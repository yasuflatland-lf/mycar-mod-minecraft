# 0044. Bank into turns under water

- Status: Accepted
- Date: 2026-10-11

## Context

The SUV rolls into turns in flight (0026), but the submarine form (0040) turned flat: 0040 kept banking to hover only. A submarine steers with the same flight handling as hover, so a turn under water should read the same way.

## Decision

- `stepBank` targets `clamp(heading change this tick / SPEC.turnRate, -1, 1) * SPEC.maxBank` in both `hover` and `submarine` form, and level in every other form. The rate limit, the property and the animation of 0026 stay as they are
- `bankSink` stays hover only: a submarine's vertical speed comes from the climb input and buoyancy (0040), and a banked turn under water keeps its depth
- The in-game test `submarine_bank` turns right in the pool and expects at least half of `SPEC.maxBank`, then level after the turn. The test pool grows to 80 blocks across z, and the arena to z 0–90, so the turn has open water

## Consequences

- A submarine coming out of a turn into `car` on a shore levels out at `SPEC.bankRate` per tick, as a hover car does on touchdown
- Riders stay upright while the body rolls under water, as in flight (0026)
