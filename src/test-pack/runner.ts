// src/test-pack/runner.ts
// ゲーム内テスト (ADR 0010)。本体の Behavior Pack と別のスクリプト環境で動く。
import { type Dimension, type Entity, system, world } from "@minecraft/server";

const VEHICLE = "mycar:suv";
const INPUT_EVENT = "mycar:test_input";
const MAX_SPEED = 0.9;
const LOG = (msg: string) => console.warn(`[MYCAR-TEST] ${msg}`);
const wait = (ticks: number) =>
  new Promise<void>((r) => system.runTimeout(r, ticks));
const hlen = (v: { x: number; z: number }) => Math.hypot(v.x, v.z);
const fwd = (yaw: number) => ({
  x: -Math.sin((yaw * Math.PI) / 180),
  z: Math.cos((yaw * Math.PI) / 180),
});

interface Result {
  name: string;
  pass: boolean;
  detail: string;
}
interface Arena {
  dim: Dimension;
  gy: number;
}

function drive(car: Entity, x: number, y: number, jump = false) {
  system.sendScriptEvent(INPUT_EVENT, `${car.id},${x},${y},${jump ? 1 : 0}`);
}

function clearInput(car: Entity) {
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

async function setupArena(): Promise<Arena> {
  const dim = world.getDimension("overworld");
  dim.runCommand("tickingarea add 0 -64 0 120 0 40 mycartest true");
  await wait(60);
  const top = dim.getTopmostBlock({ x: 5, z: 20 });
  if (!top) throw new Error("arena chunk not loaded");
  const gy = top.location.y + 1;
  // fill は 1 回 32768 ブロックまでなので分割する
  dim.runCommand(`fill 0 ${gy} 0 60 ${gy + 6} 40 air`);
  dim.runCommand(`fill 61 ${gy} 0 120 ${gy + 6} 40 air`);
  dim.runCommand(`fill 0 ${gy - 1} 0 120 ${gy - 1} 40 stone`);
  dim.runCommand(`kill @e[type=${VEHICLE}]`);
  dim.runCommand("kill @e[type=cow]");
  await wait(5);
  return { dim, gy };
}

async function accelAndStep1(a: Arena): Promise<Result> {
  a.dim.runCommand(`fill 60 ${a.gy} 15 70 ${a.gy} 25 stone`);
  const car = spawnCar(a, 5.5, 20.5, -90);
  try {
    drive(car, 0, 1);
    let reach = -1;
    for (let t = 0; t < 200; t++) {
      await wait(1);
      if (reach < 0 && hlen(car.getVelocity()) >= MAX_SPEED * 0.95) reach = t;
      if (car.location.x > 63) break;
    }
    const climbed = car.location.y >= a.gy + 0.9;
    // 入力が効く tick はパックの実行順で 0 か 1 tick 揺れるので、45 に 1 tick の余裕を足す
    return {
      name: "accel_and_step1",
      pass: reach >= 0 && reach <= 46 && climbed,
      detail: `reach95=${reach} climbed=${climbed}`,
    };
  } finally {
    clearInput(car);
    if (car.isValid) car.remove();
  }
}

async function turnAndHandbrake(a: Arena): Promise<Result> {
  const slip = async (hb: boolean) => {
    const car = spawnCar(a, 5.5, 10.5, -90);
    try {
      drive(car, 0, 1);
      await wait(45);
      drive(car, 1, 1, hb);
      let maxSlip = 0;
      let maxSpeed = 0;
      for (let t = 0; t < 20; t++) {
        await wait(1);
        const v = car.getVelocity();
        const s = hlen(v);
        maxSpeed = Math.max(maxSpeed, s);
        if (s > 0.02) {
          const f = fwd(car.getRotation().y);
          maxSlip = Math.max(
            maxSlip,
            (Math.acos(Math.min(1, Math.max(-1, (v.x * f.x + v.z * f.z) / s))) *
              180) /
              Math.PI,
          );
        }
      }
      return { maxSlip, maxSpeed };
    } finally {
      clearInput(car);
      if (car.isValid) car.remove();
    }
  };
  const grip = await slip(false);
  const hb = await slip(true);
  const pass = hb.maxSlip > grip.maxSlip && hb.maxSpeed <= MAX_SPEED * 1.02;
  return {
    name: "turn_and_handbrake",
    pass,
    detail: `slip grip=${grip.maxSlip.toFixed(1)} hb=${hb.maxSlip.toFixed(1)} hbMaxSpeed=${hb.maxSpeed.toFixed(3)}`,
  };
}

async function ramCow(a: Arena): Promise<Result> {
  const car = spawnCar(a, 5.5, 30.5, -90);
  let cow: Entity | undefined;
  try {
    a.dim.runCommand(`summon minecraft:cow 25 ${a.gy} 30`); // spawnEntity のモブはプレイヤーから離れていると消える
    cow = a.dim.getEntities({
      type: "minecraft:cow",
      location: { x: 25.5, y: a.gy, z: 30.5 },
      maxDistance: 2,
    })[0];
    if (!cow) return { name: "ram_cow", pass: false, detail: "cow not found" };
    const hp0 = cow.getComponent("minecraft:health")!.currentValue;
    const x0 = cow.location.x;
    drive(car, 0, 1);
    await wait(60);
    const hp1 = cow.isValid
      ? cow.getComponent("minecraft:health")!.currentValue
      : 0;
    const pushed = cow.isValid ? cow.location.x - x0 : Number.NaN;
    // 牛が倒れて消えた場合は押し出しを測れないので、ダメージだけで判定する
    return {
      name: "ram_cow",
      pass: hp1 < hp0 && (Number.isNaN(pushed) || pushed > 1),
      detail: `hp ${hp0}->${hp1} pushed=${pushed.toFixed(2)}`,
    };
  } finally {
    clearInput(car);
    if (car.isValid) car.remove();
    if (cow?.isValid) cow.remove();
  }
}

async function wallDiagonal(a: Arena): Promise<Result> {
  a.dim.runCommand(`fill 45 ${a.gy} 20 45 ${a.gy + 3} 40 stone`);
  const car = spawnCar(a, 20.5, 24.5, -70);
  try {
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
    const pass = hit && x < 45 && maxAfter <= before + 0.1;
    return {
      name: "wall_diagonal",
      pass,
      detail: `x=${x.toFixed(2)} sideBefore=${before.toFixed(3)} sideAfterMax=${maxAfter.toFixed(3)}`,
    };
  } finally {
    clearInput(car);
    if (car.isValid) car.remove();
  }
}

async function step2(
  a: Arena,
  name: string,
  z: number,
  yaw: number,
  stepX: number,
): Promise<Result> {
  // 高さ 2 の段差を z ± 6 の幅で置き、斜めに進んでも段差の z の中心に着くよう出発位置を逆算する
  a.dim.runCommand(
    `fill ${stepX} ${a.gy} ${z - 6} ${stepX + 8} ${a.gy + 1} ${z + 6} stone`,
  );
  const dir = fwd(yaw);
  const x0 = stepX - 25;
  const z0 = z - 25 * (dir.z / dir.x);
  const car = spawnCar(a, x0 + 0.5, z0 + 0.5, yaw);
  try {
    drive(car, 0, 1);
    let maxY = a.gy;
    for (let t = 0; t < 120; t++) {
      await wait(1);
      maxY = Math.max(maxY, car.location.y);
      if (car.location.x > stepX + 3) break;
    }
    const side = Math.abs(
      (car.location.x - (x0 + 0.5)) * dir.z -
        (car.location.z - (z0 + 0.5)) * dir.x,
    );
    const climbed = maxY >= a.gy + 1.9;
    return {
      name,
      pass: climbed && side < 0.5,
      detail: `maxY=${(maxY - a.gy).toFixed(2)} sideOffset=${side.toFixed(2)}`,
    };
  } finally {
    clearInput(car);
    if (car.isValid) car.remove();
  }
}

async function runAll() {
  const a = await setupArena();
  const tests: [string, () => Promise<Result>][] = [
    ["accel_and_step1", () => accelAndStep1(a)],
    ["turn_and_handbrake", () => turnAndHandbrake(a)],
    ["ram_cow", () => ramCow(a)],
    ["wall_diagonal", () => wallDiagonal(a)],
    ["step2_front", () => step2(a, "step2_front", 8, -90, 100)],
    ["step2_diagonal", () => step2(a, "step2_diagonal", 30, -60, 100)],
  ];
  const results: Result[] = [];
  for (const [name, t] of tests) {
    try {
      results.push(await t());
    } catch (e) {
      results.push({ name, pass: false, detail: `error: ${e}` });
    }
  }
  for (const r of results)
    LOG(`${r.pass ? "PASS" : "FAIL"} ${r.name} ${r.detail}`);
  LOG(
    `SUMMARY pass=${results.filter((r) => r.pass).length} fail=${results.filter((r) => !r.pass).length}`,
  );
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "mycar:test")
    runAll().catch((e) => LOG(`SUMMARY pass=0 fail=1 error=${e}`));
});
console.warn("[MYCAR-TEST] loaded");
