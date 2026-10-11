# 0029. Raise the seats so riders' legs stay inside the body

- Status: Accepted
- Date: 2026-10-11

## Context

The seats of 0007 sit at y = 0.1 blocks. With the third-person camera in flight (0028), the riders' legs showed under the floor of the SUV. Reading a seated player's location on BDS (2026-10-11) gave feet 0.3 blocks below the vehicle's origin: Bedrock lowers a player 0.4 blocks below the seat position. The floor of the model spans 4 to 7 px above the origin and the seat cushions top out at 10 px, so the player's hips (12 px above their feet) sat at about 7 px, and the legs, which the riding pose angles forward and down, reached below 4 px.

## Decision

- All four seats move from y = 0.1 to y = 0.4 blocks. The x and z of 0007 stay. The test pack's `mycar_test:seat_probe` copies the change, as 0019 requires

## Consequences

- The hips sit at about 12 px, a little above the cushions, and the head stays under the roof at 29 px
- The legs no longer show under the floor (checked by hand in game, 2026-10-11)
