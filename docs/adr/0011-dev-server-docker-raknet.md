# 0011. Run the development server as BDS in Docker with raknet

- Status: Superseded by 0015
- Date: 2026-10-10

## Context

During development we run BDS with the add-on installed locally and connect from a PC and a phone on the LAN to check it. BDS runs as the Linux build in Docker (`itzg/minecraft-bedrock-server`).

With BDS's default `transport=nethernet`, the listening port was chosen at random on every start, so Docker's port forwarding (19132/udp) did not reach it. It did not respond to connections from the Mac itself either.

## Decision

- Run the development server as BDS in Docker, with `TRANSPORT: raknet` so that it listens on port 19132
- Mount the repository's Behavior Pack and Resource Pack directories into the container. Apply script-only changes with `/reload`; restart the server for changes to entity definitions or the Resource Pack
- When the Resource Pack changes, bump its manifest version. Otherwise devices keep using the old pack they cached
- Keep world data (`server/data/`) out of git

## Consequences

- PCs and phones can connect using the Mac's LAN IP address and port 19132
- In an environment where Docker's network address pools were exhausted, `network_mode: bridge` had to be set
