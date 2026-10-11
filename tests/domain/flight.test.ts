import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  FLIGHT_MODES,
  type FlightInput,
  type FlightMode,
  type FlightState,
  flightVerticalSpeed,
  initialFlight,
  isFlightMode,
  stepFlight,
  verticalImpulse,
} from "../../src/domain/vehicle/flight";
import { SPEC } from "../../src/domain/vehicle/spec";

type Step = Omit<FlightInput, "tick">;
interface Frame {
  input: FlightInput;
  before: FlightState;
  after: FlightState;
}

const NEXT: Record<FlightMode, FlightMode> = {
  ground: "takeoff",
  takeoff: "flying",
  flying: "landing",
  landing: "ground",
};

function run(steps: readonly Step[], start = initialFlight()): Frame[] {
  let state = start;
  return steps.map((step, tick) => {
    const input = { ...step, tick };
    const before = state;
    state = stepFlight(state, input);
    return { input, before, after: state };
  });
}

/** Jump is held only on the listed ticks; the vehicle is controlled and on the ground unless overridden. */
function taps(at: number[], length: number, over: Partial<Step> = {}): Step[] {
  return Array.from({ length }, (_, t) => ({
    jump: at.includes(t),
    controlled: true,
    onGround: true,
    ...over,
  }));
}

const step = fc.record({
  jump: fc.boolean(),
  controlled: fc.boolean(),
  onGround: fc.boolean(),
});
const steps = fc.array(step, { maxLength: 300 });
const mode = fc.constantFrom(...FLIGHT_MODES);

describe("stepFlight (ADR 0021)", () => {
  it("only moves on in the cycle ground -> takeoff -> flying -> landing -> ground", () => {
    fc.assert(
      fc.property(mode, steps, (m, seq) => {
        for (const f of run(seq, initialFlight(m)))
          if (f.after.mode !== f.before.mode)
            expect(f.after.mode).toBe(NEXT[f.before.mode]);
      }),
    );
  });

  it("takes off only on a controlled Jump press that follows another press within doubleTapTicks", () => {
    fc.assert(
      fc.property(steps, (seq) => {
        const frames = run(seq);
        const press = (i: number) =>
          (frames[i]?.input.jump ?? false) &&
          !(frames[i - 1]?.input.jump ?? false);
        frames.forEach((f, t) => {
          if (f.before.mode !== "ground" || f.after.mode !== "takeoff") return;
          expect(press(t)).toBe(true);
          expect(f.input.controlled).toBe(true);
          let earlier = false;
          for (let i = Math.max(0, t - SPEC.doubleTapTicks); i < t; i++)
            earlier ||= press(i);
          expect(earlier).toBe(true);
        });
      }),
    );
  });

  it("toggles on two presses 2 to doubleTapTicks ticks apart, but not on presses further apart", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: SPEC.doubleTapTicks }), (gap) => {
        expect(run(taps([0, gap], gap + 1)).at(-1)?.after.mode).toBe("takeoff");
      }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: SPEC.doubleTapTicks + 1, max: 60 }),
        (gap) => {
          expect(run(taps([0, gap], gap + 1)).at(-1)?.after.mode).toBe(
            "ground",
          );
        },
      ),
    );
  });

  it("stays in takeoff for exactly takeoffTicks ticks, whatever the input", () => {
    fc.assert(
      fc.property(
        fc.array(step, {
          minLength: SPEC.takeoffTicks,
          maxLength: SPEC.takeoffTicks,
        }),
        (seq) => {
          const modes = run([...taps([0, 2], 3), ...seq]).map(
            (f) => f.after.mode,
          );
          expect(modes.filter((m) => m === "takeoff")).toHaveLength(
            SPEC.takeoffTicks,
          );
          expect(modes.at(-1)).toBe("flying");
        },
      ),
    );
  });

  it("starts landing on the tick nothing controls a flying vehicle", () => {
    fc.assert(
      fc.property(steps, (seq) => {
        for (const f of run(seq, initialFlight("flying")))
          if (f.before.mode === "flying" && !f.input.controlled)
            expect(f.after.mode).toBe("landing");
      }),
    );
  });

  it("touches down exactly when the vehicle is on the ground while landing", () => {
    fc.assert(
      fc.property(steps, (seq) => {
        for (const f of run(seq, initialFlight("landing")))
          if (f.before.mode === "landing")
            expect(f.after.mode === "ground").toBe(f.input.onGround);
      }),
    );
  });

  it("a triple tap toggles only once", () => {
    expect(run(taps([0, 2, 4], 5)).map((f) => f.after.mode)).toEqual([
      "ground",
      "ground",
      "takeoff",
      "takeoff",
      "takeoff",
    ]);
  });

  it("example: take off, fly, land, and touch down", () => {
    const modes = run([
      ...taps([0, 2], 3),
      ...taps([], SPEC.takeoffTicks, { onGround: false }),
      ...taps([], 10, { onGround: false }),
      ...taps([0, 2], 3, { onGround: false }),
      ...taps([], 1),
    ]).map((f) => f.after.mode);
    expect(modes[2]).toBe("takeoff");
    expect(modes[2 + SPEC.takeoffTicks]).toBe("flying");
    expect(modes.at(-2)).toBe("landing");
    expect(modes.at(-1)).toBe("ground");
  });
});

describe("isFlightMode", () => {
  it("accepts exactly the four modes", () => {
    for (const m of FLIGHT_MODES) expect(isFlightMode(m)).toBe(true);
    fc.assert(
      fc.property(fc.anything(), (v) => {
        fc.pre(!(FLIGHT_MODES as readonly unknown[]).includes(v));
        expect(isFlightMode(v)).toBe(false);
      }),
    );
  });
});

describe("flightVerticalSpeed (ADR 0021)", () => {
  const pitch = fc.double({ min: -90, max: 90, noNaN: true });
  const speed = fc.double({
    min: -SPEC.maxReverse,
    max: SPEC.maxSpeed,
    noNaN: true,
  });

  it("never exceeds maxClimb up or down while flying", () => {
    fc.assert(
      fc.property(pitch, speed, (p, s) => {
        expect(
          Math.abs(flightVerticalSpeed("flying", p, s)),
        ).toBeLessThanOrEqual(SPEC.maxClimb);
      }),
    );
  });

  it("holds altitude within the pitch dead zone, when stopped, and in reverse", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -SPEC.pitchDeadzone,
          max: SPEC.pitchDeadzone,
          noNaN: true,
        }),
        speed,
        (p, s) => {
          expect(flightVerticalSpeed("flying", p, s)).toBe(0);
        },
      ),
    );
    fc.assert(
      fc.property(
        pitch,
        fc.double({ min: -SPEC.maxReverse, max: 0, noNaN: true }),
        (p, s) => {
          expect(flightVerticalSpeed("flying", p, s)).toBe(0);
        },
      ),
    );
  });

  it("climbs when looking up and sinks when looking down while moving forward", () => {
    const tilt = fc.double({
      min: SPEC.pitchDeadzone + 1,
      max: 90,
      noNaN: true,
    });
    const forward = fc.double({ min: 0.01, max: SPEC.maxSpeed, noNaN: true });
    fc.assert(
      fc.property(tilt, forward, (t, s) => {
        expect(flightVerticalSpeed("flying", -t, s)).toBeGreaterThan(0);
        expect(flightVerticalSpeed("flying", t, s)).toBeLessThan(0);
      }),
    );
  });

  it("rises at takeoffClimb in takeoff, sinks at landingSink while landing, and is 0 on the ground", () => {
    fc.assert(
      fc.property(pitch, speed, (p, s) => {
        expect(flightVerticalSpeed("takeoff", p, s)).toBe(SPEC.takeoffClimb);
        expect(flightVerticalSpeed("landing", p, s)).toBe(-SPEC.landingSink);
        expect(flightVerticalSpeed("ground", p, s)).toBe(0);
      }),
    );
  });

  it("holds altitude for a pitch that is not a finite number", () => {
    for (const p of [Number.NaN, Infinity, -Infinity])
      expect(flightVerticalSpeed("flying", p, SPEC.maxSpeed)).toBe(0);
  });
});

describe("verticalImpulse", () => {
  it("leaves the target vertical velocity after the engine's vertical drag", () => {
    const v = fc.double({ min: -1, max: 1, noNaN: true });
    fc.assert(
      fc.property(v, v, (target, vy) => {
        expect(
          (vy + verticalImpulse(target, vy)) * SPEC.flightVerticalDrag,
        ).toBeCloseTo(target, 9);
      }),
    );
  });
});
