import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TestInputStore } from "../../src/infrastructure/testInput/testInputStore";

const input = fc.record({
  moveX: fc.double({ min: -1, max: 1, noNaN: true }),
  moveY: fc.double({ min: -1, max: 1, noNaN: true }),
  jump: fc.boolean(),
});

describe("TestInputStore", () => {
  it("未登録の車の入力は undefined", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        expect(new TestInputStore().get(id)).toBeUndefined();
      }),
    );
  });

  it("登録した入力を取得でき、同じ id の入力を更新できる", () => {
    fc.assert(
      fc.property(fc.string(), input, input, (id, first, next) => {
        const store = new TestInputStore();
        store.set(id, first);
        expect(store.get(id)).toEqual(first);
        store.set(id, next);
        expect(store.get(id)).toEqual(next);
      }),
    );
  });

  it("clear は指定した車の入力だけを削除する", () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string()).filter(([a, b]) => a !== b),
        input,
        (ids, raw) => {
          const [removed, kept] = ids;
          const store = new TestInputStore();
          store.set(removed, raw);
          store.set(kept, raw);
          store.clear(removed);
          expect(store.get(removed)).toBeUndefined();
          expect(store.get(kept)).toEqual(raw);
          store.clear(removed);
          expect(store.get(removed)).toBeUndefined();
        },
      ),
    );
  });

  it("retain は指定集合にある車の入力だけを残す", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.string(), { minLength: 2 }),
        input,
        fc.nat(),
        (ids, raw, count) => {
          const store = new TestInputStore();
          for (const id of ids) store.set(id, raw);
          const retained = new Set(ids.slice(0, count % (ids.length + 1)));
          store.retain(retained);
          for (const id of ids) {
            expect(store.get(id)).toEqual(retained.has(id) ? raw : undefined);
          }
          store.retain(new Set());
          for (const id of ids) expect(store.get(id)).toBeUndefined();
        },
      ),
    );
  });
});
