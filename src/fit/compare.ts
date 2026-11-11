import type {
  ClipAnalysis,
  FitEvent,
  Intake,
  Metric,
  Session,
} from "../domain/types";
import { describeRange, targetRange, type TargetRange } from "./ranges";

/**
 * Side-view measurements worth comparing between setups, in the order a
 * rider reads them. Cadence, cycle count and limb proportions describe the
 * recording or the rider, not the fit, so they are left out.
 */
export const COMPARED = [
  "knee-min",
  "knee-max",
  "knee-bdc",
  "hip",
  "torso",
  "shoulder-angle",
  "elbow",
  "ankle-bdc",
  "ankle-rom",
  "kops",
];

const isSide = (c: ClipAnalysis) =>
  (c.view === "left" || c.view === "right") && c.metrics.length > 0;

/** Newest side-view clip with measurements recorded at a setup. */
export function sideClipAt(
  session: Session,
  revision: number,
): ClipAnalysis | undefined {
  return newest(
    session.clips.filter((c) => c.setupRevision === revision && isSide(c)),
  );
}

function newest(clips: ClipAnalysis[], view?: ClipAnalysis["view"]) {
  const pool = view ? clips.filter((c) => c.view === view) : clips;
  // Later in the list wins a tie, matching how the app picks clips.
  return pool.reduce<ClipAnalysis | undefined>(
    (best, c) => (!best || c.createdAt >= best.createdAt ? c : best),
    undefined,
  );
}

/** Earlier setups that have a side view to compare against, newest first. */
export function earlierSetups(session: Session, revision: number): number[] {
  return [
    ...new Set(
      session.clips
        .filter((c) => c.setupRevision < revision && isSide(c))
        .map((c) => c.setupRevision),
    ),
  ].sort((a, b) => b - a);
}

/**
 * The clip to use for an earlier setup. The same side as `after` is
 * preferred, so the camera sees the same leg.
 */
export function beforeClip(
  session: Session,
  revision: number,
  after: ClipAnalysis,
): ClipAnalysis | undefined {
  const at = session.clips.filter(
    (c) => c.setupRevision === revision && isSide(c),
  );
  return newest(at, after.view) ?? newest(at);
}

/**
 * The setup each adjustment or revert produced. Only these events change
 * the setup, each by one, starting from setup 0.
 */
export function revisionAfter(session: Session): Map<string, number> {
  const out = new Map<string, number>();
  let rev = 0;
  for (const e of session.events)
    if (e.kind === "adjustment" || e.kind === "revert") out.set(e.id, ++rev);
  return out;
}

/** Adjustments and reverts that turned setup `from` into setup `to`. */
export function changesBetween(
  session: Session,
  from: number,
  to: number,
): FitEvent[] {
  const rev = revisionAfter(session);
  return session.events.filter((e) => {
    const r = rev.get(e.id);
    return r !== undefined && r > from && r <= to;
  });
}

const SETTING = {
  saddleHeight: { name: "Saddle height", unit: " mm" },
  saddleSetback: { name: "Saddle setback", unit: " mm" },
  saddleTilt: { name: "Saddle tilt", unit: "°" },
} as const;

/** One change in words, e.g. "Saddle height 720 → 725 mm". */
export function describeChange(e: FitEvent, session: Session): string {
  if (e.kind === "revert") {
    const undone = session.events.find((x) => x.id === e.experimentId);
    const what = undone ? describeChange(undone, session) : "the last change";
    return `Undid ${what[0].toLowerCase() + what.slice(1)}`;
  }
  if (e.setting && e.setting !== "other") {
    const s = SETTING[e.setting];
    const v = (n: number | null | undefined) => (n == null ? "unknown" : n);
    return `${s.name} ${v(e.before)} → ${v(e.after)}${s.unit}`;
  }
  return e.detail.trim() || "Unrecorded change";
}

export type MetricChange = {
  id: string;
  label: string;
  unit: string;
  before: number;
  after: number;
  delta: number;
  /** Spread of the two recordings, in the metric's unit. */
  noise: number;
  /** The difference is smaller than the stroke-to-stroke variation. */
  withinNoise: boolean;
  range?: TargetRange;
  /** Plain-language result, e.g. "Now inside the target (30–40°)". */
  verdict: string;
  /** The change moved the value into, out of, or along its range. */
  trend: "into" | "out" | "closer" | "further" | "inside" | "none";
};

const round = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number, unit: string) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(round(n))}${unit}`;

/** How far a value sits outside its range; 0 when inside. */
function gap(value: number, r: TargetRange) {
  if (r.low !== undefined && value < r.low) return r.low - value;
  if (r.high !== undefined && value > r.high) return value - r.high;
  return 0;
}

/**
 * Smallest change taken as real. The medians move a little between any two
 * recordings, so a change inside the typical stroke-to-stroke spread is not
 * claimed as an effect of the adjustment.
 */
export function noiseFloor(a: Metric, b: Metric) {
  const spread = ((a.spread ?? 0) + (b.spread ?? 0)) / 2;
  const floor = a.unit === "°" ? 2 : 1;
  return round(Math.max(floor, spread / 2));
}

export function compareMetric(
  a: Metric,
  b: Metric,
  intake: Intake,
): MetricChange {
  const delta = round(b.value - a.value);
  const noise = noiseFloor(a, b);
  const withinNoise = Math.abs(delta) < noise;
  const range = targetRange(b.id, intake);
  const base = {
    id: b.id,
    label: b.label,
    unit: b.unit,
    before: a.value,
    after: b.value,
    delta,
    noise,
    withinNoise,
    range,
  };
  if (!range)
    return {
      ...base,
      trend: "none",
      verdict: withinNoise
        ? "About the same; the change is within normal stroke-to-stroke variation."
        : `Changed by ${signed(delta, b.unit)}.`,
    };
  const was = describeRange(a.value, range, a.unit),
    now = describeRange(b.value, range, b.unit);
  const lower = now.text[0].toLowerCase() + now.text.slice(1);
  const g0 = gap(a.value, range),
    g1 = gap(b.value, range);
  if (withinNoise)
    return {
      ...base,
      trend: now.state === "inside" ? "inside" : "none",
      verdict: `About the same: the change is within normal stroke-to-stroke variation. Still ${lower}.`,
    };
  if (now.state === "inside")
    return was.state === "inside"
      ? { ...base, trend: "inside", verdict: `Still ${lower}.` }
      : { ...base, trend: "into", verdict: `Now ${lower}.` };
  if (was.state === "inside")
    return { ...base, trend: "out", verdict: `Now ${lower}.` };
  // Outside before and after. A jump across the band counts by distance.
  return g1 < g0
    ? { ...base, trend: "closer", verdict: `Closer, ${lower}.` }
    : { ...base, trend: "further", verdict: `Further off, ${lower}.` };
}

/** Measurements recorded at both setups, in reading order. */
export function compareClips(
  before: ClipAnalysis,
  after: ClipAnalysis,
  intake: Intake,
): MetricChange[] {
  return COMPARED.flatMap((id) => {
    const a = before.metrics.find((m) => m.id === id),
      b = after.metrics.find((m) => m.id === id);
    return a && b ? [compareMetric(a, b, intake)] : [];
  });
}

/**
 * The one line to show for a change, e.g. "Knee flexion · extension 28° →
 * 35°, now inside the target (30–40°)". It picks the measurement that
 * moved into or out of its range, then the knee at extension.
 */
export function headline(changes: MetricChange[]): MetricChange | undefined {
  return (
    changes.find((c) => c.trend === "into" || c.trend === "out") ??
    changes.find((c) => c.id === "knee-min") ??
    changes[0]
  );
}

export function headlineText(c: MetricChange): string {
  const v = (n: number) => `${n}${c.unit}`;
  const verdict = c.verdict[0].toLowerCase() + c.verdict.slice(1);
  return `${c.label} ${v(c.before)} → ${v(c.after)}, ${verdict}`;
}

export type SetupComparison = {
  from: number;
  to: number;
  before: ClipAnalysis;
  after: ClipAnalysis;
  changes: FitEvent[];
  metrics: MetricChange[];
};

/**
 * Compare the side view of setup `to` with an earlier setup, by default
 * the most recent one that was recorded.
 */
export function compareSetups(
  session: Session,
  to: number,
  from?: number,
): SetupComparison | undefined {
  const after = sideClipAt(session, to);
  if (!after) return;
  const options = earlierSetups(session, to);
  const pick = from !== undefined && options.includes(from) ? from : options[0];
  if (pick === undefined) return;
  const before = beforeClip(session, pick, after);
  if (!before) return;
  return {
    from: pick,
    to,
    before,
    after,
    changes: changesBetween(session, pick, to),
    metrics: compareClips(before, after, session.intake),
  };
}
