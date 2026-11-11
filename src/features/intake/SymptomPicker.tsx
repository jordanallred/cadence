import type { Symptom, SymptomArea } from "../../domain/types";
import { AREAS, GROUPS } from "../../fit/symptoms";

const MAX = 30;

/**
 * Every place it hurts, each with its own side, severity and warning signs.
 * Areas are grouped by body region so the list reads top to bottom like a
 * fitter's questionnaire.
 */
export function SymptomPicker({
  value,
  onChange,
}: {
  value: Symptom[];
  onChange: (v: Symptom[]) => void;
}) {
  const picked = (area: SymptomArea) => value.some((s) => s.area === area);
  const toggle = (area: SymptomArea, on: boolean) =>
    onChange(
      on
        ? [
            ...value,
            { area, side: "both" as const, severity: 4, warning: false },
          ].slice(0, MAX)
        : value.filter((s) => s.area !== area),
    );
  const update = (n: number, patch: Partial<Symptom>) =>
    onChange(value.map((s, k) => (k === n ? { ...s, ...patch } : s)));
  const remove = (n: number) => onChange(value.filter((_, k) => k !== n));
  return (
    <div className="symptom-picker">
      <fieldset>
        <legend>
          Where do you feel pain, numbness or discomfort on the bike?
          <small>
            Tick everything that applies. Leave all blank if riding is
            comfortable.
          </small>
        </legend>
        <div className="symptom-groups">
          {GROUPS.map((g) => (
            <div key={g} className="symptom-group">
              <h3>{g}</h3>
              {(Object.keys(AREAS) as SymptomArea[])
                .filter((a) => AREAS[a].group === g)
                .map((a) => (
                  <label key={a} className="check">
                    <input
                      type="checkbox"
                      checked={picked(a)}
                      onChange={(e) => toggle(a, e.target.checked)}
                    />
                    <span>{AREAS[a].label}</span>
                  </label>
                ))}
            </div>
          ))}
        </div>
      </fieldset>
      {value.length > 0 && (
        <div className="symptom-rows" role="group" aria-label="Your symptoms">
          {value.map((s, n) => {
            const a = AREAS[s.area];
            const id = `symptom-${n}`;
            const other: Symptom["side"] | null =
              a.sided && s.side !== "both"
                ? s.side === "left"
                  ? "right"
                  : "left"
                : null;
            const hasOther =
              other !== null &&
              value.some((x) => x.area === s.area && x.side === other);
            return (
              <div key={s.area + n} className="symptom-row">
                <div className="symptom-row-name">
                  <strong id={id}>{a.label}</strong>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => remove(n)}
                    aria-label={`Remove ${a.label}${a.sided && s.side !== "both" ? `, ${s.side}` : ""}`}
                  >
                    Remove
                  </button>
                </div>
                {a.sided && (
                  <div
                    className="segmented"
                    role="radiogroup"
                    aria-labelledby={id}
                  >
                    {(["left", "right", "both"] as const).map((side) => (
                      <label key={side}>
                        <input
                          type="radio"
                          name={`${id}-side`}
                          checked={s.side === side}
                          disabled={value.some(
                            (x, k) =>
                              k !== n && x.area === s.area && x.side === side,
                          )}
                          onChange={() => update(n, { side })}
                        />
                        <span>
                          {side === "both"
                            ? "Both"
                            : side[0].toUpperCase() + side.slice(1)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {!a.sign && (
                  <label className="severity">
                    <span>
                      How bad <strong>{s.severity}/10</strong>
                    </span>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      value={s.severity}
                      aria-describedby={id}
                      onChange={(e) => update(n, { severity: +e.target.value })}
                    />
                  </label>
                )}
                {!a.sign && s.area !== "other" && (
                  <label className="check warning-check">
                    <input
                      type="checkbox"
                      checked={s.warning}
                      onChange={(e) => update(n, { warning: e.target.checked })}
                    />
                    <span>
                      {a.numb
                        ? "Numbness or weakness lasts hours after the ride"
                        : "Sharp, sudden, getting worse, or swollen"}
                    </span>
                  </label>
                )}
                {other && !hasOther && (
                  <button
                    type="button"
                    className="text-button add-side"
                    onClick={() =>
                      onChange(
                        [
                          ...value.slice(0, n + 1),
                          { ...s, side: other! },
                          ...value.slice(n + 1),
                        ].slice(0, MAX),
                      )
                    }
                  >
                    Add {other} side with its own rating
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
