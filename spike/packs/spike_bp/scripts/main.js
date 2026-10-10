// THROWAWAY spike code. 走行コアの実現性検証用。本実装には流用しない。
import { world, system, InputButton, ButtonState, EntityDamageCause } from "@minecraft/server";

const CFG = {
  maxSpeed: 0.6, // blocks/tick (= 12 blocks/s)
  maxReverse: 0.2,
  accel: 0.015,
  brake: 0.04,
  drag: 0.008,
  turnRate: 4.0, // deg/tick at full lock
  grip: 0.3, // 速度ベクトルを向きへ寄せる割合 (1 = 滑らない)
  handbrakeGrip: 0.04,
  ramMinSpeed: 0.15, // これ未満の速度ではぶつかってもダメージなし
  ramCooldown: 10, // 同じ相手に連続でダメージを与えない tick 数
};

const SCRIPT_CAR = "spike:car_script";
const HORSE_CAR = "spike:car_horse";
const LOG = (msg) => console.warn(`[SPIKE] ${msg}`);

/** @type {Map<string, {speed: number, yaw: number}>} */
const cars = new Map();
/** autotest 用の仮想入力。entity id -> {x, y, handbrake} */
const virtualInput = new Map();

const hlen = (v) => Math.hypot(v.x, v.z);
const fwd = (yawDeg) => {
  const r = (yawDeg * Math.PI) / 180;
  return { x: -Math.sin(r), z: Math.cos(r) };
};

function readInput(car, driver) {
  const v = virtualInput.get(car.id);
  if (v) return v;
  if (!driver) return { x: 0, y: 0, handbrake: false };
  const mv = driver.inputInfo.getMovementVector();
  const jump = driver.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed;
  return { x: mv.x, y: mv.y, handbrake: jump };
}

function stepScriptCar(car) {
  let st = cars.get(car.id);
  if (!st) {
    st = { speed: 0, yaw: car.getRotation().y };
    cars.set(car.id, st);
  }
  const riders = car.getComponent("minecraft:rideable")?.getRiders() ?? [];
  const driver = riders.find((r) => r.typeId === "minecraft:player");
  const input = readInput(car, driver);

  // 停車中に運転者が乗り込んだら、車の向きを運転者の視線に合わせる
  if (driver && st.driverId !== driver.id && Math.abs(st.speed) < 0.01) {
    st.yaw = driver.getRotation().y;
  }
  st.driverId = driver?.id;

  // 速度 (スカラー) の更新
  if (input.y > 0.05) {
    st.speed += (st.speed < 0 ? CFG.brake : CFG.accel) * input.y;
  } else if (input.y < -0.05) {
    st.speed += (st.speed > 0 ? CFG.brake : CFG.accel * 0.5) * input.y;
  } else {
    st.speed -= Math.sign(st.speed) * Math.min(Math.abs(st.speed), CFG.drag);
  }
  st.speed = Math.max(-CFG.maxReverse, Math.min(CFG.maxSpeed, st.speed));

  // 旋回: 低速では曲がりにくく、後退時は逆向き。左入力 (x>0) で yaw 減少
  const steerFactor = Math.min(1, Math.abs(st.speed) / 0.15) * Math.sign(st.speed);
  st.yaw -= input.x * CFG.turnRate * steerFactor;

  // エンジンの地面摩擦による減衰率を前 tick の結果から推定する
  const v = car.getVelocity();
  if (st.expected !== undefined && st.expected > 0.05 && car.isOnGround) {
    const ratio = Math.max(0.3, Math.min(1, hlen(v) / st.expected));
    st.friction = st.friction === undefined ? ratio : st.friction * 0.8 + ratio * 0.2;
  }
  const friction = st.friction ?? 0.55;

  // 速度を前後成分と横成分に分け、横成分だけを grip で減衰させる (横滑りの表現)
  const f = fwd(st.yaw);
  const vLong = v.x * f.x + v.z * f.z;
  const vLatX = v.x - f.x * vLong;
  const vLatZ = v.z - f.z * vLong;
  const grip = input.handbrake ? CFG.handbrakeGrip : CFG.grip;
  const control = car.isOnGround ? 1 : 0.2;
  const keepLat = 1 - grip;
  // 摩擦で減る分を見越して上乗せする
  const nx = (f.x * st.speed + vLatX * keepLat) / friction;
  const nz = (f.z * st.speed + vLatZ * keepLat) / friction;
  car.applyImpulse({ x: (nx - v.x) * control, y: 0, z: (nz - v.z) * control });
  st.expected = Math.hypot(nx, nz);
  car.setRotation({ x: 0, y: st.yaw });
  if (Math.abs(st.speed) > CFG.ramMinSpeed) ram(car, f, st.speed, riders, driver);

  if (driver && system.currentTick % 20 === 0) {
    const heading = hlen(v) > 0.02 ? (Math.atan2(-v.x, v.z) * 180) / Math.PI : NaN;
    LOG(
      `drive in=(${input.x.toFixed(2)},${input.y.toFixed(2)}) carYaw=${st.yaw.toFixed(0)} ` +
        `driverYaw=${driver.getRotation().y.toFixed(0)} velHeading=${heading.toFixed(0)} speed=${st.speed.toFixed(3)}`
    );
  }
  if (driver && system.currentTick % 2 === 0) {
    const slip = slipAngle(v, f);
    driver.onScreenDisplay.setActionBar(
      `in x=${input.x.toFixed(2)} y=${input.y.toFixed(2)} hb=${input.handbrake ? 1 : 0}\n` +
        `cmd=${st.speed.toFixed(3)} act=${hlen(v).toFixed(3)} slip=${slip.toFixed(0)}° ground=${car.isOnGround ? 1 : 0}`
    );
  }
  return { st, v };
}

/** @type {Map<string, number>} target id -> 最後にダメージを与えた tick */
const lastHit = new Map();

// 車の進行方向の前方 (車幅 + 余裕の長方形) にいる相手へ、速度に応じたダメージとノックバックを与える
function ram(car, f, speed, riders, driver) {
  const dir = Math.sign(speed);
  const riderIds = new Set(riders.map((r) => r.id));
  const nearby = car.dimension.getEntities({
    location: car.location,
    maxDistance: 3,
    excludeFamilies: ["inanimate"],
    excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
  });
  for (const e of nearby) {
    if (e.id === car.id || riderIds.has(e.id)) continue;
    const dx = e.location.x - car.location.x;
    const dz = e.location.z - car.location.z;
    const ahead = (dx * f.x + dz * f.z) * dir; // 進行方向への距離
    const side = Math.abs(dx * f.z - dz * f.x); // 横方向の距離
    const dy = e.location.y - car.location.y;
    // 1 tick に最大 0.6 進むので、前方の判定は車の半分 (0.7) + 1 tick 分 + 余裕
    if (ahead < 0 || ahead > 1.6 || side > 1.1 || dy < -0.5 || dy > 1.5) continue;
    const t = lastHit.get(e.id);
    if (t !== undefined && system.currentTick - t < CFG.ramCooldown) continue;
    lastHit.set(e.id, system.currentTick);
    const damage = Math.max(1, Math.round(Math.abs(speed) * 20)); // 最高速度 0.6 で 12 (ハート 6 個)
    const hurt = e.applyDamage(damage, { cause: EntityDamageCause.entityAttack, damagingEntity: driver });
    const push = 0.5 + Math.abs(speed) * 2.5;
    e.applyKnockback({ x: f.x * dir * push, z: f.z * dir * push }, 0.35);
    LOG(`ram ${e.typeId} damage=${damage} applied=${hurt} speed=${speed.toFixed(3)} ahead=${ahead.toFixed(2)} side=${side.toFixed(2)}`);
  }
}

function slipAngle(v, f) {
  const s = hlen(v);
  if (s < 0.02) return 0;
  const dot = (v.x * f.x + v.z * f.z) / s;
  return (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
}

function showHorseCarHud(car) {
  const riders = car.getComponent("minecraft:rideable")?.getRiders() ?? [];
  const driver = riders.find((r) => r.typeId === "minecraft:player");
  if (!driver || system.currentTick % 2 !== 0) return;
  const mv = driver.inputInfo.getMovementVector();
  driver.onScreenDisplay.setActionBar(
    `[horse] in x=${mv.x.toFixed(2)} y=${mv.y.toFixed(2)} act=${hlen(car.getVelocity()).toFixed(3)}`
  );
}

// tick 間隔の計測 (サーバー側の実時間ばらつき)
const tickStats = { last: Date.now(), min: Infinity, max: 0, sum: 0, n: 0 };
function measureTick() {
  const now = Date.now();
  const dt = now - tickStats.last;
  tickStats.last = now;
  tickStats.min = Math.min(tickStats.min, dt);
  tickStats.max = Math.max(tickStats.max, dt);
  tickStats.sum += dt;
  tickStats.n++;
  if (tickStats.n >= 200) {
    LOG(`tick ms avg=${(tickStats.sum / tickStats.n).toFixed(1)} min=${tickStats.min} max=${tickStats.max}`);
    Object.assign(tickStats, { min: Infinity, max: 0, sum: 0, n: 0 });
  }
}

system.runInterval(() => {
  measureTick();
  const dim = world.getDimension("overworld");
  for (const car of dim.getEntities({ type: SCRIPT_CAR })) stepScriptCar(car);
  for (const car of dim.getEntities({ type: HORSE_CAR })) showHorseCarHud(car);
  for (const id of cars.keys()) {
    if (!world.getEntity(id)) cars.delete(id);
  }
}, 1);

// 乗車中の運転者・同乗者や車が何かのダメージを受けていないかを記録する
world.afterEvents.entityHurt.subscribe((ev) => {
  const e = ev.hurtEntity;
  const ridingOn = e.getComponent("minecraft:riding")?.entityRidingOn;
  if (e.typeId === SCRIPT_CAR || ridingOn?.typeId === SCRIPT_CAR) {
    LOG(`self-hurt ${e.typeId} cause=${ev.damageSource.cause} amount=${ev.damage}`);
  }
});

// 乗車時に入力が取れているかをログに残す
world.afterEvents.playerInteractWithEntity.subscribe((ev) => {
  if (ev.target.typeId === SCRIPT_CAR || ev.target.typeId === HORSE_CAR) {
    system.runTimeout(() => {
      const mv = ev.player.inputInfo.getMovementVector();
      LOG(`${ev.player.name} mounted ${ev.target.typeId}; movementVector=(${mv.x},${mv.y}) device=${ev.player.clientSystemInfo?.platformType}`);
    }, 5);
  }
});

// ---- 自動計測: サーバーコンソールから `scriptevent spike:autotest` ----
const wait = (ticks) => new Promise((r) => system.runTimeout(r, ticks));

async function autotest() {
  const dim = world.getDimension("overworld");
  dim.runCommand("tickingarea add 0 -64 0 120 0 40 spiketest true");
  await wait(60);
  const top = dim.getTopmostBlock({ x: 5, z: 20 });
  if (!top) {
    LOG("autotest: chunk not loaded");
    return;
  }
  const gy = top.location.y + 1;
  dim.runCommand(`fill 0 ${gy} 0 120 ${gy + 6} 40 air`);
  dim.runCommand(`fill 0 ${gy - 1} 0 120 ${gy - 1} 40 stone`);
  dim.runCommand(`fill 60 ${gy} 0 120 ${gy} 40 stone`); // x=60 から 1 段高い
  dim.runCommand(`kill @e[type=${SCRIPT_CAR}]`);
  await wait(5);

  // テスト 1: 直進加速 → 段差 → 惰性
  const car = dim.spawnEntity(SCRIPT_CAR, { x: 5.5, y: gy, z: 20.5 });
  car.setRotation({ x: 0, y: -90 }); // +x 方向
  cars.set(car.id, { speed: 0, yaw: -90 });
  virtualInput.set(car.id, { x: 0, y: 1, handbrake: false });
  let maxAct = 0;
  let maxCmd = 0;
  let reachedTick = -1;
  let blockedTicks = 0;
  for (let t = 0; t < 200; t++) {
    await wait(1);
    if (!car.isValid) break;
    const v = car.getVelocity();
    const st = cars.get(car.id);
    maxAct = Math.max(maxAct, hlen(v));
    maxCmd = Math.max(maxCmd, st.speed);
    if (reachedTick < 0 && hlen(v) >= 0.95 * CFG.maxSpeed) reachedTick = t;
    const loc = car.location;
    if (loc.x > 57 && loc.x < 61 && hlen(v) < 0.05) blockedTicks++;
    if (loc.x > 62 || t === 199) {
      LOG(`T1 accel: maxCmd=${maxCmd.toFixed(3)} maxAct=${maxAct.toFixed(3)} ratio=${(maxAct / maxCmd).toFixed(2)} reach95%Tick=${reachedTick} friction=${st.friction?.toFixed(3)}`);
      LOG(`T1 step: x=${loc.x.toFixed(2)} y=${loc.y.toFixed(2)} (ground ${gy}) climbed=${loc.y >= gy + 0.9} blockedTicks=${blockedTicks} tick=${t}`);
      break;
    }
  }
  virtualInput.set(car.id, { x: 0, y: 0, handbrake: false });
  const coastStart = car.location.x;
  await wait(100);
  LOG(`T1 coast: distance=${(car.location.x - coastStart).toFixed(2)} speedAfter100=${hlen(car.getVelocity()).toFixed(3)}`);
  car.remove();

  // テスト 2: 全開で旋回 + ハンドブレーキの横滑り角
  const car2 = dim.spawnEntity(SCRIPT_CAR, { x: 5.5, y: gy, z: 20.5 });
  cars.set(car2.id, { speed: 0, yaw: -90 });
  car2.setRotation({ x: 0, y: -90 });
  virtualInput.set(car2.id, { x: 0, y: 1, handbrake: false });
  await wait(40);
  for (const [label, hb] of [["grip", false], ["handbrake", true]]) {
    virtualInput.set(car2.id, { x: 1, y: 1, handbrake: hb });
    let maxSlip = 0;
    for (let t = 0; t < 20; t++) {
      await wait(1);
      maxSlip = Math.max(maxSlip, slipAngle(car2.getVelocity(), fwd(cars.get(car2.id).yaw)));
    }
    LOG(`T2 turn(${label}): maxSlip=${maxSlip.toFixed(1)}deg speed=${hlen(car2.getVelocity()).toFixed(3)}`);
  }
  car2.remove();

  // テスト 3: 前方の牛に突っ込み、ダメージとノックバックを確認する
  const car3 = dim.spawnEntity(SCRIPT_CAR, { x: 5.5, y: gy, z: 30.5 });
  cars.set(car3.id, { speed: 0, yaw: -90 });
  car3.setRotation({ x: 0, y: -90 });
  // spawnEntity で出したモブはプレイヤーから離れていると 1 tick で削除されるため、summon で出す
  dim.runCommand(`summon minecraft:cow 25 ${gy} 31`); // 中心線から 0.8 ずらす
  const cow = dim.getEntities({ type: "minecraft:cow", location: { x: 25.5, y: gy, z: 31.5 }, maxDistance: 2 })[0];
  const hp0 = cow.getComponent("minecraft:health").currentValue;
  const cowX0 = cow.location.x;
  virtualInput.set(car3.id, { x: 0, y: 1, handbrake: false });
  for (let t = 0; t < 60; t += 10) {
    await wait(10);
    const c = cow.isValid ? `cow x=${cow.location.x.toFixed(1)} hp=${cow.getComponent("minecraft:health").currentValue}` : "cow invalid";
    LOG(`T3 t=${t + 10} car x=${car3.location.x.toFixed(1)} speed=${cars.get(car3.id).speed.toFixed(3)} ${c}`);
  }
  const hp1 = cow.isValid ? cow.getComponent("minecraft:health").currentValue : 0;
  const pushed = cow.isValid ? cow.location.x - cowX0 : NaN;
  LOG(`T3 ram: cowHp ${hp0} -> ${hp1} pushedX=${pushed.toFixed(2)} cowAlive=${cow.isValid}`);
  car3.remove();
  if (cow.isValid) cow.remove();
  virtualInput.clear();
  LOG("autotest done");
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "spike:autotest") autotest().catch((e) => LOG(`autotest error: ${e}`));
});

LOG("spike script loaded");
