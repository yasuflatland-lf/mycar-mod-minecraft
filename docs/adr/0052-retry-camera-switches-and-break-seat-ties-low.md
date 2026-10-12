# 0052. Retry camera switches in both directions, and break seat ties toward the lower index

- Status: Accepted
- Date: 2026-10-12
- Supersedes in part: 0028 (the rule for retrying a failed camera clear)

## Context

0028 says a failed `clear()` is not retried, to prevent a missing player from throwing every tick. `DriveVehicles.syncCameras` in `src/application/vehicle/driveVehicles.ts` now retries failed switches in either direction. Giving up after a failed clear would leave a rider in third person instead of returning their own view. `BedrockVehicleWorld.setThirdPerson` in `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts` returns without doing anything when the player is missing, so a player who left is dropped from camera tracking rather than retried. The missing-player concern in 0028 no longer applies. The `cameraFailed` set suppresses repeated failure logs until a switch succeeds for that player.

The nearest-seat rule of 0007 and 0019 does not specify how to break equal-distance ties. `nearestSeat` in `src/domain/vehicle/seats.ts` visits seats in index order and replaces the best candidate only for a strictly smaller distance (`<`), so the lower index wins. The test "breaks an exact tie on the centerline toward the lower seat index, the driver's side" in `tests/domain/vehicle/seats.test.ts` pins this behavior. Recording it adds a rule that 0019's Decision did not cover; it does not supersede 0019.

## Decision

- Retry a failed `setCamera` or `clear()` on the next tick while that switch is still needed. Only update the `thirdPerson` set after the switch returns successfully. A missing player is a successful no-op, so clearing removes that player from the set
- Log a camera failure once per player until a switch for that player succeeds. Only a successful switch removes the player from `cameraFailed`, allowing a later failure to be logged again; the entry stays when the failed switch stops being needed before it is retried. A failure must not stop other vehicles or riders
- Use the lower seat index when two or more seats are exactly as close. Keep the existing seat coordinates, where positive x is left and positive z is forward:

  | Index | Position | x | z |
  |---|---|---|---|
  | 0 | Driver, front right | -0.38 | 0.35 |
  | 1 | Front passenger | 0.38 | 0.35 |
  | 2 | Behind the driver | -0.38 | -0.8 |
  | 3 | Behind the front passenger | 0.38 | -0.8 |

  A rider on the center line (`x = 0`) is assigned seat 0 in the front row or seat 2 in the back row; for example, `(0, 0.35)` selects 0 and `(0, -0.8)` selects 2

## Consequences

- A transient clear failure can recover automatically instead of leaving the rider in third person. The existing "retries giving the view back when it fails" test in `tests/application/vehicle/driveVehicles.test.ts` pins the retry; nearby tests pin log suppression and logging again after success
- A present player whose camera can never be cleared incurs a small retry every tick, with only one failure log until a switch succeeds. Revisit this if persistent failures make that cost significant; missing players do not cause this retry loop
- Log suppression can span flights. If a failed switch stops being needed before its retry, for example because the rider lands or gets off before the next tick, `syncCameras` never calls `switchCamera` for that player again, and the `cameraFailed` entry stays. A later flight whose switches keep failing for that player then logs nothing, because the only log came from the earlier flight. This gap is accepted; clear the entry when the pending switch is dropped if a missing log hinders diagnosis
- Equal-distance seat assignments are deterministic and favor the driver's side on the center line. Revisit the tie-break if the seat layout or index order changes
- This records existing behavior without changing code or tests. The rest of 0028's Decision remains in force, with the third-person scope widened to every form but `car` by 0039; 0019 remains Accepted
