import { useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import type { Recommendation, Session } from "../../domain/types";
import { activeExperiment } from "../../fit/history";
import { describeChange } from "../../fit/compare";
import { outcomeOf } from "../../fit/outcome";
import {
  STAGES,
  dayFromNow,
  nextStep,
  reminderFile,
  type Place,
} from "../../fit/loop";
import { download } from "../../storage/portable";
import { OutcomeCard } from "../followup/OutcomeCard";
import { ShareWithFitter } from "./ShareWithFitter";

const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

/**
 * The page a returning rider lands on: where they are in the loop, the one
 * thing to do next, and what each change so far did.
 */
export function WhereYouAre({
  session,
  results,
  onGo,
}: {
  session: Session;
  results: Recommendation[];
  onGo: (p: Place) => void;
}) {
  const next = nextStep(session, results),
    active = activeExperiment(session),
    at = STAGES.findIndex((s) => s.id === next.stage);
  const [remind, setRemind] = useState(dayFromNow(7)),
    [saved, setSaved] = useState(false);
  const decided = (id: string) =>
    session.events.find(
      (e) =>
        (e.kind === "retain" || e.kind === "revert") && e.experimentId === id,
    );
  const past = session.events.filter(
    (e) => e.kind === "adjustment" && decided(e.id),
  );
  const what = active
    ? describeChange(active, session)
    : (results.find((r) => r.outcome === "experiment")?.title ?? "your fit");
  return (
    <>
      <div className="section-title">
        <h1>Where you are</h1>
        <p>
          {session.intake.bike || "Your bike"}, setup{" "}
          {session.setupRevision + 1}. Started{" "}
          {new Date(session.createdAt).toLocaleDateString()}.
        </p>
      </div>
      <ol className="loop-track" aria-label="The fit loop">
        {STAGES.map((s, n) => (
          <li
            key={s.id}
            className={n < at ? "done" : n === at ? "current" : ""}
            aria-current={n === at ? "step" : undefined}
          >
            {n < at && <Check size={14} aria-hidden="true" />}
            {n === at && (
              <span className="loop-count">
                Step {n + 1} of {STAGES.length}:{" "}
              </span>
            )}
            {s.label}
          </li>
        ))}
      </ol>
      <section className="next-step" aria-labelledby="next-h">
        <span className="eyebrow">Next</span>
        <h2 id="next-h">{next.title}</h2>
        <p>{next.detail}</p>
        <button className="primary" onClick={() => onGo(next.place)}>
          {next.action}
        </button>
      </section>
      {active && (
        <section className="panel" aria-labelledby="current-h">
          <div className="panel-heading">
            <h2 id="current-h">Current change</h2>
            <span>Logged {daysAgo(active.at)}</span>
          </div>
          <h3 className="change-name">{describeChange(active, session)}</h3>
          {active.detail &&
            active.detail !== describeChange(active, session) && (
              <p className="muted change-why">{active.detail}</p>
            )}
          <OutcomeCard
            outcome={outcomeOf(session, active)}
            onCompare={() => onGo("report")}
          />
        </section>
      )}
      {past.length > 0 && (
        <section className="panel" aria-labelledby="tried-h">
          <div className="panel-heading">
            <h2 id="tried-h">What you've tried</h2>
          </div>
          <ul className="tried">
            {[...past].reverse().map((e) => {
              const o = outcomeOf(session, e),
                d = decided(e.id)!;
              return (
                <li key={e.id}>
                  <div>
                    <strong>{describeChange(e, session)}</strong>
                    <small>
                      {new Date(e.at).toLocaleDateString()}, {o.rides.total}{" "}
                      {o.rides.total === 1 ? "ride" : "rides"}
                    </small>
                  </div>
                  <span className={"tried-result " + o.verdict}>{o.title}</span>
                  <span className="tried-decision">
                    {d.kind === "retain" ? "Kept" : "Reverted"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <ShareWithFitter session={session} results={results} />
      <section className="reminder" aria-labelledby="remind-h">
        <h2 id="remind-h">Remind me to come back</h2>
        <p className="muted">
          Saves a calendar file to open in your calendar app. Nothing is sent
          anywhere.
        </p>
        <div className="reminder-row">
          <label className="field">
            <span>Date</span>
            <input
              type="date"
              value={remind}
              min={dayFromNow(0)}
              onChange={(e) => {
                setRemind(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <button
            className="secondary"
            disabled={!remind}
            onClick={() => {
              download(
                "cadence-reminder.ics",
                new Blob(
                  [
                    reminderFile(
                      remind,
                      active
                        ? "Cadence: how is the change going?"
                        : "Cadence: check in on your fit",
                      `${what}. Open Cadence, log your rides and rate your symptoms, then record a side view.`,
                    ),
                  ],
                  { type: "text/calendar" },
                ),
              );
              setSaved(true);
            }}
          >
            <CalendarPlus size={16} />
            Save reminder
          </button>
        </div>
        {saved && (
          <p className="muted" role="status">
            Saved cadence-reminder.ics. Open it to add it to your calendar.
          </p>
        )}
      </section>
    </>
  );
}
