import type { TraceInput, TraceKind } from "./adapter";
import type { WorldSetup } from "./world";

type Segment = readonly [TraceInput, number];
type ScenarioEvent =
  | { tick: number; type: "join"; seat: number; yaw: number }
  | { tick: number; type: "leave"; seat: number }
  | { tick: number; type: "rebuild" | "forget" }
  | { tick: number; type: "failure"; write: string };
export interface Scenario {
  name: string;
  kind: TraceKind;
  world: WorldSetup;
  segments: readonly Segment[];
  events?: readonly ScenarioEvent[];
  headlights?: boolean;
}
const input = (moveX = 0, moveY = 0, jump = false): TraceInput => ({
  moveX,
  moveY,
  jump,
});
const idle = input();
const forward = input(0, 1);
const back = input(0, -1);
const jump = input(0, 0, true);
const flat: WorldSetup = { column: () => ({ ground: 0 }) };
const lake: WorldSetup = {
  column: () => ({ ground: -4, surface: 0 }),
  location: { x: 0, y: 0, z: 0 },
};
const shore: WorldSetup = {
  column: (_x, z) =>
    z >= 8 && z < 45 ? { ground: -4, surface: 0 } : { ground: 0 },
};
const takeoff: Segment[] = [
  [jump, 1],
  [idle, 1],
  [jump, 1],
  [idle, 23],
];
function randomSegments(): Segment[] {
  let seed = 55;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 300 }, () => [
    input(random() * 2 - 1, random() * 2 - 1, random() < 0.2),
    1,
  ]);
}
export const domainScenarios: readonly Scenario[] = [
  {
    name: "suv_ground",
    kind: "suv",
    world: flat,
    segments: [
      [forward, 50],
      [input(0.6, 1), 20],
      [input(-0.6, 1), 20],
      [input(1, 0), 20],
      [input(-1, 1, true), 15],
      [back, 40],
      [idle, 35],
    ],
  },
  {
    name: "suv_wall",
    kind: "suv",
    world: { column: (_x, z) => ({ ground: z >= 12 ? 8 : 0 }) },
    segments: [
      [forward, 90],
      [idle, 10],
    ],
  },
  {
    name: "suv_steps",
    kind: "suv",
    world: { column: (_x, z) => ({ ground: z >= 24 ? 3 : z >= 8 ? 1 : 0 }) },
    segments: [
      [forward, 110],
      [idle, 20],
    ],
  },
  {
    name: "suv_flight",
    kind: "suv",
    world: flat,
    segments: [
      ...takeoff,
      [jump, 20],
      [input(-1, 1), 15],
      [back, 10],
      [idle, 2],
      [jump, 1],
      [idle, 1],
      [jump, 1],
      [idle, 80],
    ],
  },
  {
    name: "suv_submarine",
    kind: "suv",
    world: shore,
    segments: [
      [forward, 45],
      [back, 4],
      [idle, 4],
      [jump, 7],
      [forward, 10],
      [forward, 110],
      [idle, 20],
    ],
  },
  {
    name: "suv_mount_door",
    kind: "suv",
    world: flat,
    segments: [
      [idle, 5],
      [forward, 40],
      [idle, 20],
    ],
    events: [
      { tick: 5, type: "join", seat: 0, yaw: 90 },
      { tick: 5, type: "join", seat: 1, yaw: 0 },
      { tick: 45, type: "leave", seat: 0 },
      { tick: 45, type: "leave", seat: 1 },
      { tick: 50, type: "join", seat: 0, yaw: 0 },
    ],
  },
  {
    name: "suv_rebuild_in_flight",
    kind: "suv",
    world: flat,
    segments: [...takeoff, [forward, 40], [input(1, 1), 15], [idle, 20]],
    events: [
      { tick: 0, type: "join", seat: 1, yaw: 0 },
      { tick: 0, type: "join", seat: 0, yaw: 0 },
      { tick: 0, type: "join", seat: 3, yaw: 0 },
      { tick: 40, type: "rebuild" },
    ],
  },
  {
    name: "suv_ram",
    kind: "suv",
    world: {
      ...flat,
      targets: [
        {
          id: "near",
          location: { x: 0, y: 0, z: 8 },
          protectedOccupant: false,
        },
        {
          id: "far",
          location: { x: 0.8, y: 1, z: 20 },
          protectedOccupant: false,
        },
        {
          id: "occupant",
          location: { x: 0, y: 0, z: 8 },
          protectedOccupant: true,
        },
        {
          id: "side",
          location: { x: 5, y: 0, z: 8 },
          protectedOccupant: false,
        },
        {
          id: "high",
          location: { x: 0, y: 4, z: 8 },
          protectedOccupant: false,
        },
      ],
    },
    segments: [
      [forward, 55],
      [back, 65],
      [idle, 20],
    ],
  },
  { name: "suv_random", kind: "suv", world: flat, segments: randomSegments() },
  {
    name: "boat_random",
    kind: "sportsboat",
    world: lake,
    segments: randomSegments(),
  },
  {
    name: "boat_afloat",
    kind: "sportsboat",
    world: lake,
    segments: [
      [forward, 65],
      [input(-0.7, 1), 20],
      [input(0.7, 1), 20],
      [back, 65],
      [idle, 20],
    ],
  },
  {
    name: "boat_beach",
    kind: "sportsboat",
    world: {
      column: (_x, z) => (z < 15 ? { ground: -4, surface: 0 } : { ground: 0 }),
      location: { x: 0, y: 0, z: 0 },
    },
    segments: [
      [forward, 80],
      [idle, 40],
    ],
  },
  {
    name: "boat_rebuild",
    kind: "sportsboat",
    world: lake,
    segments: [
      [forward, 65],
      [input(-0.5, 1), 20],
      [back, 30],
    ],
    events: [
      { tick: 0, type: "join", seat: 1, yaw: 0 },
      { tick: 0, type: "join", seat: 2, yaw: 0 },
      { tick: 0, type: "join", seat: 3, yaw: 0 },
      { tick: 0, type: "join", seat: 0, yaw: 0 },
      { tick: 40, type: "rebuild" },
      { tick: 70, type: "leave", seat: 3 },
    ],
  },
];
export const appScenarios: readonly Scenario[] = [
  {
    name: "app_suv",
    kind: "suv",
    world: {
      column: (_x, z) =>
        z >= 4 && z < 50 ? { ground: -4, surface: 0 } : { ground: 0 },
    },
    headlights: true,
    segments: [
      ...takeoff,
      [idle, 39],
      [forward, 20],
      [back, 12],
      [idle, 8],
      [jump, 25],
      [forward, 120],
      [idle, 100],
    ],
    events: [
      { tick: 0, type: "join", seat: 0, yaw: 0 },
      { tick: 0, type: "join", seat: 2, yaw: 0 },
      { tick: 2, type: "failure", write: "event gravity_off" },
      { tick: 60, type: "forget" },
      { tick: 240, type: "leave", seat: 0 },
      { tick: 240, type: "leave", seat: 2 },
    ],
  },
  {
    name: "app_boat",
    kind: "sportsboat",
    world: {
      ...lake,
      targets: [
        {
          id: "buoy",
          location: { x: 0, y: 0, z: 8 },
          protectedOccupant: false,
        },
      ],
    },
    headlights: true,
    segments: [
      [forward, 60],
      [input(-0.5, 1), 20],
      [back, 30],
      [idle, 20],
    ],
    events: [
      { tick: 0, type: "join", seat: 1, yaw: 0 },
      { tick: 0, type: "join", seat: 0, yaw: 0 },
      { tick: 110, type: "leave", seat: 0 },
    ],
  },
];
export function seatOffset(
  seat: number,
  yaw: number,
): { x: number; z: number } {
  const positions = [
    { x: -0.38, z: 0.35 },
    { x: 0.38, z: 0.35 },
    { x: -0.38, z: -0.8 },
    { x: 0.38, z: -0.8 },
  ];
  const p = positions[seat];
  if (!p) throw new Error(`Invalid seat ${seat}`);
  const angle = (yaw * Math.PI) / 180;
  return {
    x: p.x * Math.cos(angle) - p.z * Math.sin(angle),
    z: p.x * Math.sin(angle) + p.z * Math.cos(angle),
  };
}
