# 0054. Shard the in-game tests across three CI jobs

- Status: Accepted
- Date: 2026-10-12

## Context

The in-game tests (0010) run one after another on a single BDS, and the runner refuses a second run while one is active because runs share the arena. With 28 tests the `in-game` job took 153 s, of which `pnpm test:game` took 133 s, while the unit test job took 55 s. The in-game job therefore set how long a pull request waits.

The suite took 2546 ticks (127 s at 20 TPS). The six slowest tests made up 43% of it: boat_cruise 235, submarine_unmanned 211, submarine_shore 178, boat_shore 165, flight_land 140, and submarine_dive 136 ticks.

Spike run 38212196180 (#163) ran the whole suite and the 2-way and 3-way splits side by side, each job on its own runner and BDS. All 28 tests passed in every configuration:

| Jobs | Slowest job | Slowest `test:game` | Wall clock | Runner time (sum of jobs) |
|---|---|---|---|---|
| 1 | 153 s | 133 s | - | 153 s |
| 2 | 106 s | 73 s | -31% | 195 s |
| 3 | 81 s | 51 s | -47% | 228 s |

Each job pays about 20 s for checkout, install, build, and BDS start, and about 7 s for the arena setup and log polling, however few tests it runs.

## Decision

- Run the in-game tests as a matrix of three jobs, `in-game (1/3)` to `in-game (3/3)`, with `fail-fast: false` so one failing slice does not hide the others
- `pnpm test:game` reads `GAME_TEST_SHARD=<index>/<total>` and sends it after the run id in the scriptevent message. Without it, and for a run started by hand, the whole suite runs
- Each entry in the runner's test list carries its ticks as last logged in CI. `shardsOf` packs the tests slowest first, each into the slice with the fewest ticks so far, breaking ties by list position and then by the lower slice, so all three jobs compute the same split
- Every result line carries `ticks=`. Update a test's number when it moves by more than about 50 ticks, and give a new test its measured ticks

## Consequences

A pull request waits about 80 s instead of about 155 s for the in-game tests, and the unit test job (55 s) is close to becoming the slowest check. Runner time grows by about half, and a failure log is spread over three jobs. The job names change, but only `check` is a required status check, so the ruleset is unaffected.

Round robin by list position was tried first and is fragile. It gave 930, 848, and 768 ticks in the spike. After `boat_drag` was inserted in the middle of the list, every later test moved to the next slice, and run 38212837415 took 937, 747, and 1035 ticks, so the slowest job took 86 s. Packing the same 29 tests by their ticks gives 900, 890, and 894. The cost is a tick number per test that can go stale; a stale number only unbalances the slices and never skips or repeats a test.

Revisit when the slowest slice runs more than 10 s longer than the fastest. A fourth job would save at most about 14 s, because each job still pays the fixed 27 s.
