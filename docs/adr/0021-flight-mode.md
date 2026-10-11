# 0021. Flight mode: toggle with a double tap, climb with the view pitch, and switch gravity with a component group

- Status: Superseded in part by 0032 (climbing and sinking), 0034 (how flight ends), and 0039 (vocabulary, property, component group and event names)
- Date: 2026-10-11

## Context

We want the SUV to fly like the hover car in Back to the Future Part II, from PC keyboards and mobile touch (0018). The stable Script API gives us the movement vector, Jump, and Sneak through `InputInfo`. Jump already pulls the handbrake (the handbrake is from 0002; the Jump mapping is in `driveInput.ts`). Sneak dismounts, and on touch it reads as pressed for at most one tick, so it cannot be held.

We compared three ways to stop gravity:

1. A component group with `minecraft:physics` `has_gravity: false`, added and removed by entity events
2. Keep gravity and cancel it every tick with an upward impulse
3. Move the vehicle by teleport while it flies

Option 2 has to estimate the engine's gravity and drag and fight them every tick, the vertical twin of the friction problem in 0003, and the client still needs an entity property to know when to fold the wheels. Option 3 gives up the engine's collision and interpolation and goes against 0002.

`Entity.setProperty` is applied on the next tick, not at once.

## Decision

- The `Vehicle` aggregate has four flight modes, `ground`, `takeoff`, `flying`, and `landing`, mirrored to the client-synced enum entity property `mycar:flight`
- Two Jump presses within 8 ticks toggle flight: `ground` to `takeoff`, and `flying` to `landing`. Takeoff and landing ignore Jump. On the ground the first press still pulls the handbrake for a moment
- `takeoff` lasts 20 ticks, rises at 0.075 blocks/tick (1.5 blocks), and ignores the controls
- `flying` keeps the ground handling (throttle, steering, grip 0.6, max speed 0.9) without the handbrake. The vertical speed is `-sin(sign(pitch) * (|pitch| - 10°)) * forward speed`, capped at ±0.3 blocks/tick. It is 0 within 10° of level and whenever the vehicle is not moving forward, so a parked vehicle holds its altitude while the driver looks around
- `landing` sinks at 0.15 blocks/tick and returns to `ground` when the vehicle touches the ground. A flying vehicle with neither a driver nor test input starts landing at once
- Gravity is switched by two component groups. The event `mycar:hover` adds `mycar:hovering` (`has_gravity: false`) and removes `mycar:grounded`; `mycar:land` does the reverse. `mycar:grounded` only holds `minecraft:physics` again, because removing a group drops its components instead of restoring the base ones: with `mycar:hovering` simply removed, the in-game `flight_land` test showed a landed car floating up 20 blocks after a hop. On the tick the mode changes, the script writes the property and fires the event in the same call
- The script reads the property only when it rebuilds an aggregate after `/reload`. Comparing it every tick would roll back a change written on the previous tick, because `setProperty` lands a tick late
- Impulses are pre-divided by the engine's drag with gravity off (`SPEC.flightDrag` horizontally, `SPEC.flightVerticalDrag` vertically), the way 0003 pre-divides by ground friction. The `flight_cruise` in-game test reports the measured horizontal drag. Step climbing (0004) and the ground friction estimate (0003) are off while airborne. The per-axis wall check of 0003 stays on, measured against `SPEC.flightDrag`, so a vehicle pressed against a wall drops to its real speed: it stops ramming at full speed and stops climbing or sinking. Ram damage (0006) stays on

## Consequences

- The "box you can ride" of 0002 now leaves the ground, and the script owns the vertical velocity while flying
- Changing the entity definition needs a server restart (0015)
- A vehicle pressed against a cliff cannot climb its face by pitching up; the driver backs off first
- A quick double tap of the handbrake on the ground takes off. If players trigger it by accident, revisit the gesture
