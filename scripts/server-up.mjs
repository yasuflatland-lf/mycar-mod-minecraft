// Start the dev BDS (ADR 0015). NetherNet needs the LAN address the phone and
// PC reach the Mac on (BDS_LAN_IP, detected when unset); BDS_TRANSPORT=raknet
// falls back to the old transport while BDS still ships it.
import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";

const UDP_RANGE = "19140-19155";

const transport = process.env.BDS_TRANSPORT ?? "nethernet";
if (transport !== "raknet" && transport !== "nethernet") {
  console.error(`BDS_TRANSPORT must be raknet or nethernet, not ${transport}`);
  process.exit(1);
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

let udpPorts = "";
if (transport === "nethernet") {
  // BDS only accepts an IP literal here; a hostname makes clients fail to join
  // with error "Door" (itzg/docker-minecraft-bedrock-server#673).
  let lanIp = process.env.BDS_LAN_IP;
  if (!lanIp) {
    const found = lanAddresses();
    if (found.length !== 1) {
      console.error(
        `found ${found.length} LAN addresses (${found.join(", ")}); set BDS_LAN_IP`,
      );
      process.exit(1);
    }
    lanIp = found[0];
  }
  udpPorts = `${lanIp}:${UDP_RANGE}:${UDP_RANGE}`;
  console.log(`NetherNet: advertising ${udpPorts}`);
}

execFileSync("node", ["scripts/setup-dev-world.mjs"], { stdio: "inherit" });
execFileSync("docker", ["compose", "-f", "server/compose.yaml", "up", "-d"], {
  stdio: "inherit",
  env: { ...process.env, BDS_TRANSPORT: transport, BDS_UDP_PORTS: udpPorts },
});
