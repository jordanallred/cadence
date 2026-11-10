import { it, expect } from "vitest";
import { appendEvent, activeExperiment } from "../src/fit/history";
import { newSession, type FitEvent } from "../src/domain/types";
const event: FitEvent = {
  id: "one",
  at: "now",
  kind: "adjustment",
  detail: "Lower saddle",
  setting: "saddleHeight",
  before: 750,
  after: 747,
};
it("preserves baseline while applying a known setting", () => {
  const s = newSession();
  s.intake.saddleHeight = 750;
  const n = appendEvent(s, event);
  expect(n.baseline?.saddleHeight).toBe(750);
  expect(n.intake.saddleHeight).toBe(747);
  expect(s.events).toEqual([]);
  expect(n.setupRevision).toBe(1);
});
it("only one experiment may be active", () => {
  const s = appendEvent(newSession(), { ...event, before: null });
  expect(() => appendEvent(s, { ...event, id: "two" })).toThrow();
});
it("undo restores known settings and retains audit history", () => {
  const s = newSession();
  s.intake.saddleHeight = 750;
  const n = appendEvent(appendEvent(s, event), {
    id: "undo",
    at: "now",
    kind: "revert",
    detail: "",
    experimentId: "one",
  });
  expect(n.intake.saddleHeight).toBe(750);
  expect(n.events.length).toBe(2);
  expect(activeExperiment(n)).toBeUndefined();
});
it("unknown prior settings require manual restoration acknowledgment", () => {
  const s = appendEvent(newSession(), { ...event, before: null });
  expect(() =>
    appendEvent(s, {
      id: "undo",
      at: "now",
      kind: "revert",
      detail: "",
      experimentId: "one",
    }),
  ).toThrow();
});
