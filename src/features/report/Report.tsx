import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Printer,
  Info,
} from "lucide-react";
import {
  viewLabel,
  type Session,
  type Recommendation,
} from "../../domain/types";
import { evidence } from "../../fit/evidence";
import { CLEAR_LEAD } from "../../fit/recommend";
import { Notice } from "../../components/Fields";
import { metricValue } from "../metricFormat";
import { PositionReport, positionMetrics } from "./Visuals";
import { Comparison } from "./Comparison";
import { FitNumbers } from "./FitNumbers";
import { SymptomPlan } from "./SymptomPlan";
/** The headline number, naming what moves: "Saddle 5–29 mm back". */
export function estimateText(e: NonNullable<Recommendation["estimate"]>) {
  const unit = e.unit === "°" ? "°" : " mm";
  const mm =
    e.minMm === e.maxMm ? `${e.minMm}${unit}` : `${e.minMm}–${e.maxMm}${unit}`;
  const side = e.side ? `${e.side[0].toUpperCase()}${e.side.slice(1)} ` : "";
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
      return e.side ? `${side}cleat ${mm} back` : `Cleats ${mm} ${e.direction}`;
    case "saddleTilt":
      return `Saddle nose ${mm} ${e.direction === "nose-down" ? "down" : "up"}`;
    case "cleatRotation":
      return `${side || "Both "}${side ? "toes" : "feet: toes"} ${mm} ${e.direction === "toe-out" ? "out" : "in"}`;
    case "stance":
      return `${side || ""}${side ? "stance" : "Stance"} ${mm} ${e.direction}`;
    case "crank":
      return `Cranks ${mm} shorter`;
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
  const comfortable = session.intake.symptoms.length === 0;
  // The first change, safety advice and missing information stay open;
  // later changes start folded so the report reads in order.
  const first = results.find((r) => r.outcome === "experiment")?.id;
  const collapsible = (r: Recommendation) =>
    r.urgency === "routine" &&
    r.id !== first &&
    (r.outcome === "experiment" ||
      r.outcome === "equipment-training" ||
      r.outcome === "no-change");
  const [opened, setOpened] = useState<Set<string>>(new Set());
  return (
    <>
      <div className="section-title report-title">
        <div>
          <h1>Fit report</h1>
          <p>
            {[
              session.intake.name.trim(),
              session.intake.bike.trim(),
              `Setup ${session.setupRevision + 1}`,
            ]
              .filter(Boolean)
              .join(" · ")}
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
            {ok ? (
              <CheckCircle2 size={18} className="green" aria-hidden="true" />
            ) : (
              <Circle size={18} className="muted" aria-hidden="true" />
            )}
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
      <SymptomPlan intake={session.intake} results={results} />
      <div className="report-grid">
        <div>
          {results.map((r) => {
            const shut = collapsible(r) && !opened.has(r.id);
            return (
              <section
                key={r.id}
                className={
                  "recommendation " +
                  r.outcome +
                  " " +
                  r.urgency +
                  (shut ? " collapsed" : "")
                }
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
                      <span className="chip strong">
                        {comfortable
                          ? "First, if you change anything"
                          : "Do this first"}
                      </span>
                    )}
                    {r.priority && r.priority > 1 && (
                      <span className="chip">Change {r.priority}, later</span>
                    )}
                    {r.confidence && (
                      <span
                        className="chip"
                        title="How well the evidence behind this rule and your recording support it. Not a measured accuracy."
                      >
                        {r.confidence[0].toUpperCase() + r.confidence.slice(1)}
                        -strength rule
                      </span>
                    )}
                  </div>
                )}
                {shut && r.estimate && r.outcome !== "no-change" && (
                  <p className="estimate-line">
                    <strong>{estimateText(r.estimate)}</strong>
                  </p>
                )}
                {collapsible(r) && (
                  <button
                    className="text-button no-print rec-toggle"
                    aria-expanded={!shut}
                    aria-controls={r.id + "-body"}
                    onClick={() =>
                      setOpened((o) => {
                        const n = new Set(o);
                        if (n.has(r.id)) n.delete(r.id);
                        else n.add(r.id);
                        return n;
                      })
                    }
                  >
                    {shut ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                    {shut ? "Show details" : "Hide details"}
                  </button>
                )}
                <div className="rec-body" id={r.id + "-body"}>
                  <p>{r.observations}</p>
                  {r.estimate &&
                    (r.outcome === "no-change" ? (
                      <p className="estimate-optional">
                        If you decide to change it:{" "}
                        <strong>{estimateText(r.estimate)}</strong>.{" "}
                        {r.estimate.basis}
                      </p>
                    ) : (
                      <div className="estimate">
                        <strong>{estimateText(r.estimate)}</strong>
                        <small>{r.estimate.basis}</small>
                      </div>
                    ))}
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
                </div>
              </section>
            );
          })}
        </div>
        <aside>
          <section className="panel">
            <h2>{side ? "Other measurements" : "What the videos show"}</h2>
            {selected.length ? (
              selected.map((c) => (
                <div className="snapshot" key={c.id}>
                  <h3>
                    {viewLabel(c.view)}{" "}
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
                          {metricValue(m)}
                          {m.unit === "°" && "°"}
                          {m.spread !== undefined && m.spread > 0 && (
                            <small> ±{m.spread}</small>
                          )}
                          {m.unit !== "°" && <small> {m.unit}</small>}
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
              measure pressure, forces or establish a medical diagnosis. Rule
              strength on each change says how well the evidence and your
              recording support that rule, not how accurate the measurement is.
              Accuracy on real riders has not been measured yet.
            </span>
          </Notice>
        </aside>
      </div>
      <section className="panel policy" id="policy">
        <h2>How we make a recommendation</h2>
        <p>
          Only emergency or urgent warning signs stop the advice. Everything
          else, such as an unanswered safety check, long-lasting symptoms or a
          ride that went worse, adds a note and the changes still come, in
          millimetres. An area you mark as sharp, sudden or worsening is held
          back on its own and the report says who to see. A comfortable rider
          does not need to chase a target angle.
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
            Safety screening always runs first. Then changes are ranked so you
            make one at a time. First come problems the video or your
            measurements show directly, in fitting order from the feet up:
            cleats, saddle height, setback, tilt, then handlebar height and
            reach. After that, changes that come only from your symptoms, worst
            symptom first. When two symptoms pull one setting opposite ways, a
            video measurement outside its range decides; otherwise the worse
            symptom wins if it is at least {CLEAR_LEAD} points worse, and if not
            the setting stays put and the other changes take over. A change you
            logged as making a ride worse is not suggested again. Saddle height
            in millimetres comes from your knee angle and saddle height;
            symptoms can move it within the 30–40° range but never out of it.
            Reach, drop and knee position in millimetres scale the video by your
            height using average body proportions, so they carry about ±40%
            uncertainty and are given as ranges. Setback and drop are compared
            with measured road riders; that shows what is common, not what is
            right for you. Cleat angle and stance width cannot be seen on a side
            video, so they come from your symptoms only, in 1–2° and 1–4 mm
            steps. Which symptom points to which setting follows the clinical
            reviews listed above; they are expert synthesis, not trials of each
            adjustment.
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
