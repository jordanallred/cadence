import { useEffect, useId, useRef, useState } from "react";
import type {
  ClipAnalysis,
  Intake,
  KeyMoment,
  Metric,
  Point,
} from "../../domain/types";
import {
  describeRange,
  rangeText,
  targetRange,
  type TargetRange,
} from "../../fit/ranges";

type Vec = { x: number; y: number };
type Angle = {
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

export const MOMENTS: Record<
  KeyMoment["position"],
  { tab: string; caption: string; metrics: string[] }
> = {
  extension: {
    tab: "Leg most extended",
    caption:
      "Near the bottom of the stroke, where the knee is straightest. Saddle height is judged here.",
    metrics: ["knee-min", "torso", "shoulder-angle", "elbow"],
  },
  top: {
    tab: "Top of the stroke",
    caption:
      "Where the knee and hip close the most. Useful for saddle position and crank length questions.",
    metrics: ["knee-max", "hip"],
  },
};

/** Frames of this clip that can be drawn. */
export const stillsOf = (clip: ClipAnalysis) =>
  (clip.keyframes ?? []).filter(
    (k) => k.image && clip.frames.some((f) => f.timeMs === k.timeMs),
  );

/** Metric ids the position report shows for this clip. */
export function positionMetrics(clip: ClipAnalysis): Set<string> {
  const stills = stillsOf(clip);
  const moments = stills.length
    ? stills.map((k) => k.position)
    : ["extension" as const];
  return new Set(moments.flatMap((m) => MOMENTS[m].metrics));
}

/**
 * The rider's side view at key moments of the pedal stroke, with the
 * measured angles drawn on the video frame and each value set against
 * its target range.
 */
export function PositionReport({
  clip,
  intake,
}: {
  clip: ClipAnalysis;
  intake: Intake;
}) {
  const stills = stillsOf(clip);
  const [shown, setShown] = useState<KeyMoment["position"]>("extension");
  const id = useId();
  const moments = stills.length
    ? stills
    : [{ position: "extension" as const, timeMs: 0 }];
  return (
    <section className="position-report" aria-labelledby={id + "-h"}>
      <div className="position-head">
        <h2 id={id + "-h"}>Your position, {clip.view} side</h2>
        {stills.length > 1 && (
          <div
            className="moment-tabs no-print"
            role="tablist"
            aria-label="Moment in the pedal stroke"
          >
            {stills.map((k) => (
              <button
                key={k.position}
                role="tab"
                id={`${id}-tab-${k.position}`}
                aria-selected={shown === k.position}
                aria-controls={`${id}-panel-${k.position}`}
                tabIndex={shown === k.position ? 0 : -1}
                onClick={() => setShown(k.position)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  const n = stills.findIndex((s) => s.position === shown);
                  const next =
                    stills[
                      (n + (e.key === "ArrowRight" ? 1 : -1) + stills.length) %
                        stills.length
                    ];
                  setShown(next.position);
                  document
                    .getElementById(`${id}-tab-${next.position}`)
                    ?.focus();
                }}
              >
                {MOMENTS[k.position].tab}
              </button>
            ))}
          </div>
        )}
      </div>
      {moments.map((k) => {
        const spec = MOMENTS[k.position];
        const metrics = spec.metrics.flatMap((m) => {
          const found = clip.metrics.find((x) => x.id === m);
          return found ? [found] : [];
        });
        return (
          <div
            key={k.position}
            className="position-body"
            role={stills.length > 1 ? "tabpanel" : undefined}
            id={`${id}-panel-${k.position}`}
            aria-labelledby={
              stills.length > 1 ? `${id}-tab-${k.position}` : undefined
            }
            data-hidden={stills.length > 1 && shown !== k.position}
          >
            {k.image ? (
              <MomentFigure clip={clip} moment={k} caption={spec.caption} />
            ) : (
              <p className="no-still">
                This video was analyzed before still frames were saved, so only
                the numbers are shown. Record or import this view again to see
                your position drawn on the video.
              </p>
            )}
            <div className="ranges">
              {metrics.map((m) => {
                const range = targetRange(m.id, intake);
                return range ? (
                  <RangeBar key={m.id} metric={m} range={range} />
                ) : (
                  <Reading key={m.id} metric={m} />
                );
              })}
              <RangeNotes metrics={metrics} intake={intake} />
              {metrics.every((m) => !targetRange(m.id, intake)) && (
                <p className="range-notes">
                  These have no target range. Compare them with your next fit
                  after a change.
                </p>
              )}
              {!clip.reviewed && (
                <p className="review-note">
                  The tracking on this video has not been reviewed yet. Check it
                  on the Recordings step before acting on these numbers.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function MomentFigure({
  clip,
  moment,
  caption,
  short = false,
}: {
  clip: ClipAnalysis;
  moment: KeyMoment;
  caption: string;
  /** Show only the caption, without the note on how angles are drawn. */
  short?: boolean;
}) {
  const frame = clip.frames.find((f) => f.timeMs === moment.timeMs)!;
  // Rendered width, so labels stay readable when the frame is shown small.
  const box = useRef<SVGSVGElement>(null);
  const [shownWidth, setShownWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(([e]) =>
      setShownWidth(e.contentRect.width),
    );
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  const off = clip.view === "right" ? 1 : 0;
  const W = clip.width,
    H = clip.height;
  const at = (j: number): Vec | undefined => {
    const p: Point | undefined = frame.points[j];
    return p && p.visibility >= 0.3 ? { x: p.x * W, y: p.y * H } : undefined;
  };
  const hip = at(23 + off),
    knee = at(25 + off),
    ankle = at(27 + off),
    shoulder = at(11 + off),
    elbow = at(13 + off),
    wrist = at(15 + off);
  const value = (id: string) => clip.metrics.find((m) => m.id === id)?.value;
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
  if (moment.position === "extension") {
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
  const size = Math.max(W, H);
  // Image units per screen pixel.
  const px = shownWidth ? W / shownWidth : size / 900;
  const stroke = Math.max(size / 260, 1.6 * px);
  const font = Math.max(size * 0.022, 13 * px);
  const unit = (v: Vec) => {
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  };
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));
  const description = angles
    .map((a) => `${a.name} ${Math.round(a.value)} degrees`)
    .join(", ");
  return (
    <figure className="moment-figure">
      <svg
        ref={box}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Video frame at ${(moment.timeMs / 1000).toFixed(1)} seconds with the body traced. ${description}.`}
      >
        <image href={moment.image} width={W} height={H} />
        {angles.map((a) => {
          if (!a.reference) return null;
          const len = size * 0.11;
          const u = unit(a.from);
          return (
            <line
              key={a.name + "-ref"}
              x1={a.at.x}
              y1={a.at.y}
              x2={a.at.x + u.x * len}
              y2={a.at.y + u.y * len}
              className="reference"
              strokeWidth={stroke * 0.9}
              strokeDasharray={`${stroke * 2.5} ${stroke * 2}`}
            />
          );
        })}
        {limbs.map((l, n) => {
          const pts = l.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={n}>
              <polyline
                points={pts}
                className="limb-under"
                strokeWidth={stroke * 2.6}
              />
              <polyline points={pts} className="limb" strokeWidth={stroke} />
            </g>
          );
        })}
        {angles.map((a) => {
          const r = size * 0.045;
          const u = unit(a.from),
            v = unit(a.to);
          const p = { x: a.at.x + u.x * r, y: a.at.y + u.y * r },
            q = { x: a.at.x + v.x * r, y: a.at.y + v.y * r };
          const sweep = u.x * v.y - u.y * v.x > 0 ? 1 : 0;
          const mid = unit({ x: u.x + v.x, y: u.y + v.y });
          const reach = r + font * 1.9;
          const lx = clamp(a.at.x + mid.x * reach, font * 3, W - font * 3),
            ly = clamp(a.at.y + mid.y * reach, font, H - font);
          return (
            <g key={a.name}>
              <path
                d={`M ${p.x} ${p.y} A ${r} ${r} 0 0 ${sweep} ${q.x} ${q.y}`}
                className="arc"
                strokeWidth={stroke * 1.4}
              />
              <text
                x={lx}
                y={ly}
                fontSize={font}
                className="angle-label"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {a.name} {Math.round(a.value)}°
              </text>
            </g>
          );
        })}
        {[hip, knee, ankle, shoulder, elbow, wrist].map(
          (p, n) =>
            p && (
              <circle
                key={n}
                cx={p.x}
                cy={p.y}
                r={stroke * 1.8}
                className="joint"
                strokeWidth={stroke * 0.6}
              />
            ),
        )}
      </svg>
      <figcaption>
        {short ? (
          caption
        ) : (
          <>
            {caption} Frame at {(moment.timeMs / 1000).toFixed(1)} s. Angles are
            medians across every stroke analyzed. Dashed lines show a straight
            limb
            {moment.position === "extension" ? " or the horizontal" : ""}.
          </>
        )}
      </figcaption>
    </figure>
  );
}

/** A measured value against its target range, with its cycle-to-cycle spread. */
export function RangeBar({
  metric,
  range,
}: {
  metric: Metric;
  range: TargetRange;
}) {
  const [lo, hi] = range.scale;
  const pos = (v: number) =>
    Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const band = (from?: number, to?: number) => ({
    left: pos(from ?? lo) + "%",
    width: pos(to ?? hi) - pos(from ?? lo) + "%",
  });
  const status = describeRange(metric.value, range, metric.unit);
  const spread = metric.spread ?? 0;
  const edges = [range.low, range.high].filter(
    (x): x is number => x !== undefined,
  );
  return (
    <div className={"range " + status.state}>
      <div className="range-head">
        <span>{metric.label}</span>
        <strong>
          {metric.value}
          {metric.unit}
          {spread > 0 && (
            <small title="Middle half of your strokes fall within this spread">
              {" "}
              ±{spread}
            </small>
          )}
        </strong>
      </div>
      <div className="range-track" aria-hidden="true">
        {(range.outerLow !== undefined || range.outerHigh !== undefined) && (
          <span
            className="range-outer"
            style={band(range.outerLow, range.outerHigh)}
          />
        )}
        <span className="range-band" style={band(range.low, range.high)} />
        {spread > 0 && (
          <span
            className="range-spread"
            style={band(metric.value - spread, metric.value + spread)}
          />
        )}
        <span
          className="range-mark"
          style={{ left: pos(metric.value) + "%" }}
        />
      </div>
      <div className="range-scale" aria-hidden="true">
        {edges.map((e) => (
          <span key={e} style={{ left: pos(e) + "%" }}>
            {e}
            {metric.unit}
          </span>
        ))}
      </div>
      <p>{status.text}</p>
    </div>
  );
}

/** A measurement with no target range: a plain reading, no bar. */
function Reading({ metric }: { metric: Metric }) {
  return (
    <div className="range reading">
      <div className="range-head">
        <span>{metric.label}</span>
        <strong>
          {metric.value}
          {metric.unit}
          {metric.spread !== undefined && metric.spread > 0 && (
            <small> ±{metric.spread}</small>
          )}
        </strong>
      </div>
    </div>
  );
}

/** Where the ranges come from, said once instead of under every bar. */
function RangeNotes({
  metrics,
  intake,
}: {
  metrics: Metric[];
  intake: Intake;
}) {
  const ranges = metrics.flatMap((m) => {
    const r = targetRange(m.id, intake);
    return r ? [{ m, r }] : [];
  });
  if (!ranges.length) return null;
  const research = ranges.some((x) => x.r.basis === "research"),
    practice = ranges.some((x) => x.r.basis === "practice"),
    notes = ranges.flatMap((x) => (x.r.note ? [x.r.note] : []));
  return (
    <p className="range-notes">
      {research &&
        "The knee target comes from studies of riders filmed while pedaling. Inside the pale band is close enough that a comfortable rider need not change anything. "}
      {practice &&
        "Upper-body targets are common fitting practice, not research cut-offs. "}
      {notes.join(" ")}
    </p>
  );
}
