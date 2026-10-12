# 0050. Vehicle kinds and per-kind profiles

- Status: Superseded in part by 0055
- Date: 2026-10-12

## Context

All driven entities belong to the vehicle feature, but 0046 left its internal layout open until a second vehicle arrived. The [sports boat spike](../spike-sportsboat.md) found SUV assumptions in motion limits, body sizes, seats, lights, placement, entity filters, and item drops. A family query found both kinds and passed all 24 SUV in-game tests, but branching inside the aggregate and reusing SUV forms for afloat and beached states would couple the boat to the SUV.

## Decision

- Define `VehicleKind` in `src/domain/vehicle/kind.ts`, starting with `"suv"`; `"sportsboat"` follows in 6/8
- Keep every value that can differ between kinds in one `VehicleProfile` per kind in `src/domain/vehicle/profile.ts`, namely motion limits, ram body, seat layout, and headlight beams. `SPEC` keeps values shared by every kind and the SUV-only form, step, flight, and submarine tuning
- Build the SUV profile from today's `SPEC`, `SEAT_POSITIONS`, and `DOOR_BY_SEAT`, so the SUV behaves exactly as before
- Keep seats, driver, ram, hit counter, headlight switch, and motion state in the `Vehicle` aggregate. Delegate the rest of a tick to a `Drive` chosen by kind. `SuvDrive` holds the forms, gear, and bank (0039, 0040); the boat gets its own drive in 6/8
- Map kind to entity ID and item ID in one infrastructure table. Find vehicles by the family `yasu_ride_vehicle`; queries and event filters never compare with a single vehicle type
- Keep `src/domain/vehicle` flat (0046). The new files are `kind.ts`, `profile.ts`, `drive.ts`, and `suvDrive.ts`, and later `boatDrive.ts`

## Consequences

A new kind needs a new profile, a new drive, and a new row in the identifier table. Shared logic never branches on the kind. The profile and the drive interface arrive before the second kind ships, so the SUV refactor can be reviewed on its own against unchanged SUV behavior. Revisit the flat layout when more drives make it hard to navigate.
