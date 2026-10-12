import type { Vec3 } from "../../src/domain/shared/vec";
import type { PropertyValue, TraceKind, TraceSensors } from "./adapter";

export interface Column {
  ground: number;
  surface?: number;
}
export interface WorldSetup {
  column(x: number, z: number): Column;
  location?: Vec3;
  targets?: readonly {
    id: string;
    location: Vec3;
    protectedOccupant: boolean;
  }[];
}
export class TraceWorld {
  location: Vec3;
  velocity: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  gravity = true;
  readonly properties: Record<string, PropertyValue> = { form: "car" };
  constructor(
    readonly kind: TraceKind,
    readonly setup: WorldSetup,
  ) {
    this.location = setup.location ?? {
      x: 0,
      y: setup.column(0, 0).ground,
      z: 0,
    };
  }
  private column(x: number, z: number): Column {
    return this.setup.column(Math.floor(x), Math.floor(z));
  }
  get onGround(): boolean {
    return (
      this.location.y <= this.column(this.location.x, this.location.z).ground
    );
  }
  sensors(tick: number): TraceSensors {
    return {
      tick,
      location: this.location,
      velocity: this.velocity,
      onGround: this.onGround,
      isSolidCell: (x, y, z) => y < this.column(x, z).ground,
      isWaterCell: (x, y, z) => {
        const c = this.column(x, z);
        return y >= c.ground && y < (c.surface ?? c.ground);
      },
      targets: () =>
        (this.setup.targets ?? []).map((t) => ({
          id: t.id,
          protectedOccupant: t.protectedOccupant,
          offset: {
            x: t.location.x - this.location.x,
            y: t.location.y - this.location.y,
            z: t.location.z - this.location.z,
          },
        })),
    };
  }
  write(write: string): void {
    if (write === "event gravity_off") this.gravity = false;
    if (write === "event gravity_on") this.gravity = true;
    if (write.startsWith("property ")) {
      const [, name, value] = write.split(" ");
      if (name !== undefined && value !== undefined)
        this.properties[name] =
          value === "true"
            ? true
            : value === "false"
              ? false
              : Number.isNaN(Number(value))
                ? value
                : Number(value);
    }
  }
  advance(impulse: Vec3, yaw: number): void {
    this.yaw = yaw;
    let { x, y, z } = this.location;
    let vx = this.velocity.x + impulse.x;
    let vy = this.velocity.y + impulse.y;
    let vz = this.velocity.z + impulse.z;
    if (this.column(x + vx, z).ground > y) vx = 0;
    else x += vx;
    if (this.column(x, z + vz).ground > y) vz = 0;
    else z += vz;
    const c = this.column(x, z);
    const afloat =
      this.kind === "sportsboat" &&
      c.surface !== undefined &&
      c.surface > c.ground;
    if (afloat) {
      y = c.surface ?? y;
      vy = 0;
    } else {
      y += vy;
      if (this.gravity) vy -= 0.08;
      if (y <= c.ground) {
        y = c.ground;
        vy = 0;
      }
    }
    const wet = y >= c.ground && y < (c.surface ?? c.ground);
    const drag =
      afloat || (!this.gravity && wet)
        ? 0.83
        : !this.gravity
          ? 0.91
          : y <= c.ground
            ? 0.688
            : 0.91;
    vx *= drag;
    vz *= drag;
    vy *= !this.gravity && wet ? 0.84 : 0.98;
    this.location = { x, y, z };
    this.velocity = { x: vx, y: vy, z: vz };
  }
}
