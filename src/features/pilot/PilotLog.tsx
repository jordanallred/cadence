import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import type { Recommendation, Session } from "../../domain/types";
import {
  buildPilotLog,
  PILOT_CODE,
  PILOT_EXCLUDES,
  PILOT_INCLUDES,
} from "../../fit/pilot";
import { download } from "../../storage/portable";
import { rememberVersion } from "../../storage/version";

/**
 * Footer panel for riders in the pilot: enter the code the pilot lead gave
 * you, see exactly what the file holds, download it.
 */
export function PilotLog({
  session,
  results,
  onCode,
  onClose,
}: {
  session: Session;
  results: Recommendation[];
  onCode: (code: string | undefined) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(session.pilotCode ?? ""),
    [appVersion, setAppVersion] = useState("unknown");
  useEffect(() => {
    void rememberVersion().then((v) =>
      setAppVersion(v ? v.replace(/^cadence\s*/, "") : "unknown"),
    );
  }, []);
  const code = draft.trim().toUpperCase();
  const valid = PILOT_CODE.test(code);
  const log = useMemo(
    () =>
      buildPilotLog(session, results, {
        code: valid ? code : null,
        appVersion,
      }),
    [session, results, code, valid, appVersion],
  );
  return (
    <section className="pilot-log no-print" aria-labelledby="pilot-log-title">
      <div className="pilot-log-head">
        <h2 id="pilot-log-title">Pilot log</h2>
        <button
          className="text-button"
          aria-label="Close pilot log"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <p>
        Only for riders taking part in the Cadence pilot. Your pilot lead will
        ask you to send this file. It never leaves your computer unless you send
        it.
      </p>
      <label className="field pilot-code">
        <span>Participant code</span>
        <input
          value={draft}
          maxLength={6}
          autoComplete="off"
          spellCheck={false}
          placeholder="P07"
          aria-invalid={draft !== "" && !valid}
          aria-describedby="pilot-code-hint"
          onChange={(e) => {
            const next = e.target.value.toUpperCase();
            setDraft(next);
            const c = next.trim();
            onCode(PILOT_CODE.test(c) ? c : undefined);
          }}
        />
        <small id="pilot-code-hint">
          {draft !== "" && !valid
            ? "Letters then numbers, like P07."
            : "From your pilot lead. Not your name."}
        </small>
      </label>
      <div className="pilot-contents">
        <h3>In the file</h3>
        <ul>
          {PILOT_INCLUDES.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p>
          <strong>Not in the file.</strong> {PILOT_EXCLUDES}
        </p>
      </div>
      <details className="pilot-preview">
        <summary>Read the whole file</summary>
        <pre tabIndex={0}>{JSON.stringify(log, null, 2)}</pre>
      </details>
      <button
        className="primary"
        disabled={!valid}
        onClick={() =>
          download(
            `cadence-pilot-${code}-${log.exportedOn}.json`,
            new Blob([JSON.stringify(log, null, 2)], {
              type: "application/json",
            }),
          )
        }
      >
        <Download size={15} />
        Download pilot log
      </button>
    </section>
  );
}
