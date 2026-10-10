// Judges the ram_cow in-game test from per-tick samples (ADR 0006, 0010).

export interface RamSample {
  valid: boolean;
  hp: number;
  /** The car drives toward +x, so the knockback pushes the cow toward +x. */
  x: number;
}

export interface RamVerdict {
  pass: boolean;
  detail: string;
}

/** Ticks after the hit over which the knockback has to move the cow. */
export const PUSH_WINDOW = 3;
/** Measured in-game: the knockback moves the cow about 2.25 blocks in PUSH_WINDOW ticks. */
export const MIN_PUSH = 1;

export function hitTick(hp0: number, samples: readonly RamSample[]): number {
  return samples.findIndex((s) => s.valid && s.hp < hp0);
}

export function judgeRam(
  hp0: number,
  x0: number,
  samples: readonly RamSample[],
): RamVerdict {
  const hit = hitTick(hp0, samples);
  if (hit < 0) {
    const vanished = samples.some((s) => !s.valid);
    return {
      pass: false,
      detail: vanished ? "cow vanished before a hit" : `no hit hp=${hp0}`,
    };
  }
  const before = hit > 0 ? (samples[hit - 1]?.x ?? x0) : x0;
  const after = samples[hit + PUSH_WINDOW];
  if (!after?.valid) {
    return {
      pass: false,
      detail: `cow gone within ${PUSH_WINDOW} ticks of the hit`,
    };
  }
  const pushed = after.x - before;
  const hp1 = samples[hit]?.hp ?? hp0;
  return {
    pass: pushed > MIN_PUSH,
    detail: `hitTick=${hit} hp ${hp0}->${hp1} pushed=${pushed.toFixed(2)}`,
  };
}
