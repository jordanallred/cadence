import { it, expect } from "vitest";
import { parseSession } from "../src/storage/portable";
import { newSession } from "../src/domain/types";
it("portable metadata preserves rider text as data", () => {
  const s = newSession();
  s.intake.name = "<script>alert(1)</script>";
  expect(parseSession(JSON.stringify(s)).intake.name).toBe(s.intake.name);
});
it("rejects an incompatible schema", () =>
  expect(() => parseSession('{"schemaVersion":9}')).toThrow());
it("rejects invalid values instead of creating an empty fit", () => {
  const s = newSession();
  (s.intake as unknown as { symptoms: unknown[] }).symptoms = [
    { area: "neck", side: "both", severity: 99, warning: false },
  ];
  expect(() => parseSession(JSON.stringify(s))).toThrow();
});
it("migrates an imperial profile to metric without changing its values", () => {
  const s = newSession() as unknown as {
    intake: Record<string, unknown>;
    baseline: Record<string, unknown> | null;
  };
  // Imperial 29.33 in was stored as 29.33 × 25.4 mm.
  s.intake = {
    ...s.intake,
    units: "imperial",
    saddleHeight: 29.33 * 25.4,
    saddleSetback: 2.5 * 25.4,
    crankLength: 172.5,
    saddleTilt: -1.5,
  };
  s.baseline = { ...s.intake };
  const out = parseSession(JSON.stringify(s));
  for (const i of [out.intake, out.baseline!]) {
    expect("units" in i).toBe(false);
    expect(i.saddleHeight).toBe(745);
    expect(i.saddleSetback).toBe(63.5);
    expect(i.crankLength).toBe(172.5);
    expect(i.saddleTilt).toBe(-1.5);
  }
});
it("migrates a metric profile by dropping the old units setting", () => {
  const s = newSession();
  const raw = {
    ...s,
    intake: { ...s.intake, units: "metric", saddleHeight: 731 },
  };
  const out = parseSession(JSON.stringify(raw));
  expect("units" in out.intake).toBe(false);
  expect(out.intake.saddleHeight).toBe(731);
});
