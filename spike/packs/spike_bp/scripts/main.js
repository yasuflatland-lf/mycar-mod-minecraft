// THROWAWAY spike code. 走行コアの実現性検証用。本実装には流用しない。
import { world, system, InputButton, ButtonState, EntityDamageCause } from "@minecraft/server";

const CFG = {
  maxSpeed: 0.6, // blocks/tick (= 12 blocks/s)
  maxReverse: 0.2,
  accel: 0.015,
  brake: 0.04,
  drag: 0.008,
  turnRate: 6.0, // deg/tick at full lock
  grip: 0.3, // 速度ベクトルを向きへ寄せる割合 (1 = 滑らない)
  handbrakeGrip: 0.04,
  airFriction: 0.91, // 空中の水平方向の減衰率
  stepVelocity: 0.75, // 2 段の段差に飛び乗るときの上向き速度
  stepTicks: 10, // 飛び乗ってから空中でも制御する tick 数
  hitboxFront: 0.9, // 当たり判定 (幅 1.8 の正方形) の前端
  bodyFront: 1.65, // 見た目の車体の前端 (モデルは長さ約 3.3)
  bodyHalfWidth: 1.0, // 見た目の車体の半幅 (タイヤ込み)
  targetHalfWidth: 0.45, // 相手の体の半分の幅の目安
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

  // 前 tick に与えた速度 (st.expected) のうち、どれだけ残ったかで摩擦と衝突を見分ける
  const v = car.getVelocity();
  const f = fwd(st.yaw);
  const vLong = v.x * f.x + v.z * f.z;
  st.blocked = false;
  if (st.expected && car.isOnGround) {
    const e = st.expected;
    const limit = (st.friction ?? 0.55) * 0.5;
    // 壁はエンジンが軸ごとに速度を 0 にするので、x・z の軸ごとに「与えた速度がほぼ消えたか」を見る
    const axisBlocked = (ve, ee) => Math.abs(ee) > 0.03 && ve / ee < limit;
    st.blocked = axisBlocked(v.x, e.x) || axisBlocked(v.z, e.z);
    if (st.blocked) {
      // 摩擦では説明できない減速 = 壁などに当たった。摩擦の推定は更新せず、内部速度を実際の前方速度まで落とす
      if (Math.abs(vLong) < Math.abs(st.speed)) st.speed = vLong;
    } else {
      const eLen = Math.hypot(e.x, e.z);
      if (eLen > 0.05) {
        const ratio = (v.x * e.x + v.z * e.z) / (eLen * eLen); // 与えた方向に残った割合
        const r = Math.max(0.5, Math.min(1, ratio));
        st.friction = st.friction === undefined ? r : st.friction * 0.8 + r * 0.2;
      }
    }
  }
  const friction = car.isOnGround ? st.friction ?? 0.55 : CFG.airFriction;

  // 2 段の段差はエンジンの自動段差越えでは越えられないので、前方を先読みして手前で飛び乗る
  if (input.y > 0.05 && st.speed >= 0 && car.isOnGround && tryStepUp(car, f, st.speed)) {
    st.speed = Math.max(st.speed, 0.15);
    st.stepTicks = CFG.stepTicks;
  }
  const stepping = (st.stepTicks ?? 0) > 0;
  if (stepping) st.stepTicks--;

  // 速度を前後成分と横成分に分け、横成分だけを grip で減衰させる (横滑りの表現)
  const vLatX = v.x - f.x * vLong;
  const vLatZ = v.z - f.z * vLong;
  const grip = input.handbrake ? CFG.handbrakeGrip : CFG.grip;
  // 段差を越えている間は空中でも制御し、横方向の速度を打ち消して段差の外へ押し出されないようにする
  const control = car.isOnGround || stepping ? 1 : 0.2;
  const keepLat = stepping ? 0 : 1 - grip;
  // 摩擦で減る分を見越して上乗せする
  const nx = (f.x * st.speed + vLatX * keepLat) / friction;
  const nz = (f.z * st.speed + vLatZ * keepLat) / friction;
  car.applyImpulse({ x: (nx - v.x) * control, y: 0, z: (nz - v.z) * control });
  st.expected = { x: nx, z: nz };
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

// 前方を先読みし、「2 段の段差 + その上に車が入る空間」が近づいたら上向きの速度を与える。
// 斜めに近づくと車の角が先に当たるので、中心線と左右の端の 3 本で見る。
// 1 段はエンジンに任せ、3 段以上は壁として扱う
function tryStepUp(car, f, speed) {
  const dim = car.dimension;
  const p = car.location;
  const right = { x: -f.z, z: f.x };
  const solid = (ahead, side, dy) => {
    const b = dim.getBlock({
      x: p.x + f.x * ahead + right.x * side,
      y: p.y + dy,
      z: p.z + f.z * ahead + right.z * side,
    });
    return b !== undefined && !b.isAir && !b.isLiquid;
  };
  if (solid(0, 0, 2.5)) return false; // 頭上がふさがっている
  const front = CFG.hitboxFront; // 当たり判定の前端 (ブロックに当たるのはここ)
  const lookahead = speed * 4 + 0.3; // 上がりきるまでの約 4 tick 分 + 余裕
  for (let d = front + 0.1; d <= front + lookahead + 0.01; d += 0.2) {
    for (const side of [0, -0.8, 0.8]) {
      if (!solid(d, side, 0.5)) continue; // この線上にはまだ段差がない
      if (!solid(d, side, 1.5)) continue; // 1 段 (エンジンに任せる)
      if (solid(d, side, 2.5) || solid(d, side, 3.5)) return false; // 3 段以上 = 壁
      car.applyImpulse({ x: 0, y: CFG.stepVelocity, z: 0 });
      LOG(`step-up at (${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) gap=${(d - front).toFixed(2)} side=${side} speed=${speed.toFixed(3)}`);
      return true;
    }
  }
  return false;
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
    // 見た目の車体の前端に相手の体が触れたら当たり。1 tick に最大 0.6 進むが、判定の奥行きの方が長いのですり抜けない
    if (ahead < 0 || ahead > CFG.bodyFront + CFG.targetHalfWidth) continue;
    if (side > CFG.bodyHalfWidth + CFG.targetHalfWidth || dy < -0.5 || dy > 1.8) continue;
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
  // fill は 1 回 32768 ブロックまでなので分割する
  dim.runCommand(`fill 0 ${gy} 0 60 ${gy + 6} 40 air`);
  dim.runCommand(`fill 61 ${gy} 0 120 ${gy + 6} 40 air`);
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

  // テスト 4: 高さ 4 の壁に斜め 20° で全速力で突っ込み、横に飛ばないかを見る
  dim.runCommand(`fill 45 ${gy} 20 45 ${gy + 3} 40 stone`);
  const car4 = dim.spawnEntity(SCRIPT_CAR, { x: 20.5, y: gy, z: 24.5 });
  cars.set(car4.id, { speed: 0, yaw: -70 });
  car4.setRotation({ x: 0, y: -70 });
  virtualInput.set(car4.id, { x: 0, y: 1, handbrake: false });
  let maxLatAfterHit = 0;
  let hitTick = -1;
  let blockedCount = 0;
  for (let t = 0; t < 120; t++) {
    await wait(1);
    const st4 = cars.get(car4.id);
    if (st4.blocked) blockedCount++;
    if (hitTick < 0 && car4.location.x > 43.5) hitTick = t;
    if (hitTick >= 0) {
      const v4 = car4.getVelocity();
      maxLatAfterHit = Math.max(maxLatAfterHit, Math.abs(v4.z));
    }
  }
  LOG(`T4 wall: hitTick=${hitTick} x=${car4.location.x.toFixed(2)} maxSideSpeedAfterHit=${maxLatAfterHit.toFixed(3)} blockedTicks=${blockedCount} speedState=${cars.get(car4.id).speed.toFixed(3)} friction=${cars.get(car4.id).friction?.toFixed(3)}`);
  car4.remove();

  // テスト 5: 高さ 2 の段差を越えられるか
  dim.runCommand(`fill 30 ${gy} 3 40 ${gy + 1} 8 stone`);
  const car5 = dim.spawnEntity(SCRIPT_CAR, { x: 5.5, y: gy, z: 5.5 });
  cars.set(car5.id, { speed: 0, yaw: -90 });
  car5.setRotation({ x: 0, y: -90 });
  virtualInput.set(car5.id, { x: 0, y: 1, handbrake: false });
  let maxY = gy;
  for (let t = 0; t < 100; t++) {
    await wait(1);
    maxY = Math.max(maxY, car5.location.y);
    if (car5.location.x > 33) break;
  }
  LOG(`T5 step2: x=${car5.location.x.toFixed(2)} maxY=${maxY.toFixed(2)} (ground ${gy}) climbed2=${maxY >= gy + 1.9}`);
  car5.remove();

  // テスト 6: 2 段の段差に斜め 30° で近づく (車の角が先に当たるケース)
  dim.runCommand(`fill 100 ${gy + 1} 0 100 ${gy + 2} 40 stone`);
  const car6 = dim.spawnEntity(SCRIPT_CAR, { x: 80.5, y: gy + 1, z: 10.5 }); // x>=60 は 1 段高い
  cars.set(car6.id, { speed: 0, yaw: -60 });
  car6.setRotation({ x: 0, y: -60 });
  virtualInput.set(car6.id, { x: 0, y: 1, handbrake: false });
  let maxY6 = car6.location.y;
  let minSpeedNearStep = 1;
  for (let t = 0; t < 120; t++) {
    await wait(1);
    maxY6 = Math.max(maxY6, car6.location.y);
    if (car6.location.x > 97 && car6.location.x < 100.5) minSpeedNearStep = Math.min(minSpeedNearStep, hlen(car6.getVelocity()));
    if (car6.location.x > 102) break;
  }
  const f6 = fwd(-60);
  const off6 = (car6.location.x - 80.5) * f6.z - (car6.location.z - 10.5) * f6.x;
  LOG(`T6 sideOffset=${off6.toFixed(2)}`);
  LOG(`T6 step2 diagonal: x=${car6.location.x.toFixed(2)} maxY=${maxY6.toFixed(2)} (base ${gy + 1}) climbed2=${maxY6 >= gy + 2.9} minSpeedNearStep=${minSpeedNearStep.toFixed(3)}`);
  car6.remove();
  virtualInput.clear();
  LOG("autotest done");
}

system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id === "spike:autotest") autotest().catch((e) => LOG(`autotest error: ${e}`));
});

LOG("spike script loaded");
