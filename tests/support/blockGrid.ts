import { type Cell, cellKey } from "../../src/domain/vehicle/headlights";

const AIR = "minecraft:air";

/**
 * A dimension stand-in that remembers the type of every block set in it, so a
 * test can read back what the scripts left in the world. Unset cells are air.
 */
export function blockGrid() {
  const types = new Map<string, string>();
  const typeAt = (c: Cell): string => types.get(cellKey(c)) ?? AIR;
  return {
    typeAt,
    getBlock: (c: Cell) => ({
      get typeId() {
        return typeAt(c);
      },
      get isAir() {
        return typeAt(c) === AIR;
      },
      setType: (typeId: string) => {
        types.set(cellKey(c), typeId);
      },
      setPermutation: (permutation: { typeId: string }) => {
        types.set(cellKey(c), permutation.typeId);
      },
    }),
  };
}
