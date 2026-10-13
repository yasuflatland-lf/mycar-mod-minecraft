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
  LimitWorld,
  PaintWorld,
  PlacementWorld,
  StarterWorld,
  VehicleSnapshot,
} from "../../../application/vehicle/ports";
import type { Vec3 } from "../../../domain/shared/vec";
import type { EngineCommand } from "../../../domain/vehicle/drive";
import type { RawInput } from "../../../domain/vehicle/driveInput";
import type { FleetEntry } from "../../../domain/vehicle/fleet";
import type { FloorCell, HoldPose } from "../../../domain/vehicle/floor";
import type { Cell } from "../../../domain/vehicle/headlights";
import type { VehicleKind } from "../../../domain/vehicle/kind";
import {
  entityContractOf,
  RAM_QUERY_RADIUS,
} from "../../../domain/vehicle/kinds/index";
import { PAINTS, type Paint } from "../../../domain/vehicle/paint";
import type { RamHit, RamTarget } from "../../../domain/vehicle/ram";
import type { RiderView } from "../../../domain/vehicle/vehicle";
import type { TestInputStore } from "../testInput/testInputStore";
import { DeckSeats } from "./deckSeats";
import { FloorBlocks } from "./floorBlocks";
import { HeadlightBlocks, isLightBlock } from "./headlightBlocks";
import {
  dyeOf,
  ENTITY_TYPE,
  entityAnimationId,
  entityEventId,
  entityPropertyId,
  fleetEntryOf,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  isVehicleEntity,
  kindOfEntity,
  OWNER_PROPERTY,
  PAINT_VARIANT,
  PLAYER_TYPE,
  paintEvent,
  STARTER_RECEIVED_PROPERTY,
  THIRD_PERSON_CAMERA,
  VEHICLE_FAMILY,
} from "./identifiers";
import { isWaterAt } from "./water";

const DIMENSIONS = ["overworld", "nether", "the_end"] as const;
const isPlayer = (e: Entity): e is Player => e.typeId === PLAYER_TYPE;

function rawInputOf(player: Player): RawInput {
  const movement = player.inputInfo.getMovementVector();
  return {
    moveX: movement.x,
    moveY: movement.y,
    jump:
      player.inputInfo.getButtonState(InputButton.Jump) === ButtonState.Pressed,
  };
}

function offsetFrom(car: Entity, offset: Vec3): Vec3 {
  return {
    x: car.location.x + offset.x,
    y: car.location.y + offset.y,
    z: car.location.z + offset.z,
  };
}

export class BedrockVehicleWorld
  implements
    DriveWorld,
    PlacementWorld,
    StarterWorld,
    BreakWorld,
    PaintWorld,
    HeadlightWorld,
    LimitWorld
{
  /** Vehicles collected by loadedVehicles() for this tick. The other methods look them up here by id. */
  private current = new Map<string, Entity>();
  private readonly headlightBlocks = new HeadlightBlocks();
  private readonly deckSeats = new DeckSeats();
  private readonly floorBlocks = new FloorBlocks();
  private readonly holds = new Map<string, HoldPose>();

  constructor(private readonly testInputs: TestInputStore) {}

  private entity(id: string): Entity | undefined {
    const e = this.current.get(id) ?? world.getEntity(id);
    return e?.isValid ? e : undefined;
  }

  private player(playerId: string): Player | undefined {
    const player = world.getEntity(playerId);
    return player && isPlayer(player) ? player : undefined;
  }

  loadedFleetEntries(): FleetEntry[] {
    return DIMENSIONS.flatMap((dimId) =>
      world
        .getDimension(dimId)
        .getEntities({ families: [VEHICLE_FAMILY] })
        .map(fleetEntryOf)
        .filter((entry) => entry !== undefined),
    );
  }

  loadedVehicles(): VehicleSnapshot[] {
    this.current = new Map();
    const snapshots: VehicleSnapshot[] = [];
    for (const dimId of DIMENSIONS) {
      for (const car of world
        .getDimension(dimId)
        .getEntities({ families: [VEHICLE_FAMILY] })) {
        const kind = kindOfEntity(car.typeId);
        if (kind === undefined) continue;
        this.current.set(car.id, car);
        const v = car.getVelocity();
        snapshots.push({
          id: car.id,
          kind,
          location: car.location,
          yaw: car.getRotation().y,
          velocity: v,
          onGround: car.isOnGround,
          riders: this.riders(car),
          deckSeatInputs: this.deckSeats
            .riders(car)
            .map((player) => (player ? rawInputOf(player) : undefined)),
          restored: () =>
            Object.fromEntries(
              entityContractOf(kind).restored.map((name) => [
                name,
                car.getProperty(entityPropertyId(name)),
              ]),
            ),
          headlights: car.getProperty(HEADLIGHTS_PROPERTY) === true,
          testInput: this.testInputs.get(car.id),
        });
      }
    }
    const live = new Set(this.current.keys());
    this.testInputs.retain(live);
    this.headlightBlocks.clearGone(live);
    this.floorBlocks.clearGone(live);
    this.deckSeats.clearGone(live);
    for (const id of this.holds.keys())
      if (!live.has(id)) this.holds.delete(id);
    return snapshots;
  }

  private riders(car: Entity): RiderView[] {
    return (car.getComponent("minecraft:rideable")?.getRiders() ?? [])
      .filter(isPlayer)
      .map((p) => {
        return {
          id: p.id,
          offset: {
            x: p.location.x - car.location.x,
            z: p.location.z - car.location.z,
          },
          yaw: p.getRotation().y,
          raw: rawInputOf(p),
        };
      });
  }

  waterAt(vehicleId: string, offset: Vec3): boolean {
    const car = this.entity(vehicleId);
    if (!car) return false;
    return isWaterAt(car.dimension, offsetFrom(car, offset));
  }

  solidAt(vehicleId: string, offset: Vec3): boolean {
    const car = this.entity(vehicleId);
    if (!car) return false;
    try {
      const at = offsetFrom(car, offset);
      const b = car.dimension.getBlock(at);
      if (!b || b.isAir || b.isLiquid || isLightBlock(b)) return false;
      // A ray that starts inside a block finds nothing, so a cell under
      // another block counts as solid without one.
      const above = b.above();
      if (above && !above.isAir && !above.isLiquid) return true;
      // Flowers, grass, carpets and torches have no collision box: a ray cast
      // down from just above the cell passes through them (ADR 0035).
      const hit = car.dimension.getBlockFromRay(
        { x: at.x, y: b.location.y + 1.001, z: at.z },
        { x: 0, y: -1, z: 0 },
        {
          includePassableBlocks: false,
          includeLiquidBlocks: false,
          maxDistance: 1,
        },
      );
      return hit?.block.location.y === b.location.y;
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
        protectedOccupant: isVehicleEntity(
          e.getComponent("minecraft:riding")?.entityRidingOn?.typeId,
        ),
      }));
  }

  holdAt(vehicleId: string, pose: HoldPose | undefined): void {
    if (!pose) {
      this.holds.delete(vehicleId);
      return;
    }
    this.holds.set(vehicleId, pose);
    const car = this.entity(vehicleId);
    if (!car) return;
    car.teleport(
      { x: pose.x, y: pose.y, z: pose.z },
      { rotation: { x: 0, y: pose.yaw } },
    );
    car.clearVelocity();
  }

  keepDeckSeats(
    vehicleId: string,
    positions: readonly (Vec3 | undefined)[],
    yaw: number,
  ): void {
    this.deckSeats.keep(vehicleId, this.entity(vehicleId), positions, yaw);
  }

  boardDeckRiders(vehicleId: string): void {
    const car = this.entity(vehicleId);
    if (car) this.deckSeats.board(car);
  }

  layFloor(vehicleId: string, cells: readonly FloorCell[]): void {
    this.floorBlocks.lay(vehicleId, this.entity(vehicleId), cells);
  }

  applyMotion(vehicleId: string, impulse: Vec3, yaw: number): void {
    if (this.holds.has(vehicleId)) return;
    const car = this.entity(vehicleId);
    if (!car) return;
    car.applyImpulse(impulse);
    car.setRotation({ x: 0, y: yaw });
  }

  run(vehicleId: string, commands: readonly EngineCommand[]): void {
    const entity = this.entity(vehicleId);
    if (!entity) return;
    for (const command of commands) {
      switch (command.type) {
        case "setProperty":
          entity.setProperty(entityPropertyId(command.name), command.value);
          break;
        case "triggerEvent":
          entity.triggerEvent(entityEventId(command.name));
          break;
        case "playAnimation":
          entity.playAnimation(entityAnimationId(entity.typeId, command.name));
          break;
        case "playSound":
          entity.dimension.playSound(command.name, entity.location);
          break;
        default: {
          const unknown: never = command;
          throw new Error(`Unknown engine command: ${JSON.stringify(unknown)}`);
        }
      }
    }
  }

  setThirdPerson(playerId: string, on: boolean): void {
    const camera = this.player(playerId)?.camera;
    if (!camera) return;
    if (on) camera.setCamera(THIRD_PERSON_CAMERA);
    else camera.clear();
  }

  giveWaterBreathing(playerId: string, ticks: number): void {
    this.player(playerId)?.addEffect("water_breathing", ticks, {
      showParticles: false,
    });
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

  isAir(dimensionId: string, at: Vec3): boolean {
    try {
      const b = world.getDimension(dimensionId).getBlock(at);
      return b !== undefined && (b.isAir || isLightBlock(b));
    } catch {
      return false;
    }
  }

  spawnVehicle(
    dimensionId: string,
    at: Vec3,
    yaw: number,
    kind: VehicleKind,
    ownerId: string,
  ): string {
    const car = world
      .getDimension(dimensionId)
      .spawnEntity(ENTITY_TYPE[kind], at);
    car.setRotation({ x: 0, y: yaw });
    car.setDynamicProperty(OWNER_PROPERTY, ownerId);
    return car.id;
  }

  consumeVehicleItem(
    playerId: string,
    slot: number,
    kind: VehicleKind,
  ): boolean {
    return this.consumeHeld(playerId, ITEM_TYPE[kind], slot);
  }

  /** Takes one item from `slot` (the selected one by default), but only if it still holds `typeId`. */
  private consumeHeld(
    playerId: string,
    typeId: string,
    slot?: number,
  ): boolean {
    const player = this.player(playerId);
    if (!player) return false;
    const inv = player.getComponent("minecraft:inventory")?.container;
    if (!inv) return false;
    const at = slot ?? player.selectedSlotIndex;
    const item = inv.getItem(at);
    if (!item || item.typeId !== typeId) return false;
    if (item.amount > 1) {
      item.amount -= 1;
      inv.setItem(at, item);
    } else {
      inv.setItem(at, undefined);
    }
    return true;
  }

  receivedStarter(playerId: string): boolean | undefined {
    const player = this.player(playerId);
    if (!player) return undefined;
    return player.getDynamicProperty(STARTER_RECEIVED_PROPERTY) === true;
  }

  giveVehicleItem(playerId: string, kind: VehicleKind): void {
    const player = this.player(playerId);
    if (!player) return;
    const inv = player.getComponent("minecraft:inventory")?.container;
    const item = new ItemStack(ITEM_TYPE[kind], 1);
    const leftover = inv ? inv.addItem(item) : item;
    if (leftover) player.dimension.spawnItem(leftover, player.location);
  }

  markStarterReceived(playerId: string): void {
    this.player(playerId)?.setDynamicProperty(STARTER_RECEIVED_PROPERTY, true);
  }

  dropVehicleItem(vehicleId: string): void {
    const car = this.entity(vehicleId);
    if (!car) return;
    const kind = kindOfEntity(car.typeId);
    if (kind === undefined) return;
    car.dimension.spawnItem(new ItemStack(ITEM_TYPE[kind], 1), car.location);
  }

  removeVehicle(vehicleId: string): void {
    const car = this.entity(vehicleId);
    this.headlightBlocks.shine(vehicleId, car, []);
    this.floorBlocks.lay(vehicleId, car, []);
    this.deckSeats.keep(vehicleId, car, [], 0);
    this.holds.delete(vehicleId);
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
    this.consumeHeld(playerId, dyeOf(paint));
  }
}
