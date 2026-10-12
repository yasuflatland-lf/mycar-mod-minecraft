import type { Vec3 } from "../../src/domain/shared/vec";
import {
  createTraceApp,
  createTraceVehicle,
  rebuildTraceVehicle,
  type TraceAppVehicle,
  type TraceRider,
  type TraceStep,
} from "./adapter";
import { type Scenario, seatOffset } from "./scenarios";
import { TraceWorld } from "./world";

export interface DomainLine extends TraceStep {
  tick: number;
  location: Vec3;
  velocity: Vec3;
}
export interface AppLine {
  tick: number;
  calls: readonly string[];
}
export function traceText(lines: readonly (DomainLine | AppLine)[]): string {
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`;
}
function runner(scenario: Scenario) {
  const world = new TraceWorld(scenario.kind, scenario.world);
  const seats = new Map<number, number>();
  let tick = 0;
  return {
    world,
    *ticks() {
      for (const [input, count] of scenario.segments)
        for (let i = 0; i < count; i++) {
          const events = (scenario.events ?? []).filter((e) => e.tick === tick);
          for (const event of events) {
            if (event.type === "join") seats.set(event.seat, event.yaw);
            if (event.type === "leave") seats.delete(event.seat);
          }
          const riders: TraceRider[] = [...seats].map(([seat, yaw]) => ({
            id: `rider_${seat}`,
            offset: seatOffset(seat, world.yaw),
            yaw,
            raw: seat === 0 ? input : { moveX: 0, moveY: 0, jump: false },
          }));
          yield { tick, events, riders, input };
          tick++;
        }
    },
  };
}
export function recordDomain(scenario: Scenario): DomainLine[] {
  const run = runner(scenario);
  const { world } = run;
  let vehicle = createTraceVehicle(scenario.kind, scenario.name, world.yaw);
  const lines: DomainLine[] = [];
  for (const { tick, events, riders, input } of run.ticks()) {
    if (events.some((e) => e.type === "rebuild"))
      vehicle = rebuildTraceVehicle(
        scenario.kind,
        scenario.name,
        world.yaw,
        riders,
        world.properties,
      );
    const step = vehicle.tick(world.sensors(tick), riders, input);
    for (const write of [...step.writes, ...step.seatWrites])
      world.write(write);
    world.advance(step.impulse, step.yaw);
    lines.push({
      tick,
      location: {
        x: world.location.x,
        y: world.location.y,
        z: world.location.z,
      },
      velocity: {
        x: world.velocity.x,
        y: world.velocity.y,
        z: world.velocity.z,
      },
      impulse: { x: step.impulse.x, y: step.impulse.y, z: step.impulse.z },
      yaw: step.yaw,
      speed: step.speed,
      ...(step.driverId === undefined ? {} : { driverId: step.driverId }),
      hits: step.hits.map((hit) => ({
        id: hit.id,
        damage: hit.damage,
        push: { x: hit.push.x, z: hit.push.z },
        pushUp: hit.pushUp,
      })),
      writes: [...step.writes],
      seatWrites: [...step.seatWrites],
      riders: {
        thirdPerson: step.riders.thirdPerson,
        underwater: step.riders.underwater,
      },
    });
  }
  return lines;
}
export function recordApp(scenario: Scenario): AppLine[] {
  const run = runner(scenario);
  const { world } = run;
  const app = createTraceApp();
  const lines: AppLine[] = [];
  for (const { tick, events, riders } of run.ticks()) {
    for (const event of events) {
      if (event.type === "forget") app.forget(scenario.name);
      if (event.type === "failure") app.failOn(event.write);
    }
    const vehicles: TraceAppVehicle[] = [
      {
        id: scenario.name,
        kind: scenario.kind,
        yaw: world.yaw,
        sensors: world.sensors(tick),
        riders,
        properties: world.properties,
        headlights: scenario.headlights ?? false,
      },
    ];
    const calls = app.execute(tick, vehicles);
    let impulse: Vec3 = { x: 0, y: 0, z: 0 };
    let yaw = world.yaw;
    for (const call of calls) {
      const write = call.slice(scenario.name.length + 1);
      world.write(write);
      if (write.startsWith("motion ")) {
        const [, heading, vector] = write.split(" ");
        const [x = 0, y = 0, z = 0] = (vector ?? "").split(",").map(Number);
        impulse = { x, y, z };
        yaw = Number(heading);
      }
    }
    world.advance(impulse, yaw);
    lines.push({ tick, calls });
  }
  return lines;
}
