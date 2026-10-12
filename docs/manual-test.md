# Manual test

Dev server: `pnpm build && pnpm server:up`. Connect to the Mac's LAN IP address on port 19132.
The server uses NetherNet (0015). Set `BDS_LAN_IP=<address>` if the script finds more than one LAN address. If joins fail, restart it with raknet: `pnpm server:down && BDS_TRANSPORT=raknet pnpm server:up`.
After a Resource Pack or entity definition change, restart with `pnpm server:restart` (not `docker restart`), so the packs are served under a new dev-only version and devices do not show a cached copy (0062).
To use commands, run `docker exec yasuflatland-ride-bds send-command op <player name>`.

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| 1 | At a crafting table, craft the vehicle item from 5 iron ingots, 1 iron block, and 2 coal blocks | An "SUV" item is created | | |
| 2 | Use the item on the ground / use it under a low ceiling | The vehicle appears and the item count drops by one (not in Creative) / no vehicle appears and the item count stays the same | | |
| 3 | Get in, drive, turn, and slide with the handbrake | The vehicle moves where you look and turns right away. The handbrake makes it slide | | |
| 4 | Smoothness of the driver's camera | 3 or higher on a 5-point scale | | |
| 5 | While driving, approach a 1-block and a 2-block step head-on and at an angle, then drive over flowers and carpets | The vehicle climbs both steps without stopping, and does not hop over the flowers or carpets (ADR 0035) | | |
| 6 | Hit a wall at full speed / fall 10 blocks while riding (Survival) | No hearts are lost | | |
| 7 | Hit a pig | The pig takes damage and is pushed aside | | |
| 8 | Get out | The door of the seat you sat in swings outward and a door-open sound plays | | |
| 9 | Exhaust while riding | Smoke comes out of the tip of the rear-right muffler | | |
| 10 | Ride with two players, then the driver gets out | Within a moment the passenger moves to the driver's seat and can drive (ADR 0019) | | |
| 11 | With an empty hand, hit an empty vehicle 3 times / hit an occupied vehicle | It breaks and drops the item / it does not break | | |
| 12 | The moving vehicle as seen by a passenger | 3 or higher on a 5-point scale | | |
| 13 | Appearance (SUV shape, khaki, interior and exterior) | As intended | | |
| 14 | Stop, then hold the stick straight right (mobile) / hold only D (PC) | The vehicle moves slowly forward and turns right; it does not back up | | |
| 15 | Tap (mobile) / left-click (PC) a placed vehicle with green dye, then light blue dye, then brown dye / do it with brown dye again | The body turns green, then light blue, then khaki, one dye is used each time (not in Creative), and the vehicle does not break / nothing changes and the dye stays | | |
| 16 | Craft the headlight switch from a lever and glowstone dust. At night, drive with it in hand and use it (right-click / tap), then use it again | The lamps glow and the road ahead lights up and follows the vehicle; the second use turns both off and leaves no light behind | | |
| 17 | Use the switch from a passenger seat / outside the vehicle | Nothing changes | | |
| 18 | While driving, double-tap Jump | The wheels fold flat, hang out from the body on gunmetal arms, and glow blue underneath, and the vehicle rises about 1.5 blocks (ADR 0043) | | |
| 19 | Fly forward, then hold Jump, then pull the stick back (S on PC) | The vehicle holds its altitude, then climbs, then sinks without backing up (ADR 0032) | | |
| 20 | Fly forward and stop in the air, looking up and down each time | Only the view moves; the vehicle holds its altitude (ADR 0032) | | |
| 21 | Hold Jump to climb about 10 blocks, then double-tap Jump (Survival) | The vehicle sinks slowly, the wheels unfold a few blocks above the ground and are down at touchdown, and no hearts are lost (ADR 0033) | | |
| 22 | Get out while flying | The empty vehicle sinks slowly to the ground and the wheels unfold | | |
| 23 | Tap the handbrake repeatedly while driving on the ground | Note how often the vehicle takes off by accident | | |
| 24 | With an account that has never joined the world (or after `pnpm server:down` and deleting `server/data/worlds/yasuflatland-ride-dev`), join in Survival / leave and join again / die and respawn | One "SUV" item is in the inventory / no second item is given / no second item is given | | |
| 25 | In hover form, turn hard left and right without touching Jump or pulling the stick back | The body banks into the turn and the vehicle sinks slowly while banked (ADR 0026, 0032) | | |
| 26 | In hover form in third person, pull the stick back until the vehicle touches the ground | On touchdown the wheels unfold, the camera returns to first person, and the vehicle drives on the ground again (ADR 0034) | | |
| 27 | Standing outside, tap (mobile) / left-click (PC) a khaki vehicle with red dye, then do it 3 more times | The body turns red and one dye is used (not in Creative); the extra hits change nothing, use no dye, and do not break the vehicle (ADR 0036) | | |
| 28 | Holding a dye, press the ride button (mobile) / right-click (PC) on a vehicle | You get in, the color does not change, and no dye is used (ADR 0036) | | |
| 29 | Place 10 vehicles, then place an eleventh / ride the oldest one while another player places a new one | The first vehicle placed disappears without dropping an item / you are dismounted and the vehicle you rode disappears (ADR 0038) | | |
| 30 | Drive into deep water, then drive forward underwater | All windows turn sealed blue, and the rear wheels turn backward into ring guards around spinning bronze four-blade propellers with swept blades, each held from the front by a gunmetal arm (ADR 0042, 0043) | | |
| 31 | Board with riders in every seat using different camera views, dive into deep water, then drive onto the shore | Every rider switches to third person on diving and returns to their own previous view on the shore | | |
| 32 | In Survival, stay submerged with riders in every seat for at least 30 seconds, then have a rider get off underwater | No rider loses air while aboard; the rider who gets off starts losing air within about 3 seconds | | |
| 33 | While submerged, hold Jump until the entire body clears the surface | The submarine rises and becomes the hover car once fully out of the water, without becoming a car along the way | | |
| 34 | Drive the submarine onto a beach with one-block steps, then park at the waterline for 2 seconds | It climbs out, becomes a car, and stays in the same form while parked | | |
| 35 | Get out of a submarine in deep water and watch it for at least 10 seconds | The empty submarine rises to its float line and stays at the surface without becoming the hover car | | |
| 36 | Drive into water deep enough for the submarine form, then get out while it floats | Under water a sonar ping, with a fainter echo about 1.6 seconds later, repeats every 4 seconds over a low rumble. After you get out no new ping starts, though the current one may finish (ADR 0041) | | |
| 37 | While submerged, turn hard left and right | The body banks into the turn as in flight and keeps its depth (ADR 0044) | | |

## Sports boat

Setup: craft the "Sports Boat" item from 5 iron ingots and an oak boat, or use `/give @s yasu_ride:sportsboat_item`. Use a pool or lake at least 3 blocks deep.

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| B1 | Use the boat item on water by tapping the bed, the water surface, and the side of a shore block that has water next to it | One boat appears at the water surface for each tap, never on the shore, and one item is used (not in Creative) | | |
| B2 | Use the boat item on the top of a dry block, then on the side of a dry block with no water next to it, then aimed at dry ground beyond reach | The first tap places the boat on the clicked block and it cannot drive on land; the other two place nothing and use no item | | |
| B3 | Seat four riders and look forward from the driver's seat | All four riders fit and the driver's eye level sees over the windshield | | |
| B4 | Drive forward, reverse, turn, and drive into a shore level with the water | The boat responds on water and stops at the shore without leaving the water | | |
| B5 | Tap (mobile) / left-click (PC) the boat with a dye, then brown dye | The hull turns the dye's color, then back to black; each repaint uses one dye (not in Creative) | | |
| B6 | At night, drive with the headlight switch in hand and use it | Two beams light the water about 60 blocks ahead and follow the boat | | |
| B7 | Place an empty boat and hit its bow 3 times; repeat with another boat's middle, then another boat's stern | Each boat breaks and drops one boat item | | |
| B8 | Ram a mob at full throttle (Survival) | The mob takes damage and the boat and riders take none | | |
| B9 | Stop a boat and get off onto the deck | After a second with no driver, the boat stays still and you can walk at the deck's height | | |
| B10 | Walk around the deck and jump into the water | You can walk across the deck and fall into the water at the edge | | |
| B11 | Get back in from the water and drive off | The boat leaves and the invisible floor disappears | | |

## Upgrading from MyCar 0.5.0 and earlier

Setup: in a world that used MyCar 0.5.0, place two vehicles and switch the headlights of one of them off, then stop the server and replace the old pack folders with the new ones as described under "Upgrading from MyCar 0.5.0 and earlier" in the [README](../README.md).

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| U1 | Start the server with the new packs and open the world | The world loads without content log errors and the old vehicles and items are gone | | |
| U2 | Join with a player who had received the starter vehicle before | One "SUV" item is given again | | |
| U3 | Look where the vehicle with its headlights off stood | No light blocks are left there | | |
