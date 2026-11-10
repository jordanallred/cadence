import type { ClipAnalysis, Metric } from "../../domain/types";
import { describeRange, type TargetRange } from "../../fit/ranges";

/**
 * The video frame where the knee is straightest, with the leg traced and
 * the flexion angle drawn: the number the saddle-height advice rests on.
 */
export function StrokeFigure({ clip }: { clip: ClipAnalysis }) {
  const key = clip.keyframe;
  const frame = key && clip.frames.find((f) => f.timeMs === key.timeMs);
  if (!key?.image || !frame) return null;
  const off = clip.view === "right" ? 1 : 0;
  const W = clip.width,
    H = clip.height;
  const at = (j: number) => {
    const p = frame.points[j];
    return p ? { x: p.x * W, y: p.y * H } : undefined;
  };
  const hip = at(23 + off),
    knee = at(25 + off),
    ankle = at(27 + off);
  if (!hip || !knee || !ankle) return null;
  const thigh = Math.hypot(knee.x - hip.x, knee.y - hip.y),
    shank = Math.hypot(ankle.x - knee.x, ankle.y - knee.y);
  if (!thigh || !shank) return null;
  // A straight leg would continue the thigh line past the knee; flexion is
  // the angle between that line and the shank.
  const ux = (knee.x - hip.x) / thigh,
    uy = (knee.y - hip.y) / thigh;
  const straight = { x: knee.x + ux * shank, y: knee.y + uy * shank };
  const vx = (ankle.x - knee.x) / shank,
    vy = (ankle.y - knee.y) / shank;
  const flexion =
    (Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) * 180) / Math.PI;
  const r = Math.min(shank * 0.45, Math.max(W, H) * 0.08);
  const a = { x: knee.x + ux * r, y: knee.y + uy * r },
    b = { x: knee.x + vx * r, y: knee.y + vy * r };
  const sweep = ux * vy - uy * vx > 0 ? 1 : 0;
  const mid = { x: ux + vx, y: uy + vy },
    midLen = Math.hypot(mid.x, mid.y) || 1;
  const label = {
    x: knee.x + (mid.x / midLen) * (r + Math.max(W, H) * 0.035),
    y: knee.y + (mid.y / midLen) * (r + Math.max(W, H) * 0.035),
  };
  const stroke = Math.max(W, H) / 220;
  const leg = `${hip.x},${hip.y} ${knee.x},${knee.y} ${ankle.x},${ankle.y}`;
  return (
    <figure className="stroke-figure">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Video frame with the leg traced. The knee is bent ${Math.round(flexion)} degrees from straight at its most extended point.`}
      >
        <image href={key.image} width={W} height={H} />
        <line
          x1={knee.x}
          y1={knee.y}
          x2={straight.x}
          y2={straight.y}
          className="straight"
          strokeWidth={stroke * 0.8}
          strokeDasharray={`${stroke * 3} ${stroke * 2.5}`}
        />
        <polyline
          points={leg}
          className="leg-under"
          strokeWidth={stroke * 2.6}
        />
        <polyline points={leg} className="leg" strokeWidth={stroke} />
        <path
          d={`M ${a.x} ${a.y} A ${r} ${r} 0 0 ${sweep} ${b.x} ${b.y}`}
          className="arc"
          strokeWidth={stroke * 1.2}
        />
        {[hip, knee, ankle].map((p, n) => (
          <circle key={n} cx={p.x} cy={p.y} r={stroke * 2} className="joint" />
        ))}
        <text
          x={label.x}
          y={label.y}
          fontSize={Math.max(W, H) * 0.034}
          className="angle-label"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {Math.round(flexion)}°
        </text>
      </svg>
      <figcaption>
        Most extended point of a typical pedal stroke at{" "}
        {(key.timeMs / 1000).toFixed(1)} s. The dashed line is a straight leg;
        the arc is how far the knee stays bent.
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
  return (
    <div className="range">
      <div className="range-head">
        <span>{metric.label}</span>
        <strong>
          {metric.value}
          {metric.unit}
          {spread > 0 && <small> ±{spread}</small>}
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
          className={"range-mark " + (status.inside ? "inside" : "outside")}
          style={{ left: pos(metric.value) + "%" }}
        />
      </div>
      <div className="range-scale" aria-hidden="true">
        <span>
          {lo}
          {metric.unit}
        </span>
        <span>
          {hi}
          {metric.unit}
        </span>
      </div>
      <p className={status.inside ? "" : "outside"}>
        {status.text}. <small>{range.basis}.</small>
      </p>
    </div>
  );
}
