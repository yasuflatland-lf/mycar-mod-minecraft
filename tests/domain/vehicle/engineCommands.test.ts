import fc from "fast-check";
import { expect, it } from "vitest";
import type { EngineCommand } from "../../../src/domain/vehicle/drive";
import type {
  EntityContract,
  PropertySpec,
} from "../../../src/domain/vehicle/entityContract";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  createVehicle,
  entityContractOf,
} from "../../../src/domain/vehicle/kinds/index";
import { waterSensors } from "../../support/waterDepth";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const sample = fc.record({
  raw: fc.option(
    fc.record({
      moveX: number(-1, 1),
      moveY: number(-1, 1),
      jump: fc.boolean(),
    }),
    { nil: undefined },
  ),
  depth: number(0, 5),
  below: fc.boolean(),
  ground: fc.boolean(),
  solid: fc.boolean(),
  velocity: fc.record({ x: number(-2, 2), y: number(-1, 1), z: number(-2, 2) }),
  mounted: fc.boolean(),
  driverYaw: number(-180, 180),
});

function check(command: EngineCommand, contract: EntityContract) {
  switch (command.type) {
    case "setProperty": {
      const spec: PropertySpec | undefined = contract.properties[command.name];
      expect(spec).toBeDefined();
      if (!spec) throw new Error(`Undeclared property ${command.name}`);
      switch (spec.type) {
        case "enum":
          expect(spec.values).toContain(command.value);
          break;
        case "bool":
          expect(typeof command.value).toBe("boolean");
          break;
        case "float":
          expect(typeof command.value).toBe("number");
          expect(command.value).toBeGreaterThanOrEqual(spec.range[0]);
          expect(command.value).toBeLessThanOrEqual(spec.range[1]);
          break;
      }
      break;
    }
    case "triggerEvent":
      expect(contract.events).toContain(command.name);
      break;
    case "playAnimation":
      expect(contract.animations).toContain(command.name);
      break;
    case "playSound":
      expect(typeof command.name).toBe("string");
      break;
  }
}

it.each(VEHICLE_KINDS)(
  "emits declared commands with valid values for %s over 200 random ticks",
  (kind) => {
    fc.assert(
      fc.property(
        number(-180, 180),
        fc.array(sample, { minLength: 200, maxLength: 200 }),
        (yaw, samples) => {
          const vehicle = createVehicle(kind, "v", yaw);
          const contract = entityContractOf(kind);
          samples.forEach((s, tick) => {
            const out = vehicle.tick({
              tick,
              deckSeatInputs: [],
              riders: s.mounted
                ? [
                    {
                      id: "driver",
                      offset: { x: 0.38, z: -0.35 },
                      yaw: s.driverYaw,
                      raw: s.raw ?? { moveX: 0, moveY: 0, jump: false },
                    },
                  ]
                : [],
              testInput: s.raw,
              velocity: s.velocity,
              onGround: s.ground,
              ...waterSensors(s.depth, s.below),
              solidAt: () => s.solid,
              targets: () => [],
            });
            for (const command of [...out.commands, ...out.seatCommands])
              check(command, contract);
          });
        },
      ),
    );
  },
);
