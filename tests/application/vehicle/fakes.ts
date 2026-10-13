import type {
  BreakWorld,
  DriveWorld,
  HeadlightWorld,
  LimitWorld,
  PaintWorld,
  PlacementWorld,
  StarterWorld,
  VehicleSnapshot,
} from "../../../src/application/vehicle/ports";
import type { Vec3 } from "../../../src/domain/shared/vec";
import type { EngineCommand } from "../../../src/domain/vehicle/drive";
import {
  Fleet,
  type FleetEntry,
  type FleetLimitOf,
  type FleetState,
} from "../../../src/domain/vehicle/fleet";
import type { FleetRepository } from "../../../src/domain/vehicle/fleetRepository";
import type { FloorCell, HoldPose } from "../../../src/domain/vehicle/floor";
import type { Cell } from "../../../src/domain/vehicle/headlights";
import type { VehicleKind } from "../../../src/domain/vehicle/kind";
import type { Paint } from "../../../src/domain/vehicle/paint";
import type { RamHit, RamTarget } from "../../../src/domain/vehicle/ram";
import type { Vehicle } from "../../../src/domain/vehicle/vehicle";
import type { VehicleRepository } from "../../../src/domain/vehicle/vehicleRepository";
import { waterSensors } from "../../support/waterDepth";

export class InMemoryRepo implements VehicleRepository {
  readonly map = new Map<string, Vehicle>();
  get(id: string) {
    return this.map.get(id);
  }
  save(v: Vehicle) {
    this.map.set(v.id, v);
  }
  remove(id: string) {
    this.map.delete(id);
  }
  ids() {
    return [...this.map.keys()];
  }
}

export class FakeFleetRepository implements FleetRepository {
  state: FleetState;
  saves = 0;
  constructor(private readonly limitOf: FleetLimitOf) {
    this.state = Fleet.empty(limitOf).state();
  }
  load() {
    return Fleet.restore(this.state, this.limitOf);
  }
  save(fleet: Fleet) {
    this.state = fleet.state();
    this.saves++;
  }
}

export class FakeWorld
  implements
    DriveWorld,
    PlacementWorld,
    StarterWorld,
    BreakWorld,
    PaintWorld,
    HeadlightWorld,
    LimitWorld
{
  snapshots: VehicleSnapshot[] = [];
  loaded: FleetEntry[] = [];
  targets: RamTarget[] = [];
  readonly paints = new Map<string, Paint>();
  readonly owners = new Map<string, string>();
  readonly headlights = new Map<string, boolean>();
  /** Players in the world, and whether each has received the starter item. */
  readonly starters = new Map<string, boolean>();
  /** The cells each vehicle was last told to light. */
  readonly shone = new Map<string, readonly Cell[]>();
  readonly held = new Map<string, HoldPose | undefined>();
  readonly floors = new Map<string, readonly FloorCell[]>();
  air = (_at: Vec3) => true;
  /** Whether the slot a vehicle item was used from still holds one. */
  itemInSlot = true;
  failOn: string | undefined;
  failRunOn: { id: string; name: string } | undefined;
  failCameraOn: string | undefined;
  failBreathingOn: string | undefined;
  failRemoveOn: string | undefined;
  failShineOn: string | undefined;
  readonly calls: string[] = [];
  private nextId = 1;

  loadedVehicles() {
    return this.snapshots;
  }
  loadedFleetEntries() {
    return this.loaded;
  }
  solidAt() {
    return false;
  }
  waterAt(id: string, offset: Vec3) {
    const snap = this.snapshots.find((s) => s.id === id);
    const waterAt = snap && waterQueries.get(snap);
    return waterAt ? waterAt(offset) : false;
  }
  targetsNear() {
    return this.targets;
  }
  holdAt(id: string, pose: HoldPose | undefined) {
    this.held.set(id, pose);
  }
  keepDeckSeats(
    _id: string,
    _positions: readonly (Vec3 | undefined)[],
    _yaw: number,
  ) {}
  boardDeckRiders(_id: string) {}
  layFloor(id: string, cells: readonly FloorCell[]) {
    this.floors.set(id, cells);
  }
  applyMotion(id: string, _impulse: Vec3, yaw: number) {
    if (id === this.failOn) throw new Error("boom");
    this.calls.push(`motion:${id}:${yaw.toFixed(0)}`);
  }
  readonly properties = new Map<
    string,
    Record<string, string | number | boolean>
  >();
  run(id: string, commands: readonly EngineCommand[]) {
    for (const command of commands) {
      if (id === this.failRunOn?.id && command.name === this.failRunOn.name)
        throw new Error(`command ${command.name}`);
      if (command.type === "setProperty") {
        const properties = this.properties.get(id) ?? {};
        properties[command.name] = command.value;
        this.properties.set(id, properties);
        if (command.name === "form")
          this.calls.push(`form:${id}:${command.value}`);
        if (command.name === "bank")
          this.calls.push(`bank:${id}:${command.value}`);
        if (command.name === "gear_down")
          this.calls.push(`gear:${id}:${command.value ? "down" : "up"}`);
      }
      if (command.type === "playAnimation")
        this.calls.push(`door:${id}:${command.name}`);
    }
  }
  formOf(id: string) {
    return (
      this.properties.get(id)?.form ??
      this.snapshots.find((s) => s.id === id)?.restored().form ??
      "car"
    );
  }
  setThirdPerson(id: string, on: boolean) {
    if (id === this.failCameraOn) throw new Error("camera");
    this.calls.push(`camera:${id}:${on ? "third" : "own"}`);
  }
  giveWaterBreathing(id: string, ticks: number) {
    if (id === this.failBreathingOn) throw new Error("breathing");
    this.calls.push(`breathing:${id}:${ticks}`);
  }
  damage(hit: RamHit, attackerId: string | undefined) {
    this.calls.push(`damage:${hit.id}:${attackerId ?? "-"}`);
  }
  shineHeadlights(id: string, cells: readonly Cell[]) {
    if (id === this.failShineOn) throw new Error("lights");
    this.shone.set(id, cells);
  }
  headlightsOn(id: string) {
    return this.headlights.get(id);
  }
  setHeadlights(id: string, on: boolean) {
    this.headlights.set(id, on);
    this.calls.push(`headlights:${id}:${on}`);
  }
  isAir(_dim: string, at: Vec3) {
    return this.air(at);
  }
  spawnVehicle(
    dim: string,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: string,
  ) {
    const id = `v${this.nextId++}`;
    this.owners.set(id, ownerId);
    this.calls.push(`spawn:${dim}:${at.x},${at.y},${at.z}:${yaw}:${kind}`);
    return id;
  }
  consumeVehicleItem(playerId: string, slot: number, kind: VehicleKind) {
    if (!this.itemInSlot) return false;
    this.calls.push(`consume:${playerId}:${slot}:${kind}`);
    return true;
  }
  receivedStarter(playerId: string) {
    return this.starters.get(playerId);
  }
  giveVehicleItem(playerId: string, kind: VehicleKind) {
    this.calls.push(`give:${playerId}:${kind}`);
  }
  markStarterReceived(playerId: string) {
    this.starters.set(playerId, true);
    this.calls.push(`mark:${playerId}`);
  }
  dropVehicleItem(id: string) {
    this.calls.push(`drop:${id}`);
  }
  removeVehicle(id: string) {
    if (id === this.failRemoveOn) throw new Error("remove");
    this.calls.push(`remove:${id}`);
  }
  paintOf(id: string) {
    return this.paints.get(id);
  }
  paint(id: string, paint: Paint) {
    this.paints.set(id, paint);
    this.calls.push(`paint:${id}:${paint}`);
  }
  consumeDye(playerId: string, paint: Paint) {
    this.calls.push(`dye:${playerId}:${paint}`);
  }
}

const waterQueries = new WeakMap<VehicleSnapshot, (offset: Vec3) => boolean>();

export const snapshot = (
  id: string,
  over: Partial<VehicleSnapshot> & {
    waterDepth?: number;
    waterBelow?: boolean;
  } = {},
): VehicleSnapshot => {
  const { waterDepth, waterBelow, ...fields } = over;
  const sensors = waterSensors(waterDepth, waterBelow);
  const snap: VehicleSnapshot = {
    id,
    kind: "suv",
    location: sensors.location,
    yaw: 0,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    riders: [],
    deckSeatInputs: [],
    restored: () => ({}),
    headlights: false,
    ...fields,
  };
  waterQueries.set(snap, sensors.waterAt);
  return snap;
};
