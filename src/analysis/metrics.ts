import type {
  PoseFrame,
  View,
  Metric,
  QualityIssue,
  Point,
  KeyMoment,
} from "../domain/types";
import { angle, quantile, smoothSeries } from "./geometry";
import { peakTime } from "./timing";
import { othersShare } from "./rider";
export const joints: Record<string, number> = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
};
/** Product heuristics, kept together so they are easy to audit and tune. */
export const QUALITY = {
  minVisibility: 0.65,
  minUsableShare: 0.8,
  minSpanMs: 7500,
  maxGapMs: 350,
  minCyclePeriodMs: 400,
  maxCyclePeriodMs: 2500,
  maxPeriodRatio: 1.6,
  minAnkleSpan: 0.025,
  optionalVisibility: 0.5,
  optionalShare: 0.7,
  resolutionWarningShortEdge: 480,
};
const median = (v: number[]) => quantile(v, 0.5);
/**
 * Per-cycle minimum (sign 1) or maximum (sign -1), refined between frames
 * with a least-squares parabola through the extreme sample and two
 * neighbours each side. Frame sampling alone misses the true extreme.
 */
export function extreme(c: number[], sign: 1 | -1): number {
  let k = -1;
  for (let n = 0; n < c.length; n++)
    if (Number.isFinite(c[n]) && (k < 0 || sign * c[n] < sign * c[k])) k = n;
  if (k < 0) return NaN;
  const y = [-2, -1, 0, 1, 2].map((o) => c[k + o]);
  if (!y.every(Number.isFinite)) return c[k];
  const a2 = (2 * y[0] - y[1] - 2 * y[2] - y[3] + 2 * y[4]) / 14,
    a1 = (-2 * y[0] - y[1] + y[3] + 2 * y[4]) / 10,
    a0 = (-3 * y[0] + 12 * y[1] + 17 * y[2] + 12 * y[3] - 3 * y[4]) / 35;
  if (sign * a2 <= 0 || Math.abs(a1 / (2 * a2)) > 1.5) return c[k];
  return a0 - (a1 * a1) / (4 * a2);
}
const iqr = (v: number[]) => quantile(v, 0.75) - quantile(v, 0.25);
export function measureClip(
  frames: PoseFrame[],
  view: View,
  w: number,
  h: number,
): {
  metrics: Metric[];
  quality: QualityIssue[];
  keyframes?: Omit<KeyMoment, "image">[];
} {
  const quality: QualityIssue[] = [],
    metrics: Metric[] = [];
  const keyframes: Omit<KeyMoment, "image">[] = [];
  if (Math.min(w, h) < QUALITY.resolutionWarningShortEdge)
    quality.push({
      code: "resolution",
      severity: "warning",
      message: `This video is ${w} × ${h} pixels. Small joint-placement errors matter more at this resolution. Review the overlays carefully; use the original camera file rather than a compressed copy when available.`,
    });
  const reject = (code: string, message: string) => ({
    metrics: [],
    quality: [...quality, { code, severity: "reject" as const, message }],
  });
  if (
    frames.length < 40 ||
    frames.at(-1)!.timeMs - frames[0].timeMs < QUALITY.minSpanMs
  )
    return reject(
      "duration",
      "Record at least 8 seconds of steady pedaling with the whole rider visible.",
    );
  if (frames.some((f, n) => n > 0 && f.timeMs <= frames[n - 1].timeMs))
    return reject(
      "timestamps",
      "Frame timestamps are not increasing. Reimport the original video.",
    );
  // Frames hold only the rider's pose (selectRider), so someone else in the
  // shot is a note, not a failure.
  if (othersShare(frames) > 0.05)
    quality.push({
      code: "people",
      severity: "warning",
      message:
        "Someone else, or a picture of a person, was in the shot. Cadence followed the rider; check that the tracing stays on the rider.",
    });
  const side = view === "left" || view === "right",
    off = view === "right" ? 1 : 0;
  const required = side
    ? [11 + off, 23 + off, 25 + off, 27 + off]
    : [11, 12, 23, 24, 25, 26, 27, 28];
  const ok = (p: Point | undefined, v = QUALITY.minVisibility) =>
    !!p &&
    p.visibility >= v &&
    p.x > 0.01 &&
    p.x < 0.99 &&
    p.y > 0.01 &&
    p.y < 0.99;
  const usable = frames.filter((f) => required.every((j) => ok(f.points[j])));
  if (usable.length / frames.length < QUALITY.minUsableShare)
    return reject(
      "visibility",
      "Too many joints are hidden, cropped or uncertain. Improve lighting, camera placement or clothing contrast.",
    );
  if (
    usable.some(
      (f, n) => n > 0 && f.timeMs - usable[n - 1].timeMs > QUALITY.maxGapMs,
    )
  )
    return reject("gaps", "Tracking has gaps. Re-record without obstructions.");
  // Temporal smoothing removes frame-to-frame landmark jitter before any
  // angle is computed. Raw landmarks stay on the clip for review.
  const track = (j: number, average = true): Point[] => {
    const xs = smoothSeries(
        usable.map((f) => f.points[j]?.x ?? NaN),
        average,
      ),
      ys = smoothSeries(
        usable.map((f) => f.points[j]?.y ?? NaN),
        average,
      );
    return xs.map((x, n) => ({
      x,
      y: ys[n],
      visibility: usable[n].points[j]?.visibility ?? 0,
    }));
  };
  const optional = (j: number) =>
    usable.filter((f) => ok(f.points[j], QUALITY.optionalVisibility)).length /
      usable.length >=
    QUALITY.optionalShare;
  const ankleTrack = track(27 + off);
  const ankles = ankleTrack.map((p) => p.y),
    span = quantile(ankles, 0.95) - quantile(ankles, 0.05);
  // Bottom of the pedal stroke: the ankle's lowest image position per cycle.
  const peaks: number[] = [];
  const high = quantile(ankles, 0.65);
  for (let n = 1; n < ankles.length - 1; n++) {
    if (!(ankles[n] >= ankles[n - 1] && ankles[n] > ankles[n + 1])) continue;
    if (ankles[n] <= high) continue;
    // A real bottom of stroke follows the foot coming down. The edge of a
    // still stretch (rider waiting before pedaling) is flat, not a stroke.
    let low = ankles[n];
    for (
      let k = n - 1;
      k >= 0 && usable[n].timeMs - usable[k].timeMs <= 400;
      k--
    )
      low = Math.min(low, ankles[k]);
    if (ankles[n] - low < 0.25 * span) continue;
    const last = peaks.at(-1);
    if (
      last !== undefined &&
      usable[n].timeMs - usable[last].timeMs <= QUALITY.minCyclePeriodMs
    ) {
      if (ankles[n] > ankles[last]) peaks[peaks.length - 1] = n;
      continue;
    }
    peaks.push(n);
  }
  if (span < QUALITY.minAnkleSpan || peaks.length < 4)
    return reject(
      "cycles",
      "Could not identify at least three complete pedal cycles. Use a steady 10–20 second recording.",
    );
  const times = usable.map((f) => f.timeMs);
  const refinedPeaks = peaks.map((p) => peakTime(times, ankles, p));
  const periods = peaks
    .slice(1)
    .map((_, n) => refinedPeaks[n + 1] - refinedPeaks[n]);
  if (
    periods.some(
      (p) => p < QUALITY.minCyclePeriodMs || p > QUALITY.maxCyclePeriodMs,
    ) ||
    Math.max(...periods) / Math.min(...periods) > QUALITY.maxPeriodRatio
  )
    return reject(
      "cycles",
      "Pedal cycles were inconsistent. Check tracking and record at a steady cadence.",
    );
  quality.push({
    code: "projection",
    severity: "warning",
    message:
      "2D estimates. Camera perspective, clothing and landmark errors affect every measurement; review overlays before using results.",
  });
  const cycles = peaks.length - 1;
  const add = (
    id: string,
    label: string,
    value: number,
    unit: string,
    sampleCount: number,
    spread?: number,
  ) =>
    metrics.push({
      id,
      label,
      // A ratio near 1 needs two decimals to say anything.
      value:
        unit === "ratio"
          ? Math.round(value * 100) / 100
          : Math.round(value * 10) / 10,
      unit,
      sampleCount,
      confidence:
        spread !== undefined && (spread > 5 || sampleCount < 4)
          ? "low"
          : "moderate",
      ...(spread !== undefined ? { spread: Math.round(spread * 10) / 10 } : {}),
      limitations: [
        "Projected measurement; not clinical validation.",
        "Tracking confidence is not an angle-error bound.",
      ],
    });
  add("cycles", "Complete cycles", cycles, "cycles", cycles);
  add(
    "cadence",
    "Estimated cadence",
    60000 / median(periods),
    "rpm",
    periods.length,
  );
  const perCycle = (series: number[], pick: (c: number[]) => number) => {
    const out: number[] = [];
    for (let n = 1; n < peaks.length; n++)
      out.push(pick(series.slice(peaks[n - 1], peaks[n] + 1)));
    return out;
  };
  if (side) {
    const hip = track(23 + off),
      knee = track(25 + off),
      shoulder = track(11 + off);
    // Check that the near side matches the selected view.
    const vis = (js: number[]) =>
      median(
        usable.flatMap((f) => js.map((j) => f.points[j]?.visibility ?? 0)),
      );
    const near = vis([11 + off, 23 + off, 25 + off, 27 + off]),
      far = vis([12 - off, 24 - off, 26 - off, 28 - off]);
    if (far > near + 0.1)
      quality.push({
        code: "side",
        severity: "warning",
        message: `The ${view === "left" ? "right" : "left"} side appears closer to the camera. Check that this view is labelled correctly.`,
      });
    // Direction of travel: the shoulders sit ahead of the hips.
    const facing = median(shoulder.map((s, n) => s.x - hip[n].x)) >= 0 ? 1 : -1;
    // Joint-angle extremes use spike-filtered but unaveraged landmarks;
    // averaging flattens the peaks. The per-cycle parabola fit denoises.
    const rh = track(23 + off, false),
      rk = track(25 + off, false),
      ra = track(27 + off, false);
    const flex = usable.map((_, n) => {
      const a = angle(rh[n], rk[n], ra[n], w, h);
      return a === null ? NaN : 180 - a;
    });
    const mins = perCycle(flex, (c) => extreme(c, 1)),
      maxs = perCycle(flex, (c) => extreme(c, -1));
    add(
      "knee-min",
      "Knee flexion · extension",
      median(mins),
      "°",
      mins.length,
      iqr(mins),
    );
    // Frames for the report, from the cycle most typical of this rider:
    // its extension and top-of-stroke flexion are closest to the medians.
    {
      const mid = (xs: number[]) => {
        const target = median(xs);
        let best = 0;
        xs.forEach((x, n) => {
          if (Math.abs(x - target) < Math.abs(xs[best] - target)) best = n;
        });
        return best;
      };
      const momentOf = (cycle: number, sign: 1 | -1) => {
        let at = peaks[cycle];
        for (let n = peaks[cycle]; n <= peaks[cycle + 1]; n++)
          if (sign * flex[n] < sign * flex[at]) at = n;
        return usable[at].timeMs;
      };
      keyframes.push(
        { position: "extension", timeMs: momentOf(mid(mins), 1) },
        { position: "top", timeMs: momentOf(mid(maxs), -1) },
      );
    }
    const bdc = peaks.slice(1).map((p) => flex[p]);
    add(
      "knee-bdc",
      "Knee flexion · bottom of stroke",
      median(bdc),
      "°",
      bdc.length,
      iqr(bdc),
    );
    add(
      "knee-max",
      "Knee flexion · top",
      median(maxs),
      "°",
      maxs.length,
      iqr(maxs),
    );
    const dist = (a: Point[], b: Point[]) =>
      median(
        a.map((p, n) => Math.hypot((p.x - b[n].x) * w, (p.y - b[n].y) * h)),
      );
    const thigh = dist(hip, knee),
      shank = dist(knee, ankleTrack);
    if (thigh > 0 && shank > 0)
      add(
        "leg-ratio",
        "Thigh / shank length",
        thigh / shank,
        "ratio",
        usable.length,
      );
    const torso = usable.map(
      (_, n) =>
        (Math.atan2(
          Math.abs((shoulder[n].y - hip[n].y) * h),
          Math.abs((shoulder[n].x - hip[n].x) * w),
        ) *
          180) /
        Math.PI,
    );
    add(
      "torso",
      "Torso to horizontal",
      median(torso),
      "°",
      usable.length,
      iqr(torso),
    );
    const hips = shoulder
      .map((s, n) => angle(s, hip[n], knee[n], w, h))
      .filter((x): x is number => x !== null);
    add(
      "hip",
      "Minimum projected hip angle",
      quantile(hips, 0.05),
      "°",
      hips.length,
    );
    const toeJ = 31 + off;
    if (optional(toeJ)) {
      const toe = track(toeJ);
      const ankleAngle = usable.map((_, n) => {
        const a = angle(knee[n], ankleTrack[n], toe[n], w, h);
        return a === null ? NaN : a;
      });
      const atBottom = peaks.slice(1).map((p) => ankleAngle[p]);
      add(
        "ankle-bdc",
        "Ankle angle · bottom of stroke",
        median(atBottom),
        "°",
        atBottom.length,
        iqr(atBottom),
      );
      const rom = perCycle(
        ankleAngle,
        (c) => quantile(c, 0.95) - quantile(c, 0.05),
      );
      add(
        "ankle-rom",
        "Ankle range of motion",
        median(rom),
        "°",
        rom.length,
        iqr(rom),
      );
      // Knee relative to the ball of the foot with the crank forward
      // (3 o'clock): the frame where the foot is furthest forward each cycle.
      const forward: number[] = [];
      for (let n = 1; n < peaks.length; n++) {
        let best = peaks[n - 1];
        for (let k = peaks[n - 1]; k <= peaks[n]; k++)
          if (facing * ankleTrack[k].x > facing * ankleTrack[best].x) best = k;
        const ball =
          ankleTrack[best].x + 0.65 * (toe[best].x - ankleTrack[best].x);
        forward.push(
          ((facing * (knee[best].x - ball) * w) / Math.max(thigh, 1)) * 100,
        );
      }
      add(
        "kops",
        "Knee ahead of ball of foot · crank forward",
        median(forward),
        "% thigh",
        forward.length,
        iqr(forward),
      );
    }
    const elbowJ = 13 + off,
      wristJ = 15 + off;
    if (optional(elbowJ) && optional(wristJ)) {
      const elbow = track(elbowJ),
        wrist = track(wristJ);
      const elbowFlex = usable
        .map((_, n) => angle(shoulder[n], elbow[n], wrist[n], w, h))
        .filter((x): x is number => x !== null)
        .map((a) => 180 - a);
      add(
        "elbow",
        "Elbow flexion",
        median(elbowFlex),
        "°",
        elbowFlex.length,
        iqr(elbowFlex),
      );
      const shoulderAngle = usable
        .map((_, n) => angle(hip[n], shoulder[n], elbow[n], w, h))
        .filter((x): x is number => x !== null);
      add(
        "shoulder-angle",
        "Shoulder angle · torso to upper arm",
        median(shoulderAngle),
        "°",
        shoulderAngle.length,
        iqr(shoulderAngle),
      );
    }
  } else {
    const width = quantile(
      usable.map((f) => Math.abs(f.points[23].x - f.points[24].x) * w),
      0.5,
    );
    if (width < 0.04 * w)
      return reject(
        "view",
        "The hips are too narrow in this view. Place the camera directly in front or behind.",
      );
    const lh = track(23),
      rh = track(24),
      ls = track(11),
      rs = track(12);
    const tilt = (a: Point[], b: Point[]) =>
      a.map(
        (p, n) =>
          (Math.atan2((b[n].y - p.y) * h, Math.abs((b[n].x - p.x) * w)) * 180) /
          Math.PI,
      );
    const excursion = (c: number[]) => quantile(c, 0.95) - quantile(c, 0.05);
    const pelvis = perCycle(tilt(lh, rh), excursion);
    add(
      "pelvic-rock",
      "Pelvic tilt excursion",
      median(pelvis),
      "°",
      pelvis.length,
      iqr(pelvis),
    );
    for (const [name, j] of [
      ["Left", 25],
      ["Right", 26],
    ] as const) {
      const k = track(j);
      const d = k.map(
        (p, n) => (((p.x - (lh[n].x + rh[n].x) / 2) * w) / width) * 100,
      );
      const ex = perCycle(d, excursion);
      add(
        name.toLowerCase() + "-knee",
        name + " knee lateral excursion",
        median(ex),
        "% hip width",
        ex.length,
        iqr(ex),
      );
    }
    const shoulders = perCycle(tilt(ls, rs), excursion);
    add(
      "shoulder",
      "Shoulder tilt excursion",
      median(shoulders),
      "°",
      shoulders.length,
      iqr(shoulders),
    );
  }
  return keyframes.length
    ? { metrics, quality, keyframes }
    : { metrics, quality };
}
