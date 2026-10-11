# 0019. Passengers move up to the driver seat

- Status: Accepted
- Date: 2026-10-11
- Amended by: [0025](0025-jump-on-touch-and-a-sticky-driver.md) (the driver stays the driver while riding)

## Context

0007 left one question open: when the driver gets out and only passengers remain, does Bedrock move a passenger into the driver seat? It assumed it does not, and asked to revisit the ADR if it does.

Only players can ride the SUV (`family_types: ["player"]`), and in-game tests have no players (0010). The test pack therefore defines `mycar_test:seat_probe`, an entity with the SUV's `minecraft:rideable` except that it seats cows, and boards cows with `addRider`. On BDS (2026-10-11):

- Two riders board: they sit in seat 0 (driver) and seat 1 (front passenger), in boarding order
- The driver is ejected: the front passenger moves to seat 0 within 5 ticks
- A third rider boards: it sits in seat 1, and the moved passenger stays in seat 0

Bedrock places riders by their index in the rider list, so removing the first rider shifts everyone after it forward by one seat.

## Decision

- Keep the seat layout and the driver rule of 0007: four seats from `minecraft:rideable` with the driver seat at index 0, and the driver is the rider closest to the driver seat after converting positions into the vehicle's coordinates
- Accept Bedrock's behavior: when the driver gets out, the next rider in boarding order moves into the driver seat and becomes the driver. The script does not undo or add to this
- When someone gets out, play the door animation and sound of the seat that was emptied, as in 0007
- The in-game test `seats_after_driver_leaves` pins this behavior on `mycar_test:seat_probe`. A unit test keeps the probe's `minecraft:rideable` equal to the SUV's apart from `family_types`

## Consequences

- To hand over the wheel, the driver only has to get out; nobody else has to get out and back in
- A passenger who did not intend to drive becomes the driver. When the vehicle is nearly stopped, its heading snaps to that passenger's view (0007), so it may turn on the spot
- Riders who move up are judged by position, so the door event of the moved passenger's old seat is not emitted; only the seat the driver left counts as vacated. Revisit this if the door effects look wrong in game
- The probe shows engine behavior for a non-player rider. If players are found to behave differently on real devices, revisit this ADR
