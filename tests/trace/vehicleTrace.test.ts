import "./portableTrig";
import { expect, it } from "vitest";
import { recordDomain, traceText } from "./record";
import { domainScenarios } from "./scenarios";

for (const scenario of domainScenarios) {
  it(`records ${scenario.name}`, async () => {
    const lines = recordDomain(scenario);
    const writes = lines.flatMap((line) => line.writes);
    if (scenario.name === "suv_ground") expect(lines).toHaveLength(200);
    if (scenario.name.endsWith("random")) expect(lines).toHaveLength(300);
    if (scenario.name === "suv_flight") {
      expect(writes).toContain("property form takeoff");
      expect(writes).toContain("property form hover");
      expect(writes).toContain("property form landing");
      expect(writes).toContain("property form car");
      expect(
        lines.some((line) =>
          line.writes.some(
            (w) => w.startsWith("property bank ") && w !== "property bank 0",
          ),
        ),
      ).toBe(true);
      expect(lines.at(-1)?.location.y).toBe(0);
    }
    if (scenario.name === "suv_submarine") {
      expect(writes).toContain("property form submarine");
      expect(
        lines.some((line) => line.riders.underwater && line.velocity.y < 0),
      ).toBe(true);
      expect(
        lines.some((line) => line.riders.underwater && line.velocity.y > 0),
      ).toBe(true);
      // With a driver, a submarine surfaces to its float line, 1.2 blocks
      // below the surface with the roof above it, and stays in submarine form
      // until it reaches dry ground (ADR 0040).
      expect(lines[55]?.location.y).toBeLessThan(-2);
      expect(lines[80]?.location.y).toBeCloseTo(-1.2, 3);
      expect(lines[80]?.riders.underwater).toBe(true);
      expect(lines.at(-1)?.riders.underwater).toBe(false);
      expect(lines.at(-1)?.location.z).toBeGreaterThan(45);
      expect(writes).toContain("property form car");
      expect(lines.at(-1)?.location.y).toBe(0);
    }
    if (scenario.name === "suv_mount_door") {
      expect(lines[5]?.yaw).toBe(90);
      expect(lines[45]?.seatWrites).toEqual([
        "animation door_fr",
        "sound random.door_open",
        "animation door_fl",
        "sound random.door_open",
      ]);
      expect(Math.abs(lines[49]?.speed ?? 0)).toBeGreaterThan(0.01);
      expect(lines[49]?.yaw).toBe(90);
      expect(lines[50]?.driverId).toBe("rider_0");
      expect(Math.abs(lines[50]?.speed ?? 0)).toBeGreaterThan(0.01);
      expect(lines[50]?.yaw).toBe(lines[49]?.yaw);
      expect(lines[50]?.yaw).not.toBe(0);
    }
    if (scenario.name === "suv_ram") {
      const hitIds = lines.flatMap((line) => line.hits).map((hit) => hit.id);
      expect(hitIds).toContain("near");
      expect(hitIds).not.toContain("occupant");
    }
    if (scenario.name === "suv_wall") {
      expect(lines.at(-1)?.location.z).toBeGreaterThan(11);
      expect(lines.at(-1)?.location.z).toBeLessThan(12);
      expect(lines.at(-1)?.velocity.z).toBe(0);
    }
    if (scenario.name === "suv_steps") {
      expect(
        lines.some((line) => line.location.z >= 8 && line.location.y >= 1),
      ).toBe(true);
      expect(
        lines.some((line) => line.location.z >= 24 && line.location.y >= 3),
      ).toBe(true);
    }
    if (scenario.name === "boat_afloat") {
      expect(lines.some((line) => line.speed < 0)).toBe(true);
      expect(lines.some((line) => line.yaw !== 0)).toBe(true);
      expect(
        lines.every((line) => line.location.y === 0 && line.impulse.y === 0),
      ).toBe(true);
    }
    if (scenario.name === "boat_beach") {
      expect(lines.at(-1)?.location.z).toBeGreaterThan(15);
      expect(lines.at(-1)?.location.y).toBe(0);
      expect(lines.at(-1)?.speed).toBe(0);
    }
    if (scenario.name === "suv_rebuild_in_flight") {
      expect(writes).toContain("property form takeoff");
      expect(
        lines
          .slice(0, 41)
          .flatMap((line) => line.writes)
          .filter((write) => write.startsWith("property form "))
          .at(-1),
      ).toBe("property form hover");
      expect(lines[40]?.riders.thirdPerson).toBe(true);
      expect(lines[40]?.writes).not.toContain("property form car");
      expect(lines[40]?.location.y).toBeGreaterThan(1);
      expect(lines[40]?.driverId).toBe("rider_0");
      // The seated driver's position reads as the passenger seat for one tick;
      // the driver stays the driver and the vehicle keeps hovering (ADR 0025).
      expect(lines[60]?.driverId).toBe("rider_0");
      expect(lines[60]?.writes).toEqual([]);
      expect(lines[61]?.driverId).toBe("rider_0");
      // Rebuilt while hovering at yaw -90 with the driver looking at yaw 0: a
      // rebuild that forgot the driver would snap the heading to the driver's.
      expect(lines[84]?.yaw).toBe(-90);
      expect(lines[85]?.yaw).toBe(-90);
      expect(lines[85]?.driverId).toBe("rider_0");
      expect(lines[85]?.writes).not.toContain("property form landing");
    }
    if (scenario.name === "boat_rebuild") {
      expect(lines[40]?.speed).toBeGreaterThan(0);
      expect(lines[40]?.speed).toBeLessThan(lines[39]?.speed ?? 0);
      expect(lines[40]?.location.y).toBe(0);
      expect(lines[40]?.driverId).toBe("rider_0");
      expect(lines[70]?.seatWrites).toEqual([]);
      // Rebuilt mid-turn, away from the driver's yaw 0, so the heading carries
      // over instead of snapping to the driver's view.
      expect(lines[74]?.yaw).toBeGreaterThan(20);
      expect(lines[75]?.yaw).toBeGreaterThanOrEqual(lines[74]?.yaw ?? 0);
      expect(lines[75]?.driverId).toBe("rider_0");
      expect(lines.every((line) => line.seatWrites.length === 0)).toBe(true);
    }
    await expect(traceText(lines)).toMatchFileSnapshot(
      `traces/${scenario.name}.jsonl`,
    );
  });
}
