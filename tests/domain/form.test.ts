import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  climbInput,
  FORMS,
  type Form,
  type FormInput,
  type FormState,
  initialForm,
  isForm,
  stepForm,
  verticalImpulse,
  verticalSpeed,
} from "../../src/domain/vehicle/form";
import { SPEC } from "../../src/domain/vehicle/spec";

type Step = Omit<FormInput, "tick">;
interface Frame {
  input: FormInput;
  before: FormState;
  after: FormState;
}

// A flying vehicle that sinks onto the ground skips landing (ADR 0034).
const NEXT: Record<Form, readonly Form[]> = {
  car: ["takeoff"],
  takeoff: ["hover"],
  hover: ["landing", "car"],
  landing: ["car"],
};

function run(steps: readonly Step[], start = initialForm()): Frame[] {
  let state = start;
  return steps.map((step, tick) => {
    const input = { ...step, tick };
    const before = state;
    state = stepForm(state, input);
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
const form = fc.constantFrom(...FORMS);

describe("stepForm (ADR 0021)", () => {
  it("only moves on in the cycle car -> takeoff -> hover -> (landing ->) car", () => {
    fc.assert(
      fc.property(form, steps, (m, seq) => {
        for (const f of run(seq, initialForm(m)))
          if (f.after.form !== f.before.form)
            expect(NEXT[f.before.form]).toContain(f.after.form);
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
          if (f.before.form !== "car" || f.after.form !== "takeoff") return;
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
        expect(run(taps([0, gap], gap + 1)).at(-1)?.after.form).toBe("takeoff");
      }),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: SPEC.doubleTapTicks + 1, max: 60 }),
        (gap) => {
          expect(run(taps([0, gap], gap + 1)).at(-1)?.after.form).toBe("car");
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
          const forms = run([...taps([0, 2], 3), ...seq]).map(
            (f) => f.after.form,
          );
          expect(forms.filter((m) => m === "takeoff")).toHaveLength(
            SPEC.takeoffTicks,
          );
          expect(forms.at(-1)).toBe("hover");
        },
      ),
    );
  });

  it("starts landing on the tick nothing controls a flying vehicle in the air", () => {
    fc.assert(
      fc.property(steps, (seq) => {
        for (const f of run(seq, initialForm("hover")))
          if (
            f.before.form === "hover" &&
            !f.input.controlled &&
            !f.input.onGround
          )
            expect(f.after.form).toBe("landing");
      }),
    );
  });

  it("returns to the ground on the tick a flying vehicle touches it (ADR 0034)", () => {
    fc.assert(
      fc.property(steps, (seq) => {
        for (const f of run(seq, initialForm("hover")))
          if (f.before.form === "hover")
            expect(f.after.form === "car").toBe(f.input.onGround);
      }),
    );
  });

  it("touches down exactly when the vehicle is on the ground while landing", () => {
    fc.assert(
      fc.property(steps, (seq) => {
        for (const f of run(seq, initialForm("landing")))
          if (f.before.form === "landing")
            expect(f.after.form === "car").toBe(f.input.onGround);
      }),
    );
  });

  it("forgets a pending tap whenever the form changes", () => {
    fc.assert(
      fc.property(form, steps, (m, seq) => {
        for (const f of run(seq, initialForm(m)))
          if (f.after.form !== f.before.form)
            expect(f.after.lastTap).toBeUndefined();
      }),
    );
  });

  it("a single tap before a driverless landing does not pair with the next tap on the ground", () => {
    const frames = run(
      [
        { jump: true, controlled: true, onGround: false },
        { jump: false, controlled: false, onGround: false },
        { jump: false, controlled: true, onGround: true },
        { jump: true, controlled: true, onGround: true },
      ],
      initialForm("hover"),
    );
    expect(frames.map((f) => f.after.form)).toEqual([
      "hover",
      "landing",
      "car",
      "car",
    ]);
  });

  it("a triple tap toggles only once", () => {
    expect(run(taps([0, 2, 4], 5)).map((f) => f.after.form)).toEqual([
      "car",
      "car",
      "takeoff",
      "takeoff",
      "takeoff",
    ]);
  });

  it("example: take off, fly, land, and touch down", () => {
    const forms = run([
      ...taps([0, 2], 3),
      ...taps([], SPEC.takeoffTicks, { onGround: false }),
      ...taps([], 10, { onGround: false }),
      ...taps([0, 2], 3, { onGround: false }),
      ...taps([], 1),
    ]).map((f) => f.after.form);
    expect(forms[2]).toBe("takeoff");
    expect(forms[2 + SPEC.takeoffTicks]).toBe("hover");
    expect(forms.at(-2)).toBe("landing");
    expect(forms.at(-1)).toBe("car");
  });
});

describe("isForm", () => {
  it("accepts exactly the four forms", () => {
    for (const m of FORMS) expect(isForm(m)).toBe(true);
    fc.assert(
      fc.property(fc.anything(), (v) => {
        fc.pre(!(FORMS as readonly unknown[]).includes(v));
        expect(isForm(v)).toBe(false);
      }),
    );
  });
});

describe("climbInput (ADR 0032)", () => {
  const axis = fc.double({ min: -1, max: 1, noNaN: true });

  it("stays within -1 to 1", () => {
    fc.assert(
      fc.property(axis, axis, fc.boolean(), (x, y, jump) => {
        const c = climbInput({ moveX: x, moveY: y, jump });
        expect(c).toBeGreaterThanOrEqual(-1);
        expect(c).toBeLessThanOrEqual(1);
      }),
    );
  });

  it("climbs fully with Jump held and the stick centered or pushed forward", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (y) => {
        expect(climbInput({ moveX: 0, moveY: y, jump: true })).toBe(1);
      }),
    );
  });

  it("sinks with the stick pulled back past the dead zone and never climbs without Jump", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1, max: -SPEC.throttleDeadzone - 0.01, noNaN: true }),
        (y) => {
          expect(climbInput({ moveX: 0, moveY: y, jump: false })).toBeLessThan(
            0,
          );
        },
      ),
    );
    fc.assert(
      fc.property(axis, axis, (x, y) => {
        expect(
          climbInput({ moveX: x, moveY: y, jump: false }),
        ).toBeLessThanOrEqual(0);
      }),
    );
  });

  it("is 0 without input", () => {
    expect(climbInput(undefined)).toBe(0);
  });
});

describe("verticalSpeed (ADR 0021, 0032)", () => {
  const climb = fc.double({ min: -1, max: 1, noNaN: true });

  it("never exceeds maxClimb up or down while flying", () => {
    fc.assert(
      fc.property(fc.double(), (c) => {
        expect(Math.abs(verticalSpeed("hover", c))).toBeLessThanOrEqual(
          SPEC.maxClimb,
        );
      }),
    );
  });

  it("follows the climb command while flying", () => {
    fc.assert(
      fc.property(climb, (c) => {
        expect(verticalSpeed("hover", c)).toBeCloseTo(c * SPEC.maxClimb, 12);
      }),
    );
  });

  it("rises at takeoffClimb in takeoff, sinks at landingSink while landing, and is 0 on the ground", () => {
    fc.assert(
      fc.property(climb, (c) => {
        expect(verticalSpeed("takeoff", c)).toBe(SPEC.takeoffClimb);
        expect(verticalSpeed("landing", c)).toBe(-SPEC.landingSink);
        expect(verticalSpeed("car", c)).toBe(0);
      }),
    );
  });

  it("holds altitude for a climb command that is not a finite number", () => {
    for (const v of [Number.NaN, Infinity, -Infinity])
      expect(verticalSpeed("hover", v)).toBe(0);
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
