import type { Outcome } from "../../fit/outcome";

/**
 * One change's result: the verdict, why, and the evidence behind it. The
 * symptom ratings and rides decide; the video line says whether the
 * position actually moved.
 */
export function OutcomeCard({
  outcome,
  onCompare,
}: {
  outcome: Outcome;
  onCompare?: () => void;
}) {
  return (
    <div className={"outcome " + outcome.verdict}>
      <p className="outcome-verdict">
        <strong>{outcome.title}</strong>
      </p>
      <ul>
        {outcome.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {outcome.video ? (
          <li>
            Video: {outcome.video.text}{" "}
            {onCompare && (
              <button className="text-button inline" onClick={onCompare}>
                See before and after
              </button>
            )}
          </li>
        ) : (
          <li className="muted">No recording since the change yet.</li>
        )}
      </ul>
    </div>
  );
}
