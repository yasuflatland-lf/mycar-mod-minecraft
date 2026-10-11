# 0014. Offer NetherNet on the dev server as an opt-in transport

- Status: Superseded by 0015
- Date: 2026-10-11

## Context

The dev server runs with `TRANSPORT: raknet` (0011). Since BDS 1.26.50, `transport=nethernet` is the default, and BDS 1.26.52.3 prints "NetherNet is the only supported transport type" at startup when raknet is set. That banner overstates it: the `bedrock_server_how_to.html` shipped with 1.26.52.3 still lists raknet as a supported value, and the server answered a RakNet unconnected ping on UDP 19132 (`MCPE;Dedicated Server;2193;1.26.52;...`). The Minecraft Wiki reports raknet as deprecated in the 26.60.22 Preview. The dev server follows `VERSION: LATEST`, and clients update themselves, so once a release drops raknet, phones and PCs can no longer join and pinning an older BDS does not help.

NetherNet listens for an HTTP signaling handshake on TCP `server-port`, then gives each client a UDP port. The random port that 0011 ran into is the UDP port, and `server-udp-ports` can fix it to a range. Behind Docker's bridge network, clients must also be told the Mac's LAN address, and BDS accepts only an IP literal there; a hostname makes clients fail with error "Door" (itzg/docker-minecraft-bedrock-server#673). An open report describes the NetherNet TLS handshake failing with `InitialConnection-13` on BDS 1.26.51 and 1.26.52, under arm64/Box64 and on some x86_64 hosts (itzg/docker-minecraft-bedrock-server#680).

## Decision

- Keep raknet as the default dev transport (0011 still applies)
- `pnpm server:up` reads `BDS_TRANSPORT` (`raknet` or `nethernet`, default `raknet`)
- With `nethernet`, it sets `server-udp-ports` to `<LAN IP>:19140-19155:19140-19155`. The LAN IP comes from `BDS_LAN_IP`, or from the Mac's only non-internal IPv4 address; with zero or several addresses it stops and asks for `BDS_LAN_IP`
- `server/compose.yaml` always publishes UDP 19132 (raknet), TCP 19132 (NetherNet signaling), and UDP 19140-19155 (NetherNet gameplay)

## Consequences

- Switching transports needs only an environment variable and a server restart, so NetherNet can be tried on real devices before raknet goes away
- The UDP range allows 16 simultaneous clients, which is enough for the home LAN
- When the Mac's LAN IP changes, the server must be restarted with NetherNet so that clients are told the new address
- LAN discovery (UDP 7551 broadcast) does not cross the bridge network, so players add the server by IP address, as with raknet
- On Apple Silicon the image runs BDS under Box64, the setup #680 reports. If NetherNet joins fail with `InitialConnection-13`, try the x86_64 image under Rosetta with `DOCKER_DEFAULT_PLATFORM=linux/amd64`
- Revisit when a phone and a PC have joined over NetherNet, or when a stable BDS release rejects raknet. Then make NetherNet the default in a new ADR that supersedes 0011
