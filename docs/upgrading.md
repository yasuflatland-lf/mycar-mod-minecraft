# Upgrading from MyCar 0.5.0 and earlier

Switch the headlights off before upgrading. Old vehicles and items disappear because their IDs are not migrated. Light blocks from a vehicle whose headlights are on remain in the world: the record of lit cells lives on the vanished entity.

The fleet record starts empty, and every player receives the starter vehicle again on their next join. Get additional vehicles with `/give @s yasu_ride:suv_item` or the recipe. Pack UUIDs stay the same, so worlds that already list the packs load the new versions.

On a dedicated server, delete the old MyCar pack folders from `behavior_packs` and `resource_packs` (the ones ending in `_bp` and `_rp` that predate `yasu_ride_bp` and `yasu_ride_rp`) before you copy in the new ones. The old and new folders share UUIDs, so keeping both leaves the server with two packs under one UUID.
