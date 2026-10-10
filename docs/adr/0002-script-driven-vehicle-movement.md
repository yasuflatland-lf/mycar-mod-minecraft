# 0002. Drive vehicles by setting their velocity from the script

- Status: Accepted
- Date: 2026-10-10

## Context

We want arcade-style driving: acceleration and coasting, turning as soon as you steer, and sliding sideways under the handbrake. We considered three ways to move a vehicle in Bedrock:

1. Every tick, compute speed and heading in the script and give the vehicle its velocity with `applyImpulse`
2. Use `minecraft:input_ground_controlled`, the same as horses, and let the engine move the vehicle
3. Keep approach 2, but raise and lower the max-speed attribute from the script

The spike built and compared 1 and 2. With 2, left/right input slid the vehicle straight sideways without turning it (crab walking), so it did not turn like a car. With 3, the direction of travel always matches the vehicle's facing, so sideways sliding is impossible. Approach 1 produced acceleration, coasting, and sliding.

## Decision

Adopt approach 1. The vehicle entity is defined as a "box you can ride", and all movement is computed in the script.

- Keep the tuning values in one place: max speed 0.9 blocks/tick, reverse 0.2, acceleration 0.0225, braking 0.04, coasting deceleration 0.02, steering 6°/tick, grip 0.6, grip under handbrake 0.04
- Cap the magnitude of horizontal velocity at the max speed every tick. In the spike, forward velocity was added on top of the remaining sideways component, so the combined speed exceeded the max speed under the handbrake (1.15 against 0.9)
- When a player gets into the driver seat while the vehicle is stopped, turn the vehicle to face the driver's view direction. Give the driver seat `lock_rider_rotation: 90` so the camera follows the vehicle when it turns

## Consequences

- We can shape the handling freely, and parts swapping (sub-project 3) only needs to swap tuning values
- Because the computation runs on the server, the driver sees the vehicle's position at least one tick late. On a LAN the round trip is a few milliseconds, but the wait for the next tick and the interpolation delay remain. The smoothness of the driver camera has not been evaluated yet. If it rates poorly, revisit this ADR
- The script has to deal with the engine's ground friction and wall interactions itself (0003, 0004)
