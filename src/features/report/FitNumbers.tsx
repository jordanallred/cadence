import type { ClipAnalysis, Intake, Recommendation } from "../../domain/types";
import {
  setbackCheck,
  dropCheck,
  barWidthTarget,
  cleatCheck,
  kneeOverBall,
  CLEAT,
  rangeText,
  type Range,
} from "../../fit/targets";
import { measurement, type MeasureKey } from "../../fit/measurements";

type Row = {
  name: string;
  now: string;
  /** What to do, or why there is no number yet. */
  next: string;
  /** Change is recommended (bold), or a placeholder (muted). */
  tone: "change" | "keep" | "missing";
  basis?: string;
};

const mm = (v: number | null, unit = "mm") =>
  v === null ? "Not measured" : `${v} ${unit}`;
const need = (...keys: MeasureKey[]) =>
  `Add your ${keys.map((k) => measurement(k).label.toLowerCase()).join(" and ")} in Your starting point.`;
const span = (e: { minMm: number; maxMm: number }) =>
  rangeText({ min: e.minMm, max: e.maxMm } as Range);
const conf = (r: Recommendation) =>
  r.confidence
    ? `${r.confidence[0].toUpperCase()}${r.confidence.slice(1)} confidence. `
    : "";
const hasHeight = (i: Intake) => i.riderHeight !== null;
const roadOnly = (i: Intake) =>
  i.discipline === "road" || i.discipline === "gravel";

/**
 * Every contact point in one table: what the rider has now, the change the
 * report suggests in millimetres, and why. Numbers come from the same
 * recommendations shown below, so the two never disagree.
 */
export function fitRows(
  i: Intake,
  results: Recommendation[],
  side: ClipAnalysis | undefined,
): Row[] {
  const rec = (id: string) => results.find((r) => r.id === id);
  const rows: Row[] = [];

  // Saddle height
  {
    const r = rec("saddle"),
      ok = rec("saddle-ok");
    const e = r?.estimate;
    rows.push({
      name: "Saddle height",
      now: mm(i.saddleHeight),
      ...(e
        ? {
            tone: "change" as const,
            next: `${e.direction === "raise" ? "Raise" : "Lower"} ${span(e)}${
              i.saddleHeight
                ? `, to ${rangeText(
                    e.direction === "raise"
                      ? {
                          min: i.saddleHeight + e.minMm,
                          max: i.saddleHeight + e.maxMm,
                        }
                      : {
                          min: i.saddleHeight - e.maxMm,
                          max: i.saddleHeight - e.minMm,
                        },
                  )}${e.maxMm > 10 ? "; start with 5 mm" : ""}`
                : ""
            }`,
            basis: conf(r!) + e.basis,
          }
        : r
          ? {
              tone: "change" as const,
              next: r.title,
              basis: need("saddleHeight"),
            }
          : ok
            ? { tone: "keep" as const, next: "Keep", basis: ok.observations }
            : {
                tone: "missing" as const,
                next: "Needs a reviewed side view",
              }),
    });
  }

  // Saddle setback
  {
    const r = rec("setback"),
      check = setbackCheck(i),
      knee = kneeOverBall(i, side);
    const kneeText =
      knee === null
        ? ""
        : ` With the crank forward, your knee is about ${Math.abs(knee)} mm ${knee >= 0 ? "ahead of" : "behind"} the ball of your foot (for information; the plumb-line rule is not validated).`;
    rows.push({
      name: "Saddle setback",
      now: mm(i.saddleSetback),
      ...(r?.estimate
        ? {
            tone: "change" as const,
            next: `${r.outcome === "experiment" ? "Move" : "Optional: move"} ${r.estimate.direction} ${span(r.estimate)}`,
            basis: conf(r) + r.estimate.basis + kneeText,
          }
        : !roadOnly(i)
          ? {
              tone: "missing" as const,
              next: "No measured-rider data for this discipline",
              basis: kneeText.trim() || undefined,
            }
          : check && check.current !== null
            ? {
                tone: "keep" as const,
                next: "Keep",
                basis: `Within what measured road riders use for your saddle height (${rangeText(check.outer)}).${kneeText}`,
              }
            : {
                tone: "missing" as const,
                next: need(
                  ...(["saddleHeight", "saddleSetback"] as MeasureKey[]).filter(
                    (k) => i[k] === null,
                  ),
                ),
                basis: kneeText.trim() || undefined,
              }),
    });
  }

  // Reach and drop come from the same side-view recommendation.
  {
    const r = rec("reach");
    const e = r?.estimate;
    const stem = e && e.setting === "stem" ? e : undefined;
    const spacers = e && e.setting === "spacers" ? e : undefined;
    const acting = r && r.outcome === "experiment";
    const sideAngles = side?.metrics.some((m) => m.id === "shoulder-angle");
    rows.push({
      name: "Reach (stem)",
      now:
        i.barReach !== null || i.stemLength !== null
          ? [
              i.barReach !== null ? `${i.barReach} mm reach` : "",
              i.stemLength !== null ? `${i.stemLength} mm stem` : "",
            ]
              .filter(Boolean)
              .join(", ")
          : "Not measured",
      ...(stem && acting
        ? {
            tone: "change" as const,
            next: hasHeight(i)
              ? `${stem.direction === "shorter" ? "Shorter" : "Longer"} by ${span(stem)} in total; start with a stem 10 mm ${stem.direction}`
              : `Try a stem 10 mm ${stem.direction}`,
            basis:
              conf(r!) +
              stem.basis +
              (hasHeight(i) ? "" : " " + need("riderHeight")),
          }
        : stem
          ? {
              tone: "keep" as const,
              next: "No change while you are comfortable",
              basis: r!.observations,
            }
          : sideAngles
            ? {
                tone: "keep" as const,
                next: "Keep",
                basis: "Arm and shoulder angles are inside the practice range.",
              }
            : {
                tone: "missing" as const,
                next: "Needs a reviewed side view with arms visible",
              }),
    });
    const check = dropCheck(i);
    const pop = check
      ? `Measured road riders with your saddle height mostly use ${rangeText(check.typical)} to the top of the bar.`
      : "";
    rows.push({
      name: "Drop (spacers)",
      now: mm(i.barDrop),
      ...(spacers && acting
        ? {
            tone: "change" as const,
            next: `Raise the bar: move ${span(spacers)} of spacers below the stem`,
            basis:
              `${conf(r!)}${spacers.basis} ${hasHeight(i) ? "" : need("riderHeight")} ${pop}`.trim(),
          }
        : check && check.current !== null && check.move !== 0
          ? {
              tone: "keep" as const,
              next:
                check.move < 0
                  ? "Lower than most riders; keep unless uncomfortable"
                  : "Higher than most riders; keep unless you want a lower position",
              basis: pop,
            }
          : side?.metrics.some((m) => m.id === "torso")
            ? {
                tone: "keep" as const,
                next: "Keep",
                basis:
                  `Torso angle is acceptable for ${i.discipline} riding. ${pop}`.trim(),
              }
            : {
                tone: "missing" as const,
                next: "Needs a reviewed side view",
                basis: pop || undefined,
              }),
    });
  }

  // Handlebar width
  {
    const r = rec("bar-width"),
      t = barWidthTarget(i);
    rows.push({
      name: "Handlebar width",
      now: mm(i.barWidth),
      ...(r?.estimate
        ? {
            tone: "change" as const,
            next: `${t!.size} mm when you next replace the bar`,
            basis: conf(r) + r.estimate.basis,
          }
        : !roadOnly(i)
          ? {
              tone: "missing" as const,
              next: "Set by control and terrain; no shoulder-based target",
            }
          : t && t.current !== null
            ? {
                tone: "keep" as const,
                next: "Keep",
                basis: `Within 20 mm of your ${i.shoulderWidth} mm shoulder width.`,
              }
            : {
                tone: "missing" as const,
                next: need(
                  ...(["shoulderWidth", "barWidth"] as MeasureKey[]).filter(
                    (k) => i[k] === null,
                  ),
                ),
              }),
    });
  }

  // Cleats
  {
    const r = rec("cleat"),
      c = cleatCheck(i);
    rows.push({
      name: "Cleat fore-aft",
      now:
        i.cleatOffset === null
          ? "Not measured"
          : `${Math.abs(i.cleatOffset)} mm ${i.cleatOffset >= 0 ? "behind" : "ahead of"} the ball of the foot`,
      ...(r?.estimate
        ? {
            tone: "change" as const,
            next: `${r.outcome === "experiment" ? "Move" : "Optional: move"} back ${span(r.estimate)}`,
            basis: conf(r) + r.estimate.basis,
          }
        : c
          ? {
              tone: "keep" as const,
              next: "Keep",
              basis:
                c.current <= CLEAT.max
                  ? `Within ${CLEAT.min}–${CLEAT.max} mm behind the ball of the foot.`
                  : "Further back than most riders; a midfoot cleat showed no loss of performance.",
            }
          : { tone: "missing" as const, next: need("cleatOffset") }),
    });
  }
  return rows;
}

export function FitNumbers({
  intake,
  results,
  side,
}: {
  intake: Intake;
  results: Recommendation[];
  side: ClipAnalysis | undefined;
}) {
  // Safety outcomes replace the fit advice; so does this table.
  if (results.some((r) => r.outcome === "assessment" || r.id === "screen"))
    return null;
  const rows = fitRows(intake, results, side);
  return (
    <section className="fit-numbers" aria-labelledby="fit-numbers-title">
      <h2 id="fit-numbers-title">Your numbers</h2>
      <p className="muted">
        Each setting, what you have now and what to change. Make one change at a
        time, in the order of the recommendations below.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Setting</th>
            <th scope="col">Now</th>
            <th scope="col">Suggested</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={r.tone}>
              <th scope="row">{r.name}</th>
              <td>{r.now}</td>
              <td>
                <strong>{r.next}</strong>
                {r.basis && <small>{r.basis}</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
