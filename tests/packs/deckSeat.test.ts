import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const BP = "packs/yasu_ride_bp";
const RP = "packs/yasu_ride_rp";
const entityFile = read(`${BP}/entities/yasu_ride/deck_seat.se.json`);
const entity = entityFile["minecraft:entity"];

describe("Boat deck seat (ADR 0063)", () => {
  it("is summonable but not spawnable and excluded from the vehicle family", () => {
    expect(entityFile.format_version).toBe("1.21.80");
    expect(entity.description).toEqual({
      identifier: "yasu_ride:deck_seat",
      is_spawnable: false,
      is_summonable: true,
    });
    expect(entity.components["minecraft:type_family"]).toEqual({
      family: ["yasu_ride_deck_seat", "inanimate"],
    });
  });

  it("offers one player seat at the boat's rider height", () => {
    expect(entity.components["minecraft:rideable"]).toEqual({
      seat_count: 1,
      family_types: ["player"],
      interact_text: "action.interact.ride.horse",
      crouching_skip_interact: true,
      seats: [{ position: [0, 0.52, 0] }],
    });
  });

  it("seats its rider at the same height as every sports boat seat", () => {
    const boatSeats: { position: number[] }[] = read(
      `${BP}/entities/yasu_ride/sportsboat.se.json`,
    )["minecraft:entity"].components["minecraft:rideable"].seats;
    const deckY = entity.components["minecraft:rideable"].seats[0].position[1];
    expect(boatSeats.length).toBeGreaterThan(0);
    for (const boatSeat of boatSeats) {
      expect(boatSeat.position[1]).toBe(deckY);
    }
  });

  it("can be aimed at above the deck without gravity, collision, or pushing", () => {
    expect(entity.components["minecraft:collision_box"]).toEqual({
      width: 0.8,
      height: 1.0,
    });
    expect(entity.components["minecraft:physics"]).toEqual({
      has_collision: false,
      has_gravity: false,
    });
    expect(entity.components["minecraft:pushable"]).toEqual({
      is_pushable: false,
      is_pushable_by_piston: false,
    });
    expect(entity.components["minecraft:knockback_resistance"]).toEqual({
      value: 1.0,
    });
  });

  it("takes no damage from any cause", () => {
    expect(entity.components["minecraft:health"]).toEqual({
      value: 20,
      max: 20,
    });
    expect(entity.components["minecraft:damage_sensor"]).toEqual({
      triggers: { cause: "all", deals_damage: "no" },
    });
  });

  it("references an existing texture and an invisible model with no cubes", () => {
    const clientFile = read(`${RP}/entity/yasu_ride/deck_seat.ce.json`);
    const client = clientFile["minecraft:client_entity"].description;
    expect(clientFile.format_version).toBe("1.10.0");
    expect(client.identifier).toBe(entity.description.identifier);
    expect(client.materials).toEqual({ default: "entity" });
    expect(client.textures).toEqual({
      default: "textures/entity/yasu_ride/sportsboat",
    });
    expect(existsSync(`${RP}/${client.textures.default}.png`)).toBe(true);
    expect(client.render_controllers).toEqual(["controller.render.default"]);
    expect(client.geometry).toEqual({
      default: "geometry.yasu_ride.deck_seat",
    });

    const file = read(`${RP}/models/entity/yasu_ride/deck_seat.geo.json`);
    expect(file.format_version).toBe("1.12.0");
    const geometries = file["minecraft:geometry"];
    expect(geometries).toHaveLength(1);
    const geometry = geometries[0];
    expect(geometry.description).toEqual({
      identifier: client.geometry.default,
      texture_width: 16,
      texture_height: 16,
      visible_bounds_width: 1,
      visible_bounds_height: 1,
    });
    expect(geometry.bones).toEqual([{ name: "root", pivot: [0, 0, 0] }]);
  });

  it.each(["en_US", "ja_JP"])("names the entity in %s", (locale) => {
    const names = readFileSync(`${RP}/texts/${locale}.lang`, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.startsWith("entity.yasu_ride:deck_seat.name="))
      .map((line) => line.slice(line.indexOf("=") + 1));
    expect(names).toHaveLength(1);
    expect(names[0]?.trim()).not.toBe("");
    if (locale === "en_US") expect(names[0]).toBe("Boat Seat");
  });
});
