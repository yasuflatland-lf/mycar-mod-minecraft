// src/infrastructure/bedrock/bedrockVehicleWorld.ts
// @minecraft/server でポートを実装する (ADR 0012)。
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
  PlacementWorld,
  VehicleSnapshot,
} from "../../application/ports";
import type { Vec3 } from "../../domain/shared/vec";
import type { RamHit, RamTarget } from "../../domain/vehicle/ram";
import type { RiderView } from "../../domain/vehicle/vehicle";
import type { TestInputStore } from "../testInput/testInputStore";
import { ITEM_TYPE, VEHICLE_TYPE } from "./identifiers";

const DIMENSIONS = ["overworld", "nether", "the_end"] as const;
const isPlayer = (e: Entity): e is Player => e.typeId === "minecraft:player";

export class BedrockVehicleWorld
  implements DriveWorld, PlacementWorld, BreakWorld
{
  /** loadedVehicles() で集めたこの tick の車。ほかのメソッドは id からここを引く。 */
  private current = new Map<string, Entity>();

  constructor(private readonly testInputs: TestInputStore) {}

  private entity(id: string): Entity | undefined {
    const e = this.current.get(id) ?? world.getEntity(id);
    return e?.isValid ? e : undefined;
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
          yaw: car.getRotation().y,
          velocity: { x: v.x, z: v.z },
          onGround: car.isOnGround,
          riders: this.riders(car),
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

  solidAt(vehicleId: string, o: Vec3): boolean {
    const car = this.entity(vehicleId);
    if (!car) return false;
    try {
      const b = car.dimension.getBlock({
        x: car.location.x + o.x,
        y: car.location.y + o.y,
        z: car.location.z + o.z,
      });
      return b !== undefined && !b.isAir && !b.isLiquid;
    } catch {
      return false; // 読み込まれていないチャンクや世界の外
    }
  }

  targetsNear(vehicleId: string): RamTarget[] {
    const car = this.entity(vehicleId);
    if (!car) return [];
    return car.dimension
      .getEntities({
        location: car.location,
        maxDistance: 3,
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
      return world.getDimension(dimensionId).getBlock(at)?.isAir ?? false;
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
    const player = world.getEntity(playerId);
    if (!player || !isPlayer(player)) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return;
    const slot = player.selectedSlotIndex;
    const item = inv.getItem(slot);
    if (!item || item.typeId !== ITEM_TYPE) return;
    if (item.amount > 1) {
      item.amount -= 1;
      inv.setItem(slot, item);
    } else {
      inv.setItem(slot, undefined);
    }
  }

  dropVehicleItem(vehicleId: string): void {
    const car = this.entity(vehicleId);
    if (!car) return;
    car.dimension.spawnItem(new ItemStack(ITEM_TYPE, 1), car.location);
  }

  removeVehicle(vehicleId: string): void {
    this.entity(vehicleId)?.remove();
  }
}
