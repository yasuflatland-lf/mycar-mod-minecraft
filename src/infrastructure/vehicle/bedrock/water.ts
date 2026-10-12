import type { Dimension } from "@minecraft/server";
import type { Vec3 } from "../../../domain/shared/vec";

/** Whether the block cell at `at` holds water, including a waterlogged block. */
export function isWaterAt(dimension: Dimension, at: Vec3): boolean {
  try {
    const block = dimension.getBlock({
      x: Math.floor(at.x),
      y: Math.floor(at.y),
      z: Math.floor(at.z),
    });
    return (
      block !== undefined &&
      (block.typeId === "minecraft:water" ||
        block.typeId === "minecraft:flowing_water" ||
        block.typeId === "minecraft:bubble_column" ||
        block.isWaterlogged)
    );
  } catch {
    return false; // Unloaded chunk or outside the world
  }
}
