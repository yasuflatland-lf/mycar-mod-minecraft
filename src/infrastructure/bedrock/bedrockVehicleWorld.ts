// Implements the ports with @minecraft/server (ADR 0012).
import {
  ButtonState,
  type Entity,
  EntityDamageCause,
  InputButton,
  ItemStack,
  type Player,
  world,
} from "@minecraft/server";
import type {
  BreakWorld,
  DriveWorld,
  HeadlightWorld,
  PaintWorld,
  PlacementWorld,
  StarterWorld,
  VehicleSnapshot,
} from "../../application/ports";
import type { Vec3 } from "../../domain/shared/vec";
import type { Cell } from "../../domain/vehicle/headlights";
import { PAINTS, type Paint } from "../../domain/vehicle/paint";
import type { RamHit, RamTarget } from "../../domain/vehicle/ram";
import { RAM_QUERY_RADIUS } from "../../domain/vehicle/ramQuery";
import type { RiderView } from "../../domain/vehicle/vehicle";
import type { TestInputStore } from "../testInput/testInputStore";
import { HeadlightBlocks, isLightBlock } from "./headlightBlocks";
import {
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  PAINT_BY_DYE,
  PAINT_VARIANT,
  PLAYER_TYPE,
  paintEvent,
  STARTER_RECEIVED_PROPERTY,
  VEHICLE_TYPE,
} from "./identifiers";

const DIMENSIONS = ["overworld", "nether", "the_end"] as const;
const isPlayer = (e: Entity): e is Player => e.typeId === PLAYER_TYPE;

export class BedrockVehicleWorld
  implements
    DriveWorld,
    PlacementWorld,
    StarterWorld,
    BreakWorld,
    PaintWorld,
    HeadlightWorld
{
  /** Vehicles collected by loadedVehicles() for this tick. The other methods look them up here by id. */
  private current = new Map<string, Entity>();
  private readonly headlightBlocks = new HeadlightBlocks();

  constructor(private readonly testInputs: TestInputStore) {}

  private entity(id: string): Entity | undefined {
    const e = this.current.get(id) ?? world.getEntity(id);
    return e?.isValid ? e : undefined;
  }

  private player(playerId: string): Player | undefined {
    const player = world.getEntity(playerId);
    return player && isPlayer(player) ? player : undefined;
  }

  loadedVehicles(): VehicleSnapshot[] {
    this.current = new Map();
    const snapshots: VehicleSnapshot[] = [];
    for (const dimId of DIMENSIONS) {
      for (const car of world
        .getDimension(dimId)
        .getEntities({ type: VEHICLE_TYPE })) {
        this.current.set(car.id, car);
        const v = car.getVelocity();
        snapshots.push({
          id: car.id,
          location: car.location,
          yaw: car.getRotation().y,
          velocity: { x: v.x, z: v.z },
          onGround: car.isOnGround,
          riders: this.riders(car),
          headlights: car.getProperty(HEADLIGHTS_PROPERTY) === true,
          testInput: this.testInputs.get(car.id),
        });
      }
    }
    this.testInputs.retain(new Set(this.current.keys()));
    return snapshots;
  }

  private riders(car: Entity): RiderView[] {
    return (car.getComponent("minecraft:rideable")?.getRiders() ?? [])
      .filter(isPlayer)
      .map((p) => {
        const mv = p.inputInfo.getMovementVector();
        return {
          id: p.id,
          offset: {
            x: p.location.x - car.location.x,
            z: p.location.z - car.location.z,
          },
          yaw: p.getRotation().y,
          raw: {
            moveX: mv.x,
            moveY: mv.y,
            jump:
              p.inputInfo.getButtonState(InputButton.Jump) ===
              ButtonState.Pressed,
          },
        };
      });
  }

  solidAt(vehicleId: string, offset: Vec3): boolean {
    const car = this.entity(vehicleId);
    if (!car) return false;
    try {
      const b = car.dimension.getBlock({
        x: car.location.x + offset.x,
        y: car.location.y + offset.y,
        z: car.location.z + offset.z,
      });
      return b !== undefined && !b.isAir && !b.isLiquid && !isLightBlock(b);
    } catch {
      return false; // Unloaded chunk or outside the world
    }
  }

  targetsNear(vehicleId: string): RamTarget[] {
    const car = this.entity(vehicleId);
    if (!car) return [];
    return car.dimension
      .getEntities({
        location: car.location,
        maxDistance: RAM_QUERY_RADIUS,
        excludeFamilies: ["inanimate"],
        excludeTypes: ["minecraft:item", "minecraft:xp_orb"],
      })
      .filter((e) => e.id !== car.id)
      .map((e) => ({
        id: e.id,
        offset: {
          x: e.location.x - car.location.x,
          y: e.location.y - car.location.y,
          z: e.location.z - car.location.z,
        },
        protectedOccupant:
          e.getComponent("minecraft:riding")?.entityRidingOn?.typeId ===
          VEHICLE_TYPE,
      }));
  }

  applyMotion(vehicleId: string, impulse: Vec3, yaw: number): void {
    const car = this.entity(vehicleId);
    if (!car) return;
    car.applyImpulse(impulse);
    car.setRotation({ x: 0, y: yaw });
  }

  damage(hit: RamHit, attackerId: string | undefined): void {
    const target = world.getEntity(hit.id);
    if (!target?.isValid) return;
    const attacker = attackerId ? world.getEntity(attackerId) : undefined;
    target.applyDamage(hit.damage, {
      cause: EntityDamageCause.entityAttack,
      damagingEntity: attacker,
    });
    target.applyKnockback({ x: hit.push.x, z: hit.push.z }, hit.pushUp);
  }

  playDoor(vehicleId: string, door: string): void {
    const car = this.entity(vehicleId);
    if (!car) return;
    car.playAnimation(`animation.mycar.suv.${door}`);
    car.dimension.playSound("random.door_open", car.location);
  }

  isAir(dimensionId: string, at: Vec3): boolean {
    try {
      const b = world.getDimension(dimensionId).getBlock(at);
      return b !== undefined && (b.isAir || isLightBlock(b));
    } catch {
      return false;
    }
  }

  spawnVehicle(dimensionId: string, at: Vec3, yaw: number): string {
    const car = world.getDimension(dimensionId).spawnEntity(VEHICLE_TYPE, at);
    car.setRotation({ x: 0, y: yaw });
    return car.id;
  }

  consumeVehicleItem(playerId: string): void {
    this.consumeHeld(playerId, ITEM_TYPE);
  }

  /** Takes one item from the selected slot, but only if it still holds `typeId`. */
  private consumeHeld(playerId: string, typeId: string): void {
    const player = this.player(playerId);
    if (!player) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    const slot = player.selectedSlotIndex;
    const item = inv.getItem(slot);
    if (!item || item.typeId !== typeId) return;
    if (item.amount > 1) {
      item.amount -= 1;
      inv.setItem(slot, item);
    } else {
      inv.setItem(slot, undefined);
    }
  }

  receivedStarter(playerId: string): boolean | undefined {
    const player = this.player(playerId);
    if (!player) return undefined;
    return player.getDynamicProperty(STARTER_RECEIVED_PROPERTY) === true;
  }

  giveVehicleItem(playerId: string): void {
    const player = this.player(playerId);
    if (!player) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    const item = new ItemStack(ITEM_TYPE, 1);
    const leftover = inv ? inv.addItem(item) : item;
    if (leftover) player.dimension.spawnItem(leftover, player.location);
  }

  markStarterReceived(playerId: string): void {
    this.player(playerId)?.setDynamicProperty(STARTER_RECEIVED_PROPERTY, true);
  }

  dropVehicleItem(vehicleId: string): void {
    const car = this.entity(vehicleId);
    if (!car) return;
    car.dimension.spawnItem(new ItemStack(ITEM_TYPE, 1), car.location);
  }

  removeVehicle(vehicleId: string): void {
    const car = this.entity(vehicleId);
    this.headlightBlocks.shine(vehicleId, car, []);
    car?.remove();
  }

  shineHeadlights(vehicleId: string, cells: readonly Cell[]): void {
    this.headlightBlocks.shine(vehicleId, this.entity(vehicleId), cells);
  }

  headlightsOn(vehicleId: string): boolean | undefined {
    const car = this.entity(vehicleId);
    if (!car) return undefined;
    return car.getProperty(HEADLIGHTS_PROPERTY) === true;
  }

  setHeadlights(vehicleId: string, on: boolean): void {
    const car = this.entity(vehicleId);
    if (!car) return;
    car.setProperty(HEADLIGHTS_PROPERTY, on);
    car.dimension.playSound("random.click", car.location);
  }

  paintOf(vehicleId: string): Paint | undefined {
    const car = this.entity(vehicleId);
    if (!car) return undefined;
    const variant = car.getComponent("minecraft:variant")?.value ?? 0;
    return PAINTS.find((p) => PAINT_VARIANT[p] === variant);
  }

  paint(vehicleId: string, paint: Paint): void {
    const car = this.entity(vehicleId);
    if (!car) return;
    car.triggerEvent(paintEvent(paint));
    car.dimension.playSound("dye.use", car.location);
  }

  consumeDye(playerId: string, paint: Paint): void {
    const dye = Object.keys(PAINT_BY_DYE).find(
      (d) => PAINT_BY_DYE[d] === paint,
    );
    if (dye) this.consumeHeld(playerId, dye);
  }
}
