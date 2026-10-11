// In-game tests (ADR 0010). They run in a script environment separate from the
// main Behavior Pack, so they drive the vehicle through script events.
import { type Dimension, type Entity, system, world } from "@minecraft/server";
import { forward } from "../domain/shared/vec";
import { headlightCells } from "../domain/vehicle/headlights";
import { PAINTS } from "../domain/vehicle/paint";
import { nearestSeat, toLocal } from "../domain/vehicle/seats";
import { SPEC } from "../domain/vehicle/spec";
import {
  FLIGHT_PROPERTY,
  HEADLIGHTS_PROPERTY,
  TEST_INPUT_EVENT as INPUT_EVENT,
  LIGHT_BLOCK,
  PAINT_VARIANT,
  paintEvent,
  VEHICLE_TYPE as VEHICLE,
} from "../infrastructure/bedrock/identifiers";
import { LOG_TAG, linePrefix, runIdFrom, TEST_EVENT } from "./protocol";
import { hitTick, judgeRam, PUSH_WINDOW, type RamSample } from "./ramJudge";

// setupArena clears and floors this x/z rectangle and keeps it ticking.
const ARENA = { minX: 0, maxX: 120, minZ: 0, maxZ: 40 } as const;

// Mirrors the SUV's minecraft:rideable but seats cows, because only players
// can ride the SUV and a test has no players (ADR 0010).
const SEAT_PROBE = "mycar_test:seat_probe";

interface Outcome {
  pass: boolean;
  detail: string;
}
interface Arena {
  dim: Dimension;
  gy: number;
}
interface Horizontal {
  x: number;
  z: number;
}

function log(runId: string, msg: string): void {
  console.warn(`${linePrefix(runId)}${msg}`);
}

function wait(ticks: number): Promise<void> {
  return new Promise((resolve) => system.runTimeout(resolve, ticks));
}

function hlen(v: Horizontal): number {
  return Math.hypot(v.x, v.z);
}

function slipAngleDeg(v: Horizontal, yaw: number): number {
  const f = forward(yaw);
  const cos = (v.x * f.x + v.z * f.z) / hlen(v);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

function insideArena(p: Horizontal): boolean {
  const m = SPEC.bodyHalfWidth;
  return (
    p.x >= ARENA.minX + m &&
    p.x <= ARENA.maxX + 1 - m &&
    p.z >= ARENA.minZ + m &&
    p.z <= ARENA.maxZ + 1 - m
  );
}

function drive(
  car: Entity,
  x: number,
  y: number,
  jump = false,
  pitch = 0,
): void {
  system.sendScriptEvent(
    INPUT_EVENT,
    `${car.id},${x},${y},${jump ? 1 : 0},${pitch}`,
  );
}

function clearInput(car: Entity): void {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},clear`);
}

function spawnCar(a: Arena, x: number, z: number, yaw: number): Entity {
  a.dim.runCommand(`summon ${VEHICLE} ${x} ${a.gy} ${z}`);
  const car = a.dim.getEntities({
    type: VEHICLE,
    location: { x, y: a.gy, z },
    maxDistance: 1.5,
  })[0];
  if (!car) throw new Error(`car not spawned at ${x},${z}`);
  car.setRotation({ x: 0, y: yaw });
  return car;
}

async function withCar<T>(
  a: Arena,
  x: number,
  z: number,
  yaw: number,
  run: (car: Entity) => Promise<T>,
): Promise<T> {
  const car = spawnCar(a, x, z, yaw);
  try {
    return await run(car);
  } finally {
    clearInput(car);
    if (car.isValid) car.remove();
  }
}

async function setupArena(): Promise<Arena> {
  const dim = world.getDimension("overworld");
  const { minX, maxX, minZ, maxZ } = ARENA;
  dim.runCommand(
    `tickingarea add ${minX} -64 ${minZ} ${maxX} 0 ${maxZ} mycartest true`,
  );
  await wait(60);
  const top = dim.getTopmostBlock({ x: 5, z: 20 });
  if (!top) throw new Error("arena chunk not loaded");
  const gy = top.location.y + 1;
  // fill is capped at 32,768 blocks per call, so the clear is split in two.
  const midX = (minX + maxX) / 2;
  dim.runCommand(`fill ${minX} ${gy} ${minZ} ${midX} ${gy + 6} ${maxZ} air`);
  dim.runCommand(
    `fill ${midX + 1} ${gy} ${minZ} ${maxX} ${gy + 6} ${maxZ} air`,
  );
  dim.runCommand(
    `fill ${minX} ${gy - 1} ${minZ} ${maxX} ${gy - 1} ${maxZ} stone`,
  );
  // The flight tests climb up to about 8 blocks above the floor along z = 4.5.
  dim.runCommand(`fill ${minX} ${gy + 7} 0 60 ${gy + 20} 12 air`);
  dim.runCommand(`kill @e[type=${VEHICLE}]`);
  dim.runCommand("kill @e[type=cow]");
  dim.runCommand(`kill @e[type=${SEAT_PROBE}]`);
  await wait(5);
  return { dim, gy };
}

function accelAndStep1(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`fill 60 ${a.gy} 15 70 ${a.gy} 25 stone`);
  return withCar(a, 5.5, 20.5, -90, async (car) => {
    drive(car, 0, 1);
    let reach = -1;
    for (let t = 0; t < 200; t++) {
      await wait(1);
      if (reach < 0 && hlen(car.getVelocity()) >= SPEC.maxSpeed * 0.95)
        reach = t;
      if (car.location.x > 63) break;
    }
    const climbed = car.location.y >= a.gy + 0.9;
    // The tick the input takes effect shifts by 0 or 1 depending on pack run
    // order, so the 45-tick target gets one tick of slack.
    return {
      pass: reach >= 0 && reach <= 46 && climbed,
      detail: `reach95=${reach} climbed=${climbed}`,
    };
  });
}

async function turnAndHandbrake(a: Arena): Promise<Outcome> {
  function measureTurn(
    handbrake: boolean,
  ): Promise<{ maxSlip: number; maxSpeed: number; inside: boolean }> {
    // A left turn heads toward -z, so start near the +z edge: the grip run
    // drifts about 19 blocks sideways, and leaving the floor or the ticking
    // area would change the slip.
    return withCar(a, 5.5, 37.5, -90, async (car) => {
      drive(car, 0, 1);
      await wait(45);
      drive(car, 1, 1, handbrake);
      let maxSlip = 0;
      let maxSpeed = 0;
      let inside = true;
      for (let t = 0; t < 20; t++) {
        await wait(1);
        inside &&= insideArena(car.location);
        const v = car.getVelocity();
        const speed = hlen(v);
        maxSpeed = Math.max(maxSpeed, speed);
        if (speed > 0.02) {
          maxSlip = Math.max(maxSlip, slipAngleDeg(v, car.getRotation().y));
        }
      }
      return { maxSlip, maxSpeed, inside };
    });
  }
  const grip = await measureTurn(false);
  const hb = await measureTurn(true);
  return {
    pass:
      grip.inside &&
      hb.inside &&
      hb.maxSlip > grip.maxSlip &&
      hb.maxSpeed <= SPEC.maxSpeed * 1.02,
    detail: `inside=${grip.inside && hb.inside} slip grip=${grip.maxSlip.toFixed(1)} hb=${hb.maxSlip.toFixed(1)} hbMaxSpeed=${hb.maxSpeed.toFixed(3)}`,
  };
}

function summonCow(a: Arena, x: number, z: number): Entity | undefined {
  // Mobs from spawnEntity far from players despawn at once, so use summon.
  a.dim.runCommand(`summon minecraft:cow ${x} ${a.gy} ${z}`);
  return a.dim.getEntities({
    type: "minecraft:cow",
    location: { x, y: a.gy, z },
    maxDistance: 2,
  })[0];
}

function ramCow(a: Arena): Promise<Outcome> {
  return withCar(a, 5.5, 30.5, -90, async (car) => {
    const cow = summonCow(a, 25.5, 30.5);
    if (!cow) return { pass: false, detail: "cow not found" };
    try {
      // A wandering cow can step out of the car's path. Resistance III takes
      // 60% off the ram damage, so the first hit (up to 18) leaves a 10 HP cow
      // alive and its knockback measurable.
      cow.addEffect("slowness", 600, { amplifier: 255, showParticles: false });
      cow.addEffect("resistance", 600, { amplifier: 2, showParticles: false });
      const health = () => cow.getComponent("minecraft:health")?.currentValue;
      const hp0 = health() ?? 0;
      const x0 = cow.location.x;
      drive(car, 0, 1);
      const samples: RamSample[] = [];
      for (let t = 0; t < 80; t++) {
        await wait(1);
        const valid = cow.isValid;
        samples.push({
          valid,
          hp: valid ? (health() ?? 0) : 0,
          x: valid ? cow.location.x : Number.NaN,
        });
        const hit = hitTick(hp0, samples);
        // Removing the car on the hit tick leaves the knockback as the only
        // thing moving the cow; a car still driving would shove it along too.
        if (hit >= 0 && car.isValid) car.remove();
        if (!valid || (hit >= 0 && samples.length > hit + PUSH_WINDOW)) break;
      }
      return judgeRam(hp0, x0, samples);
    } finally {
      if (cow.isValid) cow.remove();
    }
  });
}

function wallDiagonal(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`fill 45 ${a.gy} 20 45 ${a.gy + 3} 40 stone`);
  return withCar(a, 20.5, 24.5, -70, async (car) => {
    drive(car, 0, 1);
    let before = 0;
    let maxAfter = 0;
    let hit = false;
    for (let t = 0; t < 120; t++) {
      await wait(1);
      const v = car.getVelocity();
      if (!hit && car.location.x > 43.5) hit = true;
      if (hit) maxAfter = Math.max(maxAfter, Math.abs(v.z));
      else before = Math.abs(v.z);
    }
    const x = car.location.x;
    return {
      pass: hit && x < 45 && maxAfter <= before + 0.1,
      detail: `x=${x.toFixed(2)} sideBefore=${before.toFixed(3)} sideAfterMax=${maxAfter.toFixed(3)}`,
    };
  });
}

function step2(
  a: Arena,
  z: number,
  yaw: number,
  stepX: number,
): Promise<Outcome> {
  // Place a 2-high step spanning z ± 6, and back-compute the start so that a
  // diagonal approach still meets the step at its z center.
  a.dim.runCommand(
    `fill ${stepX} ${a.gy} ${z - 6} ${stepX + 8} ${a.gy + 1} ${z + 6} stone`,
  );
  const dir = forward(yaw);
  const startX = stepX - 25 + 0.5;
  const startZ = z - 25 * (dir.z / dir.x) + 0.5;
  return withCar(a, startX, startZ, yaw, async (car) => {
    drive(car, 0, 1);
    let maxY = a.gy;
    for (let t = 0; t < 120; t++) {
      await wait(1);
      maxY = Math.max(maxY, car.location.y);
      if (car.location.x > stepX + 3) break;
    }
    const side = Math.abs(
      (car.location.x - startX) * dir.z - (car.location.z - startZ) * dir.x,
    );
    const climbed = maxY >= a.gy + 1.9;
    return {
      pass: climbed && side < 0.5,
      detail: `maxY=${(maxY - a.gy).toFixed(2)} sideOffset=${side.toFixed(2)}`,
    };
  });
}

/** The seat a rider sits in, judged the same way as the main pack (ADR 0019). */
function seatOf(vehicle: Entity, rider: Entity): number {
  const offset = {
    x: rider.location.x - vehicle.location.x,
    z: rider.location.z - vehicle.location.z,
  };
  return nearestSeat(toLocal(offset, forward(vehicle.getRotation().y)));
}

// Bedrock seats riders by their index in the rider list, so a passenger moves
// up into the driver's seat when the driver gets out (ADR 0019).
async function seatsAfterDriverLeaves(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`summon ${SEAT_PROBE} 30.5 ${a.gy} 8.5`);
  const probe = a.dim.getEntities({
    type: SEAT_PROBE,
    location: { x: 30.5, y: a.gy, z: 8.5 },
    maxDistance: 1.5,
  })[0];
  const cows = [0, 1, 2].map((i) => summonCow(a, 26.5 + i * 2, 4.5));
  try {
    const rideable = probe?.getComponent("minecraft:rideable");
    const [driver, passenger, next] = cows;
    if (!probe || !rideable || !driver || !passenger || !next)
      return { pass: false, detail: "probe or cows missing" };
    probe.setRotation({ x: 0, y: -90 });
    const board = async (cow: Entity) => {
      const ok = rideable.addRider(cow);
      await wait(5);
      return ok;
    };
    const boarded = (await board(driver)) && (await board(passenger));
    const before = [seatOf(probe, driver), seatOf(probe, passenger)];
    rideable.ejectRider(driver);
    await wait(5);
    const afterLeave = seatOf(probe, passenger);
    const nextBoarded = await board(next);
    const afterBoard = [seatOf(probe, passenger), seatOf(probe, next)];
    return {
      pass:
        boarded &&
        nextBoarded &&
        before.join() === "0,1" &&
        afterLeave === 0 &&
        afterBoard.join() === "0,1",
      detail: `boarded=${boarded && nextBoarded} before=${before} afterLeave=${afterLeave} afterBoard=${afterBoard}`,
    };
  } finally {
    for (const cow of cows) if (cow?.isValid) cow.remove();
    if (probe?.isValid) probe.remove();
  }
}

// Players cannot be simulated, so this drives the entity events that the dye
// interaction triggers and reads back the variant the texture is chosen by.
function paintEvents(a: Arena): Promise<Outcome> {
  return withCar(a, 5.5, 35.5, 0, async (car) => {
    const variant = () => car.getComponent("minecraft:variant")?.value;
    const seen = [`start=${variant()}`];
    let pass = variant() === PAINT_VARIANT.khaki;
    for (const paint of [...PAINTS.slice(1), PAINTS[0]]) {
      car.triggerEvent(paintEvent(paint));
      await wait(1);
      seen.push(`${paint}=${variant()}`);
      pass &&= variant() === PAINT_VARIANT[paint];
    }
    return { pass, detail: seen.join(" ") };
  });
}

// The switch item needs a player, so this sets the property the switch flips
// and checks the light blocks the main pack keeps in front of the vehicle.
function headlightsFollowAndClear(a: Arena): Promise<Outcome> {
  return withCar(a, 5.5, 12.5, -90, async (car) => {
    const lightAt = (c: { x: number; y: number; z: number }) =>
      a.dim.getBlock(c)?.typeId === LIGHT_BLOCK;
    const lightsAround = () => {
      let n = 0;
      for (let x = 0; x <= 60; x++)
        for (let z = 9; z <= 16; z++)
          for (let dy = 0; dy <= 2; dy++)
            if (lightAt({ x, y: a.gy + dy, z })) n++;
      return n;
    };
    car.setProperty(HEADLIGHTS_PROPERTY, true);
    await wait(3);
    const parked = headlightCells(car.location, car.getRotation().y);
    const litParked = parked.filter(lightAt).length;
    drive(car, 0, 1);
    await wait(30);
    drive(car, 0, 0);
    await wait(20);
    const moved = headlightCells(car.location, car.getRotation().y);
    const litMoved = moved.filter(lightAt).length;
    const whileOn = lightsAround();
    const level = Math.abs(car.location.y - a.gy) < 0.1;
    car.setProperty(HEADLIGHTS_PROPERTY, false);
    await wait(3);
    const afterOff = lightsAround();
    return {
      pass:
        litParked === parked.length &&
        litMoved === moved.length &&
        whileOn === moved.length &&
        level &&
        afterOff === 0,
      detail: `parked=${litParked}/${parked.length} moved=${litMoved}/${moved.length} whileOn=${whileOn} level=${level} afterOff=${afterOff}`,
    };
  });
}

const FLIGHT_LANE = { x: 5.5, z: 4.5 } as const;

function flightMode(car: Entity): string {
  return String(car.getProperty(FLIGHT_PROPERTY));
}

/** Two Jump presses 4 ticks apart (ADR 0021). */
async function doubleTap(car: Entity): Promise<void> {
  for (let i = 0; i < 2; i++) {
    drive(car, 0, 0, true);
    await wait(2);
    drive(car, 0, 0, false);
    await wait(2);
  }
}

/** Runs `run` on a car that has taken off over the flight lane. */
function withAirborneCar<T>(
  a: Arena,
  run: (car: Entity) => Promise<T>,
): Promise<T> {
  return withCar(a, FLIGHT_LANE.x, FLIGHT_LANE.z, -90, async (car) => {
    await doubleTap(car);
    await wait(SPEC.takeoffTicks + 5);
    return run(car);
  });
}

/** Ticks until the flight mode reads ground, or -1 after `limit` ticks. */
async function ticksUntilGround(car: Entity, limit: number): Promise<number> {
  for (let t = 0; t < limit; t++) {
    await wait(1);
    if (flightMode(car) === "ground") return t;
  }
  return -1;
}

function flightTakeoff(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    const mode = flightMode(car);
    const rise = car.location.y - a.gy;
    return {
      pass: mode === "flying" && rise >= 1.2 && rise <= 1.8,
      detail: `mode=${mode} rise=${rise.toFixed(2)}`,
    };
  });
}

function flightCruise(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    drive(car, 0, 1);
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let speed = 0;
    for (let t = 0; t < 60; t++) {
      await wait(1);
      if (t >= 20) {
        minY = Math.min(minY, car.location.y);
        maxY = Math.max(maxY, car.location.y);
      }
      if (t >= 50) speed = Math.max(speed, hlen(car.getVelocity()));
    }
    const altRange = maxY - minY;
    // At steady state the speed is maxSpeed * engineDrag / SPEC.flightDrag,
    // so the ratio reveals the engine's drag with gravity off.
    const measuredDrag = (SPEC.flightDrag * speed) / SPEC.maxSpeed;
    return {
      pass:
        altRange <= 0.5 &&
        speed >= SPEC.maxSpeed * 0.95 &&
        speed <= SPEC.maxSpeed * 1.05,
      detail: `altRange=${altRange.toFixed(3)} speed=${speed.toFixed(3)} measuredDrag=${measuredDrag.toFixed(3)}`,
    };
  });
}

function flightClimbDescend(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    drive(car, 0, 1, false, -30);
    await wait(35);
    const top = car.location.y;
    drive(car, 0, 1, false, 30);
    await wait(10);
    const climbed = top - a.gy;
    const sank = top - car.location.y;
    return {
      pass: climbed >= 4 && sank >= 1.5,
      detail: `climbed=${climbed.toFixed(2)} sank=${sank.toFixed(2)}`,
    };
  });
}

function flightLand(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    await doubleTap(car);
    const afterTap = flightMode(car);
    const landedAt = await ticksUntilGround(car, 60);
    const restY = car.location.y - a.gy;
    // Gravity must be back on: a hop up has to come down again.
    car.applyImpulse({ x: 0, y: 0.5, z: 0 });
    await wait(40);
    const afterHop = car.location.y - a.gy;
    return {
      pass:
        afterTap === "landing" &&
        landedAt >= 0 &&
        Math.abs(restY) <= 0.1 &&
        Math.abs(afterHop) <= 0.1,
      detail: `afterTap=${afterTap} landedAt=${landedAt} restY=${restY.toFixed(2)} afterHop=${afterHop.toFixed(2)}`,
    };
  });
}

function flightDriverless(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    clearInput(car);
    await wait(3);
    const afterClear = flightMode(car);
    const landedAt = await ticksUntilGround(car, 60);
    return {
      pass: afterClear === "landing" && landedAt >= 0,
      detail: `afterClear=${afterClear} landedAt=${landedAt}`,
    };
  });
}

async function runAll(runId: string): Promise<void> {
  const a = await setupArena();
  const tests: [string, () => Promise<Outcome>][] = [
    ["accel_and_step1", () => accelAndStep1(a)],
    ["turn_and_handbrake", () => turnAndHandbrake(a)],
    ["ram_cow", () => ramCow(a)],
    ["wall_diagonal", () => wallDiagonal(a)],
    ["step2_front", () => step2(a, 8, -90, 100)],
    ["step2_diagonal", () => step2(a, 30, -60, 100)],
    ["seats_after_driver_leaves", () => seatsAfterDriverLeaves(a)],
    ["paint_events", () => paintEvents(a)],
    ["headlights_follow_and_clear", () => headlightsFollowAndClear(a)],
    ["flight_takeoff", () => flightTakeoff(a)],
    ["flight_cruise", () => flightCruise(a)],
    ["flight_climb_descend", () => flightClimbDescend(a)],
    ["flight_land", () => flightLand(a)],
    ["flight_driverless", () => flightDriverless(a)],
  ];
  let passed = 0;
  const lines: string[] = [];
  for (const [name, test] of tests) {
    let outcome: Outcome;
    try {
      outcome = await test();
    } catch (e) {
      outcome = { pass: false, detail: `error: ${e}` };
    }
    if (outcome.pass) passed++;
    lines.push(`${outcome.pass ? "PASS" : "FAIL"} ${name} ${outcome.detail}`);
  }
  for (const line of lines) log(runId, line);
  log(runId, `SUMMARY pass=${passed} fail=${tests.length - passed}`);
}

// Two runs would share the arena and kill each other's cars in setupArena.
let activeRun: string | undefined;

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== TEST_EVENT) return;
  const runId = runIdFrom(ev.message);
  if (activeRun !== undefined) {
    log(runId, `SUMMARY pass=0 fail=1 error=run ${activeRun} in progress`);
    return;
  }
  activeRun = runId;
  runAll(runId)
    .catch((e) => log(runId, `SUMMARY pass=0 fail=1 error=${e}`))
    .finally(() => {
      activeRun = undefined;
    });
});
console.warn(`${LOG_TAG} loaded`);
