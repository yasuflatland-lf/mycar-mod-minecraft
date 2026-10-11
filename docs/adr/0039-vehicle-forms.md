# 0039. Vehicle forms

- Status: Accepted
- Date: 2026-10-11
- Supersedes in part: 0021 (the vocabulary, the property, and the component group and event names)

## Context

A submarine form is coming, and a submarine is not a flight mode. The vehicle is one machine with several forms, changed by the driver's intent or by its surroundings. Keeping one state machine avoids invalid combinations such as being a car and a submarine at the same time. This change only renames the existing states and interfaces; it does not add submarine behavior.

## Decision

- Rename `src/domain/vehicle/flight.ts` to `form.ts` and `tests/domain/flight.test.ts` to `form.test.ts`.
- Replace `FLIGHT_MODES` with `FORMS = ["car", "takeoff", "hover", "landing"]`: `ground` becomes `car`, `flying` becomes `hover`, and the other values stay unchanged.
- Rename `FlightMode` / `isFlightMode` to `Form` / `isForm`, `FlightState` to `FormState`, and its `mode` / `modeTicks` fields to `form` / `formTicks`. Keep `jumpHeld` and `lastTap`.
- Rename `FlightInput`, `initialFlight`, and `stepFlight` to `FormInput`, `initialForm(form = "car")`, and `stepForm`. Rename `flightVerticalSpeed(mode, climb)` to `verticalSpeed(form, climb)`.
- `stepBank`, `bankSink`, and `nextGearDown` take `form: Form` and use the renamed values. `Vehicle.flightMode` becomes `Vehicle.form`; `Vehicle.rebuild` takes `form = "car"`. `TickOutcome.flight` and `VehicleSnapshot.flight` become `form`; `DriveWorld.setFlight` becomes `setForm(vehicleId, form)`.
- Replace `FLIGHT_PROPERTY = "mycar:flight"` with `FORM_PROPERTY = "mycar:form"`. The client-synced enum has the four values above and defaults to `car`. Update all Resource Pack queries and rename `controller.animation.mycar.suv.flight` and its client animation key `flight` to `controller.animation.mycar.suv.form` and `form`.
- Name gravity groups after their effect: `mycar:hovering` becomes `mycar:weightless`, and `mycar:grounded` becomes `mycar:weighted`. Rename the events `mycar:hover` / `mycar:land` to `mycar:gravity_off` / `mycar:gravity_on`, and their constants `HOVER_EVENT` / `LAND_EVENT` to `GRAVITY_OFF_EVENT` / `GRAVITY_ON_EVENT`. The `car` form has gravity; every other form does not. Keep the property and gravity event synchronized as in 0021.
- The third-person rule of 0028 reads "any form but `car`". Rename the rider set `airborne` to `offRoad` (0028 + 0039).
- Keep `climbInput`, `verticalImpulse`, `stepFlightMotion`, every `SPEC` name, animation controller state names (`ground`, `deploy`, `hover`, `retract`), in-game test names (`flight_*`), and other test file names unchanged. All transitions, timing, motion, and visual behavior stay the same.

## Consequences

- Later work can add a submarine to the same form state machine without calling it flight.
- There is no migration: a vehicle that was flying when the server restarts with this change starts as `car` and drops.
- Entity definition and Resource Pack changes require a server restart, and the Resource Pack version must increase so clients discard their cached copy (0015).
- Revisit this decision if a form needs gravity rules other than "off in every form except `car`", or if vehicles saved in the old `mycar:hovering` group turn out not to drop after a restart.
