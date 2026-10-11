import type {
  BreakWorld,
  DriveWorld,
  HeadlightWorld,
  PaintWorld,
  PlacementWorld,
  VehicleSnapshot,
} from "../../src/application/ports";
import type { Vec3 } from "../../src/domain/shared/vec";
import type { FlightMode } from "../../src/domain/vehicle/flight";
import type { Cell } from "../../src/domain/vehicle/headlights";
import type { Paint } from "../../src/domain/vehicle/paint";
import type { RamHit, RamTarget } from "../../src/domain/vehicle/ram";
import type { Vehicle } from "../../src/domain/vehicle/vehicle";
import type { VehicleRepository } from "../../src/domain/vehicle/vehicleRepository";

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

export class FakeWorld
  implements DriveWorld, PlacementWorld, BreakWorld, PaintWorld, HeadlightWorld
{
  snapshots: VehicleSnapshot[] = [];
  targets: RamTarget[] = [];
  readonly paints = new Map<string, Paint>();
  readonly headlights = new Map<string, boolean>();
  /** The cells each vehicle was last told to light. */
  readonly shone = new Map<string, readonly Cell[]>();
  air = (_at: Vec3) => true;
  failOn: string | undefined;
  readonly calls: string[] = [];
  private nextId = 1;

  loadedVehicles() {
    return this.snapshots;
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
  setFlight(id: string, mode: FlightMode) {
    this.calls.push(`flight:${id}:${mode}`);
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
  spawnVehicle(dim: string, at: Vec3, yaw: number) {
    const id = `v${this.nextId++}`;
    this.calls.push(`spawn:${dim}:${at.x},${at.y},${at.z}:${yaw}`);
    return id;
  }
  consumeVehicleItem(playerId: string) {
    this.calls.push(`consume:${playerId}`);
  }
  dropVehicleItem(id: string) {
    this.calls.push(`drop:${id}`);
  }
  removeVehicle(id: string) {
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
  location: { x: 0, y: 0, z: 0 },
  yaw: 0,
  velocity: { x: 0, z: 0 },
  velocityY: 0,
  onGround: true,
  riders: [],
  flight: "ground",
  headlights: false,
  ...over,
});
