import type { Intake, Recommendation } from "../../domain/types";
import { AREAS, symptomName } from "../../fit/symptoms";
import { holdOf } from "../../fit/assessment";
import { estimateText } from "./Report";

/**
 * One line per reported symptom: what usually causes it, which of the ranked
 * changes target it, and what helps off the bike. Every symptom gets an
 * answer, even when no bike setting is linked to it.
 */
export function SymptomPlan({
  intake,
  results,
}: {
  intake: Intake;
  results: Recommendation[];
}) {
  if (!intake.symptoms.length || holdOf(results)) return null;
  const list = [...intake.symptoms].sort((a, b) => b.severity - a.severity);
  return (
    <section className="symptom-plan" aria-labelledby="symptom-plan-title">
      <h2 id="symptom-plan-title">For each symptom</h2>
      <p className="muted">
        Worst first. The numbers match the order of the changes below; make one
        at a time.
      </p>
      <ul>
        {list.map((s) => {
          const a = AREAS[s.area];
          const held = results.find((r) => r.id === `hold-${s.area}-${s.side}`);
          const changes = results.filter(
            (r) => r.targets?.includes(s.area) && !r.id.startsWith("hold-"),
          );
          const outweighed = results.filter((r) => r.against?.includes(s.area));
          const name = symptomName(s);
          return (
            <li key={s.area + s.side}>
              <div className="symptom-name">
                <strong>{name[0].toUpperCase() + name.slice(1)}</strong>
                {!a.sign && <span>{s.severity}/10</span>}
              </div>
              <div className="symptom-body">
                <p>{a.cause}</p>
                {held ? (
                  <p className="symptom-held">
                    <strong>Held back.</strong> {held.action}
                  </p>
                ) : changes.length ? (
                  <ol>
                    {changes.map((r) => (
                      <li key={r.id}>
                        {r.priority ? (
                          <span className="step">{r.priority}</span>
                        ) : (
                          <span className="step none" aria-hidden="true" />
                        )}
                        {r.estimate && r.outcome !== "no-change"
                          ? estimateText(r.estimate)
                          : r.title}
                      </li>
                    ))}
                  </ol>
                ) : outweighed.length ? null : (
                  <p>
                    No bike setting in the report targets this directly; start
                    with the kit advice below.
                  </p>
                )}
                {!held && outweighed.length > 0 && (
                  <p className="symptom-held">
                    <strong>Outweighed.</strong>{" "}
                    {outweighed
                      .map((r) =>
                        r.priority
                          ? `Change ${r.priority} (${r.title.toLowerCase()})`
                          : r.title,
                      )
                      .join(" and ")}{" "}
                    {outweighed.length > 1 ? "go" : "goes"} the other way
                    because{" "}
                    {outweighed.every((r) => r.againstBy === "measurement")
                      ? "the video measurement leads"
                      : outweighed.some((r) => r.againstBy === "measurement")
                        ? "the video measurement or a worse symptom leads"
                        : "a worse symptom leads"}
                    . Stop if this one gets worse.
                  </p>
                )}
                <p className="symptom-also">{a.also}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
