import { eventSchema, type Session, type FitEvent } from "../domain/types";
export function activeExperiment(s: Session): FitEvent | undefined {
  return [...s.events]
    .reverse()
    .find(
      (e) =>
        e.kind === "adjustment" &&
        !s.events.some(
          (x) =>
            (x.kind === "revert" || x.kind === "retain") &&
            x.experimentId === e.id,
        ),
    );
}
export function appendEvent(s: Session, event: FitEvent): Session {
  const e = eventSchema.parse(event);
  if (s.events.some((x) => x.id === e.id))
    throw Error("Duplicate history event.");
  const active = activeExperiment(s),
    n = structuredClone(s);
  n.baseline ??= structuredClone(s.intake);
  if (e.kind === "adjustment") {
    if (active) throw Error("Finish or revert the active experiment first.");
    if (!e.detail.trim()) throw Error("Describe the adjustment.");
    if (e.setting && e.setting !== "other") {
      if (e.before !== s.intake[e.setting])
        throw Error("The before value does not match the saved setup.");
      if (
        e.after === null ||
        e.after === undefined ||
        !Number.isFinite(e.after)
      )
        throw Error("Enter the measured new setting.");
      const limits =
        e.setting === "saddleHeight"
          ? [1, 1500]
          : e.setting === "saddleSetback"
            ? [-200, 400]
            : [-30, 30];
      if (e.after < limits[0] || e.after > limits[1])
        throw Error("Setting is outside the supported measurement range.");
      n.intake[e.setting] = e.after;
    }
    n.setupRevision++;
  }
  if (e.kind === "revert" || e.kind === "retain") {
    if (!active || active.id !== e.experimentId)
      throw Error("No matching active experiment.");
    if (e.kind === "revert") {
      if (
        (active.before == null || active.setting === "other") &&
        !e.detail.trim()
      )
        throw Error(
          "Describe how you manually restored the previous setup; its exact setting was unknown.",
        );
      if (active.setting && active.setting !== "other")
        n.intake[active.setting] = active.before ?? null;
      n.setupRevision++;
    }
  }
  n.events.push(e);
  n.updatedAt = new Date().toISOString();
  return n;
}
