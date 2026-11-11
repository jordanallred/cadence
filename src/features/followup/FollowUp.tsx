import { useState } from "react";
import { RotateCcw, Check, Plus } from "lucide-react";
import type {
  Session,
  FitEvent,
  Recommendation,
  SymptomRating,
} from "../../domain/types";
import { activeExperiment, appendEvent } from "../../fit/history";
import { Check as Confirm, Field, Notice } from "../../components/Fields";
import { describeChange } from "../../fit/compare";
import { latestRatings, outcomeOf } from "../../fit/outcome";
import { firstStep } from "../../fit/loop";
import { symptomName } from "../../fit/symptoms";
import { OutcomeCard } from "./OutcomeCard";
import { loggedSettings, measurement } from "../../fit/measurements";
import { holdOf } from "../../fit/assessment";
/** The setting a recommended change is logged under. */
const LOGGED_AS: Partial<
  Record<
    NonNullable<Recommendation["estimate"]>["setting"],
    NonNullable<FitEvent["setting"]>
  >
> = {
  saddleHeight: "saddleHeight",
  saddleSetback: "saddleSetback",
  saddleTilt: "saddleTilt",
  stem: "stemLength",
  spacers: "barDrop",
  barWidth: "barWidth",
  cleat: "cleatOffset",
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const EVENT_NAME: Record<FitEvent["kind"], string> = {
  adjustment: "Change",
  revert: "Reverted",
  retain: "Kept",
  ride: "Ride",
};
const RESPONSE = {
  better: "better than before",
  same: "about the same",
  worse: "worse than before",
} as const;
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
  const suggested = results.find((r) => r.outcome === "experiment");
  const first = firstStep(suggested, session);
  const [setting, setSetting] = useState<NonNullable<FitEvent["setting"]>>(
      suggested?.estimate
        ? (LOGGED_AS[suggested.estimate.setting] ?? "other")
        : "saddleHeight",
    ),
    [after, setAfter] = useState(first ? String(first.after) : ""),
    // The decision notes of an active experiment start empty.
    [detail, setDetail] = useState(
      activeExperiment(session) ? "" : (suggested?.title ?? ""),
    ),
    [duration, setDuration] = useState("45"),
    [intensity, setIntensity] = useState<"easy" | "moderate" | "hard">("easy"),
    [comfort, setComfort] = useState(5),
    [response, setResponse] = useState<"better" | "same" | "worse">("same"),
    [rideNotes, setRideNotes] = useState(""),
    [ratings, setRatings] = useState<SymptomRating[]>(() =>
      latestRatings(session),
    ),
    [error, setError] = useState(""),
    // Asked here, where the change is made, if Your starting point skipped it.
    [askLimits] = useState(!session.intake.mechanicalLimits);
  const active = activeExperiment(session),
    hold = holdOf(results),
    blocked = hold !== undefined,
    experiment = results.find((r) => r.outcome === "experiment");
  const outcome = active && outcomeOf(session, active);
  // Keep needs a better ride or a Helped verdict, and never while the
  // evidence is mixed or says worse.
  const betterRide =
    !!active &&
    outcome?.verdict !== "mixed" &&
    outcome?.verdict !== "worse" &&
    (outcome?.verdict === "helped" ||
      session.events.some(
        (e) =>
          e.kind === "ride" &&
          e.experimentId === active.id &&
          e.response === "better",
      ));
  const needsRestoreNote =
    !!active && (active.before == null || active.setting === "other");
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
                label={
                  needsRestoreNote
                    ? "How will you put it back if you revert?"
                    : "Notes on your decision (optional)"
                }
                hint={
                  needsRestoreNote
                    ? "The setting before this change was not measured, so describe how you restored it."
                    : undefined
                }
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
                  disabled={blocked || !betterRide}
                  aria-describedby={!betterRide ? "keep-needs-ride" : undefined}
                  onClick={() =>
                    add({ kind: "retain", experimentId: active.id, detail })
                  }
                >
                  <Check size={16} />
                  Keep improvement
                </button>
              </div>
              {!betterRide && !blocked && (
                <p className="muted keep-hint" id="keep-needs-ride">
                  {outcome?.verdict === "mixed" || outcome?.verdict === "worse"
                    ? "Keep is not available while the rides and ratings say mixed or worse."
                    : "Keep becomes available once a ride with this change feels better than before, or after two rides with your symptom ratings down."}
                </p>
              )}
              {outcome && (
                <OutcomeCard outcome={outcome} onCompare={onReport} />
              )}
              {!outcome?.video && (
                <button className="text-button" onClick={onRecord}>
                  Record your updated position
                </button>
              )}
            </>
          ) : (
            <>
              {experiment ? (
                <Notice>
                  <span>
                    <strong>{experiment.title}.</strong> {experiment.action}
                  </span>
                </Notice>
              ) : (
                <p className="muted">
                  Nothing to change right now. If you adjust something anyway,
                  log it here so the next recording is compared with it.
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
                  <Field
                    label="New measured setting"
                    hint={
                      first && first.setting === setting
                        ? "Filled in from the suggested first step. Measure after the change and correct it if needed."
                        : undefined
                    }
                  >
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
              {askLimits && (
                <Confirm
                  label="I checked adjustment limits and torque instructions, and have the right tools"
                  checked={session.intake.mechanicalLimits}
                  onChange={(v) =>
                    onChange({
                      ...session,
                      intake: { ...session.intake, mechanicalLimits: v },
                    })
                  }
                />
              )}
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
                      ...(ratings.length ? { symptoms: ratings } : {}),
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
              {!blocked && (
                <small className="start-hint">
                  {!session.intake.mechanicalLimits
                    ? "Confirm the adjustment limits above first."
                    : setting !== "other" && !after
                      ? "Enter the new setting you measured after the change."
                      : !detail.trim()
                        ? "Describe what you changed."
                        : ""}
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
          {active && (
            <Field label="Compared with before the change">
              <select
                value={response}
                onChange={(e) => setResponse(e.target.value as typeof response)}
              >
                <option value="better">Better</option>
                <option value="same">About the same</option>
                <option value="worse">Worse</option>
              </select>
            </Field>
          )}
          {ratings.length > 0 && (
            <fieldset className="ratings">
              <legend>
                How did each symptom feel on this ride?
                <small>0 = gone, 10 = worst imaginable</small>
              </legend>
              {ratings.map((r, n) => {
                const name = symptomName({ ...r, severity: 1, warning: false });
                return (
                  <label key={r.area + r.side} className="rating">
                    <span>{cap(name)}</span>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={r.severity}
                      aria-valuetext={`${r.severity} out of 10`}
                      onChange={(e) =>
                        setRatings(
                          ratings.map((x, k) =>
                            k === n ? { ...x, severity: +e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <output>{r.severity}</output>
                  </label>
                );
              })}
            </fieldset>
          )}
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
                  ...(active ? { response } : {}),
                  experimentId: active?.id,
                  ...(ratings.length ? { symptoms: ratings } : {}),
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
                    {EVENT_NAME[e.kind]}, {new Date(e.at).toLocaleDateString()}
                  </span>
                  <h3>
                    {e.kind === "ride"
                      ? `${e.duration} min ${e.intensity} ride${e.response ? ", " + RESPONSE[e.response] : ""}`
                      : e.detail || EVENT_NAME[e.kind]}
                  </h3>
                  {e.kind === "ride" && (
                    <p>
                      Comfort {e.comfort}/10
                      {e.symptoms?.length
                        ? `. ${e.symptoms
                            .map(
                              (r) =>
                                `${cap(symptomName({ ...r, severity: 1, warning: false }))} ${r.severity}/10`,
                            )
                            .join(", ")}`
                        : ""}
                      {e.detail ? `. ${e.detail}` : ""}
                    </p>
                  )}
                  {(e.kind === "adjustment" || e.kind === "revert") && (
                    <small>
                      {(e.kind === "revert" ||
                        (e.setting && e.setting !== "other")) &&
                        describeChange(e, session)}
                      {e.kind === "adjustment" && (
                        <span className="compare-result">
                          {outcomeOf(session, e).title}
                          {outcomeOf(session, e).video
                            ? `. ${outcomeOf(session, e).video!.text}`
                            : ""}
                        </span>
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
