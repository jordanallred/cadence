import {
  ArrowUpRight,
  CheckCircle2,
  Printer,
  Download,
  Info,
} from "lucide-react";
import type { Session, Recommendation } from "../../domain/types";
import { evidence } from "../../fit/evidence";
import { exportSession } from "../../storage/portable";
import { Notice } from "../../components/Fields";
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
  return (
    <>
      <div className="section-title report-title">
        <div>
          <span className="eyebrow">03 / YOUR FIT, UNDERSTOOD</span>
          <h1>Evidence. Then action.</h1>
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
          <button
            className="secondary"
            onClick={() =>
              exportSession({ ...session, recommendations: results })
            }
          >
            <Download size={16} />
            Backup
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
            <span>{ok ? "Reviewed" : "Needed"}</span>
          </div>
        ))}
      </div>
      <div className="report-grid">
        <div>
          {results.map((r, n) => (
            <section
              key={r.id}
              className={"recommendation " + r.outcome + " " + r.urgency}
            >
              <div className="recommendation-top">
                <span className="eyebrow">
                  {r.urgency !== "routine"
                    ? r.urgency.toUpperCase()
                    : r.outcome.replace("-", " ").toUpperCase()}
                </span>
                <span className="number">{String(n + 1).padStart(2, "0")}</span>
              </div>
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
                    <span className="chip">{r.confidence} confidence</span>
                  )}
                </div>
              )}
              <p>{r.observations}</p>
              {r.estimate && (
                <div className="estimate">
                  <strong>
                    {r.estimate.direction[0].toUpperCase() +
                      r.estimate.direction.slice(1)}{" "}
                    {r.estimate.minMm === r.estimate.maxMm
                      ? r.estimate.minMm
                      : `${r.estimate.minMm}–${r.estimate.maxMm}`}{" "}
                    mm
                  </strong>
                  <small>{r.estimate.basis}</small>
                </div>
              )}
              <div className="action">
                <ArrowUpRight size={20} />
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
            <span className="eyebrow">MOVEMENT SNAPSHOT</span>
            <h2>What the videos show</h2>
            {selected.length ? (
              selected.map((c) => (
                <div className="snapshot" key={c.id}>
                  <h3>
                    {c.view} view{" "}
                    <span>{c.reviewed ? "Reviewed" : "Unreviewed"}</span>
                  </h3>
                  {c.metrics
                    .filter((m) => m.id !== "cycles")
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
            Experiments cover saddle height (with a millimetre estimate when
            your saddle height is known) and handlebar reach and drop. They are
            ranked so you change one thing at a time, starting with the saddle.
            Front and rear views add knee tracking and pelvic stability; they
            inform referrals but do not set cleat rotation or establish
            structural asymmetry. Safety screening always runs first.
          </p>
        </details>
      </section>
      <div className="footer-actions no-print">
        <p>One change at a time. Keep what helps.</p>
        <button className="primary" onClick={onNext}>
          Ride & refine →
        </button>
      </div>
    </>
  );
}
