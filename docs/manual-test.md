# Manual test

Dev server: `pnpm build && pnpm server:up`. Connect to the Mac's LAN IP address on port 19132.
The server uses NetherNet (0015). Set `BDS_LAN_IP=<address>` if the script finds more than one LAN address. If joins fail, restart it with raknet: `pnpm server:down && BDS_TRANSPORT=raknet pnpm server:up`.
To use commands, run `docker exec mycar-bds send-command op <player name>`.

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| 1 | At a crafting table, craft the vehicle item from 5 iron ingots, 1 iron block, and 2 coal blocks | An "SUV" item is created | | |
| 2 | Use the item on the ground / use it under a low ceiling | The vehicle appears and the item count drops by one (not in Creative) / no vehicle appears and the item count stays the same | | |
| 3 | Get in, drive, turn, and slide with the handbrake | The vehicle moves where you look and turns right away. The handbrake makes it slide | | |
| 4 | Smoothness of the driver's camera | 3 or higher on a 5-point scale | | |
| 5 | Approach a 2-block step head-on and at an angle | The vehicle climbs it without stopping | | |
| 6 | Hit a wall at full speed / fall 10 blocks while riding (Survival) | No hearts are lost | | |
| 7 | Hit a pig | The pig takes damage and is pushed aside | | |
| 8 | Get out | The door of the seat you sat in swings outward and a door-open sound plays | | |
| 9 | Exhaust while riding | Smoke comes out of the tip of the rear-right muffler | | |
| 10 | Ride with two players, then the driver gets out | Within a moment the passenger moves to the driver's seat and can drive (ADR 0019) | | |
| 11 | Hit an empty vehicle 3 times / hit an occupied vehicle | It breaks and drops the item / it does not break | | |
| 12 | The moving vehicle as seen by a passenger | 3 or higher on a 5-point scale | | |
| 13 | Appearance (SUV shape, khaki, interior and exterior) | As intended | | |
| 14 | Stop, then hold the stick straight right (mobile) / hold only D (PC) | The vehicle moves slowly forward and turns right; it does not back up | | |
| 15 | Use green dye, then red dye, on a placed vehicle / use red dye again | The body turns green, then red, one dye is used each time (not in Creative), and nobody gets in / nothing changes and the dye stays | | |
| 16 | Craft the headlight switch from a lever and glowstone dust. At night, drive with it in hand and use it (right-click / tap), then use it again | The lamps glow and the road ahead lights up and follows the vehicle; the second use turns both off and leaves no light behind | | |
| 17 | Use the switch from a passenger seat / outside the vehicle | Nothing changes | | |
| 18 | While driving, double-tap Jump | The wheels fold flat and glow blue underneath, and the vehicle rises about 1.5 blocks | | |
| 19 | Fly forward looking level, then up, then down | The vehicle holds its altitude, then climbs, then sinks | | |
| 20 | Stop in the air and look around | The vehicle holds its altitude | | |
| 21 | Double-tap Jump in the air (Survival) | The vehicle sinks slowly, the wheels unfold after touchdown, and no hearts are lost | | |
| 22 | Get out while flying | The empty vehicle sinks slowly to the ground and the wheels unfold | | |
| 23 | Tap the handbrake repeatedly while driving on the ground | Note how often the vehicle takes off by accident | | |
| 24 | With an account that has never joined the world (or after `pnpm server:down` and deleting `server/data/worlds/mycar-dev`), join in Survival / leave and join again / die and respawn | One "SUV" item is in the inventory / no second item is given / no second item is given | | |
