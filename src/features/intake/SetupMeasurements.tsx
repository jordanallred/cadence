import type { Intake as Profile } from "../../domain/types";
import { useState } from "react";
import { Field, Notice } from "../../components/Fields";
import {
  measurement,
  type MeasureKey,
  type Measurement,
} from "../../fit/measurements";

const groups: { title: string; keys: MeasureKey[]; note?: string }[] = [
  {
    title: "You",
    keys: ["riderHeight", "shoulderWidth"],
    note: "Your height lets the app turn video angles into millimetres.",
  },
  {
    title: "Saddle",
    keys: ["saddleHeight", "saddleSetback", "saddleTilt", "crankLength"],
  },
  {
    title: "Handlebar",
    keys: ["barReach", "barDrop", "stemLength", "barWidth"],
  },
  { title: "Shoes", keys: ["cleatOffset"] },
];

/**
 * Side view of the four frame measurements, drawn to the same conventions
 * as the guide: plumb lines from the saddle nose and bar, a level line from
 * the saddle top. Not to scale.
 */
function Diagram() {
  return (
    <svg
      className="measure-diagram"
      viewBox="0 0 520 300"
      role="img"
      aria-labelledby="measure-diagram-title"
    >
      <title id="measure-diagram-title">
        Where to measure saddle height, setback, reach and drop
      </title>
      <g className="frame">
        <line x1="200" y1="230" x2="152" y2="72" />
        <line x1="157" y1="90" x2="388" y2="104" />
        <line x1="200" y1="230" x2="402" y2="150" />
        <line x1="388" y1="104" x2="402" y2="150" />
        <line x1="200" y1="230" x2="246" y2="230" />
        <circle cx="200" cy="230" r="7" />
      </g>
      <g className="parts">
        <path d="M104 58 h58 q8 0 8 4 v2 h-66 z" />
        <line x1="388" y1="100" x2="425" y2="100" />
        <circle cx="425" cy="100" r="7" />
        <path d="M430 106 q16 18 -2 40" />
      </g>
      <g className="dims">
        {/* Saddle height: along the seat tube */}
        <line x1="200" y1="230" x2="150" y2="64" className="dim" />
        <text x="164" y="160" textAnchor="end">
          Saddle height
        </text>
        {/* Plumb lines from the saddle nose and crank axle; setback between */}
        <line x1="170" y1="64" x2="170" y2="288" className="plumb" />
        <line x1="200" y1="238" x2="200" y2="288" className="plumb" />
        <line x1="170" y1="282" x2="200" y2="282" className="dim" />
        <text x="185" y="299" textAnchor="middle">
          Setback
        </text>
        {/* Plumb from the bar centre; reach along the floor */}
        <line x1="425" y1="108" x2="425" y2="268" className="plumb" />
        <line x1="170" y1="262" x2="425" y2="262" className="dim" />
        <text x="312" y="255" textAnchor="middle">
          Saddle to bar reach
        </text>
        {/* Level line from the saddle top; drop down to the top of the bar */}
        <line x1="170" y1="58" x2="490" y2="58" className="level" />
        <line x1="432" y1="93" x2="490" y2="93" className="level" />
        <line x1="478" y1="58" x2="478" y2="93" className="dim" />
        <text x="472" y="80" textAnchor="end">
          Drop
        </text>
      </g>
    </svg>
  );
}

/**
 * Why a typed value cannot be used, or "" if it can. Exported for tests.
 * A value a tenth of the range is almost always centimetres, so say so.
 */
export function rangeProblem(m: Measurement, n: number): string {
  if (!Number.isFinite(n)) return "Enter a number.";
  if (n >= m.min && n <= m.max) return "";
  const range = `Enter ${m.min} to ${m.max} ${m.unit}.`;
  if (m.unit === "mm" && n * 10 >= m.min && n * 10 <= m.max)
    return `${range} If you measured ${n} cm, that is ${n * 10} mm.`;
  return range;
}

function Input({
  m,
  value,
  set,
  locked,
}: {
  m: Measurement;
  value: number | null;
  set: (v: number | null) => void;
  locked: boolean;
}) {
  // The typed text is kept here and only valid numbers reach the fit, so a
  // half-typed "5" on the way to "500" is never saved.
  const [draft, setDraft] = useState(value === null ? "" : String(value)),
    [touched, setTouched] = useState(false);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    // The fit changed from outside (another fit, an import): follow it.
    setShown(value);
    if (draft.trim() === "" ? value !== null : Number(draft) !== value) {
      setDraft(value === null ? "" : String(value));
      setTouched(false);
    }
  }
  const problem = draft.trim() === "" ? "" : rangeProblem(m, Number(draft));
  const errorId = `${m.key}-problem`;
  return (
    <div className="measure">
      <Field label={`${m.label} · ${m.unit}`} hint={m.hint}>
        <input
          type="number"
          step="any"
          inputMode="decimal"
          min={m.min}
          max={m.max}
          disabled={locked}
          value={draft}
          aria-invalid={touched && problem ? true : undefined}
          aria-describedby={touched && problem ? errorId : undefined}
          onChange={(e) => {
            const text = e.target.value;
            setDraft(text);
            if (text.trim() === "") set(null);
            else if (!rangeProblem(m, Number(text))) set(Number(text));
          }}
          onBlur={() => setTouched(true)}
          placeholder="Unknown"
        />
      </Field>
      {touched && problem && (
        <p className="measure-problem" id={errorId} role="alert">
          Not saved. {problem}
        </p>
      )}
      <details className="how">
        <summary>How to measure</summary>
        <ol>
          {m.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p>Used for: {m.usedFor}</p>
      </details>
    </div>
  );
}

export function SetupMeasurements({
  value,
  set,
  locked,
}: {
  value: Profile;
  set: (key: MeasureKey, v: number | null) => void;
  locked: boolean;
}) {
  // After the first experiment the setup is locked so history stays
  // consistent, but a value that was never measured can still be added.
  const [unknownAtStart] = useState(
    () =>
      new Set(
        groups.flatMap((g) => g.keys).filter((key) => value[key] === null),
      ),
  );
  return (
    <>
      {locked && (
        <Notice>
          Settings you already entered are kept as your baseline; log changes to
          them in Ride &amp; refine. You can still add measurements that were
          blank.
        </Notice>
      )}
      <div className="measure-intro">
        <Diagram />
        <div>
          <h3>Before you measure</h3>
          <p>
            You need a tape measure, a string with a small weight on it as a
            plumb line, a spirit level or a phone level app, and a long straight
            edge such as a spare length of wood. Put the bike on a trainer or
            lean it against a wall on level ground.
          </p>
          <p>
            Each number you add unlocks a specific suggestion in your report.
            Leave anything you cannot measure blank; the report says which
            measurement it needs.
          </p>
        </div>
      </div>
      {groups.map((g) => (
        <fieldset key={g.title} className="measure-group">
          <legend>{g.title}</legend>
          {g.note && <p className="muted">{g.note}</p>}
          <div className="form-grid">
            {g.keys.map((key) => (
              <Input
                key={key}
                m={measurement(key)}
                value={value[key]}
                set={(v) => set(key, v)}
                locked={
                  locked &&
                  key !== "riderHeight" &&
                  key !== "shoulderWidth" &&
                  !unknownAtStart.has(key)
                }
              />
            ))}
          </div>
        </fieldset>
      ))}
    </>
  );
}
