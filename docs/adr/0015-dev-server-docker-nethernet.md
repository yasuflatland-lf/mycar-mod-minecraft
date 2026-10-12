# 0015. Run the development server as BDS in Docker with NetherNet

- Status: Extended by 0062
- Date: 2026-10-11
- Supersedes: 0011, 0014

## Context

0011 ran the dev server with `transport=raknet` because NetherNet's UDP port was random and Docker could not forward it. 0014 added NetherNet as an opt-in: `server-udp-ports` pins the UDP ports to a published range and advertises the Mac's LAN IP, and TCP 19132 carries the signaling handshake.

Since then:

- NetherNet is the BDS default from 1.26.50, and the Minecraft Wiki reports raknet as deprecated in the 26.60.22 Preview. The dev server follows `VERSION: LATEST` and clients update themselves, so a release without raknet would lock every device out, and pinning an older BDS would not help
- On 2026-10-11, a client on the LAN joined BDS 1.26.52.3 over NetherNet through `pnpm server:up` with `BDS_TRANSPORT=nethernet`. The server ran on Apple Silicon under the arm64 image's Box64, the setup where itzg/docker-minecraft-bedrock-server#680 reports `InitialConnection-13`; it did not occur. `GET /v1/join` on the LAN IP answered 200 through Docker's port forwarding

## Decision

- Run the development server as BDS in Docker (`itzg/minecraft-bedrock-server`) with `transport=nethernet` by default
- `pnpm server:up` sets `server-udp-ports` to `<LAN IP>:19140-19155:19140-19155`. The LAN IP comes from `BDS_LAN_IP`, or from the Mac's only non-internal IPv4 address; with zero or several addresses it stops and asks for `BDS_LAN_IP`. BDS accepts only an IP literal there; a hostname makes clients fail with error "Door" (itzg/docker-minecraft-bedrock-server#673)
- `server/compose.yaml` publishes TCP 19132 (signaling) and UDP 19140-19155 (one port per client), plus UDP 19132 for raknet
- Keep raknet as a fallback while BDS still ships it: `BDS_TRANSPORT=raknet pnpm server:up`
- Carried over from 0011: mount the repository's Behavior Pack and Resource Pack directories into the container; apply script-only changes with `/reload` and restart the server for entity definition or Resource Pack changes; bump the Resource Pack manifest version when it changes, or devices keep their cached copy; keep world data (`server/data/`) out of git; use `network_mode: bridge`

## Consequences

- PCs and phones connect to the Mac's LAN IP on port 19132 with "Add Server", as before. LAN discovery (UDP 7551 broadcast) does not cross the bridge network
- When the Mac's LAN IP changes, restart the server so that clients are told the new address
- The UDP range allows 16 simultaneous clients, which is enough for the home LAN
- If joins fail with `InitialConnection-13` (#680), try the x86_64 image under Rosetta with `DOCKER_DEFAULT_PLATFORM=linux/amd64`, or fall back to raknet
- The in-game tests (0010) send commands through the server's stdin and do not connect a client, so they do not depend on the transport
- Drop the raknet fallback and its UDP 19132 mapping once a stable BDS release removes raknet
