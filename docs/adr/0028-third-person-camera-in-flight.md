# 0028. Switch riders to the third-person camera in flight

- Status: Superseded in part by 0052
- Date: 2026-10-11

## Context

From the driver's seat in first person, the flying SUV (0021) is out of sight: the folded wheels and glow (0022) and the bank into turns (0026) cannot be seen, and the ground below is hard to judge. Players can press F5 on PC, but on mobile the perspective is buried in the video settings.

The stable Script API has `Player.camera`. `setCamera("minecraft:third_person")` sets the vanilla preset that views the player from behind, the same view as F5, and `clear()` returns the player to their own perspective. There is no getter for the current camera, so the script cannot read what a player chose for themselves.

## Decision

- Every tick, `DriveVehicles` collects the player riders of each vehicle whose flight mode is not `ground` (takeoff, flying, and landing). A collected player who is not switched yet gets `setCamera("minecraft:third_person")`; a switched player who is no longer collected (the vehicle landed, they got off, or they left) gets `clear()`
- The use case remembers the players it switched, so each switch is one call, and it only clears players it switched itself. A failed `setCamera` is retried on the next tick; a failed `clear()` is not, so a missing player cannot throw every tick
- A failure is logged and does not stop the other vehicles

## Consequences

- Landing clears the camera back to the player's own perspective. A custom camera that another add-on set during the flight is cleared too
- The switched set lives in memory. After `/reload` a player in flight is switched again, which is harmless, but a player who landed between the reload and the next tick stays in third person until they press F5 or take off and land again
- The camera cannot be observed from a script, so there is no in-game test for it; check it by hand on PC and mobile
