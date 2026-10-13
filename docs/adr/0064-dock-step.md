# 0064. Group the hold, floor, and deck seats into an optional dock

- Status: Accepted
- Date: 2026-10-13
- Extends: 0055, 0063

## Context

0063 added `hold`, `floor`, and `deckSeats` to `DriveStep` and `TickOutcome` as separate optional fields. A drive sets all three or none, but the core could not express that relationship, and a comment in the core named the boat. 0055 lists a new command, sensor query, or placement surface as the only ways shared code grows; 0063 introduced a held state without recording that extension.

## Decision

- Define `Dock` in `src/domain/vehicle/dock.ts` with three readonly fields: `hold: HoldPose`, `floor: readonly FloorCell[]`, and `seats: readonly (Vec3 | undefined)[]`. Deck seat i stands at seat i of the vehicle's profile, with an undefined entry where that seat has a rider.
- Replace the separate fields with `DriveStep.dock?: Dock` and `TickOutcome.dock?: Dock`. A dock is present only while a drive holds its vehicle; a kind that never holds never returns one.
- Keep `boardDeckRiders` as a separate flag because it is also set on the tick a held vehicle sets off, when there is no dock.
- The aggregate still blanks `dock.seats[i]` while seat i has a rider, and still masks that seat's deck input.
- A dock joins the shared vocabulary of 0055 as a fourth way shared code grows: a held state a kind may enter.
- Keep the ports `holdAt`, `layFloor`, `keepDeckSeats`, and `boardDeckRiders` unchanged, including their call order. Docking rules, tuning values, and behavior remain unchanged. Existing test scenarios, expected results, and checks are preserved (0055, Verification).

## Consequences

A new kind gets docking by returning a `Dock`, with no core change. A kind cannot return a floor without a hold or deck seats without a hold.

Every dock must supply all three fields, even when its floor or seats are empty. Revisit this aggregate if a second kind needs only part of a dock.
