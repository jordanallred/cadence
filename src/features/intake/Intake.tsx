import type { Intake as Profile } from "../../domain/types";
import { Field, Check, Notice } from "../../components/Fields";
export function Intake({
  value,
  onChange,
  onNext,
  locked,
}: {
  value: Profile;
  onChange: (i: Profile) => void;
  onNext: () => void;
  locked: boolean;
}) {
  const set = <K extends keyof Profile>(key: K, val: Profile[K]) =>
    onChange({ ...value, [key]: val });
  const num = (
    key: "saddleHeight" | "saddleSetback" | "saddleTilt" | "crankLength",
    label: string,
    hint: string,
  ) => {
    const length = key !== "saddleTilt";
    return (
      <Field label={label + (length ? " · mm" : " · °")} hint={hint}>
        <input
          type="number"
          step="any"
          disabled={locked}
          value={value[key] ?? ""}
          onChange={(e) =>
            set(key, e.target.value === "" ? null : Number(e.target.value))
          }
          placeholder="Unknown"
        />
      </Field>
    );
  };
  return (
    <>
      <div className="section-title">
        <h1>Your starting point</h1>
        <p>
          Who rides, on what bike, and anything that hurts. Leave anything you
          don't know blank.
        </p>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>You & your bike</h2>
        </div>
        <div className="form-grid">
          <Field label="Rider name">
            <input
              maxLength={120}
              value={value.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Your name"
            />
          </Field>
          <Field label="Bike">
            <input
              maxLength={120}
              value={value.bike}
              onChange={(e) => set("bike", e.target.value)}
              placeholder="Make, model and size"
            />
          </Field>
          <Field label="Riding discipline">
            <select
              value={value.discipline}
              onChange={(e) =>
                set("discipline", e.target.value as Profile["discipline"])
              }
            >
              <option value="road">Road</option>
              <option value="gravel">Gravel</option>
              <option value="mountain">Mountain</option>
              <option value="stationary">Stationary</option>
            </select>
          </Field>
          <Field label="Experience">
            <select
              value={value.experience}
              onChange={(e) => set("experience", e.target.value)}
            >
              <option>New rider</option>
              <option>Recreational</option>
              <option>Experienced</option>
              <option>Competitive</option>
            </select>
          </Field>
          <Field label="What would make this fit successful?">
            <input
              maxLength={1000}
              value={value.goal}
              onChange={(e) => set("goal", e.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Comfort & context</h2>
        </div>
        <div className="form-grid">
          <Field label="Main area of discomfort">
            <select
              value={value.symptom}
              onChange={(e) =>
                set("symptom", e.target.value as Profile["symptom"])
              }
            >
              {[
                ["none", "No discomfort"],
                ["knee", "Knee"],
                ["back", "Back"],
                ["neck", "Neck / shoulders"],
                ["hands", "Hands"],
                ["saddle", "Saddle contact"],
                ["feet", "Feet"],
                ["other", "Other"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={`Discomfort · ${value.severity} / 10`}
            hint="0 = none, 10 = worst imaginable"
          >
            <input
              type="range"
              min="0"
              max="10"
              value={value.severity}
              onChange={(e) => set("severity", +e.target.value)}
            />
          </Field>
          <Field
            label="When does it start?"
            hint="Time into a ride, recent onset, or a specific position."
          >
            <input
              maxLength={500}
              value={value.onset}
              onChange={(e) => set("onset", e.target.value)}
              placeholder="e.g. After 45 minutes on the hoods"
            />
          </Field>
          <Field label="Movement limitations or clinician restrictions">
            <input
              maxLength={1500}
              value={value.limitations}
              onChange={(e) => set("limitations", e.target.value)}
              placeholder="Leave blank if none"
            />
          </Field>
        </div>
        <div className="checks">
          <Check
            label="Symptoms also occur off the bike"
            checked={value.outsideCycling}
            onChange={(v) => set("outsideCycling", v)}
          />
          <Check
            label="Symptoms have persisted for weeks or affect daily activities"
            checked={value.persistent}
            onChange={(v) => set("persistent", v)}
          />
          <Check
            label="Training volume or intensity changed recently"
            checked={value.trainingChange}
            onChange={(v) => set("trainingChange", v)}
          />
          <Check
            label="Shoes, saddle or equipment may be contributing"
            checked={value.equipmentIssue}
            onChange={(v) => set("equipmentIssue", v)}
          />
        </div>
        <details className="screen" open={value.screen === "unknown"}>
          <summary>
            Symptom check{" "}
            <span>
              {value.screen === "unknown" ? "Needs an answer" : "Answered"}
            </span>
          </summary>
          <p>
            This is a limited check, not medical clearance. Select the most
            urgent applicable group.
          </p>
          <ul>
            <li>
              <strong>Emergency:</strong> back pain with symptoms in both legs;
              new loss of feeling around the genitals/anus; bladder/bowel
              changes; changed sexual sensation/function; chest pain; or after a
              serious accident.
            </li>
            <li>
              <strong>Urgent back symptoms:</strong> back pain with feeling
              feverish/unwell, or sudden severe or rapidly worsening pain.
            </li>
            <li>
              <strong>Urgent knee symptoms:</strong> very severe pain, inability
              to move or bear weight, major swelling/deformity, locking/giving
              way/painful clicking, or fever with a hot/red knee.
            </li>
          </ul>
          <Field label="Which group applies?">
            <select
              value={value.screen}
              onChange={(e) =>
                set("screen", e.target.value as Profile["screen"])
              }
            >
              <option value="unknown">Not answered / unsure</option>
              <option value="emergency-back">Emergency back-pain group</option>
              <option value="urgent-back">Urgent back-pain group</option>
              <option value="urgent-knee">Urgent knee group</option>
              <option value="none">None of these groups</option>
            </select>
          </Field>
          <small>
            Based on{" "}
            <a
              href="https://www.nhs.uk/conditions/back-pain/"
              target="_blank"
              rel="noreferrer"
            >
              NHS back pain
            </a>{" "}
            and{" "}
            <a
              href="https://www.nhs.uk/symptoms/knee-pain/"
              target="_blank"
              rel="noreferrer"
            >
              knee pain guidance
            </a>
            .
          </small>
        </details>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Record your setup</h2>
          <span>Leave unknown values blank</span>
        </div>
        {locked && (
          <Notice>
            Baseline settings are preserved. Log further changes in Ride &
            refine.
          </Notice>
        )}
        <div className="form-grid">
          {num(
            "saddleHeight",
            "Saddle height",
            "Bottom bracket center to saddle top, measured along the seat-tube line.",
          )}
          {num(
            "saddleSetback",
            "Saddle setback",
            "Horizontal distance behind bottom bracket to saddle nose; negative = in front.",
          )}
          {num(
            "saddleTilt",
            "Saddle tilt",
            "Record your measurement reference. Negative = nose down.",
          )}
          {num(
            "crankLength",
            "Crank length",
            "Usually marked on the crank arm.",
          )}
          <Field label="Cockpit settings & measurement notes">
            <textarea
              disabled={locked}
              maxLength={1000}
              value={value.cockpit}
              onChange={(e) => set("cockpit", e.target.value)}
              placeholder="Stem length, spacers, bar position, saddle reference…"
            />
          </Field>
          <Field label="Other notes">
            <textarea
              maxLength={3000}
              value={value.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
        </div>
        <Check
          label="I checked adjustment limits and torque instructions, and have the right tools"
          checked={value.mechanicalLimits}
          onChange={(v) => set("mechanicalLimits", v)}
        />
      </section>
      <div className="footer-actions">
        <p>You can update comfort information at any time.</p>
        <button className="primary" onClick={onNext}>
          Continue to recordings
        </button>
      </div>
    </>
  );
}
