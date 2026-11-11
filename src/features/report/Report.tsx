import { CheckCircle2, Printer, Info } from "lucide-react";
import type { Session, Recommendation } from "../../domain/types";
import { evidence } from "../../fit/evidence";
import { Notice } from "../../components/Fields";
import { PositionReport, positionMetrics } from "./Visuals";
import { Comparison } from "./Comparison";
import { FitNumbers } from "./FitNumbers";
/** The headline number, naming what moves: "Saddle 5–29 mm back". */
export function estimateText(e: NonNullable<Recommendation["estimate"]>) {
  const mm = e.minMm === e.maxMm ? `${e.minMm} mm` : `${e.minMm}–${e.maxMm} mm`;
  switch (e.setting) {
    case "saddleHeight":
      return `${e.direction === "raise" ? "Raise" : "Lower"} ${mm}`;
    case "saddleSetback":
      return `Saddle ${mm} ${e.direction}`;
    case "stem":
      return `Reach ${mm} ${e.direction} in total`;
    case "spacers":
      return `Bar ${mm} higher`;
    case "barWidth":
      return `Bar ${mm} ${e.direction}`;
    case "cleat":
      return `Cleats ${mm} ${e.direction}`;
  }
}
const kindLabel: Record<Recommendation["outcome"], string> = {
  experiment: "Try this change",
  information: "Information needed",
  "equipment-training": "Equipment or training",
  assessment: "Get an assessment",
  "no-change": "No change needed",
};
export function Report({
  session,
  results,
  onNext,
}: {
  session: Session;
  results: Recommendation[];
  onNext: () => void;
}) {
  const current = session.clips.filter(
    (c) => c.setupRevision === session.setupRevision,
  );
  const selected = current.filter(
    (c) => !current.some((d) => d.view === c.view && d.createdAt > c.createdAt),
  );
  const side = selected.find(
    (c) => (c.view === "left" || c.view === "right") && c.metrics.length,
  );
  const drawn = side ? positionMetrics(side) : new Set<string>();
  return (
    <>
      <div className="section-title report-title">
        <div>
          <h1>Fit report</h1>
          <p>
            {session.intake.name || "Your rider profile"} ·{" "}
            {session.intake.bike || "Your bike"} · Setup{" "}
            {session.setupRevision + 1}
          </p>
        </div>
        <div className="button-row no-print">
          <button className="secondary" onClick={() => window.print()}>
            <Printer size={16} />
            Print report
          </button>
        </div>
      </div>
      <div className="coverage-strip">
        {[
          [
            "Side",
            selected.some(
              (c) => ["left", "right"].includes(c.view) && c.reviewed,
            ),
          ],
          ["Front", selected.some((c) => c.view === "front" && c.reviewed)],
          ["Rear", selected.some((c) => c.view === "rear" && c.reviewed)],
        ].map(([name, ok]) => (
          <div key={String(name)}>
            <CheckCircle2 size={18} className={ok ? "green" : "muted"} />
            <strong>{name} view</strong>
            <span>
              {ok ? "Reviewed" : name === "Side" ? "Needed" : "Recommended"}
            </span>
          </div>
        ))}
      </div>
      <Comparison session={session} />
      {side && <PositionReport clip={side} intake={session.intake} />}
      <FitNumbers intake={session.intake} results={results} side={side} />
      <div className="report-grid">
        <div>
          {results.map((r) => (
            <section
              key={r.id}
              className={"recommendation " + r.outcome + " " + r.urgency}
            >
              <p className="recommendation-kind">
                {r.urgency !== "routine"
                  ? r.urgency === "emergency"
                    ? "Emergency"
                    : "Urgent"
                  : kindLabel[r.outcome]}
              </p>
              <h2>{r.title}</h2>
              {(r.priority || r.confidence) && (
                <div className="chips">
                  {r.priority === 1 && (
                    <span className="chip strong">Do this first</span>
                  )}
                  {r.priority && r.priority > 1 && (
                    <span className="chip">Later · one change at a time</span>
                  )}
                  {r.confidence && (
                    <span className="chip">
                      {r.confidence[0].toUpperCase() + r.confidence.slice(1)}{" "}
                      confidence
                    </span>
                  )}
                </div>
              )}
              <p>{r.observations}</p>
              {r.estimate && (
                <div className="estimate">
                  <strong>{estimateText(r.estimate)}</strong>
                  <small>{r.estimate.basis}</small>
                </div>
              )}
              <div className="action">
                <strong>What to do</strong>
                <p>{r.action}</p>
              </div>
              <details>
                <summary>Why this recommendation?</summary>
                <dl>
                  <dt>Other explanations</dt>
                  <dd>{r.alternatives}</dd>
                  <dt>Before acting</dt>
                  <dd>{r.prerequisites}</dd>
                  <dt>What to recheck</dt>
                  <dd>{r.recheck}</dd>
                </dl>
                <div className="source-links">
                  {r.sources.map(
                    (id) =>
                      evidence[id] && (
                        <a
                          key={id}
                          href={evidence[id].url}
                          target={id === "product" ? undefined : "_blank"}
                          rel="noreferrer"
                        >
                          {evidence[id].title}
                        </a>
                      ),
                  )}
                </div>
                <small>Decision policy {r.ruleVersion}</small>
              </details>
            </section>
          ))}
        </div>
        <aside>
          <section className="panel">
            <h2>{side ? "Other measurements" : "What the videos show"}</h2>
            {selected.length ? (
              selected.map((c) => (
                <div className="snapshot" key={c.id}>
                  <h3>
                    {c.view} view{" "}
                    <span>{c.reviewed ? "Reviewed" : "Unreviewed"}</span>
                  </h3>
                  {c.metrics
                    .filter(
                      (m) =>
                        m.id !== "cycles" &&
                        !(c.id === side?.id && drawn.has(m.id)),
                    )
                    .map((m) => (
                      <div key={m.id}>
                        <span>{m.label}</span>
                        <strong>
                          {m.value}
                          {m.spread !== undefined && m.spread > 0 && (
                            <small> ±{m.spread}</small>
                          )}{" "}
                          <small>{m.unit}</small>
                        </strong>
                      </div>
                    ))}
                  {!c.metrics.length && <p>Recording needs improvement.</p>}
                </div>
              ))
            ) : (
              <p>Measurements will appear after analysis.</p>
            )}
          </section>
          <Notice>
            <Info size={17} />
            <span>
              This is an experimental fitting aid. Multi-view video does not
              measure pressure, forces or establish a medical diagnosis.
              Expert-equivalent accuracy has not been validated.
            </span>
          </Notice>
        </aside>
      </div>
      <section className="panel policy" id="policy">
        <h2>How we make a recommendation</h2>
        <p>
          Your context comes first. The app checks symptoms and feedback, then
          recording quality and reviewed movement. It may recommend a small
          experiment, more information, broader assessment, or no change. A
          comfortable rider does not need to chase a target angle.
        </p>
        <details>
          <summary>Evidence & current limits</summary>
          {Object.entries(evidence).map(([id, e]) => (
            <p key={id}>
              <a href={e.url}>{e.title}</a>
              <br />
              <small>{e.limit}</small>
            </p>
          ))}
          <p>
            Safety screening always runs first. Experiments are ranked so you
            change one thing at a time: cleats (only for foot symptoms), then
            saddle height, then setback, then handlebar reach and drop. Saddle
            height in millimetres comes from your knee angle and saddle height.
            Reach, drop and knee position in millimetres scale the video by your
            height using average body proportions, so they carry about ±40%
            uncertainty and are given as ranges. Setback and drop are compared
            with measured road riders; that shows what is common, not what is
            right for you. Handlebar width follows shoulder width. Front and
            rear views add knee tracking and pelvic stability; they inform
            referrals but do not set cleat rotation or establish structural
            asymmetry.
          </p>
        </details>
      </section>
      <div className="footer-actions no-print">
        <p>Next, make the first change and ride with it.</p>
        <button className="primary" onClick={onNext}>
          Ride & refine
        </button>
      </div>
    </>
  );
}
