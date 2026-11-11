import type { KeyMoment, Point, View } from "../../domain/types";
/** Placing the angle labels on a traced video frame (#9). */
export type Vec = { x: number; y: number };
export type Angle = {
  /** Short name drawn on the frame. */
  name: string;
  value: number;
  at: Vec;
  /** Directions of the two rays, from `at`. */
  from: Vec;
  to: Vec;
  /** Dashed reference ray (a straight limb or the horizontal), if any. */
  reference?: "from";
};
export interface PlacedLabel {
  a: Angle;
  text: string;
  /** Arc radius and its two ends. */
  r: number;
  p: Vec;
  q: Vec;
  sweep: 0 | 1;
  /** Centre of the text, and half its width and height. */
  x: number;
  y: number;
  half: number;
  halfHeight: number;
}

const unit = (v: Vec) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const rotate = (v: Vec, deg: number) => {
  const r = (deg * Math.PI) / 180;
  return {
    x: v.x * Math.cos(r) - v.y * Math.sin(r),
    y: v.x * Math.sin(r) + v.y * Math.cos(r),
  };
};
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
/** Overlap area of two centred boxes. */
const overlap = (
  a: { x: number; y: number; half: number; halfHeight: number },
  b: { x: number; y: number; half: number; halfHeight: number },
) =>
  Math.max(0, a.half + b.half - Math.abs(a.x - b.x)) *
  Math.max(0, a.halfHeight + b.halfHeight - Math.abs(a.y - b.y));
/** Whether segment ab passes through a centred box (sampled). */
const crosses = (
  box: { x: number; y: number; half: number; halfHeight: number },
  a: Vec,
  b: Vec,
) => {
  for (let k = 0; k <= 16; k++) {
    const x = a.x + ((b.x - a.x) * k) / 16,
      y = a.y + ((b.y - a.y) * k) / 16;
    if (Math.abs(x - box.x) < box.half && Math.abs(y - box.y) < box.halfHeight)
      return true;
  }
  return false;
};

/**
 * Put each label next to its own angle without covering another label,
 * a joint or a limb, inside the frame. On a forward-leaning rider the
 * shoulder angle opens down the torso, right where the torso label sits,
 * so labels try the bisector first and then turn away from it, and are
 * placed in order: the first angles get the best spots.
 */
export function placeLabels(
  angles: Angle[],
  limbs: Vec[][],
  W: number,
  H: number,
  font: number,
): PlacedLabel[] {
  const size = Math.max(W, H);
  const r = size * 0.045;
  const halfHeight = font * 0.7;
  const joints = limbs.flat();
  // Limbs and the dashed reference rays drawn from each angle.
  const segments = [
    ...limbs.flatMap((l) => l.slice(1).map((b, n) => [l[n], b])),
    ...angles
      .filter((a) => a.reference)
      .map((a) => {
        const u = unit(a.from);
        return [
          a.at,
          { x: a.at.x + u.x * size * 0.11, y: a.at.y + u.y * size * 0.11 },
        ];
      }),
  ];
  const placed: PlacedLabel[] = [];
  for (const a of angles) {
    const u = unit(a.from),
      v = unit(a.to);
    const mid = unit({ x: u.x + v.x, y: u.y + v.y });
    const text = `${a.name} ${Math.round(a.value)}°`;
    const half = (text.length * font * 0.58) / 2;
    const base = {
      a,
      text,
      r,
      p: { x: a.at.x + u.x * r, y: a.at.y + u.y * r },
      q: { x: a.at.x + v.x * r, y: a.at.y + v.y * r },
      sweep: (u.x * v.y - u.y * v.x > 0 ? 1 : 0) as 0 | 1,
      half,
      halfHeight,
    };
    let best: PlacedLabel | null = null,
      bestCost = Infinity;
    for (const turn of [0, 30, -30, 60, -60, 90, -90, 135, -135, 180])
      for (const far of [1, 1.5, 2.1]) {
        const d = rotate(mid, turn);
        // Far enough that the text clears the vertex in this direction.
        const reach =
          r + font * 0.6 + (Math.abs(d.x) * half + Math.abs(d.y) * halfHeight);
        const want = {
          x: a.at.x + d.x * reach * far,
          y: a.at.y + d.y * reach * far,
        };
        const at = {
          x: clamp(want.x, half + font * 0.3, W - half - font * 0.3),
          y: clamp(want.y, halfHeight, H - halfHeight),
        };
        const box = { ...at, half, halfHeight };
        let cost = Math.abs(turn) / 30 + (far - 1) * 3;
        cost += Math.hypot(at.x - want.x, at.y - want.y) / font;
        for (const o of placed)
          cost += (overlap(box, o) / (half * halfHeight)) * 200;
        for (const j of joints)
          if (
            Math.abs(j.x - at.x) < half + font * 0.3 &&
            Math.abs(j.y - at.y) < halfHeight + font * 0.3
          )
            cost += 20;
        for (const [s, e] of segments) if (crosses(box, s, e)) cost += 4;
        if (cost < bestCost) {
          bestCost = cost;
          best = { ...base, ...at };
        }
      }
    placed.push(best!);
  }
  return placed;
}

/** Pairs of labels whose text boxes overlap; empty when all are readable. */
export function overlapping(labels: PlacedLabel[]): [string, string][] {
  const out: [string, string][] = [];
  labels.forEach((a, i) =>
    labels
      .slice(i + 1)
      .forEach((b) => overlap(a, b) > 0 && out.push([a.a.name, b.a.name])),
  );
  return out;
}

/**
 * The angles and limbs to draw on a side-view frame at one moment of the
 * stroke. Points are 0–1 of the frame; the result is in pixels.
 */
export function traceFrame(
  points: Point[],
  view: View,
  position: KeyMoment["position"],
  value: (metricId: string) => number | undefined,
  W: number,
  H: number,
): { angles: Angle[]; limbs: Vec[][]; joints: (Vec | undefined)[] } {
  const off = view === "right" ? 1 : 0;
  const at = (j: number): Vec | undefined => {
    const p: Point | undefined = points[j];
    return p && p.visibility >= 0.3 ? { x: p.x * W, y: p.y * H } : undefined;
  };
  const hip = at(23 + off),
    knee = at(25 + off),
    ankle = at(27 + off),
    shoulder = at(11 + off),
    elbow = at(13 + off),
    wrist = at(15 + off);
  const sub = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y });
  const angles: Angle[] = [];
  const flexion = (name: string, id: string, a?: Vec, b?: Vec, c?: Vec) => {
    const v = value(id);
    if (a && b && c && v !== undefined)
      angles.push({
        name,
        value: v,
        at: b,
        from: sub(b, a),
        to: sub(c, b),
        reference: "from",
      });
  };
  const limbs: Vec[][] = [];
  if (hip && knee && ankle) limbs.push([hip, knee, ankle]);
  if (hip && shoulder) limbs.push([hip, shoulder]);
  if (shoulder && elbow && wrist) limbs.push([shoulder, elbow, wrist]);
  if (position === "extension") {
    flexion("Knee", "knee-min", hip, knee, ankle);
    flexion("Elbow", "elbow", shoulder, elbow, wrist);
    const torso = value("torso");
    if (hip && shoulder && torso !== undefined)
      angles.push({
        name: "Torso",
        value: torso,
        at: hip,
        from: { x: Math.sign(shoulder.x - hip.x) || 1, y: 0 },
        to: sub(shoulder, hip),
        reference: "from",
      });
    const sh = value("shoulder-angle");
    if (hip && shoulder && elbow && sh !== undefined)
      angles.push({
        name: "Shoulder",
        value: sh,
        at: shoulder,
        from: sub(hip, shoulder),
        to: sub(elbow, shoulder),
      });
  } else {
    flexion("Knee", "knee-max", hip, knee, ankle);
    const hp = value("hip");
    if (hip && shoulder && knee && hp !== undefined)
      angles.push({
        name: "Hip",
        value: hp,
        at: hip,
        from: sub(shoulder, hip),
        to: sub(knee, hip),
      });
  }
  return {
    angles,
    limbs,
    joints: [hip, knee, ankle, shoulder, elbow, wrist],
  };
}
