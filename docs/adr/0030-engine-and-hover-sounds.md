# 0030. Engine and hover sounds from client animations, stepped by speed

- Status: Accepted
- Date: 2026-10-11

## Context

The SUV is silent. On the ground it should sound like an old single-cylinder diesel, the slow, heavy beat of a walk-behind tiller with its combustion knock and the clank of the crank and connecting rod, beating faster as the car speeds up. In flight (0021) it should be only the "shhh" of rushing air, quieter than the engine, rising in pitch with the speed. The sound has to follow a moving vehicle, and every nearby player should hear it.

A script can call `Dimension.playSound` with a pitch, but each sound stays where it started, so at 0.9 blocks/tick it trails behind the car, and it would cost a call per vehicle every few ticks. A client animation can play a sound effect from a keyframe at the entity, as the exhaust animation already emits particles, and it can read `has_rider`, `mycar:flight`, and `query.ground_speed` (blocks/s, up to 18 at `SPEC.maxSpeed`) on the client. An animation sound effect has no pitch control, so a pitch that follows the speed has to come from separate clips.

No audio tools are available in the dev environment (no ffmpeg, sox, or numpy), and there are no sound assets in the repository.

## Decision

- `tools/gen_sounds.py` (`pnpm sounds`) synthesizes the sounds with the Python standard library and a seeded random generator, and writes 16-bit mono 22050 Hz WAV files to `packs/mycar_rp/sounds/mycar/`. No recording is used; the references only set the character:
  - `engine_0` to `engine_5`: 1 s loops at 8, 10, 12, 14, 17, and 20 power strokes a second (a four-stroke single from about 960 to 2400 rpm). Each stroke is a noisy pop rung through band-pass resonances at 60, 95, and 180 Hz (the exhaust's boom), a sharp knock 1 ms later rung at 2200 and 3600 Hz (diesel combustion), and a faint clank half a stroke later rung at 1100 and 2600 Hz (the crank and connecting rod), all clipped gently with `tanh`. At idle the strokes vary in strength and wander up to 6% of a stroke in time; the higher levels run steadier. The resonators filter two copies of the loop and keep the second, so the ringing wraps around the seam. A first version modeled a two-stroke twin; it was replaced to follow the diesel reference
  - `hover_0` to `hover_4`: 1 s loops of band noise rising from 700–2200 Hz to 2500–6500 Hz, swelling by 12% three times a second. The noise is a sum of 250 sines with whole cycles in the loop, so it repeats without a click. Earlier versions laid an F1-like V6 howl and a turbo whistle under the air; in game only the air was wanted
  - `hover_start`: 1 s of the slowest level's air swelling in
- `sound_definitions.json` defines `mycar.engine_<n>` (volume 0.5 rising to 0.7, heard up to 24 blocks), `mycar.hover_<n>` (0.14 rising to 0.22, up to 32 blocks), and `mycar.hover_start` (0.14) in the `neutral` category
- The client entity plays exactly one engine level while `query.has_rider` and `mycar:flight` is `ground`, picked by `query.ground_speed`: below 1, 1–4.5, 4.5–8, 8–11.5, 11.5–15, and from 15 blocks/s. `wheels_deploy` plays `hover_start` as the wheels start to fold, and the `hover` state of the flight controller (0022) plays exactly one hover level: below 2, 2–6, 6–10, 10–14, and from 14 blocks/s. Each level is a looping animation as long as its clip: 1 s for the engine and the hover levels

## Consequences

- The pitch steps between levels instead of gliding; when the speed crosses a bound, the old clip finishes under the new one for up to its length
- Each loop restarts the sound at the animation's position, so a fast car may show a faint seam where the old copy, left behind, overlaps the new one
- Replacing a sound means changing the generator and running `pnpm sounds`, or dropping a recorded file in with the same name
