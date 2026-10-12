import "./portableTrig";
import { expect, it } from "vitest";
import { recordApp, traceText } from "./record";
import { appScenarios } from "./scenarios";

for (const scenario of appScenarios) {
  it(`records ${scenario.name}`, async () => {
    const lines = recordApp(scenario);
    const calls = lines.flatMap((line) => line.calls);
    if (scenario.name === "app_suv") {
      expect(lines[2]?.calls).toEqual([]);
      expect(calls).toContain("app_suv property form hover");
      expect(calls).toContain("app_suv property form submarine");
      const afterDismount = lines
        .filter((line) => line.tick >= 240)
        .flatMap((line) => line.calls);
      expect(afterDismount).toContain("app_suv event gravity_on");
      expect(afterDismount).toContain("app_suv property form car");
      const gravityOn = afterDismount.indexOf("app_suv event gravity_on");
      expect(afterDismount[gravityOn + 1]).toBe("app_suv property form car");
      expect(calls).toContain("app_suv camera rider_0 third");
      expect(calls).toContain("app_suv camera rider_0 own");
      expect(calls).toContain("app_suv breathing rider_0 60");
      expect(calls).toContain("app_suv animation door_fr");
      // The aggregate is dropped after a turn, so a rebuild that lost the
      // driver would snap the heading back to the driver's yaw 0.
      const heading = (line: (typeof lines)[number] | undefined) =>
        line?.calls
          .find((call) => call.startsWith("app_suv motion "))
          ?.split(" ")[2];
      expect(heading(lines[59])).not.toBe("0");
      expect(heading(lines[60])).toBe(heading(lines[59]));
      expect(lines[60]?.calls).toContain("app_suv property bank 0");
      expect(lines[60]?.calls).toContain("app_suv property gear_down false");
      const diving = lines.findIndex((line) =>
        line.calls.includes("app_suv property form submarine"),
      );
      expect(
        lines
          .slice(diving + 1)
          .some((line) => line.calls.includes("app_suv property form hover")),
      ).toBe(true);
      expect(
        lines[60]?.calls.some((call) => call.includes("property form")),
      ).toBe(false);
    } else {
      expect(
        calls.some(
          (call) =>
            call.startsWith("app_boat motion 0 0,0,") &&
            !call.endsWith("0,0,0"),
        ),
      ).toBe(true);
      expect(calls).toContain("app_boat lights 30");
      expect(calls).toContain("app_boat damage buoy rider_0");
      expect(
        calls.some(
          (call) => call.includes("animation ") || call.includes("camera "),
        ),
      ).toBe(false);
    }
    await expect(traceText(lines)).toMatchFileSnapshot(
      `traces/${scenario.name}.jsonl`,
    );
  });
}
