import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  forward,
  leftOf,
  length,
  normalizeYaw,
  type Vec2,
  type Vec3,
} from "../../../../../src/domain/shared/vec";
import {
  type RawInput,
  toDriveInput,
} from "../../../../../src/domain/vehicle/driveInput";
import type { VehicleKind } from "../../../../../src/domain/vehicle/kind";
import {
  createVehicle,
  rebuildVehicle,
} from "../../../../../src/domain/vehicle/kinds/index";
import { SPORTSBOAT_ATTITUDE } from "../../../../../src/domain/vehicle/kinds/sportsboat/attitude";
import {
  DOCK,
  floorCells,
  holdHeight,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/deck";
import {
  BoatDrive,
  estimateWaterDrag,
  isAfloat,
  SPORTSBOAT_DRAG,
  SPORTSBOAT_WATER,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/drive";
import {
  dockCommands,
  SPORTSBOAT_ENTITY,
  undockCommands,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/entity";
import {
  SPORTSBOAT_MOTION,
  SPORTSBOAT_PROFILE,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/profile";
import { FORMS } from "../../../../../src/domain/vehicle/kinds/suv/form";
import {
  SUV_MOTION,
  SUV_PROFILE,
} from "../../../../../src/domain/vehicle/kinds/suv/profile";
import { MOTION } from "../../../../../src/domain/vehicle/motion/constants";
import {
  initialMotion,
  type MotionState,
  stepFlightMotion,
} from "../../../../../src/domain/vehicle/motion/motion";
import type { RamTarget } from "../../../../../src/domain/vehicle/ram";
import { seatWorldPositions } from "../../../../../src/domain/vehicle/seats";
import { SPEC } from "../../../../../src/domain/vehicle/spec";
import type {
  TickOutcome,
  Vehicle,
  VehicleTickInput,
} from "../../../../../src/domain/vehicle/vehicle";
import { type Body, engineStep } from "../../../../support/engineModel";
import { waterSensors } from "../../../../support/waterDepth";

const number = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true });
const yaw = number(-180, 180);
const rawInput: fc.Arbitrary<RawInput> = fc.record({
  moveX: number(-1, 1),
  moveY: number(-1, 1),
  jump: fc.boolean(),
});
const FULL_THROTTLE: RawInput = { moveX: 0, moveY: 1, jump: false };
const steer = number(-1, 1);
/** A stick held sideways: beyond the deadzone and within SPEC.sidewaysAngle of horizontal (ADR 0018). */
const sideways: fc.Arbitrary<RawInput> = fc
  .tuple(number(0.2, 1), fc.constantFrom(-1, 1), number(-0.9, 0.9))
  .map(([x, sign, slope]) => ({
    moveX: sign * x,
    moveY: x * slope * Math.tan((SPEC.sidewaysAngle * Math.PI) / 180),
    jump: false,
  }));

/** Signed difference between two yaws, in (-180, 180]. */
const yawDelta = (from: number, to: number) => normalizeYaw(to - from);

interface Water {
  waterDepth?: number;
  waterBelow?: boolean;
}
const AFLOAT: Water = { waterDepth: 0.5 };
const BEACHED: Water = { waterDepth: 0, waterBelow: false };
/** The usual case for a floating hull: its feet sit above the water cell (ADR 0051). */
const WATER_BELOW: Water = { waterDepth: 0, waterBelow: true };
const waterDepth = number(0.01, 5);
const afloatWater: fc.Arbitrary<Water> = fc.oneof(
  waterDepth.map((d) => ({ waterDepth: d })),
  fc.constant(WATER_BELOW),
  waterDepth.map((d) => ({ waterDepth: d, waterBelow: true })),
);

/** Feeds a vehicle through the engine model: apply the impulse, then the medium's drag. */
class BoatSim {
  tick = 0;
  body: Body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };

  constructor(
    readonly vehicle: Vehicle,
    private readonly drag: number,
  ) {}

  step(
    raw: RawInput | undefined,
    water: Water,
    targets: () => readonly RamTarget[] = () => [],
  ): TickOutcome {
    const out = this.vehicle.tick(
      context(this.tick++, raw, this.body.vel, water, targets),
    );
    this.body = engineStep(
      this.body,
      out.impulse,
      { mu: this.drag, drag: this.drag },
      true,
    ).body;
    return out;
  }
}

function context(
  tick: number,
  raw: RawInput | undefined,
  velocity: Vec2,
  water: Water,
  targets: () => readonly RamTarget[] = () => [],
): VehicleTickInput {
  return {
    tick,
    riders: [],
    deckSeatInputs: [],
    testInput: raw,
    velocity: { ...velocity, y: 0 },
    onGround: true,
    ...waterSensors(water.waterDepth, water.waterBelow),
    solidAt: () => false,
    targets,
  };
}

const LEVEL = [
  { type: "setProperty", name: "trim", value: 0 },
  { type: "setProperty", name: "roll", value: 0 },
];

function boat(heading: number): Vehicle {
  return createVehicle("sportsboat", "boat", heading);
}

describe("sports boat docking (ADR 0063)", () => {
  it("returns a complete dock matching its hold on every tick", () => {
    fc.assert(
      fc.property(
        yaw,
        afloatWater,
        number(-100, 100),
        number(-100, 100),
        fc.array(fc.option(rawInput, { nil: undefined }), {
          minLength: 1,
          maxLength: 50,
        }),
        (heading, water, x, z, inputs) => {
          const drive = new BoatDrive(heading, {});
          const ctx = context(0, undefined, { x: 0, z: 0 }, water);
          ctx.location = { ...ctx.location, x, z };
          const sequence = [
            ...Array<undefined>(DOCK.ticks + 1).fill(undefined),
            FULL_THROTTLE,
            ...inputs,
          ];
          sequence.forEach((raw, tick) => {
            const step = drive.step(raw, { ...ctx, tick });
            if (step.dock === undefined) return;
            expect(step.dock.floor).toStrictEqual(floorCells(step.dock.hold));
            expect(step.dock.seats).toStrictEqual(
              seatWorldPositions(
                step.dock.hold,
                SPORTSBOAT_PROFILE.seats.positions,
              ),
            );
          });
        },
      ),
    );
  });

  it("docks exactly on the twentieth consecutive still tick with a water-relative hold and floor", () => {
    fc.assert(
      fc.property(
        yaw,
        afloatWater,
        number(-100, 100),
        number(-100, 100),
        (heading, water, x, z) => {
          const drive = new BoatDrive(heading, {});
          const ctx = context(0, undefined, { x: 0, z: 0 }, water);
          ctx.location = { ...ctx.location, x, z };
          for (let tick = 1; tick < DOCK.ticks; tick++) {
            const out = drive.step(undefined, ctx);
            expect(drive.isDocked).toBe(false);
            expect(out.dock?.hold).toBeUndefined();
            expect(out.dock?.floor).toBeUndefined();
            expect(out.commands).toStrictEqual(tick === 1 ? LEVEL : []);
          }
          const out = drive.step(undefined, ctx);
          const hold = {
            x,
            y: holdHeight(ctx.location.y, (dy) =>
              ctx.waterAt({ x: 0, y: dy, z: 0 }),
            ),
            z,
            yaw: drive.yaw,
          };
          expect(drive.isDocked).toBe(true);
          expect(drive.speed).toBe(0);
          expect(out.commands).toStrictEqual(dockCommands());
          expect(out.dock?.hold).toStrictEqual(hold);
          if (!out.dock?.hold) throw new Error("missing dock hold");
          expect(out.dock?.floor ?? []).toStrictEqual(
            floorCells(out.dock?.hold),
          );
          expect(out.dock?.seats ?? []).toStrictEqual(
            seatWorldPositions(
              out.dock?.hold,
              SPORTSBOAT_PROFILE.seats.positions,
            ),
          );
        },
      ),
    );
  });

  it("resets the still count for any input, so a driver never docks", () => {
    fc.assert(
      fc.property(yaw, rawInput, afloatWater, (heading, raw, water) => {
        // Zero acceleration isolates input presence from changes in speed.
        const drive = new BoatDrive(
          heading,
          {},
          { ...SPORTSBOAT_MOTION, accel: 0, reverseAccel: 0, creepSpeed: 0 },
        );
        const ctx = context(0, undefined, { x: 0, z: 0 }, water);
        for (let tick = 1; tick < DOCK.ticks; tick++)
          drive.step(undefined, ctx);
        drive.step(raw, ctx);
        for (let tick = 1; tick < DOCK.ticks; tick++) {
          expect(drive.step(undefined, ctx).dock?.hold).toBeUndefined();
        }
        expect(drive.step(undefined, ctx).dock?.hold).toBeDefined();
        const occupied = new BoatDrive(heading, {});
        for (let tick = 0; tick < DOCK.ticks * 3; tick++) {
          expect(occupied.step(raw, ctx).dock?.hold).toBeUndefined();
          expect(occupied.isDocked).toBe(false);
        }
        const idle = new BoatDrive(heading, {});
        for (let tick = 0; tick < DOCK.ticks * 3; tick++) {
          expect(
            idle.step({ moveX: 0, moveY: 0, jump: raw.jump }, ctx).dock?.hold,
          ).toBeUndefined();
        }
      }),
    );
  });

  it("holds the same pose and motion without impulses or attitude commands for absent or small input", () => {
    const smallInput = fc.record({
      moveX: number(-DOCK.stick, DOCK.stick),
      moveY: number(-DOCK.stick, DOCK.stick),
      jump: fc.boolean(),
    });
    fc.assert(
      fc.property(
        yaw,
        afloatWater,
        fc.array(fc.option(smallInput, { nil: undefined }), {
          minLength: 1,
          maxLength: 50,
        }),
        (heading, water, inputs) => {
          const drive = new BoatDrive(heading, {});
          const ctx = context(0, undefined, { x: 0, z: 0 }, water);
          let out = drive.step(undefined, ctx);
          for (let tick = 1; tick < DOCK.ticks; tick++)
            out = drive.step(undefined, ctx);
          const hold = out.dock?.hold;
          if (!hold) throw new Error("missing dock hold");
          const state = drive.state;
          for (const raw of [
            ...inputs,
            { moveX: DOCK.stick, moveY: -DOCK.stick, jump: true },
          ]) {
            out = drive.step(raw, {
              ...ctx,
              location: { x: 40, y: 30, z: -20 },
              velocity: { x: 1, y: 1, z: 1 },
              waterAt: () => false,
            });
            expect(out.dock?.hold).toBe(hold);
            expect(out.dock?.floor ?? []).toStrictEqual(floorCells(hold));
            expect(out.impulse).toStrictEqual({ x: 0, y: 0, z: 0 });
            expect(out.forward).toStrictEqual(forward(drive.yaw));
            expect(out.commands).toStrictEqual([]);
            expect(drive.state).toStrictEqual(state);
            expect(drive.trimAngle).toBe(0);
            expect(drive.rollAngle).toBe(0);
          }
        },
      ),
    );
  });

  it("undocks on either axis above the threshold and runs normal motion that same tick", () => {
    fc.assert(
      fc.property(
        yaw,
        afloatWater,
        fc.constantFrom("moveX", "moveY"),
        number(DOCK.stick, 1).filter((n) => n > DOCK.stick),
        fc.constantFrom(-1, 1),
        (heading, water, axis, magnitude, sign) => {
          const drive = new BoatDrive(heading, {});
          const normal = new BoatDrive(heading, {});
          const ctx = context(0, undefined, { x: 0, z: 0 }, water);
          for (let tick = 0; tick < DOCK.ticks; tick++) {
            drive.step(undefined, ctx);
            normal.step({ moveX: 0, moveY: 0, jump: false }, ctx);
          }
          const raw = {
            moveX: 0,
            moveY: 0,
            jump: false,
            [axis]: magnitude * sign,
          };
          const expected = normal.step(raw, ctx);
          const out = drive.step(raw, ctx);
          expect(out).toStrictEqual({
            ...expected,
            commands: [...undockCommands(), ...expected.commands],
            boardDeckRiders: true,
          });
          expect(drive.isDocked).toBe(false);
          expect(out.dock?.hold).toBeUndefined();
          expect(out.dock?.floor).toBeUndefined();
          expect(out.dock?.seats ?? []).toStrictEqual([]);
          expect(drive.state).toStrictEqual(normal.state);
          drive.restore({ motion: initialMotion(drive.yaw) });
          for (let tick = 1; tick < DOCK.ticks; tick++)
            expect(drive.step(undefined, ctx).dock?.hold).toBeUndefined();
          expect(drive.step(undefined, ctx).dock?.hold).toBeDefined();
        },
      ),
    );
  });

  it("restores a docked boat at its first location without dock or attitude commands", () => {
    fc.assert(
      fc.property(
        yaw,
        number(-100, 100),
        number(-60, 300),
        number(-100, 100),
        (heading, x, y, z) => {
          const drive = new BoatDrive(heading, { docked: true });
          const ctx = {
            ...context(0, undefined, { x: 0, z: 0 }, BEACHED),
            location: { x, y, z },
          };
          const out = drive.step(undefined, ctx);
          expect(drive.isDocked).toBe(true);
          expect(out.dock?.hold).toStrictEqual({
            x,
            y,
            z,
            yaw: normalizeYaw(heading),
          });
          if (!out.dock?.hold) throw new Error("missing dock hold");
          expect(out.dock?.floor ?? []).toStrictEqual(
            floorCells(out.dock?.hold),
          );
          expect(out.dock?.seats ?? []).toStrictEqual(
            seatWorldPositions(
              out.dock?.hold,
              SPORTSBOAT_PROFILE.seats.positions,
            ),
          );
          expect(out.commands).toStrictEqual([]);
          expect(
            drive.step(undefined, { ...ctx, location: { x: 0, y: 0, z: 0 } })
              .dock?.hold,
          ).toBe(out.dock?.hold);
        },
      ),
    );
  });

  it("resets the still count at the speed threshold in either direction", () => {
    fc.assert(
      fc.property(
        yaw,
        afloatWater,
        fc.constantFrom(-1, 1),
        (heading, water, sign) => {
          const drive = new BoatDrive(
            heading,
            {},
            { ...SPORTSBOAT_MOTION, drag: 0 },
          );
          const ctx = context(0, undefined, { x: 0, z: 0 }, water);
          for (let tick = 1; tick < DOCK.ticks; tick++)
            drive.step(undefined, ctx);
          drive.restore({
            motion: { ...initialMotion(heading), speed: sign * DOCK.maxSpeed },
          });
          expect(drive.step(undefined, ctx).dock?.hold).toBeUndefined();
          expect(drive.speed).toBe(sign * DOCK.maxSpeed);
          const speed = (sign * DOCK.maxSpeed) / 2;
          drive.restore({ motion: { ...initialMotion(heading), speed } });
          const f = forward(drive.yaw);
          const still = {
            ...ctx,
            velocity: { x: f.x * speed, y: 0, z: f.z * speed },
          };
          for (let tick = 1; tick < DOCK.ticks; tick++)
            expect(drive.step(undefined, still).dock?.hold).toBeUndefined();
          expect(drive.step(undefined, still).dock?.hold).toBeDefined();
          expect(drive.speed).toBe(0);
        },
      ),
    );
  });

  it("waits for a water column before holding a boat sensed afloat only below its feet", () => {
    fc.assert(
      fc.property(yaw, (heading) => {
        const drive = new BoatDrive(heading, {});
        const ctx = {
          ...context(0, undefined, { x: 0, z: 0 }, BEACHED),
          waterAt: (o: Vec3) => o.y === -0.3,
        };
        for (let tick = 0; tick < DOCK.ticks * 2; tick++) {
          expect(drive.step(undefined, ctx).dock?.hold).toBeUndefined();
          expect(drive.isDocked).toBe(false);
        }
        expect(
          drive.step(undefined, context(0, undefined, { x: 0, z: 0 }, AFLOAT))
            .dock?.hold,
        ).toBeDefined();
      }),
    );
  });

  it("levels residual trim when docking and keeps it level afterward", () => {
    fc.assert(
      fc.property(yaw, afloatWater, (heading, water) => {
        const drive = new BoatDrive(heading, {});
        const ctx = context(0, undefined, { x: 0, z: 0 }, water);
        for (
          let tick = 0;
          tick < SPORTSBOAT_ATTITUDE.maxTrim / SPORTSBOAT_ATTITUDE.trimRiseRate;
          tick++
        ) {
          drive.step(FULL_THROTTLE, ctx);
          const given = drive.state.motion.airExpected;
          if (!given) throw new Error("missing afloat given velocity");
          ctx.velocity = {
            x: given.x * SPORTSBOAT_WATER.drag,
            y: 0,
            z: given.z * SPORTSBOAT_WATER.drag,
          };
        }
        expect(drive.trimAngle).toBe(SPORTSBOAT_ATTITUDE.maxTrim);
        drive.restore({ motion: initialMotion(drive.yaw) });
        ctx.velocity = { x: 0, y: 0, z: 0 };
        for (let tick = 1; tick < DOCK.ticks; tick++)
          drive.step(undefined, ctx);
        const out = drive.step(undefined, ctx);
        expect(out.commands.slice(-3)).toStrictEqual([
          ...dockCommands(),
          { type: "setProperty", name: "trim", value: 0 },
        ]);
        expect(drive.trimAngle).toBe(0);
        expect(drive.step(undefined, ctx).commands).toStrictEqual([]);
      }),
    );
  });

  it("never docks beached and resets the count when it leaves the water", () => {
    fc.assert(
      fc.property(yaw, afloatWater, (heading, water) => {
        const drive = new BoatDrive(heading, {});
        const ctx = context(0, undefined, { x: 0, z: 0 }, water);
        for (let tick = 1; tick < DOCK.ticks; tick++)
          drive.step(undefined, ctx);
        for (let tick = 0; tick < DOCK.ticks * 3; tick++) {
          const out = drive.step(
            undefined,
            context(tick, undefined, { x: 0, z: 0 }, BEACHED),
          );
          expect(out.dock?.hold).toBeUndefined();
          expect(drive.isDocked).toBe(false);
        }
        for (let tick = 1; tick < DOCK.ticks; tick++)
          expect(drive.step(undefined, ctx).dock?.hold).toBeUndefined();
        expect(drive.step(undefined, ctx).dock?.hold).toBeDefined();
      }),
    );
  });
  it("keeps the hold yaw when a driver mounts a docked or restored docked boat", () => {
    const smallStick = number(-DOCK.stick, DOCK.stick);
    fc.assert(
      fc.property(
        yaw,
        yaw,
        afloatWater,
        smallStick,
        smallStick,
        fc.boolean(),
        (heading, driverYaw, water, moveX, moveY, restored) => {
          const vehicle = restored
            ? rebuildVehicle("sportsboat", "boat", heading, [], {
                docked: true,
              })
            : boat(heading);
          if (!restored)
            for (let tick = 0; tick < DOCK.ticks; tick++)
              vehicle.tick(context(tick, undefined, { x: 0, z: 0 }, water));
          const seat = SPORTSBOAT_PROFILE.seats.positions[0];
          if (seat === undefined) throw new Error("no driver seat");
          const f = forward(heading);
          const left = leftOf(f);
          const driver = {
            id: "driver",
            offset: {
              x: left.x * seat.x + f.x * seat.z,
              z: left.z * seat.x + f.z * seat.z,
            },
            yaw: driverYaw,
            raw: { moveX, moveY, jump: false },
          };
          let hold: NonNullable<TickOutcome["dock"]>["hold"] | undefined;
          for (let tick = 0; tick < DOCK.ticks; tick++) {
            const out = vehicle.tick({
              ...context(tick, undefined, { x: 0, z: 0 }, water),
              riders: [driver],
            });
            if (!out.dock?.hold) throw new Error("the boat undocked");
            hold ??= out.dock?.hold;
            expect(out.dock?.hold).toBe(hold);
            expect(out.yaw).toBe(hold.yaw);
            expect(out.yaw).toBe(normalizeYaw(heading));
            expect(out.driverId).toBe("driver");
          }
        },
      ),
    );
  });
});

describe("isAfloat (ADR 0051)", () => {
  it("is afloat with water at the feet or 0.3 blocks below them, and beached otherwise", () => {
    fc.assert(
      fc.property(number(-2, 10), fc.boolean(), (depth, below) => {
        let probes = 0;
        expect(
          isAfloat(depth, () => {
            probes++;
            return below;
          }),
        ).toBe(depth > 0 || below);
        expect(probes).toBe(depth <= 0 ? 1 : 0);
      }),
    );
  });
});

describe("estimateWaterDrag (ADR 0053)", () => {
  const estimate = number(SPORTSBOAT_DRAG.min, SPORTSBOAT_DRAG.max);
  const vector = fc.record({ x: number(-3, 3), z: number(-3, 3) });
  const given = fc.tuple(yaw, number(0.1, 3)).map(([heading, speed]) => {
    const f = forward(heading);
    return { x: f.x * speed, z: f.z * speed };
  });

  it("stays within the bounds for every sample and previous estimate", () => {
    fc.assert(
      fc.property(
        fc.option(number(-2, 2), { nil: undefined }),
        fc.option(vector, { nil: undefined }),
        vector,
        (prev, given, observed) => {
          const next = estimateWaterDrag(prev, given, observed);
          expect(next).toBeGreaterThanOrEqual(SPORTSBOAT_DRAG.min);
          expect(next).toBeLessThanOrEqual(SPORTSBOAT_DRAG.max);
        },
      ),
    );
  });

  it("converges to a constant true ratio at every heading", () => {
    fc.assert(
      fc.property(estimate, estimate, given, (prev, ratio, given) => {
        let drag = prev;
        const observed = { x: ratio * given.x, z: ratio * given.z };
        for (let t = 0; t < 60; t++)
          drag = estimateWaterDrag(drag, given, observed);
        expect(Math.abs(drag - ratio)).toBeLessThan(0.01);
      }),
    );
  });

  it("ignores a wall hit on either axis even when the other axis keeps its velocity", () => {
    fc.assert(
      fc.property(
        estimate,
        number(0.1, 3),
        number(0, 0.49),
        fc.boolean(),
        fc.boolean(),
        (prev, magnitude, kept, onX, reverse) => {
          const axis = reverse ? -magnitude : magnitude;
          const given = { x: axis, z: axis };
          const observed = onX
            ? { x: axis * prev * kept, z: axis * prev }
            : { x: axis * prev, z: axis * prev * kept };
          expect(estimateWaterDrag(prev, given, observed)).toBe(prev);
        },
      ),
    );
  });

  it("samples an axis that keeps just over half the estimate and skips one just under it, so the threshold follows the estimate", () => {
    // Every ratio drawn here lies under the fixed 0.5 of MOTION.blockedRatio, so
    // a threshold that ignored the estimate would skip the sampled side too.
    fc.assert(
      fc.property(
        number(SPORTSBOAT_DRAG.min, SPORTSBOAT_DRAG.max),
        number(0.1, 3),
        number(0.01, 0.99),
        fc.boolean(),
        fc.boolean(),
        (prev, magnitude, t, onX, reverse) => {
          const threshold = prev * MOTION.blockedRatio;
          const axis = reverse ? -magnitude : magnitude;
          const given = { x: axis, z: axis };
          // The other axis sets the sample to the bound farther from prev.
          const sample =
            prev < (SPORTSBOAT_DRAG.min + SPORTSBOAT_DRAG.max) / 2
              ? SPORTSBOAT_DRAG.max
              : SPORTSBOAT_DRAG.min;
          const at = (ratio: number) => {
            const other = 2 * sample - ratio;
            return onX
              ? { x: axis * ratio, z: axis * other }
              : { x: axis * other, z: axis * ratio };
          };
          const above = threshold + t * (MOTION.blockedRatio - threshold);
          const sampled = estimateWaterDrag(prev, given, at(above));
          expect(sampled).toBeCloseTo(prev * 0.9 + sample * 0.1, 12);
          expect(Math.abs(sampled - prev)).toBeGreaterThan(0.01);
          expect(estimateWaterDrag(prev, given, at(threshold * t))).toBe(prev);
        },
      ),
    );
  });

  it("keeps the estimate without a previous given velocity or below the sampling threshold", () => {
    fc.assert(
      fc.property(
        estimate,
        yaw,
        number(0, SPORTSBOAT_DRAG.minGiven * 0.99),
        vector,
        (prev, heading, speed, observed) => {
          const f = forward(heading);
          expect(estimateWaterDrag(prev, undefined, observed)).toBe(prev);
          expect(
            estimateWaterDrag(
              prev,
              { x: f.x * speed, z: f.z * speed },
              observed,
            ),
          ).toBe(prev);
        },
      ),
    );
    expect(estimateWaterDrag(undefined, undefined, { x: 0, z: 0 })).toBe(
      SPORTSBOAT_DRAG.initial,
    );
  });

  it("clamps the sample before averaging rather than only clamping the result", () => {
    expect(estimateWaterDrag(0.83, { x: 1, z: 0 }, { x: 2, z: 0 })).toBeCloseTo(
      0.842,
      12,
    );
    expect(
      estimateWaterDrag(0.83, { x: 1, z: 0 }, { x: 0.5, z: 0 }),
    ).toBeCloseTo(0.817, 12);
  });
});

describe("BoatDrive (ADR 0051)", () => {
  it("carries the water estimate afloat and beached, and a higher estimate gives less velocity for the same target", () => {
    fc.assert(
      fc.property(yaw, number(SPORTSBOAT_DRAG.min, 0.89), (heading, low) => {
        const motion = { ...initialMotion(heading), speed: 0.5 };
        const ctx = context(0, FULL_THROTTLE, { x: 0, z: 0 }, AFLOAT);
        const drive = new BoatDrive(heading, {}).restore({
          motion,
          waterDrag: low,
        });
        const higher = new BoatDrive(heading, {}).restore({
          motion,
          waterDrag: low + 0.04,
        });
        const a = drive.step(FULL_THROTTLE, ctx);
        const afterA = drive.state;
        const b = higher.step(FULL_THROTTLE, ctx);
        expect(afterA.waterDrag).toBe(low);
        expect(drive.waterDrag).toBe(low);
        expect(higher.state.waterDrag).toBeCloseTo(low + 0.04, 12);
        expect(length(b.impulse)).toBeLessThan(length(a.impulse));
        const given = afterA.motion.airExpected;
        if (!given) throw new Error("missing afloat given velocity");
        const observed = { x: given.x * 0.9, z: given.z * 0.9 };
        const next = drive.step(FULL_THROTTLE, {
          ...ctx,
          velocity: { ...observed, y: 0 },
        });
        const afterNext = drive.state;
        expect(afterNext.waterDrag).toBeCloseTo(low * 0.9 + 0.9 * 0.1, 12);
        // The impulse divides by the updated estimate, not the one stored in a.
        const updated = afterNext.waterDrag ?? 0;
        expect(updated).not.toBeCloseTo(low, 6);
        const expected = stepFlightMotion(
          afterA.motion,
          toDriveInput(FULL_THROTTLE),
          observed,
          { ...SPORTSBOAT_WATER, drag: updated },
          SPORTSBOAT_MOTION,
        );
        expect(next.impulse.x).toBeCloseTo(expected.impulse.x, 12);
        expect(next.impulse.z).toBeCloseTo(expected.impulse.z, 12);
        drive.step(FULL_THROTTLE, {
          ...ctx,
          ...waterSensors(BEACHED.waterDepth, BEACHED.waterBelow),
          velocity: { y: 0, x: 0, z: 0 },
        });
        expect(drive.state.waterDrag).toBe(afterNext.waterDrag);
        expect(drive.state.motion.airExpected).toBeUndefined();
      }),
    );
  });

  it("makes one wall decision per tick: a tick taken as a drag sample never lowers the speed, and a skipped one does", () => {
    // Heading +z at speed 1 and given (0.1, 1.0): the z axis keeps 0.95, so the
    // sample is about 0.945 and raises any estimate up to 0.9. The x axis keeps
    // just over half the stored estimate, which is under half the raised one.
    fc.assert(
      fc.property(
        number(SPORTSBOAT_DRAG.min, 0.9),
        number(0.0002, 0.002),
        (prev, over) => {
          const motion: MotionState = {
            ...initialMotion(0),
            speed: 1,
            airExpected: { x: 0.1, z: 1 },
          };
          const velocity = (xRatio: number) => ({ x: 0.1 * xRatio, z: 0.95 });
          /** The drive's state after one tick from `m` and the estimate `prev`. */
          const step = (v: Vec2, m = motion) => {
            const drive = new BoatDrive(0, {}).restore({
              motion: m,
              waterDrag: prev,
            });
            drive.step(FULL_THROTTLE, context(0, FULL_THROTTLE, v, AFLOAT));
            return drive.state;
          };
          const unblocked = step(velocity(0.5), {
            ...motion,
            airExpected: undefined,
          }).motion.speed;
          const sampled = step(velocity(prev * MOTION.blockedRatio + over));
          const raised = sampled.waterDrag ?? 0;
          expect(raised).toBeGreaterThan(prev);
          expect(0.1 * (prev * MOTION.blockedRatio + over)).toBeLessThan(
            0.1 * raised * MOTION.blockedRatio,
          );
          expect(sampled.motion.speed).toBe(unblocked);
          const skipped = step(velocity(prev * MOTION.blockedRatio - over));
          expect(skipped.waterDrag).toBe(prev);
          expect(skipped.motion.speed).toBeCloseTo(0.95, 12);
        },
      ),
    );
  });

  it("is the sports boat's drive and keeps no form, gear, or bank whatever form it is given", () => {
    fc.assert(
      fc.property(fc.constantFrom(...FORMS), yaw, (form, heading) => {
        const drive = new BoatDrive(heading, { form });
        const step = drive.step(
          undefined,
          context(0, undefined, { x: 0, z: 0 }, AFLOAT),
        );
        // At rest the first tick only levels the hull (ADR 0059)
        expect(step.commands).toStrictEqual(LEVEL);
        expect(step.riders).toStrictEqual({
          thirdPerson: false,
          underwater: false,
        });
        const rebuilt = rebuildVehicle("sportsboat", "boat", heading, [], {
          form,
        });
        const out = rebuilt.tick(context(0, undefined, { x: 0, z: 0 }, AFLOAT));
        expect(out.commands).toStrictEqual(LEVEL);
        expect(out.riders).toStrictEqual({
          thirdPerson: false,
          underwater: false,
        });
      }),
    );
  });

  it("afloat at full throttle, rises to the boat's top speed above the SUV's and never exceeds it", () => {
    fc.assert(
      fc.property(yaw, fc.boolean(), afloatWater, (heading, jump, water) => {
        const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
        for (let i = 0; i < 120; i++) {
          sim.step({ ...FULL_THROTTLE, jump }, water);
          expect(length(sim.body.vel)).toBeLessThanOrEqual(
            SPORTSBOAT_MOTION.maxSpeed + 1e-9,
          );
        }
        expect(length(sim.body.vel)).toBeCloseTo(SPORTSBOAT_MOTION.maxSpeed, 9);
        expect(sim.vehicle.speed).toBe(SPORTSBOAT_MOTION.maxSpeed);
        expect(sim.vehicle.speed).toBeGreaterThan(SUV_MOTION.maxSpeed);
      }),
    );
  });

  it("with water only 0.3 blocks below the feet, drives exactly as with water at the feet", () => {
    fc.assert(
      fc.property(
        yaw,
        waterDepth,
        fc.array(fc.option(rawInput, { nil: undefined }), {
          minLength: 1,
          maxLength: 80,
        }),
        (heading, depth, inputs) => {
          const below = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          const atFeet = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          for (const raw of inputs) {
            expect(below.step(raw, WATER_BELOW)).toStrictEqual(
              atFeet.step(raw, { waterDepth: depth }),
            );
          }
        },
      ),
    );
  });

  it("afloat with the stick pulled back, reverses up to the boat's reverse limit", () => {
    fc.assert(
      fc.property(yaw, fc.integer({ min: 1, max: 80 }), (heading, ticks) => {
        const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
        for (let i = 0; i < ticks; i++) {
          sim.step({ moveX: 0, moveY: -1, jump: false }, AFLOAT);
          expect(sim.vehicle.speed).toBeLessThan(0);
          expect(sim.vehicle.speed).toBeGreaterThanOrEqual(
            -SPORTSBOAT_MOTION.maxReverse,
          );
        }
      }),
    );
  });

  it("afloat at speed, turns against the stick by the profile's turnRate, and the other way in reverse", () => {
    fc.assert(
      fc.property(
        yaw,
        steer,
        fc.constantFrom(1, -1),
        afloatWater,
        (heading, s, direction, water) => {
          const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          const stick = { moveX: 0, moveY: direction, jump: false };
          // 20 ticks take the boat past steerFullSpeed both ways.
          for (let i = 0; i < 20; i++) sim.step(stick, water);
          const before = sim.vehicle.yaw;
          sim.step({ ...stick, moveX: s }, water);
          expect(
            Math.abs(sim.vehicle.speed) / SPORTSBOAT_MOTION.steerFullSpeed,
          ).toBeGreaterThanOrEqual(1);
          expect(yawDelta(before, sim.vehicle.yaw)).toBeCloseTo(
            -direction * s * SPORTSBOAT_MOTION.turnRate,
            9,
          );
        },
      ),
    );
  });

  it("steers by whatever turnRate the profile it is given holds", () => {
    fc.assert(
      fc.property(
        yaw,
        steer,
        number(1, 12),
        afloatWater,
        (heading, s, turnRate, water) => {
          const motion = { ...initialMotion(heading), speed: 0.5 };
          const drive = new BoatDrive(
            heading,
            {},
            {
              ...SPORTSBOAT_MOTION,
              turnRate,
            },
          ).restore({ motion });
          drive.step(
            { moveX: s, moveY: 1, jump: false },
            context(0, undefined, { x: 0, z: 0 }, water),
          );
          expect(yawDelta(motion.yaw, drive.yaw)).toBeCloseTo(-s * turnRate, 9);
        },
      ),
    );
  });

  it("afloat with the stick held sideways, settles at creep speed from rest or from full speed and keeps turning", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.integer({ min: 0, max: 120 }),
        sideways,
        afloatWater,
        (heading, throttleTicks, stick, water) => {
          const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          for (let i = 0; i < throttleTicks; i++)
            sim.step(FULL_THROTTLE, water);
          for (let i = 0; i < 100; i++) sim.step(stick, water);
          expect(sim.vehicle.speed).toBe(SPORTSBOAT_MOTION.creepSpeed);
          const before = sim.vehicle.yaw;
          sim.step(stick, water);
          expect(yawDelta(before, sim.vehicle.yaw)).toBeCloseTo(
            -stick.moveX * SPORTSBOAT_MOTION.turnRate,
            9,
          );
        },
      ),
    );
  });

  it("beached, never gains speed whatever the input and coasts to a stop", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.integer({ min: 0, max: 80 }),
        fc.array(fc.option(rawInput, { nil: undefined }), {
          minLength: 60,
          maxLength: 80,
        }),
        (heading, afloatTicks, inputs) => {
          const sim = new BoatSim(boat(heading), MOTION.defaultFriction);
          for (let i = 0; i < afloatTicks; i++) sim.step(FULL_THROTTLE, AFLOAT);
          let speed = Math.abs(sim.vehicle.speed);
          for (const raw of inputs) {
            sim.step(raw, BEACHED);
            expect(Math.abs(sim.vehicle.speed)).toBeLessThanOrEqual(speed);
            speed = Math.abs(sim.vehicle.speed);
          }
          expect(sim.vehicle.speed).toBe(0);
        },
      ),
    );
  });

  it("never pushes vertically and sends only attitude and docking commands, never a form, bank, or gear, for any inputs and surroundings", () => {
    const tick = fc.record({
      raw: fc.option(rawInput, { nil: undefined }),
      waterDepth: fc.option(number(0, 5), { nil: undefined }),
      waterBelow: fc.option(fc.boolean(), { nil: undefined }),
      onGround: fc.boolean(),
      velocity: fc.record({ x: number(-2, 2), z: number(-2, 2) }),
      solid: fc.boolean(),
    });
    fc.assert(
      fc.property(
        yaw,
        fc.array(tick, { minLength: 1, maxLength: 60 }),
        (heading, ticks) => {
          const vehicle = boat(heading);
          ticks.forEach((t, i) => {
            const out = vehicle.tick({
              ...context(i, t.raw, t.velocity, {
                waterDepth: t.waterDepth,
                waterBelow: t.waterBelow,
              }),
              onGround: t.onGround,
              solidAt: () => t.solid,
            });
            expect(out.impulse.y).toBe(0);
            for (const command of out.commands) {
              if (
                command.type === "triggerEvent" ||
                (command.type === "setProperty" && command.name === "docked")
              ) {
                expect([...dockCommands(), ...undockCommands()]).toContainEqual(
                  command,
                );
                continue;
              }
              expect(command).toMatchObject({ type: "setProperty" });
              const { name, value } = command as {
                name: "trim" | "roll";
                value: number;
              };
              const [min, max] = SPORTSBOAT_ENTITY.properties[name].range;
              expect(value).toBeGreaterThanOrEqual(min);
              expect(value).toBeLessThanOrEqual(max);
            }
            expect(out.riders).toStrictEqual({
              thirdPerson: false,
              underwater: false,
            });
          });
        },
      ),
    );
  });

  it("ignores jump afloat or beached, even with a handbrake grip that differs from its grip", () => {
    // SPORTSBOAT_MOTION sets handbrakeGrip equal to grip, which would hide a
    // path that reads the handbrake; a differing one makes such a path show.
    const water = fc.oneof(
      afloatWater,
      fc.constant(BEACHED),
      fc.constant<Water>({}),
    );
    fc.assert(
      fc.property(
        yaw,
        number(-0.2, 1.12),
        fc.record({ x: number(-2, 2), z: number(-2, 2) }),
        water,
        fc.boolean(),
        rawInput,
        number(0, 1),
        (heading, speed, velocity, w, onGround, raw, handbrakeGrip) => {
          const motion = { ...initialMotion(heading), speed };
          const ctx = { ...context(0, undefined, velocity, w), onGround };
          const run = (jump: boolean) => {
            const drive = new BoatDrive(
              heading,
              {},
              {
                ...SPORTSBOAT_MOTION,
                handbrakeGrip,
              },
            ).restore({ motion });
            return {
              step: drive.step({ ...raw, jump }, ctx),
              state: drive.state,
            };
          };
          expect(run(true)).toStrictEqual(run(false));
        },
      ),
    );
  });
});

describe("a sports boat Vehicle (ADR 0051)", () => {
  it("rams a target 3.2 blocks ahead at speed and not one 3.6 ahead, while an SUV at the same speed rams neither", () => {
    const drive = (kind: VehicleKind, heading: number, ticks: number) => {
      const vehicle = createVehicle(kind, kind, heading);
      const afloat = kind === "sportsboat";
      const sim = new BoatSim(
        vehicle,
        afloat ? SPORTSBOAT_WATER.drag : MOTION.defaultFriction,
      );
      const water = afloat ? AFLOAT : BEACHED;
      for (let i = 0; i < ticks; i++) sim.step(FULL_THROTTLE, water);
      const ahead = (id: string, blocks: number): RamTarget => {
        const f = forward(vehicle.yaw);
        const offset: Vec3 = { x: f.x * blocks, y: 0, z: f.z * blocks };
        return { id, offset, protectedOccupant: false };
      };
      const out = sim.step(FULL_THROTTLE, water, () => [
        ahead("near", 3.2),
        ahead("far", 3.6),
      ]);
      return { speed: vehicle.speed, hits: out.hits.map((h) => h.id) };
    };
    fc.assert(
      fc.property(yaw, fc.integer({ min: 10, max: 35 }), (heading, ticks) => {
        const boatRun = drive("sportsboat", heading, ticks);
        const suvRun = drive("suv", heading, ticks);
        expect(boatRun.speed).toBeGreaterThan(SPEC.ramMinSpeed);
        expect(suvRun.speed).toBeCloseTo(boatRun.speed, 9);
        expect(boatRun.hits).toStrictEqual(["near"]);
        expect(suvRun.hits).toStrictEqual([]);
      }),
    );
  });

  it("seats riders by the SUV's positions and emits no seat commands when one leaves", () => {
    expect(SPORTSBOAT_PROFILE.seats.positions).toStrictEqual(
      SUV_PROFILE.seats.positions,
    );
    fc.assert(
      fc.property(
        yaw,
        fc.integer({ min: 0, max: 3 }),
        rawInput,
        (heading, seat, raw) => {
          const vehicle = boat(heading);
          const local = SUV_PROFILE.seats.positions[seat];
          if (local === undefined) throw new Error(`no seat ${seat}`);
          const f = forward(heading);
          const left = leftOf(f);
          const rider = {
            id: "rider",
            offset: {
              x: left.x * local.x + f.x * local.z,
              z: left.z * local.x + f.z * local.z,
            },
            yaw: heading,
            raw,
          };
          const seated = vehicle.tick({
            ...context(0, undefined, { x: 0, z: 0 }, AFLOAT),
            riders: [rider],
          });
          expect(seated.driverId).toBe(seat === 0 ? "rider" : undefined);
          const vacated = vehicle.tick(
            context(1, undefined, { x: 0, z: 0 }, AFLOAT),
          );
          expect(vacated.seatCommands).toStrictEqual([]);
        },
      ),
    );
  });
});

it("queries below the boat only when its depth query is dry", () => {
  fc.assert(
    fc.property(fc.boolean(), fc.boolean(), (atFeet, below) => {
      const drive = new BoatDrive(0, {});
      const ctx = context(0, FULL_THROTTLE, { x: 0, z: 0 }, BEACHED);
      const probes: number[] = [];
      drive.step(FULL_THROTTLE, {
        ...ctx,
        waterAt: (o) => {
          probes.push(o.y);
          return o.y === -0.3 ? below : atFeet;
        },
      });
      expect(probes.filter((y) => y === -0.3)).toEqual(atFeet ? [] : [-0.3]);
    }),
  );
});

/** The trim and roll a vehicle last sent, starting level. */
class Attitude {
  trim = 0;
  roll = 0;

  read(out: TickOutcome): void {
    for (const command of out.commands) {
      if (command.type !== "setProperty") continue;
      if (command.name === "trim") this.trim = command.value as number;
      if (command.name === "roll") this.roll = command.value as number;
    }
  }
}

describe("a sports boat's trim and roll (ADR 0059)", () => {
  it("afloat at full throttle, lifts the bow fully while gaining speed and levels it at top speed", () => {
    fc.assert(
      fc.property(yaw, afloatWater, (heading, water) => {
        const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
        const attitude = new Attitude();
        let peak = 0;
        for (let i = 0; i < 40; i++) {
          attitude.read(sim.step(FULL_THROTTLE, water));
          peak = Math.max(peak, attitude.trim);
        }
        expect(peak).toBe(SPORTSBOAT_ATTITUDE.maxTrim);
        for (let i = 0; i < 80; i++)
          attitude.read(sim.step(FULL_THROTTLE, water));
        expect(sim.vehicle.speed).toBe(SPORTSBOAT_MOTION.maxSpeed);
        expect(attitude.trim).toBe(0);
        expect(attitude.roll).toBe(0);
      }),
    );
  });

  it("beached, keeps the hull level whatever the input", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.array(rawInput, { maxLength: 40 }),
        (heading, inputs) => {
          const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          const attitude = new Attitude();
          for (const raw of inputs) {
            attitude.read(sim.step(raw, BEACHED));
            expect(attitude.trim).toBe(0);
            expect(attitude.roll).toBe(0);
          }
        },
      ),
    );
  });

  it("at top speed, rolls into a full turn, right side down when the heading turns right, then levels after it", () => {
    fc.assert(
      fc.property(
        yaw,
        fc.constantFrom(1, -1),
        afloatWater,
        (heading, side, water) => {
          const sim = new BoatSim(boat(heading), SPORTSBOAT_WATER.drag);
          const attitude = new Attitude();
          for (let i = 0; i < 120; i++)
            attitude.read(sim.step(FULL_THROTTLE, water));
          const turning = { ...FULL_THROTTLE, moveX: side };
          const before = sim.vehicle.yaw;
          attitude.read(sim.step(turning, water));
          const right = yawDelta(before, sim.vehicle.yaw) > 0;
          for (let i = 0; i < 20; i++) attitude.read(sim.step(turning, water));
          expect(Math.abs(attitude.roll)).toBeGreaterThan(
            SPORTSBOAT_ATTITUDE.maxRoll * 0.8,
          );
          expect(attitude.roll > 0).toBe(right);
          for (let i = 0; i < 20; i++)
            attitude.read(sim.step(FULL_THROTTLE, water));
          expect(attitude.roll).toBe(0);
        },
      ),
    );
  });

  it("sends trim and roll only when they change", () => {
    const sim = new BoatSim(boat(0), SPORTSBOAT_WATER.drag);
    expect(sim.step(undefined, AFLOAT).commands).toStrictEqual(LEVEL);
    for (let i = 0; i < 10; i++)
      expect(sim.step(undefined, AFLOAT).commands).toStrictEqual([]);
  });
});

it("only the deck driver above the stick threshold requests boarding and keeps the hold", () => {
  fc.assert(
    fc.property(
      yaw,
      fc.array(fc.option(rawInput, { nil: undefined }), {
        minLength: 4,
        maxLength: 4,
      }),
      (heading, inputs) => {
        const drive = new BoatDrive(heading, { docked: true });
        const ctx = {
          ...context(0, undefined, { x: 0, z: 0 }, AFLOAT),
          deckSeatInputs: inputs,
        };
        const out = drive.step(undefined, ctx);
        const driver = inputs[0];
        expect(out.boardDeckRiders).toBe(
          driver !== undefined &&
            Math.max(Math.abs(driver.moveX), Math.abs(driver.moveY)) >
              DOCK.stick,
        );
        expect(drive.isDocked).toBe(true);
        expect(out.dock?.hold).toBeDefined();
        expect(out.dock?.seats ?? []).toHaveLength(4);
        expect(out.commands).toEqual([]);
        const passengersOnly = drive.step(undefined, {
          ...ctx,
          deckSeatInputs: [undefined, ...inputs.slice(1)],
        });
        expect(passengersOnly.boardDeckRiders).toBe(false);
        expect(passengersOnly.dock?.hold).toEqual(out.dock?.hold);
        for (const magnitude of [DOCK.stick, -DOCK.stick]) {
          expect(
            drive.step(undefined, {
              ...ctx,
              deckSeatInputs: [
                { moveX: magnitude, moveY: magnitude, jump: true },
              ],
            }).boardDeckRiders,
          ).toBe(false);
        }
      },
    ),
  );
});

it("keeps deck seats only at empty boat seats and ignores the deck driver while the boat has one", () => {
  const pushes = (input: RawInput | undefined) =>
    input !== undefined &&
    Math.max(Math.abs(input.moveX), Math.abs(input.moveY)) > DOCK.stick;
  fc.assert(
    fc.property(
      yaw,
      fc.subarray([0, 1, 2, 3]),
      fc.array(fc.option(rawInput, { nil: undefined }), {
        minLength: 4,
        maxLength: 4,
      }),
      (heading, taken, inputs) => {
        const vehicle = rebuildVehicle("sportsboat", "boat", heading, [], {
          docked: true,
        });
        const f = forward(heading);
        const left = leftOf(f);
        const riders = taken.map((seat) => {
          const at = SPORTSBOAT_PROFILE.seats.positions[seat];
          if (at === undefined) throw new Error(`no seat ${seat}`);
          return {
            id: `rider${seat}`,
            offset: {
              x: left.x * at.x + f.x * at.z,
              z: left.z * at.x + f.z * at.z,
            },
            yaw: heading,
            raw: { moveX: 0, moveY: 0, jump: false },
          };
        });
        const out = vehicle.tick({
          ...context(0, undefined, { x: 0, z: 0 }, AFLOAT),
          riders,
          deckSeatInputs: inputs,
        });
        expect(out.dock?.hold).toBeDefined();
        expect(out.dock?.seats ?? []).toHaveLength(4);
        for (const [seat, at] of (out.dock?.seats ?? []).entries())
          expect(at === undefined).toBe(taken.includes(seat));
        expect(out.boardDeckRiders).toBe(
          !taken.includes(0) && pushes(inputs[0]),
        );
      },
    ),
  );
});
