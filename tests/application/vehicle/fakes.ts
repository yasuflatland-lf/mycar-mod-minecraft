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
import { Fleet, type FleetState } from "../../../src/domain/vehicle/fleet";
import type { FleetRepository } from "../../../src/domain/vehicle/fleetRepository";
import type { Form } from "../../../src/domain/vehicle/form";
import type { Cell } from "../../../src/domain/vehicle/headlights";
import type { VehicleKind } from "../../../src/domain/vehicle/kind";
import type { Paint } from "../../../src/domain/vehicle/paint";
import type { RamHit, RamTarget } from "../../../src/domain/vehicle/ram";
import type { Vehicle } from "../../../src/domain/vehicle/vehicle";
import type { VehicleRepository } from "../../../src/domain/vehicle/vehicleRepository";

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
  state: FleetState = Fleet.empty().state();
  saves = 0;
  load() {
    return Fleet.restore(this.state);
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
  loadedIds: string[] = [];
  targets: RamTarget[] = [];
  readonly paints = new Map<string, Paint>();
  readonly headlights = new Map<string, boolean>();
  /** Players in the world, and whether each has received the starter item. */
  readonly starters = new Map<string, boolean>();
  /** The cells each vehicle was last told to light. */
  readonly shone = new Map<string, readonly Cell[]>();
  air = (_at: Vec3) => true;
  /** Whether the slot a vehicle item was used from still holds one. */
  itemInSlot = true;
  failOn: string | undefined;
  failCameraOn: string | undefined;
  failBreathingOn: string | undefined;
  failRemoveOn: string | undefined;
  readonly calls: string[] = [];
  private nextId = 1;

  loadedVehicles() {
    return this.snapshots;
  }
  loadedVehicleIds() {
    return this.loadedIds;
  }
  solidAt() {
    return false;
  }
  targetsNear() {
    return this.targets;
  }
  applyMotion(id: string, _impulse: Vec3, yaw: number) {
    if (id === this.failOn) throw new Error("boom");
    this.calls.push(`motion:${id}:${yaw.toFixed(0)}`);
  }
  setForm(id: string, form: Form) {
    this.calls.push(`form:${id}:${form}`);
  }
  setThirdPerson(id: string, on: boolean) {
    if (id === this.failCameraOn) throw new Error("camera");
    this.calls.push(`camera:${id}:${on ? "third" : "own"}`);
  }
  giveWaterBreathing(id: string, ticks: number) {
    if (id === this.failBreathingOn) throw new Error("breathing");
    this.calls.push(`breathing:${id}:${ticks}`);
  }
  setBank(id: string, degrees: number) {
    this.calls.push(`bank:${id}:${degrees}`);
  }
  setGearDown(id: string, down: boolean) {
    this.calls.push(`gear:${id}:${down ? "down" : "up"}`);
  }
  damage(hit: RamHit, attackerId: string | undefined) {
    this.calls.push(`damage:${hit.id}:${attackerId ?? "-"}`);
  }
  playDoor(id: string, door: string) {
    this.calls.push(`door:${id}:${door}`);
  }
  shineHeadlights(id: string, cells: readonly Cell[]) {
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
  spawnVehicle(dim: string, at: Vec3, yaw: number, kind: VehicleKind) {
    const id = `v${this.nextId++}`;
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
  giveVehicleItem(playerId: string) {
    this.calls.push(`give:${playerId}`);
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

export const snapshot = (
  id: string,
  over: Partial<VehicleSnapshot> = {},
): VehicleSnapshot => ({
  id,
  kind: "suv",
  location: { x: 0, y: 0, z: 0 },
  yaw: 0,
  velocity: { x: 0, z: 0 },
  velocityY: 0,
  onGround: true,
  waterDepth: 0,
  riders: [],
  form: "car",
  headlights: false,
  ...over,
});
