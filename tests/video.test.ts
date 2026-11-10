import { it, expect } from "vitest";
import { sampleTimes } from "../src/video/sample";
it("samples monotonic timestamps within trimmed interval", () => {
  const t = sampleTimes(20, 2, 12);
  expect(t[0]).toBe(2);
  expect(t.at(-1)).toBeLessThan(12);
  expect(t.length).toBe(100);
  expect(t.every((x, n) => !n || x > t[n - 1])).toBe(true);
});
it("rejects ranges outside actual duration", () =>
  expect(() => sampleTimes(5, 0, 10)).toThrow());
it("rejects a clip too short for cycles", () =>
  expect(() => sampleTimes(4, 0, 4)).toThrow());
it("caps analysis duration to control memory", () =>
  expect(() => sampleTimes(500, 0, 500)).toThrow());
