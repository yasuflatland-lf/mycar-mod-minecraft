# 0060. Sports boat engine sound

- Status: Accepted
- Date: 2026-10-12

## Context

The sports boat (0051) is silent. The reference the driver chose, a video of a wake boat under way, has the deep, lumpy burble of a V8, the wet exhaust bubbling out under the water, and the hiss of the hull cutting the water. The revs climb with the speed. Its audio cannot ship in the pack, so the sound has to be synthesized, as the SUV's are (0030).

Animations cannot change a sound's pitch while it plays. The SUV picks one of six loops by `query.ground_speed`, and its engine seems to rev up as it gains speed.

## Decision

- `tools/gen_sounds.py` writes `boat_engine_0` to `boat_engine_7`: 1 s loops at 6, 9, 13, 17, 22, 27, 32, and 38 engine cycles per second (720 to 4560 rpm)
- The burble comes from a cross-plane V8: firing order 1-8-4-3-6-5-7-2, one cylinder every 90 degrees, with each bank's exhaust pulses rung through its own set of low resonances (42 to 330 Hz). The uneven gaps between one bank's pulses make the burble, and the two banks' slightly different pipes beat against each other. The sum is soft-clipped
- The wet exhaust: 60 percent of the pulses at idle blow a bubble, down to 15 percent at full speed. Each bubble is a damped sine at 70 to 220 Hz whose pitch rises as it decays
- The water: a 400 to 3800 Hz noise band that swells twice a loop. Its level rises from 0.04 at idle to 0.55 at full speed
- Idle runs rough: the firing timing wanders by up to 8 percent of a gap and the pulse strength varies more. Both steady toward full speed
- The client plays one level while ridden, chosen by `query.ground_speed` in blocks per second: below 1, 1 to 4, 4 to 7, 7 to 10, 10 to 13, 13 to 16, 16 to 19.5, and from 19.5 (top speed is 22.4). The volume rises from 0.5 to 0.78 across the levels, audible up to 32 blocks
- The boat's generator has its own seed, so the SUV's sounds stay byte for byte the same

## Consequences

- The Resource Pack gains eight 1 s WAV files of about 43 KB each, and its version goes up to 0.1.45 (0015)
- The revs step up at each speed boundary rather than gliding. Eight levels keep each step small
- The sound follows the speed, not the throttle: the revs only fall as the boat slows. Holding full throttle against a shore sounds like idle
- Revisit the levels and the mix after hearing them in game against the reference
