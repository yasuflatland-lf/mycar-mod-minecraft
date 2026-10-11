# 0040. Sonar sound under water

- Status: Accepted
- Date: 2026-10-11

## Context

The submarine form (0039) is silent: the engine plays only in `car` form and the rushing air only in `hover` (0030). Under water it should sound like a submarine's sonar: a clear ping that rings out in the water, an echo from far away, and the low rumble of the deep, in the mood of long ambient recordings of sonar sounds. Such a recording cannot be shipped: the add-on is published, the recordings belong to their authors, and downloading audio from a video site breaks its terms of use. The sounds of 0030 are synthesized for the same reason.

## Decision

- `tools/gen_sounds.py` also writes `sonar`, a 4 s loop from its own seeded generator, so the other sounds stay byte for byte the same. No recording is used; the reference only sets the mood:
  - One ping at the start of the loop: a 1400 Hz tone with a 4 ms attack and a 0.7 s decay, and a second harmonic that fades within 0.15 s for the "ko" of "kon"
  - Four reflections 0.11 to 0.52 s later, at gains 0.35 to 0.12 and detuned by up to 6 Hz so they do not cancel into a comb, and a return from the target at 1.6 s (0.22) and 1.73 s (0.08) that fades faster
  - A rumble of 120 sines with whole cycles in the loop between 30 and 120 Hz, swelling by 30% once per loop
  - The ping is built two loops long and folded, so the tail that runs past the end comes back in at the start, and the loop repeats without a click
- `sound_definitions.json` defines `mycar.sonar` in the `neutral` category at volume 0.4, heard up to 48 blocks, farther than the engine (24) and the air (32), as sonar carries in water
- The `submarine` state of the form controller plays `submarine_sound` while `query.has_rider`, a loop as long as the clip (4 s), as the engine plays only with a rider. The `dive` and `surface` transitions stay silent

## Consequences

- An unattended submarine floating in the water is silent, as a parked car is
- The ping repeats every 4 s whatever the speed; nothing in the sound follows the speed under water
- A player under water hears the sound as Minecraft plays it, without any muffling
- Replacing the sound means changing the generator and running `pnpm sounds`, or dropping a recorded file the project may ship in with the same name
