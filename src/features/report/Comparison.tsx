import { useId, useState } from "react";
import type { KeyMoment, Session } from "../../domain/types";
import {
  compareSetups,
  describeChange,
  earlierSetups,
  type MetricChange,
} from "../../fit/compare";
import { rangeText } from "../../fit/ranges";
import { MOMENTS, MomentFigure, stillsOf } from "./Visuals";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });

/**
 * The current side view next to an earlier setup's, after the rider has
 * changed something and recorded again.
 */
export function Comparison({ session }: { session: Session }) {
  const to = session.setupRevision;
  const options = earlierSetups(session, to);
  const [from, setFrom] = useState<number | undefined>(undefined);
  const [shown, setShown] = useState<KeyMoment["position"]>("extension");
  const id = useId();
  const cmp = compareSetups(session, to, from);
  if (!cmp) return null;
  const { before, after } = cmp;
  // Moments with a still frame in both recordings.
  const a = stillsOf(before),
    b = stillsOf(after);
  const moments = b
    .map((k) => k.position)
    .filter((p) => a.some((k) => k.position === p));
  const moment = moments.includes(shown) ? shown : moments[0];
  const ranged = cmp.metrics.filter((m) => m.range),
    plain = cmp.metrics.filter((m) => !m.range);
  const name = (rev: number) => `Setup ${rev + 1}`;
  return (
    <section className="comparison" aria-labelledby={id + "-h"}>
      <div className="position-head">
        <h2 id={id + "-h"}>Before and after</h2>
        {options.length > 1 && (
          <label className="compare-pick no-print">
            Compare with
            <select
              value={cmp.from}
              onChange={(e) => setFrom(Number(e.target.value))}
            >
              {options.map((r) => (
                <option key={r} value={r}>
                  {name(r)}
                  {r === 0 ? ", where you started" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="compare-changes">
        {name(cmp.from)} to {name(cmp.to)}:{" "}
        {cmp.changes.length
          ? cmp.changes.map((e) => describeChange(e, session)).join("; ")
          : "no logged change"}
        .
      </p>
      {moment && (
        <>
          {moments.length > 1 && (
            <div
              className="moment-tabs no-print"
              role="group"
              aria-label="Moment in the pedal stroke"
            >
              {moments.map((p) => (
                <button
                  key={p}
                  aria-pressed={moment === p}
                  onClick={() => setShown(p)}
                >
                  {MOMENTS[p].tab}
                </button>
              ))}
            </div>
          )}
          <div className="compare-stills">
            {[
              { clip: before, rev: cmp.from, label: "Before" },
              { clip: after, rev: cmp.to, label: "After" },
            ].map(({ clip, rev, label }) => (
              <MomentFigure
                key={clip.id + moment}
                clip={clip}
                moment={stillsOf(clip).find((k) => k.position === moment)!}
                caption={`${label}: ${name(rev)}, ${clip.view} side, ${day(clip.createdAt)}`}
                short
              />
            ))}
          </div>
        </>
      )}
      {!moment && (
        <p className="no-still">
          One of these recordings was analyzed before still frames were saved,
          so only the numbers are compared.
        </p>
      )}
      {before.view !== after.view && (
        <p className="review-note">
          The two setups were filmed from different sides, so small differences
          may come from the camera rather than the change.
        </p>
      )}
      {(!before.reviewed || !after.reviewed) && (
        <p className="review-note">
          Tracking on{" "}
          {!before.reviewed && !after.reviewed
            ? "both recordings"
            : `the ${!before.reviewed ? "before" : "after"} recording`}{" "}
          has not been reviewed. Check it on the Recordings step before trusting
          the change.
        </p>
      )}
      <div className="compare-ranges">
        {ranged.map((m) => (
          <CompareBar key={m.id} change={m} />
        ))}
      </div>
      {plain.length > 0 && (
        <table className="compare-table">
          <caption>Measurements without a target range</caption>
          <thead>
            <tr>
              <th scope="col">Measurement</th>
              <th scope="col">Before</th>
              <th scope="col">After</th>
              <th scope="col">Change</th>
            </tr>
          </thead>
          <tbody>
            {plain.map((m) => (
              <tr key={m.id} className={m.withinNoise ? "same" : undefined}>
                <th scope="row">{m.label}</th>
                <td>
                  {m.before}
                  {m.unit}
                </td>
                <td>
                  {m.after}
                  {m.unit}
                </td>
                <td>{m.withinNoise ? "About the same" : delta(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="range-notes">
        A change smaller than the usual variation between your pedal strokes (at
        least 2° for angles) is reported as about the same.
      </p>
    </section>
  );
}

const delta = (m: MetricChange) =>
  `${m.delta > 0 ? "+" : "−"}${Math.abs(m.delta)}${m.unit}`;

/** Before and after marks on one target-range bar. */
function CompareBar({ change: m }: { change: MetricChange }) {
  const r = m.range!;
  const [lo, hi] = r.scale;
  const pos = (v: number) =>
    Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const band = (from?: number, to?: number) => ({
    left: pos(from ?? lo) + "%",
    width: pos(to ?? hi) - pos(from ?? lo) + "%",
  });
  const state =
    m.trend === "into" || m.trend === "inside"
      ? "inside"
      : m.trend === "out" || m.trend === "further"
        ? "outside"
        : "near";
  const edges = [r.low, r.high].filter((x): x is number => x !== undefined);
  const [x0, x1] = [pos(m.before), pos(m.after)].sort((p, q) => p - q);
  return (
    <div className={"range compare " + state}>
      <div className="range-head">
        <span>{m.label}</span>
        <strong>
          <span className="was">
            {m.before}
            {m.unit}
          </span>{" "}
          → {m.after}
          {m.unit}
        </strong>
      </div>
      <div
        className="range-track"
        role="img"
        aria-label={`${m.label}: before ${m.before}${m.unit}, after ${m.after}${m.unit}, target ${rangeText(r, m.unit)}`}
      >
        {(r.outerLow !== undefined || r.outerHigh !== undefined) && (
          <span className="range-outer" style={band(r.outerLow, r.outerHigh)} />
        )}
        <span className="range-band" style={band(r.low, r.high)} />
        {!m.withinNoise && (
          <span
            className="range-move"
            style={{ left: x0 + "%", width: x1 - x0 + "%" }}
          />
        )}
        <span className="range-was" style={{ left: pos(m.before) + "%" }} />
        <span className="range-mark" style={{ left: pos(m.after) + "%" }} />
      </div>
      <div className="range-scale" aria-hidden="true">
        {edges.map((e) => (
          <span key={e} style={{ left: pos(e) + "%" }}>
            {e}
            {m.unit}
          </span>
        ))}
      </div>
      <p>{m.verdict}</p>
    </div>
  );
}
