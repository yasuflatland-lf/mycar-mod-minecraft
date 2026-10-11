// Body colors a vehicle can be painted with dye (ADR 0017). A placed vehicle starts khaki.
export const PAINTS = ["khaki", "green", "red"] as const;
export type Paint = (typeof PAINTS)[number];
