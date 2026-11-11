import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { intakeSchema, newSession, sessionSchema } from "../src/domain/types";
import { measurements } from "../src/fit/measurements";
import { saveSession, loadSessions } from "../src/storage/db";
import { parseSession } from "../src/storage/portable";
import { rangeProblem } from "../src/features/intake/SetupMeasurements";

it("a half-typed or centimetre bar reach does not stop a fit from saving", async () => {
  const s = newSession();
  s.intake = { ...s.intake, barReach: 50, riderHeight: 178 };
  s.baseline = structuredClone(s.intake);
  await expect(saveSession(s)).resolves.toBeUndefined();
  const saved = (await loadSessions()).find((x) => x.id === s.id)!;
  expect(saved.intake.barReach).toBeNull();
  expect(saved.baseline?.barReach).toBeNull();
  expect(saved.intake.riderHeight).toBe(178);
});

it("a backup with an out-of-range field still imports", () => {
  const s = newSession();
  const raw = JSON.parse(JSON.stringify(s));
  raw.intake.barReach = 48;
  raw.intake.stemLength = 100;
  const back = parseSession(JSON.stringify(raw));
  expect(back.intake.barReach).toBeNull();
  expect(back.intake.stemLength).toBe(100);
});

it("schema limits match the measuring guide", () => {
  for (const m of measurements) {
    const ok = (n: number) =>
      intakeSchema.parse({ ...newSession().intake, [m.key]: n })[m.key];
    expect(ok(m.min), m.key).toBe(m.min);
    expect(ok(m.max), m.key).toBe(m.max);
    expect(ok(m.min - 0.5), m.key).toBeNull();
    expect(ok(m.max + 0.5), m.key).toBeNull();
  }
  expect(sessionSchema.safeParse(newSession()).success).toBe(true);
});

it("explains an out-of-range entry and spots centimetres", () => {
  const reach = measurements.find((m) => m.key === "barReach")!;
  expect(rangeProblem(reach, 520)).toBe("");
  expect(rangeProblem(reach, 52)).toBe(
    "Enter 300 to 900 mm. If you measured 52 cm, that is 520 mm.",
  );
  expect(rangeProblem(reach, 5)).toBe("Enter 300 to 900 mm.");
  const height = measurements.find((m) => m.key === "riderHeight")!;
  expect(rangeProblem(height, 17)).toBe("Enter 100 to 230 cm.");
});
