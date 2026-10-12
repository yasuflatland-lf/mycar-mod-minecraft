import { expect, it } from "vitest";
import {
  dockCommands,
  undockCommands,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/entity";

it("triggers dock before recording the docked state", () => {
  expect(dockCommands()).toStrictEqual([
    { type: "triggerEvent", name: "dock" },
    { type: "setProperty", name: "docked", value: true },
  ]);
});

it("triggers undock before clearing the docked state", () => {
  expect(undockCommands()).toStrictEqual([
    { type: "triggerEvent", name: "undock" },
    { type: "setProperty", name: "docked", value: false },
  ]);
});
