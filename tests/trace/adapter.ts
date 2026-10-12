import { DriveVehicles } from "../../src/application/vehicle/driveVehicles";
import type { DriveWorld } from "../../src/application/vehicle/ports";
import type { Vec2, Vec3 } from "../../src/domain/shared/vec";
import { type Form, isForm } from "../../src/domain/vehicle/form";
import {
  createVehicle,
  rebuildVehicle,
} from "../../src/domain/vehicle/registry";
import type { TickContext, Vehicle } from "../../src/domain/vehicle/vehicle";
import type { VehicleRepository } from "../../src/domain/vehicle/vehicleRepository";

export type TraceKind = "suv" | "sportsboat";
export type PropertyValue = string | number | boolean;
export interface TraceInput {
  moveX: number;
  moveY: number;
  jump: boolean;
}
export interface TraceSensors {
  tick: number;
  location: Vec3;
  velocity: Vec3;
  onGround: boolean;
  isSolidCell(x: number, y: number, z: number): boolean;
  isWaterCell(x: number, y: number, z: number): boolean;
  targets(): readonly {
    id: string;
    offset: Vec3;
    protectedOccupant: boolean;
  }[];
}
export interface TraceRider {
  id: string;
  offset: Vec2;
  yaw: number;
  raw: TraceInput;
}
export interface TraceStep {
  impulse: Vec3;
  yaw: number;
  speed: number;
  driverId?: string;
  hits: readonly { id: string; damage: number; push: Vec2; pushUp: number }[];
  writes: readonly string[];
  seatWrites: readonly string[];
  riders: { thirdPerson: boolean; underwater: boolean };
}
export interface TraceVehicle {
  tick(
    sensors: TraceSensors,
    riders: readonly TraceRider[],
    testInput?: TraceInput,
  ): TraceStep;
}

function context(
  s: TraceSensors,
  riders: readonly TraceRider[],
  testInput?: TraceInput,
): TickContext {
  const { x, y, z } = s.location;
  return {
    tick: s.tick,
    riders,
    testInput,
    location: s.location,
    velocity: s.velocity,
    onGround: s.onGround,
    waterAt: (o) =>
      s.isWaterCell(
        Math.floor(x + o.x),
        Math.floor(y + o.y),
        Math.floor(z + o.z),
      ),
    solidAt: (o) =>
      s.isSolidCell(
        Math.floor(x + o.x),
        Math.floor(y + o.y),
        Math.floor(z + o.z),
      ),
    targets: () => s.targets(),
  };
}
function formOf(properties: Readonly<Record<string, PropertyValue>>): Form {
  return isForm(properties.form) ? properties.form : "car";
}
function formWrites(form: string): string[] {
  return [
    `event gravity_${form === "car" ? "on" : "off"}`,
    `property form ${form}`,
  ];
}
function doorWrites(door: string): string[] {
  return [`animation ${door}`, "sound random.door_open"];
}
function wrap(vehicle: Vehicle): TraceVehicle {
  return {
    tick(sensors, riders, testInput) {
      const out = vehicle.tick(context(sensors, riders, testInput));
      const writes = out.form ? formWrites(out.form) : [];
      if (out.bank !== undefined) writes.push(`property bank ${out.bank}`);
      if (out.gearDown !== undefined)
        writes.push(`property gear_down ${out.gearDown}`);
      const seatWrites = out.events.flatMap((e) =>
        e.type === "SeatVacated" && e.door !== undefined
          ? doorWrites(e.door)
          : [],
      );
      return {
        impulse: out.impulse,
        yaw: out.yaw,
        speed: vehicle.speed,
        driverId: out.driverId,
        hits: out.hits,
        writes,
        seatWrites,
        riders: {
          thirdPerson: vehicle.form !== "car",
          underwater: vehicle.form === "submarine",
        },
      };
    },
  };
}
export function createTraceVehicle(
  kind: TraceKind,
  id: string,
  yaw: number,
): TraceVehicle {
  return wrap(createVehicle(kind, id, yaw));
}
export function rebuildTraceVehicle(
  kind: TraceKind,
  id: string,
  yaw: number,
  riders: readonly TraceRider[],
  properties: Readonly<Record<string, PropertyValue>>,
): TraceVehicle {
  return wrap(rebuildVehicle(kind, id, yaw, riders, properties));
}
export interface TraceAppVehicle {
  id: string;
  kind: TraceKind;
  yaw: number;
  sensors: TraceSensors;
  riders: readonly TraceRider[];
  testInput?: TraceInput;
  properties: Readonly<Record<string, PropertyValue>>;
  headlights: boolean;
}
export interface TraceApp {
  execute(
    tick: number,
    vehicles: readonly TraceAppVehicle[],
  ): readonly string[];
  forget(id: string): void;
  failOn(write: string): void;
}
export function createTraceApp(): TraceApp {
  const aggregates = new Map<string, Vehicle>();
  const repo: VehicleRepository = {
    get: (id) => aggregates.get(id),
    save: (v) => {
      aggregates.set(v.id, v);
    },
    remove: (id) => {
      aggregates.delete(id);
    },
    ids: () => [...aggregates.keys()],
  };
  let vehicles: readonly TraceAppVehicle[] = [];
  let calls: string[] = [];
  let failure: string | undefined;
  let activeVehicleId = "-";
  const record = (id: string, write: string) => {
    if (write === failure) {
      failure = undefined;
      throw new Error(`trace failure: ${write}`);
    }
    calls.push(`${id} ${write}`);
  };
  const snapshot = (id: string) => {
    const v = vehicles.find((v) => v.id === id);
    if (!v) throw new Error(`Missing trace vehicle ${id}`);
    return v;
  };
  // A rider who left this tick is no longer in any snapshot, but the camera
  // reset for them still belongs to the vehicle they left.
  const riderOwners = new Map<string, string>();
  const ownerOf = (player: string) => {
    const v = vehicles.find((v) => v.riders.some((r) => r.id === player));
    return v?.id ?? riderOwners.get(player) ?? "-";
  };
  const world: DriveWorld = {
    loadedVehicles: () =>
      vehicles.map((v) => {
        const c = context(v.sensors, v.riders, v.testInput);
        return {
          id: v.id,
          kind: v.kind,
          yaw: v.yaw,
          location: v.sensors.location,
          velocity: c.velocity,
          onGround: c.onGround,
          riders: [...v.riders],
          testInput: v.testInput,
          headlights: v.headlights,
          form: formOf(v.properties),
        };
      }),
    solidAt: (id, offset) => context(snapshot(id).sensors, []).solidAt(offset),
    waterAt: (id, offset) => context(snapshot(id).sensors, []).waterAt(offset),
    targetsNear: (id) => [...snapshot(id).sensors.targets()],
    applyMotion: (id, impulse, yaw) => {
      activeVehicleId = id;
      record(id, `motion ${yaw} ${impulse.x},${impulse.y},${impulse.z}`);
    },
    setForm: (id, form) => {
      for (const write of formWrites(form)) record(id, write);
    },
    setBank: (id, n) => record(id, `property bank ${n}`),
    setGearDown: (id, b) => record(id, `property gear_down ${b}`),
    playDoor: (id, door) => {
      for (const write of doorWrites(door)) record(id, write);
    },
    damage: (hit, attacker) =>
      record(activeVehicleId, `damage ${hit.id} ${attacker ?? "-"}`),
    setThirdPerson: (player, on) =>
      record(ownerOf(player), `camera ${player} ${on ? "third" : "own"}`),
    giveWaterBreathing: (player, ticks) =>
      record(ownerOf(player), `breathing ${player} ${ticks}`),
    shineHeadlights: (id, cells) => record(id, `lights ${cells.length}`),
  };
  const drive = new DriveVehicles(world, repo, { warn: () => {} });
  return {
    execute(tick, loaded) {
      vehicles = loaded;
      calls = [];
      for (const v of vehicles)
        for (const r of v.riders) riderOwners.set(r.id, v.id);
      drive.execute(tick);
      return calls;
    },
    forget: (id) => {
      repo.remove(id);
    },
    failOn: (write) => {
      failure = write;
    },
  };
}
