import { useState } from "react";
import { Eye, FileDown } from "lucide-react";
import type { Recommendation, Session } from "../../domain/types";
import { Check, Field } from "../../components/Fields";
import {
  QUESTION_MAX,
  buildHandoff,
  defaultHandoff,
  handoffFileName,
  type HandoffOptions,
} from "../../fit/handoff";
import { download } from "../../storage/portable";

const size = (bytes: number) =>
  bytes < 1_000_000
    ? `${Math.max(1, Math.round(bytes / 1000))} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * Saves the rider's history as one HTML file for a fitter. Nothing is
 * uploaded; the rider sends or brings the file themselves.
 */
export function ShareWithFitter({
  session,
  results,
}: {
  session: Session;
  results: Recommendation[];
}) {
  const [options, setOptions] = useState<HandoffOptions>(defaultHandoff),
    [saved, setSaved] = useState(""),
    [error, setError] = useState("");
  const set = (patch: Partial<HandoffOptions>) => {
    setOptions({ ...options, ...patch });
    setSaved("");
  };
  const file = () =>
    new Blob([buildHandoff(session, results, options)], {
      type: "text/html",
    });
  const hasName = session.intake.name.trim() !== "";
  return (
    <section className="share" aria-labelledby="share-h">
      <h2 id="share-h">Share with a fitter</h2>
      <p className="muted">
        Saves one file to email or bring to a fitting: your setup, each change
        and whether it helped, your symptom ratings, and what Cadence couldn't
        tell. It opens in any web browser. Nothing is uploaded and no video is
        included.
      </p>
      <Field
        label="What should the fitter look at?"
        hint="Optional. Shown first in the file."
      >
        <textarea
          rows={3}
          maxLength={QUESTION_MAX}
          value={options.question}
          placeholder="For example: my knee still aches after long rides even after raising the saddle."
          onChange={(e) => set({ question: e.target.value })}
        />
      </Field>
      <fieldset className="share-options">
        <legend>Include</legend>
        <Check
          label={
            hasName
              ? `Your name (${session.intake.name.trim()})`
              : "Your name (none entered)"
          }
          checked={options.name && hasName}
          onChange={(v) => set({ name: v })}
        />
        <Check
          label="Your written notes: ride notes, injuries and other notes"
          checked={options.notes}
          onChange={(v) => set({ notes: v })}
        />
        <Check
          label="Still frames from your side-view recordings, with the angles drawn"
          checked={options.stills}
          onChange={(v) => set({ stills: v })}
        />
      </fieldset>
      <div className="share-row">
        <button
          className="secondary"
          onClick={() => {
            try {
              const url = URL.createObjectURL(file());
              window.open(url, "_blank", "noopener");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
              setError("");
            } catch (e) {
              setError("Could not build the file. " + String(e));
            }
          }}
        >
          <Eye size={16} />
          Preview
        </button>
        <button
          className="primary"
          onClick={() => {
            try {
              const blob = file(),
                name = handoffFileName();
              download(name, blob);
              setSaved(`Saved ${name} (${size(blob.size)}).`);
              setError("");
            } catch (e) {
              setError("Could not build the file. " + String(e));
            }
          }}
        >
          <FileDown size={16} />
          Save file for a fitter
        </button>
      </div>
      <p className="muted share-status" role="status">
        {error || saved}
      </p>
      <p className="muted share-back">
        If the fitter changes anything, log each change on Ride &amp; refine
        like any other, so the next file shows whether it helped.
      </p>
    </section>
  );
}
