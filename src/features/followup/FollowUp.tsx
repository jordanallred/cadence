import { useState } from "react";
import { RotateCcw, Check, Plus } from "lucide-react";
import type { Session, FitEvent, Recommendation } from "../../domain/types";
import { activeExperiment, appendEvent } from "../../fit/history";
import { Field, Notice } from "../../components/Fields";
import {
  compareSetups,
  describeChange,
  headline,
  headlineText,
  revisionAfter,
} from "../../fit/compare";
import { loggedSettings, measurement } from "../../fit/measurements";
import { holdOf } from "../../fit/assessment";
export function FollowUp({
  session,
  onChange,
  results,
  onRecord,
  onReport,
}: {
  session: Session;
  onChange: (s: Session) => void;
  results: Recommendation[];
  onRecord: () => void;
  onReport: () => void;
}) {
  const [setting, setSetting] =
      useState<NonNullable<FitEvent["setting"]>>("saddleHeight"),
    [after, setAfter] = useState(""),
    [detail, setDetail] = useState(""),
    [duration, setDuration] = useState("45"),
    [intensity, setIntensity] = useState<"easy" | "moderate" | "hard">("easy"),
    [comfort, setComfort] = useState(5),
    [response, setResponse] = useState<"better" | "same" | "worse">("same"),
    [rideNotes, setRideNotes] = useState(""),
    [error, setError] = useState("");
  const active = activeExperiment(session),
    hold = holdOf(results),
    blocked = hold !== undefined,
    experiment = results.find((r) => r.outcome === "experiment");
  const revisions = revisionAfter(session);
  /** What the next recording showed after a change, in one line. */
  const result = (e: FitEvent) => {
    const rev = revisions.get(e.id);
    const cmp = rev === undefined ? undefined : compareSetups(session, rev);
    const top = cmp && headline(cmp.metrics);
    return top ? headlineText(top) : undefined;
  };
  const activeResult = active && result(active);
  const add = (e: Omit<FitEvent, "id" | "at">) => {
    try {
      onChange(
        appendEvent(session, {
          ...e,
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
        }),
      );
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  };
  return (
    <>
      <div className="section-title">
        <h1>Ride & refine</h1>
        <p>
          Make one change, ride with it, then record how it felt. Keep it only
          if riding is better.
        </p>
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      {hold && (
        <Notice tone="warning">
          <strong>New changes are on hold: {hold.title}.</strong> {hold.action}{" "}
          You can still record rides and revert an existing experiment.
        </Notice>
      )}
      <div className="follow-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>{active ? "Your active experiment" : "Log an adjustment"}</h2>
          </div>
          {active ? (
            <>
              <div className="active-experiment">
                <span className="eyebrow">In progress</span>
                <h3>{active.detail}</h3>
                <p>
                  {active.setting && active.setting !== "other"
                    ? `${active.before ?? "Unknown"} → ${active.after ?? "Unknown"} ${active.setting ? measurement(active.setting).unit : ""}`
                    : ""}
                </p>
                <small>Your previous setup remains in the history.</small>
              </div>
              <Field
                label="Decision / restoration notes"
                hint="Required when the original setting was unknown."
              >
                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  maxLength={3000}
                />
              </Field>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() =>
                    add({ kind: "revert", experimentId: active.id, detail })
                  }
                >
                  <RotateCcw size={16} />
                  Revert change
                </button>
                <button
                  className="primary"
                  disabled={
                    blocked ||
                    !session.events.some(
                      (e) =>
                        e.kind === "ride" &&
                        e.experimentId === active.id &&
                        e.response === "better",
                    )
                  }
                  onClick={() =>
                    add({ kind: "retain", experimentId: active.id, detail })
                  }
                >
                  <Check size={16} />
                  Keep improvement
                </button>
              </div>
              {activeResult ? (
                <p className="compare-summary">
                  {activeResult}{" "}
                  <button className="text-button" onClick={onReport}>
                    See before and after
                  </button>
                </p>
              ) : (
                <button className="text-button" onClick={onRecord}>
                  Record your updated position
                </button>
              )}
            </>
          ) : (
            <>
              {experiment ? (
                <Notice>{experiment.action}</Notice>
              ) : (
                <p className="muted">
                  Log a change you made with appropriate guidance. The app may
                  recommend no change.
                </p>
              )}
              <Field label="Setting">
                <select
                  value={setting}
                  onChange={(e) => {
                    setSetting(e.target.value as typeof setting);
                    setAfter("");
                  }}
                >
                  {loggedSettings.map((key) => {
                    const m = measurement(key);
                    return (
                      <option key={key} value={key}>
                        {m.label} · {m.unit === "°" ? "degrees" : m.unit}
                      </option>
                    );
                  })}
                  <option value="other">Other · describe below</option>
                </select>
              </Field>
              {setting !== "other" && (
                <div className="form-grid">
                  <Field label="Previous setting">
                    <input
                      disabled
                      value={session.intake[setting] ?? "Unknown"}
                    />
                  </Field>
                  <Field label="New measured setting">
                    <input
                      type="number"
                      step="any"
                      value={after}
                      onChange={(e) => setAfter(e.target.value)}
                    />
                  </Field>
                </div>
              )}
              <Field label="What changed and why?">
                <textarea
                  maxLength={3000}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="Record the exact change, reference and reason."
                />
              </Field>
              <button
                className="primary full"
                disabled={
                  blocked ||
                  !session.intake.mechanicalLimits ||
                  !detail.trim() ||
                  (setting !== "other" && !after)
                }
                onClick={() => {
                  if (
                    add({
                      kind: "adjustment",
                      detail,
                      setting,
                      before:
                        setting === "other" ? null : session.intake[setting],
                      after: setting === "other" ? null : Number(after),
                    })
                  ) {
                    setDetail("");
                    setAfter("");
                  }
                }}
              >
                <Plus size={16} />
                Start experiment
              </button>
              {!session.intake.mechanicalLimits && (
                <small>
                  Confirm mechanical limits and tools in Your starting point
                  first.
                </small>
              )}
            </>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>How did the ride feel?</h2>
            <span>{active ? "Experiment feedback" : "Baseline ride"}</span>
          </div>
          <div className="form-grid">
            <Field label="Ride duration · minutes">
              <input
                type="number"
                min="1"
                max="1440"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
            <Field label="Intensity">
              <select
                value={intensity}
                onChange={(e) =>
                  setIntensity(e.target.value as typeof intensity)
                }
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
              </select>
            </Field>
          </div>
          <Field
            label={`Comfort · ${comfort} / 10`}
            hint="0 = very uncomfortable, 10 = fully comfortable"
          >
            <input
              type="range"
              min="0"
              max="10"
              value={comfort}
              onChange={(e) => setComfort(+e.target.value)}
            />
          </Field>
          <Field label="Compared with before">
            <select
              value={response}
              onChange={(e) => setResponse(e.target.value as typeof response)}
            >
              <option value="better">Better</option>
              <option value="same">About the same</option>
              <option value="worse">Worse</option>
            </select>
          </Field>
          <Field label="Ride notes">
            <textarea
              maxLength={3000}
              value={rideNotes}
              onChange={(e) => setRideNotes(e.target.value)}
              placeholder="When symptoms started, terrain, hand position, anything different…"
            />
          </Field>
          <button
            className="primary full"
            disabled={Number(duration) <= 0 || Number(duration) > 1440}
            onClick={() => {
              if (
                add({
                  kind: "ride",
                  detail: rideNotes,
                  duration: Number(duration),
                  intensity,
                  comfort,
                  response,
                  experimentId: active?.id,
                })
              )
                setRideNotes("");
            }}
          >
            Save ride feedback
          </button>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your fit history</h2>
        </div>
        {!session.events.length ? (
          <p className="muted">
            Your baseline rides and adjustments will appear here.
          </p>
        ) : (
          <div className="timeline">
            {[...session.events].reverse().map((e) => (
              <div key={e.id}>
                <span className="timeline-dot" />
                <div>
                  <span className="eyebrow">
                    {e.kind} · {new Date(e.at).toLocaleDateString()}
                  </span>
                  <h3>
                    {e.kind === "ride"
                      ? `${e.duration} min · ${e.intensity} · ${e.response}`
                      : e.detail || e.kind}
                  </h3>
                  {e.kind === "ride" && (
                    <p>
                      Comfort {e.comfort}/10 · {e.detail}
                    </p>
                  )}
                  {(e.kind === "adjustment" || e.kind === "revert") && (
                    <small>
                      {(e.kind === "revert" ||
                        (e.setting && e.setting !== "other")) &&
                        describeChange(e, session)}
                      {result(e) && (
                        <span className="compare-result">{result(e)}</span>
                      )}
                    </small>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
