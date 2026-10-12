// In-game tests (ADR 0010). They run in a script environment separate from the
// main Behavior Pack, so they drive the vehicle through script events.
import { type Dimension, type Entity, system, world } from "@minecraft/server";
import { dot, forward } from "../domain/shared/vec";
import { BoatDrive } from "../domain/vehicle/boatDrive";
import { type Form, isForm } from "../domain/vehicle/form";
import { headlightCells } from "../domain/vehicle/headlights";
import { initialMotion } from "../domain/vehicle/motion";
import { PAINTS } from "../domain/vehicle/paint";
import { SPORTSBOAT_PROFILE } from "../domain/vehicle/profile";
import { nearestSeat, toLocal } from "../domain/vehicle/seats";
import { SPEC } from "../domain/vehicle/spec";
import {
  BANK_PROPERTY,
  ENTITY_TYPE,
  FORM_PROPERTY,
  GEAR_DOWN_PROPERTY,
  HEADLIGHTS_PROPERTY,
  TEST_INPUT_EVENT as INPUT_EVENT,
  LIGHT_BLOCK,
  PAINT_VARIANT,
  paintEvent,
} from "../infrastructure/vehicle/bedrock/identifiers";
import { LOG_TAG, linePrefix, runIdFrom, TEST_EVENT } from "./protocol";
import { hitTick, judgeRam, PUSH_WINDOW, type RamSample } from "./ramJudge";

// setupArena clears and floors this x/z rectangle and keeps it ticking.
const ARENA = { minX: 0, maxX: 120, minZ: 0, maxZ: 90 } as const;

// Mirrors the SUV's minecraft:rideable but seats cows, because only players
// can ride the SUV and a test has no players (ADR 0010).
const SEAT_PROBE = "yasu_ride_test:seat_probe";

interface Outcome {
  pass: boolean;
  detail: string;
  lines?: string[];
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

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function drive(car: Entity, x: number, y: number, jump = false): void {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},${x},${y},${jump ? 1 : 0}`);
}

function clearInput(car: Entity): void {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},clear`);
}

function spawnCar(a: Arena, x: number, z: number, yaw: number): Entity {
  a.dim.runCommand(`summon ${ENTITY_TYPE.suv} ${x} ${a.gy} ${z}`);
  const car = a.dim.getEntities({
    type: ENTITY_TYPE.suv,
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
  // An existing area of the same name keeps its old bounds; withPool reports
  // the fill that then fails in the chunks left out.
  dim.runCommand(
    `tickingarea add ${minX} -64 ${minZ} ${maxX} 0 ${maxZ} yasu_ride_arena true`,
  );
  await wait(60);
  const top = dim.getTopmostBlock({ x: 5, z: 20 });
  if (!top) throw new Error("arena chunk not loaded");
  const gy = top.location.y + 1;
  // fill is capped at 32,768 blocks per call, so the clear is split in four.
  const midX = (minX + maxX) / 2;
  const midZ = Math.floor((minZ + maxZ) / 2);
  for (const [x0, x1] of [
    [minX, midX],
    [midX + 1, maxX],
  ])
    for (const [z0, z1] of [
      [minZ, midZ],
      [midZ + 1, maxZ],
    ])
      dim.runCommand(`fill ${x0} ${gy} ${z0} ${x1} ${gy + 6} ${z1} air`);
  dim.runCommand(
    `fill ${minX} ${gy - 1} ${minZ} ${maxX} ${gy - 1} ${maxZ} stone`,
  );
  // The flight tests climb up to about 8 blocks above the floor along z = 4.5.
  dim.runCommand(`fill ${minX} ${gy + 7} 0 60 ${gy + 20} 12 air`);
  dim.runCommand(`kill @e[type=${ENTITY_TYPE.suv}]`);
  dim.runCommand(`kill @e[type=${ENTITY_TYPE.sportsboat}]`);
  dim.runCommand("kill @e[type=cow]");
  dim.runCommand(`kill @e[type=${SEAT_PROBE}]`);
  // The pool's water replaces the stone under passable_no_hop's carpets and
  // torches, which then drop as items.
  dim.runCommand("kill @e[type=item]");
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

// Carpets and torches have no collision box, so the step look-ahead must not
// jump for them (ADR 0035).
function passableNoHop(a: Arena): Promise<Outcome> {
  a.dim.runCommand(`fill 30 ${a.gy} 25 34 ${a.gy} 28 white_carpet`);
  a.dim.runCommand(`fill 40 ${a.gy} 25 40 ${a.gy} 28 torch`);
  return withCar(a, 5.5, 26.5, -90, async (car) => {
    drive(car, 0, 1);
    let maxRise = 0;
    for (let t = 0; t < 120; t++) {
      await wait(1);
      maxRise = Math.max(maxRise, car.location.y - a.gy);
      if (car.location.x > 45) break;
    }
    const passed = car.location.x > 45;
    return {
      pass: passed && maxRise < 0.2,
      detail: `passed=${passed} maxRise=${maxRise.toFixed(2)}`,
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

// Players cannot be simulated, so this drives the entity events that a hit
// with a dye triggers and reads back the variant the texture is chosen by.
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

function vehicleForm(car: Entity): Form | undefined {
  const form = car.getProperty(FORM_PROPERTY);
  return isForm(form) ? form : undefined;
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

/** Ticks until the vehicle form reads `form`, or -1 after `limit` ticks. */
async function ticksUntilForm(
  car: Entity,
  form: Form,
  limit: number,
): Promise<number> {
  for (let t = 0; t < limit; t++) {
    await wait(1);
    if (vehicleForm(car) === form) return t;
  }
  return -1;
}

function ticksUntilGround(car: Entity, limit: number): Promise<number> {
  return ticksUntilForm(car, "car", limit);
}

function flightTakeoff(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    const form = vehicleForm(car);
    const rise = car.location.y - a.gy;
    return {
      pass: form === "hover" && rise >= 1.2 && rise <= 1.8,
      detail: `form=${form} rise=${rise.toFixed(2)}`,
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
    drive(car, 0, 1, true);
    await wait(20);
    const top = car.location.y;
    drive(car, 0, -1);
    await wait(10);
    const climbed = top - a.gy;
    const sank = top - car.location.y;
    return {
      pass: climbed >= 4 && sank >= 1.5,
      detail: `climbed=${climbed.toFixed(2)} sank=${sank.toFixed(2)}`,
    };
  });
}

function flightBank(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    const bank = () => Number(car.getProperty(BANK_PROPERTY));
    // Turn right: the lane runs along the arena's low-z edge, and a car that
    // leaves the ticking area stops updating.
    drive(car, -1, 1);
    await wait(20);
    const turning = bank();
    drive(car, 0, 1);
    await wait(20);
    const straight = bank();
    return {
      // Steering right lowers the right side, so the angle is positive (ADR 0026).
      pass: turning >= SPEC.maxBank / 2 && straight === 0,
      detail: `turning=${turning.toFixed(1)} straight=${straight.toFixed(1)}`,
    };
  });
}

function flightLand(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    // Climb well above gearDownHeight so the wheels have to wait for the ground.
    drive(car, 0, 0, true);
    await wait(15);
    drive(car, 0, 0, false);
    await wait(2);
    await doubleTap(car);
    const afterTap = vehicleForm(car);
    let gearY = Number.NaN;
    let landedAt = -1;
    for (let t = 0; t < 80; t++) {
      await wait(1);
      if (Number.isNaN(gearY) && car.getProperty(GEAR_DOWN_PROPERTY) === true)
        gearY = car.location.y - a.gy;
      if (vehicleForm(car) === "car") {
        landedAt = t;
        break;
      }
    }
    const restY = car.location.y - a.gy;
    // Gravity must be back on: a hop up has to come down again.
    car.applyImpulse({ x: 0, y: 0.5, z: 0 });
    await wait(40);
    const afterHop = car.location.y - a.gy;
    return {
      pass:
        afterTap === "landing" &&
        landedAt >= 0 &&
        gearY >= 2 &&
        gearY <= SPEC.gearDownHeight + 0.5 &&
        Math.abs(restY) <= 0.1 &&
        Math.abs(afterHop) <= 0.1,
      detail: `afterTap=${afterTap} gearY=${gearY.toFixed(2)} landedAt=${landedAt} restY=${restY.toFixed(2)} afterHop=${afterHop.toFixed(2)}`,
    };
  });
}

function flightTouchdown(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    drive(car, 0, -1);
    const landedAt = await ticksUntilGround(car, 40);
    // Release the stick, or it reverses the car once it is on the ground.
    drive(car, 0, 0);
    await wait(20);
    const restY = car.location.y - a.gy;
    const gearDown = car.getProperty(GEAR_DOWN_PROPERTY) === true;
    return {
      pass: landedAt >= 0 && Math.abs(restY) <= 0.1 && gearDown,
      detail: `landedAt=${landedAt} restY=${restY.toFixed(2)} gearDown=${gearDown}`,
    };
  });
}

function flightDriverless(a: Arena): Promise<Outcome> {
  return withAirborneCar(a, async (car) => {
    clearInput(car);
    await wait(3);
    const afterClear = vehicleForm(car);
    const landedAt = await ticksUntilGround(car, 60);
    return {
      pass: afterClear === "landing" && landedAt >= 0,
      detail: `afterClear=${afterClear} landedAt=${landedAt}`,
    };
  });
}

// 80 blocks across z, so a submarine has room to turn (submarine_bank); the
// lane runs along the low-z edge and right turns head into the open water.
const POOL = { minX: 15, maxX: 85, minZ: 2, maxZ: 81, z: 7.5 } as const;
// Along +z at x = 20.5 the pool is clear for a full throttle and coast;
// wall_diagonal's wall stands at x = 45.
const POOL_SOUTH_LANE = { x: POOL.minX + 5.5, z: POOL.minZ + 2.5, yaw: 0 };
// Deep enough for a full car height of water with a block under it. In the
// flat dev world (gy = -60) this puts the pool's stone floor at -64, the
// bottom of the world, so a carHeight above 2 no longer fits; withPool throws
// instead of filling below the world.
const DIVE_DEPTH = Math.ceil(SPEC.carHeight + 1);
// The car holds depth exactly once it is a submarine (submarine_dive measured
// a range of 0.000), so 0.1 only absorbs float noise in the reported position.
// The same margin keeps the held depth clear of the bed and the float line, so
// a car that sank onto the bed or rose to the surface fails the hold check.
const DEPTH_HOLD_TOLERANCE = 0.1;

function withinFivePercent(value: number, target: number): boolean {
  return value >= target * 0.95 && value <= target * 1.05;
}

async function withPool<T>(
  a: Arena,
  depth: number,
  run: () => Promise<T>,
): Promise<T> {
  const { minX, maxX, minZ, maxZ } = POOL;
  const bottom = a.gy - depth;
  const worldMin = a.dim.heightRange.min;
  if (bottom - 1 < worldMin)
    throw new Error(
      `Pool of depth ${depth} needs a floor at y=${bottom - 1}, below the world's minimum y=${worldMin}`,
    );
  const fillPool = (block: string) =>
    a.dim.runCommand(
      `fill ${minX} ${bottom} ${minZ} ${maxX} ${a.gy - 1} ${maxZ} ${block}`,
    );
  a.dim.runCommand(
    `fill ${minX} ${bottom - 1} ${minZ} ${maxX} ${bottom - 1} ${maxZ} stone`,
  );
  // Contain the water even when the arena's original terrain has caves.
  for (const x of [minX - 1, maxX + 1])
    a.dim.runCommand(
      `fill ${x} ${bottom} ${minZ - 1} ${x} ${a.gy - 1} ${maxZ + 1} stone`,
    );
  for (const z of [minZ - 1, maxZ + 1])
    a.dim.runCommand(
      `fill ${minX} ${bottom} ${z} ${maxX} ${a.gy - 1} ${z} stone`,
    );
  // runCommand reports a fill into unloaded chunks as successCount 0 instead
  // of throwing. Seen in game with an arena ticking area kept from a smaller
  // arena under the same name: every submarine test then failed with
  // enteredAt=-1.
  if (fillPool("water").successCount === 0)
    throw new Error(
      `the pool was not filled: check that "tickingarea list" shows yasu_ride_arena covering x ${ARENA.minX}-${ARENA.maxX}, z ${ARENA.minZ}-${ARENA.maxZ}`,
    );
  try {
    await wait(5);
    return await run();
  } finally {
    fillPool("air");
    a.dim.runCommand(
      `fill ${minX} ${a.gy - 1} ${minZ} ${maxX} ${a.gy - 1} ${maxZ} stone`,
    );
  }
}

async function withBoat<T>(
  a: Arena,
  run: (boat: Entity) => Promise<T>,
  start: Horizontal & { yaw: number } = {
    x: POOL.minX + 5.5,
    z: POOL.z,
    yaw: -90,
  },
): Promise<T> {
  const { x, z } = start;
  a.dim.runCommand(`summon ${ENTITY_TYPE.sportsboat} ${x} ${a.gy} ${z}`);
  const boat = a.dim.getEntities({
    type: ENTITY_TYPE.sportsboat,
    location: { x, y: a.gy, z },
    maxDistance: 1.5,
  })[0];
  if (!boat) throw new Error("boat not spawned at the pool surface");
  boat.setRotation({ x: 0, y: start.yaw });
  try {
    await wait(40); // Let the boat settle on the water
    return await run(boat);
  } finally {
    clearInput(boat);
    if (boat.isValid) boat.remove();
  }
}

function boatFloat(a: Arena): Promise<Outcome> {
  return withPool(a, 3, () =>
    withBoat(a, async (boat) => {
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (let t = 0; t < 60; t++) {
        await wait(1);
        minY = Math.min(minY, boat.location.y);
        maxY = Math.max(maxY, boat.location.y);
      }
      const bob = maxY - minY;
      const minDraft = a.gy - maxY;
      const maxDraft = a.gy - minY;
      return {
        pass: bob <= 0.3 && minDraft >= 0.3 && maxDraft <= 0.6,
        detail: `bob=${bob.toFixed(3)} draft=${minDraft.toFixed(3)}-${maxDraft.toFixed(3)}`,
      };
    }),
  );
}

function feetInWater(boat: Entity): boolean {
  const { x, y, z } = boat.location;
  const block = boat.dimension.getBlock({
    x: Math.floor(x),
    y: Math.floor(y),
    z: Math.floor(z),
  });
  return (
    block?.typeId === "minecraft:water" ||
    block?.typeId === "minecraft:flowing_water"
  );
}

function boatDrag(a: Arena): Promise<Outcome> {
  return withPool(a, 3, () =>
    withBoat(
      a,
      async (boat) => {
        const start = boat.location;
        let motion = initialMotion(boat.getRotation().y);
        let observed = boat.getVelocity();
        const waterRatios: number[] = [];
        const airRatios: number[] = [];
        const steadySpeeds: number[] = [];
        const coastRatios: number[] = [];
        const steadyDrag: number[] = [];
        const replica = new BoatDrive();
        const lines: string[] = [];
        drive(boat, 0, 1);
        for (let t = 0; t < 93; t++) {
          // The main pack acts on a script event one tick after it is sent:
          // without this lag the replica's estimate drifted to 0.72 while the
          // boat held 1.11 blocks/tick, which needs about 0.84.
          const throttle = t >= 1 && t <= 80;
          if (t === 80) clearInput(boat);
          const step = replica.step(
            motion,
            { moveX: 0, moveY: throttle ? 1 : 0, jump: false },
            {
              tick: t,
              riders: [],
              velocity: observed,
              onGround: false,
              waterDepth: Math.max(0.01, a.gy - boat.location.y),
              solidAt: () => false,
              targets: () => [],
            },
            SPORTSBOAT_PROFILE,
          );
          motion = step.motion;
          const given = {
            x: observed.x + step.impulse.x,
            z: observed.z + step.impulse.z,
          };
          const previousSpeed = hlen(observed);
          // Each row pairs the given velocity at t with the observation at t+1.
          await wait(1);
          observed = boat.getVelocity();
          const speed = hlen(observed);
          const water = feetInWater(boat);
          const denominator = throttle ? dot(given, given) : previousSpeed;
          const ratio =
            denominator > 0
              ? (throttle ? dot(observed, given) : speed) / denominator
              : undefined;
          if (ratio !== undefined) {
            if (throttle && t >= 5)
              (water ? waterRatios : airRatios).push(ratio);
            if (!throttle) coastRatios.push(ratio);
          }
          if (throttle && t >= 60) {
            steadySpeeds.push(speed);
            if (motion.waterDrag !== undefined)
              steadyDrag.push(motion.waterDrag);
          }
          lines.push(
            `tick=${t + 1} ${throttle ? "throttle" : "coast"} impulse=${hlen(step.impulse).toFixed(3)} given=${hlen(given).toFixed(3)} observed=${speed.toFixed(3)} feet=${(boat.location.y - a.gy).toFixed(3)} water=${water ? 1 : 0} drag=${motion.waterDrag?.toFixed(3) ?? "n/a"} ratio=${ratio?.toFixed(3) ?? "n/a"}`,
          );
        }
        const meanText = (values: number[]) =>
          values.length > 0 ? mean(values).toFixed(3) : "n/a";
        const summary = (values: number[]) =>
          `mean=${meanText(values)} spread=${values.length > 0 ? (Math.max(...values) - Math.min(...values)).toFixed(3) : "n/a"} n=${values.length}`;
        const distance = hlen({
          x: boat.location.x - start.x,
          z: boat.location.z - start.z,
        });
        return {
          pass: distance >= 5,
          detail: `distance=${distance.toFixed(3)} water(${summary(waterRatios)}) air(${summary(airRatios)}) steadySpeed=${meanText(steadySpeeds)} coastRatio=${meanText(coastRatios)} finalDrag=${motion.waterDrag?.toFixed(3) ?? "n/a"} steadyDrag=${Math.min(...steadyDrag).toFixed(3)}-${Math.max(...steadyDrag).toFixed(3)}`,
          lines,
        };
      },
      POOL_SOUTH_LANE,
    ),
  );
}

function boatCruise(a: Arena): Promise<Outcome> {
  return withPool(a, 3, async () => {
    const steadySpeed = await withBoat(
      a,
      async (boat) => {
        drive(boat, 0, 1);
        const speeds: number[] = [];
        for (let t = 1; t <= 70; t++) {
          await wait(1);
          if (t >= 51) speeds.push(hlen(boat.getVelocity()));
        }
        return mean(speeds);
      },
      POOL_SOUTH_LANE,
    );
    const turn = await withBoat(
      a,
      async (boat) => {
        drive(boat, 0, 1);
        const cruiseSpeeds: number[] = [];
        for (let t = 1; t <= 55; t++) {
          await wait(1);
          if (t >= 51) cruiseSpeeds.push(hlen(boat.getVelocity()));
        }
        const cruiseSpeed = mean(cruiseSpeeds);
        drive(boat, -1, 1);
        let yaw = boat.getRotation().y;
        let degrees = 0;
        let ticks = 0;
        const speeds: number[] = [];
        while (Math.abs(degrees) < 360 && ticks < 120) {
          await wait(1);
          const next = boat.getRotation().y;
          degrees += ((next - yaw + 540) % 360) - 180;
          yaw = next;
          ticks++;
          speeds.push(hlen(boat.getVelocity()));
        }
        return {
          cruiseSpeed,
          minSpeed: Math.min(...speeds),
          endSpeed: mean(speeds.slice(-5)),
          degrees,
          ticks,
          rate: degrees / ticks,
        };
      },
      // A right turn heads toward -x; this lane clears the pad and diagonal wall.
      { x: 75.5, z: POOL.minZ + 2.5, yaw: 0 },
    );
    return {
      pass:
        steadySpeed >= 0.95 * SPORTSBOAT_PROFILE.motion.maxSpeed &&
        Math.abs(turn.degrees) >= 360 &&
        turn.endSpeed >= 0.8 * turn.cruiseSpeed,
      detail: `steadySpeed=${steadySpeed.toFixed(3)} cruiseSpeed=${turn.cruiseSpeed.toFixed(3)} turnMinSpeed=${turn.minSpeed.toFixed(3)} turnEndSpeed=${turn.endSpeed.toFixed(3)} kept=${(turn.endSpeed / turn.cruiseSpeed).toFixed(3)} turn=${turn.degrees.toFixed(1)} turnTicks=${turn.ticks} turnRate=${turn.rate.toFixed(3)}`,
    };
  });
}

function boatShore(a: Arena): Promise<Outcome> {
  const shoreX = 40;
  return withPool(a, 3, () => {
    a.dim.runCommand(
      `fill ${shoreX} ${a.gy - 3} ${POOL.minZ} ${POOL.maxX} ${a.gy - 1} ${POOL.maxZ} stone`,
    );
    return withBoat(a, async (boat) => {
      const x0 = boat.location.x;
      drive(boat, 0, 1);
      await wait(120);
      const x = boat.location.x;
      const feet = boat.location.y - a.gy;
      const speed = hlen(boat.getVelocity());
      return {
        pass: x - x0 > 10 && x < shoreX && feet < 0 && speed < 0.05,
        detail: `x=${x.toFixed(2)} feet=${feet.toFixed(3)} speed=${speed.toFixed(3)}`,
      };
    });
  });
}

function boatRam(a: Arena): Promise<Outcome> {
  return withPool(a, 3, () =>
    withBoat(a, async (boat) => {
      const cow = summonCow(a, boat.location.x + 14, boat.location.z);
      if (!cow) return { pass: false, detail: "cow not found" };
      try {
        cow.addEffect("slowness", 600, {
          amplifier: 255,
          showParticles: false,
        });
        const hp0 = cow.getComponent("minecraft:health")?.currentValue ?? 0;
        const boatHp0 = boat.getComponent("minecraft:health")?.currentValue;
        drive(boat, 0, 1);
        let hp = hp0;
        let hit = false;
        for (let t = 0; t < 80 && !hit; t++) {
          await wait(1);
          hp = cow.isValid
            ? (cow.getComponent("minecraft:health")?.currentValue ?? 0)
            : 0;
          hit = hp < hp0;
        }
        const boatHp = boat.getComponent("minecraft:health")?.currentValue;
        return {
          pass: hp0 > 0 && hit && boatHp0 !== undefined && boatHp === boatHp0,
          detail: `cowHp=${hp0}->${hp} boatHp=${boatHp0}->${boatHp}`,
        };
      } finally {
        if (cow.isValid) cow.remove();
      }
    }),
  );
}

/** Runs `run` on a car heading +x along the pool, starting on dry ground. */
function withPoolCar<T>(
  a: Arena,
  run: (car: Entity) => Promise<T>,
): Promise<T> {
  return withCar(a, 5.5, POOL.z, -90, run);
}

/** Runs `run` on a car that has driven into the pool and become a submarine. */
function withDivingCar<T>(
  a: Arena,
  run: (car: Entity, enteredAt: number) => Promise<T>,
): Promise<T> {
  return withPoolCar(a, async (car) => {
    drive(car, 0, 1);
    const enteredAt = await ticksUntilForm(car, "submarine", 100);
    drive(car, 0, 0);
    await wait(5);
    return run(car, enteredAt);
  });
}

function submarineDive(a: Arena): Promise<Outcome> {
  return withPool(a, DIVE_DEPTH, () =>
    withDivingCar(a, async (car, enteredAt) => {
      const y0 = car.location.y;
      drive(car, 0, 1);
      let minY = y0;
      let maxY = y0;
      let speed = 0;
      let submerged = enteredAt >= 0;
      for (let t = 0; t < 60; t++) {
        await wait(1);
        submerged &&= vehicleForm(car) === "submarine";
        minY = Math.min(minY, car.location.y);
        maxY = Math.max(maxY, car.location.y);
        if (t >= 50) speed = Math.max(speed, hlen(car.getVelocity()));
      }
      const drift = Math.max(y0 - minY, maxY - y0);
      const bed = a.gy - DIVE_DEPTH;
      const floatLine = a.gy - SPEC.floatDraft;
      const heldDepth =
        drift <= DEPTH_HOLD_TOLERANCE &&
        minY > bed + DEPTH_HOLD_TOLERANCE &&
        maxY < floatLine - DEPTH_HOLD_TOLERANCE;
      // Sink to the bed, then rise with Jump held. The flat world's floor is
      // near the bottom of the world, so the pool is only a few blocks deep
      // and the rise is sampled in its first ticks, while still submerged.
      // The first ticks overshoot (the input lands a tick late and the
      // impulse assumes SPEC's drag), so only the last two samples count.
      drive(car, 0, -1);
      await wait(20);
      drive(car, 0, 0, true);
      const rise: number[] = [];
      for (let t = 0; t < 5; t++) {
        await wait(1);
        if (vehicleForm(car) !== "submarine") break;
        rise.push(car.getVelocity().y);
      }
      const steady = rise.slice(3);
      const riseSpeed =
        steady.length === 2
          ? steady.reduce((sum, v) => sum + v, 0) / steady.length
          : Number.NaN;
      // As in flight_cruise, the steady speed is target * engineDrag / SPEC drag,
      // so the ratio reveals the engine's drag in water.
      const measuredDrag = (SPEC.waterDrag * speed) / SPEC.maxWaterSpeed;
      const measuredVerticalDrag =
        (SPEC.waterVerticalDrag * riseSpeed) / SPEC.maxClimb;
      return {
        pass:
          submerged &&
          heldDepth &&
          withinFivePercent(speed, SPEC.maxWaterSpeed) &&
          withinFivePercent(riseSpeed, SPEC.maxClimb),
        detail: `enteredAt=${enteredAt} submerged=${submerged} y0=${(y0 - a.gy).toFixed(3)} drift=${drift.toFixed(3)} speed=${speed.toFixed(3)} riseSpeed=${riseSpeed.toFixed(3)} measuredDrag=${measuredDrag.toFixed(3)} measuredVerticalDrag=${measuredVerticalDrag.toFixed(3)}`,
      };
    }),
  );
}

function submarineBank(a: Arena): Promise<Outcome> {
  return withPool(a, DIVE_DEPTH, () =>
    withDivingCar(a, async (car, enteredAt) => {
      const bank = () => Number(car.getProperty(BANK_PROPERTY));
      // Turn right into the open water, as flight_bank does in the air (ADR 0044).
      drive(car, -1, 1);
      await wait(20);
      const turning = bank();
      drive(car, 0, 0);
      await wait(20);
      const straight = bank();
      return {
        pass:
          enteredAt >= 0 &&
          vehicleForm(car) === "submarine" &&
          turning >= SPEC.maxBank / 2 &&
          straight === 0,
        detail: `enteredAt=${enteredAt} turning=${turning.toFixed(1)} straight=${straight.toFixed(1)}`,
      };
    }),
  );
}

function submarineBreach(a: Arena): Promise<Outcome> {
  return withPool(a, DIVE_DEPTH, () =>
    withDivingCar(a, async (car, enteredAt) => {
      drive(car, 0, 0, true);
      let hoverAt = -1;
      let noCar = vehicleForm(car) === "submarine";
      let dry = false;
      for (let t = 0; t < 60; t++) {
        await wait(1);
        const form = vehicleForm(car);
        noCar &&= form !== "car";
        if (form === "hover") {
          hoverAt = t;
          dry = car.location.y >= a.gy;
          break;
        }
      }
      return {
        pass: enteredAt >= 0 && hoverAt >= 0 && noCar && dry,
        detail: `enteredAt=${enteredAt} hoverAt=${hoverAt} noCar=${noCar} dry=${dry} rise=${(car.location.y - a.gy).toFixed(2)}`,
      };
    }),
  );
}

function submarineShore(a: Arena): Promise<Outcome> {
  const depth = DIVE_DEPTH;
  const shoreX = 40;
  // Wide enough that the car, coasting after it becomes a car with the
  // throttle off, settles on the last submerged step instead of reaching the
  // dry one. It becomes a car near the submarine's top speed (0.5) and loses
  // only SPEC.drag (0.02) per tick: with tread 8 it became a car 1.9 blocks
  // past the riser and coasted 7.75 blocks up onto the dry step; with tread
  // 14 it coasted 7.96 blocks and its front stopped 2.5 blocks short of the
  // next riser.
  const tread = 14;
  const dryX = shoreX + (depth - 1) * tread;
  return withPool(a, depth, () => {
    // One-block steps up from the bed; the top one is level with the floor.
    for (let step = 1; step <= depth; step++) {
      a.dim.runCommand(
        `fill ${shoreX + (step - 1) * tread} ${a.gy - depth} ${POOL.minZ} ${POOL.maxX} ${a.gy - depth + step - 1} ${POOL.maxZ} stone`,
      );
    }
    return withDivingCar(a, async (car, enteredAt) => {
      drive(car, 0, 1);
      const landedAt = await ticksUntilGround(car, 200);
      const landedX = car.location.x;
      const landedY = car.location.y - a.gy;
      // It becomes a car while the step climb lifts it over the last
      // submerged step, once its roof clears the surface, and can still be in
      // the air (landedY=0.66 in the first run). With the throttle off it
      // drops onto that step, in water shallower than its roof, and must stay
      // a car there without flipping back to a submarine.
      drive(car, 0, 0);
      const forms = new Set<Form | undefined>();
      for (let t = 0; t < 40; t++) {
        await wait(1);
        forms.add(vehicleForm(car));
      }
      const parkedX = car.location.x;
      const parkedY = car.location.y - a.gy;
      // The submerged step's top is a block below the dry floor (gy - 1), so
      // half a block separates parking in water from parking on dry land.
      const parkedInWater = parkedX < dryX && parkedY < -0.5;
      drive(car, 0, 1);
      let climbedOut = false;
      for (let t = 0; t < 100 && !climbedOut; t++) {
        await wait(1);
        climbedOut =
          car.location.x >= dryX + 1 &&
          Math.abs(car.location.y - a.gy) <= 0.1 &&
          vehicleForm(car) === "car";
      }
      return {
        pass:
          enteredAt >= 0 &&
          landedAt >= 0 &&
          landedX >= shoreX &&
          landedX < dryX &&
          parkedInWater &&
          forms.size === 1 &&
          forms.has("car") &&
          climbedOut,
        detail: `enteredAt=${enteredAt} landedAt=${landedAt} landedX=${landedX.toFixed(2)} landedY=${landedY.toFixed(2)} parkedX=${parkedX.toFixed(2)} parkedY=${parkedY.toFixed(2)} parkedForms=${[...forms].join("/")} climbedOut=${climbedOut} x=${car.location.x.toFixed(2)} y=${(car.location.y - a.gy).toFixed(2)} form=${vehicleForm(car)}`,
      };
    });
  });
}

function submarineUnmanned(a: Arena): Promise<Outcome> {
  return withPool(a, DIVE_DEPTH, () =>
    withDivingCar(a, async (car, enteredAt) => {
      const startY = car.location.y;
      clearInput(car);
      let submarineOnly = vehicleForm(car) === "submarine";
      for (let t = 0; t < 120; t++) {
        await wait(1);
        submarineOnly &&= vehicleForm(car) === "submarine";
      }
      let minY = car.location.y;
      let maxY = minY;
      let maxFloatError = 0;
      for (let t = 0; t < 40; t++) {
        await wait(1);
        submarineOnly &&= vehicleForm(car) === "submarine";
        minY = Math.min(minY, car.location.y);
        maxY = Math.max(maxY, car.location.y);
        maxFloatError = Math.max(
          maxFloatError,
          Math.abs(a.gy - car.location.y - SPEC.floatDraft),
        );
      }
      const rise = car.location.y - startY;
      return {
        pass:
          enteredAt >= 0 &&
          submarineOnly &&
          rise >= 0.2 &&
          maxFloatError <= 0.1 &&
          maxY - minY <= 0.1,
        detail: `enteredAt=${enteredAt} submarineOnly=${submarineOnly} rise=${rise.toFixed(3)} maxFloatError=${maxFloatError.toFixed(3)} floatRange=${(maxY - minY).toFixed(3)}`,
      };
    }),
  );
}

function submarineShallow(a: Arena): Promise<Outcome> {
  return withPool(a, 1, () =>
    withPoolCar(a, async (car) => {
      drive(car, 0, 1);
      let carOnly = true;
      let crossed = false;
      let enteredWater = false;
      for (let t = 0; t < 240; t++) {
        await wait(1);
        carOnly &&= vehicleForm(car) === "car";
        enteredWater ||=
          car.location.x > POOL.minX + 2 && car.location.y < a.gy - 0.5;
        if (car.location.x > POOL.maxX + 3) {
          crossed = true;
          break;
        }
      }
      return {
        pass: carOnly && enteredWater && crossed,
        detail: `carOnly=${carOnly} enteredWater=${enteredWater} crossed=${crossed} x=${car.location.x.toFixed(2)}`,
      };
    }),
  );
}

// Summons one more car than the limit; the first one summoned is the oldest
// and must go (ADR 0038).
async function vehicleLimit(a: Arena): Promise<Outcome> {
  const cars: Entity[] = [];
  try {
    for (let i = 0; i <= SPEC.maxVehicles; i++) {
      cars.push(
        spawnCar(a, 60.5 + (i % 6) * 6, 30.5 + Math.floor(i / 6) * 6, 0),
      );
    }
    // Checked before the wait, so a car lost for another reason fails the test.
    const summoned = cars.filter((c) => c.isValid).length;
    await wait(20);
    const [oldest, ...rest] = cars;
    const restValid = rest.filter((c) => c.isValid).length;
    return {
      pass:
        summoned === cars.length &&
        !oldest?.isValid &&
        restValid === SPEC.maxVehicles,
      detail: `summoned=${summoned} oldestRemoved=${!oldest?.isValid} restValid=${restValid}`,
    };
  } finally {
    for (const car of cars) if (car.isValid) car.remove();
  }
}

async function runAll(runId: string): Promise<void> {
  const a = await setupArena();
  const tests: [string, () => Promise<Outcome>][] = [
    ["accel_and_step1", () => accelAndStep1(a)],
    ["passable_no_hop", () => passableNoHop(a)],
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
    ["flight_bank", () => flightBank(a)],
    ["flight_land", () => flightLand(a)],
    ["flight_touchdown", () => flightTouchdown(a)],
    ["flight_driverless", () => flightDriverless(a)],
    ["submarine_dive", () => submarineDive(a)],
    ["submarine_bank", () => submarineBank(a)],
    ["submarine_breach", () => submarineBreach(a)],
    ["submarine_shore", () => submarineShore(a)],
    ["submarine_unmanned", () => submarineUnmanned(a)],
    ["submarine_shallow", () => submarineShallow(a)],
    ["vehicle_limit", () => vehicleLimit(a)],
    ["boat_float", () => boatFloat(a)],
    ["boat_drag", () => boatDrag(a)],
    ["boat_cruise", () => boatCruise(a)],
    ["boat_shore", () => boatShore(a)],
    ["boat_ram", () => boatRam(a)],
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
    for (const line of outcome.lines ?? []) lines.push(`${name} ${line}`);
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
