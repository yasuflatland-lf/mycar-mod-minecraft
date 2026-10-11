# 0007. Seats and choosing the driver

- Status: Superseded by 0019
- Date: 2026-10-10

## Context

The vehicle has four seats, filled in boarding order: driver seat (front right) → front passenger seat (front left) → behind the driver → behind the front passenger. Only the person in the driver seat drives.

In the spike, the first player in the list returned by `getRiders()` was the driver. We have not confirmed that the order of this list matches the seat order. We also do not know whether Bedrock moves a passenger into the driver seat when the driver gets out and only passengers remain.

## Decision

- Seat positions are defined by `minecraft:rideable` in the entity definition (front right `[-0.38, 0.1, 0.35]`, front left `[0.38, 0.1, 0.35]`, rear right `[-0.38, 0.1, -0.8]`, rear left `[0.38, 0.1, -0.8]`). The driver seat is index 0, and `controlling_seat` is also 0
- The driver is the rider closest to the driver seat position, after converting each rider's position into coordinates relative to the vehicle's heading. Do not rely on the list order
- When the driver gets out, passengers are not moved into the driver seat automatically. Anyone who wants to drive gets out and back in. At the start of implementation, confirm whether Bedrock moves them automatically; if it does, revisit this ADR
- When someone gets out, play that seat's door open/close animation and the door-open sound once each

## Consequences

- The driver is chosen correctly regardless of the order `getRiders()` returns
- If the driver seat is empty, nobody drives and the vehicle coasts to a stop
