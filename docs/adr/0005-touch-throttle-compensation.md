# 0005. Compensate the throttle from the mobile joystick

- Status: Superseded by 0018
- Date: 2026-10-10

## Context

On mobile, movement input while riding is available as analog values. However, throttle and steering share a single joystick, so steering hard lowers the throttle value. In the spike, a left/right value of 0.90 came with a forward/back value of 0.48. As is, players cannot turn at full throttle.

## Decision

When the forward/back value exceeds 0.1, use `min(1, forward / 0.5)` as the throttle. Pushing the stick at least halfway forward gives full throttle. The same formula applies backward, for braking and reversing. The left/right value is passed through to steering unchanged.

On a PC keyboard the forward/back value is either 0 or ±1, so the compensation does not change the result. Do not branch on device type.

## Consequences

- Mobile players can turn at full throttle
- Fine throttle control is squeezed into the narrow forward/back band 0.1–0.5
