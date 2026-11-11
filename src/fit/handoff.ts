import {
  viewLabel,
  type ClipAnalysis,
  type FitEvent,
  type KeyMoment,
  type Recommendation,
  type Session,
} from "../domain/types";
import { placeLabels, traceFrame } from "../features/report/labels";
import { showMetric } from "../features/metricFormat";
import { activeExperiment } from "./history";
import { assessContext } from "./assessment";
import {
  compareClips,
  describeChange,
  revisionAfter,
  type MetricChange,
} from "./compare";
import { measurements } from "./measurements";
import { latestRatings, outcomeOf, type Outcome } from "./outcome";
import { nextStep } from "./loop";
import { rangeText, targetRange } from "./ranges";
import { AREAS, symptomName } from "./symptoms";
import { RULE_VERSION } from "./evidence";

/**
 * "Share with a fitter": one HTML file a rider can hand to a fitter. It
 * opens in any browser with nothing to install and nothing uploaded. It
 * holds the rider's history and what Cadence made of it, never video.
 *
 * The file has no script and a content security policy that blocks
 * everything but its own styles and the embedded still frames.
 */
export type HandoffOptions = {
  /** The rider's name. Off by default. */
  name: boolean;
  /** Free text the rider wrote: ride notes, injuries, other notes. */
  notes: boolean;
  /** Side-view still frames with the angles drawn. */
  stills: boolean;
  /** What the rider wants the fitter to look at. */
  question: string;
};

export const defaultHandoff: HandoffOptions = {
  name: false,
  notes: false,
  stills: true,
  question: "",
};

export const QUESTION_MAX = 1000;

/** Setting names as a fitter reads them; the app speaks to the rider. */
const settingName = (m: { key: string; label: string }) =>
  m.key === "riderHeight" ? "Rider height" : m.label;

export function handoffFileName(now = new Date()) {
  return `cadence-fit-history-${now.toISOString().slice(0, 10)}.html`;
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const para = (text: string) =>
  text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
const plural = (n: number, one: string, many = one + "s") =>
  `${n} ${n === 1 ? one : many}`;

const isSide = (c: ClipAnalysis) => c.view === "left" || c.view === "right";
const rejected = (c: ClipAnalysis) =>
  c.quality.some((q) => q.severity === "reject") || !c.metrics.length;
const usable = (c: ClipAnalysis) => !rejected(c);

const RESPONSE = {
  better: "better than before",
  same: "about the same",
  worse: "worse than before",
} as const;

const DISCIPLINE = {
  road: "Road",
  gravel: "Gravel",
  mountain: "Mountain",
  stationary: "Indoor trainer",
} as const;

/** Setups with a usable side view, oldest first. */
function sideSetups(session: Session): number[] {
  return [
    ...new Set(
      session.clips
        .filter((c) => isSide(c) && usable(c))
        .map((c) => c.setupRevision),
    ),
  ].sort((a, b) => a - b);
}

/** Newest usable side clip at a setup, preferring one with stills. */
function sideAt(session: Session, rev: number, view?: ClipAnalysis["view"]) {
  const pool = session.clips.filter(
    (c) => c.setupRevision === rev && isSide(c) && usable(c),
  );
  const same = view ? pool.filter((c) => c.view === view) : [];
  const pick = (list: ClipAnalysis[]) =>
    list.reduce<ClipAnalysis | undefined>(
      (best, c) =>
        !best ||
        (c.keyframes?.length ?? 0) > (best.keyframes?.length ?? 0) ||
        ((c.keyframes?.length ?? 0) === (best.keyframes?.length ?? 0) &&
          c.createdAt >= best.createdAt)
          ? c
          : best,
      undefined,
    );
  return pick(same) ?? pick(pool);
}

const MOMENT_NAME: Record<KeyMoment["position"], string> = {
  extension: "Leg most extended",
  top: "Top of the stroke",
};

/** A still frame with the body traced and the angles drawn, as SVG. */
export function stillSvg(clip: ClipAnalysis, moment: KeyMoment): string {
  const frame = clip.frames.find((f) => f.timeMs === moment.timeMs);
  if (!frame || !moment.image) return "";
  const W = clip.width,
    H = clip.height,
    size = Math.max(W, H);
  const { angles, limbs, joints } = traceFrame(
    frame.points,
    clip.view,
    moment.position,
    (id) => clip.metrics.find((m) => m.id === id)?.value,
    W,
    H,
  );
  // Drawn for a frame shown about 400 px wide, as in the printed file.
  const px = W / 400;
  const stroke = Math.max(size / 260, 1.4 * px);
  const font = Math.max(size * 0.022, 12 * px);
  const n = (v: number) => Math.round(v * 10) / 10;
  const unit = (v: { x: number; y: number }) => {
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  };
  const parts: string[] = [
    `<image href="${esc(moment.image)}" width="${W}" height="${H}"/>`,
  ];
  for (const a of angles) {
    if (!a.reference) continue;
    const u = unit(a.from),
      len = size * 0.11;
    parts.push(
      `<line x1="${n(a.at.x)}" y1="${n(a.at.y)}" x2="${n(a.at.x + u.x * len)}" y2="${n(a.at.y + u.y * len)}" class="ref" stroke-width="${n(stroke * 0.9)}" stroke-dasharray="${n(stroke * 2.5)} ${n(stroke * 2)}"/>`,
    );
  }
  for (const l of limbs) {
    const pts = l.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
    parts.push(
      `<polyline points="${pts}" class="under" stroke-width="${n(stroke * 2.6)}"/><polyline points="${pts}" class="limb" stroke-width="${n(stroke)}"/>`,
    );
  }
  for (const { text, p, q, r, sweep, x, y } of placeLabels(
    angles,
    limbs,
    W,
    H,
    font,
  ))
    parts.push(
      `<path d="M ${n(p.x)} ${n(p.y)} A ${n(r)} ${n(r)} 0 0 ${sweep} ${n(q.x)} ${n(q.y)}" class="arc" stroke-width="${n(stroke * 1.4)}"/><text x="${n(x)}" y="${n(y)}" font-size="${n(font)}" text-anchor="middle" dominant-baseline="middle">${esc(text)}</text>`,
    );
  for (const p of joints)
    if (p)
      parts.push(
        `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${n(stroke * 1.8)}" class="joint" stroke-width="${n(stroke * 0.6)}"/>`,
      );
  const described = angles
    .map((a) => `${a.name} ${Math.round(a.value)} degrees`)
    .join(", ");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${MOMENT_NAME[moment.position]}, body traced. ${described}.`)}">${parts.join("")}</svg>`;
}

const VERDICT_CLASS: Record<Outcome["verdict"], string> = {
  helped: "good",
  "no-difference": "flat",
  worse: "bad",
  mixed: "unsure",
  "too-early": "unsure",
};

export function buildHandoff(
  session: Session,
  results: Recommendation[],
  options: HandoffOptions,
  now = new Date(),
): string {
  const i = session.intake;
  const events = session.events;
  const adjustments = events.filter((e) => e.kind === "adjustment");
  const decision = (id: string) =>
    events.find(
      (e) =>
        (e.kind === "retain" || e.kind === "revert") && e.experimentId === id,
    );
  const active = activeExperiment(session);
  const outcomes = new Map(
    adjustments.map((e) => [e.id, outcomeOf(session, e)]),
  );
  const next = nextStep(session, results);
  const urgent = assessContext(i, events).find((r) => r.urgency !== "routine");
  const riderName = options.name && i.name.trim() ? i.name.trim() : "";
  const question = options.question.trim().slice(0, QUESTION_MAX);

  // ---- Handoff summary -------------------------------------------------
  const ratings = latestRatings(session);
  const symptomRows = i.symptoms.map((s) => {
    const rated = ratings.find((r) => r.area === s.area && r.side === s.side);
    const flagged = s.warning
      ? ` <span class="flag">Marked sharp, sudden or worsening. Cadence held bike changes for this area and pointed the rider to ${esc(AREAS[s.area].clinician ?? "a clinician")}.</span>`
      : "";
    const sign = AREAS[s.area].sign ? " (something noticed, not felt)" : "";
    const start = s.severity,
      latest = rated?.severity ?? start;
    return `<tr><th scope="row">${esc(cap(symptomName(s)))}${sign}${flagged}</th><td class="num">${start}/10</td><td class="num">${latest === start ? "same" : latest + "/10"}</td></tr>`;
  });
  const kept = adjustments.filter((e) => decision(e.id)?.kind === "retain");
  const reverted = adjustments.filter((e) => decision(e.id)?.kind === "revert");
  const status: string[] = [];
  status.push(
    adjustments.length
      ? `${plural(adjustments.length, "change")} tried since ${date(session.createdAt)}: ${kept.length} kept, ${reverted.length} reverted${active ? ", 1 still being tried" : ""}.`
      : `No changes logged yet. Fit started ${date(session.createdAt)}.`,
  );
  if (active) {
    const o = outcomes.get(active.id)!;
    status.push(
      `Trying now: ${describeChange(active, session)}. So far: ${o.title.toLowerCase()}.`,
    );
  }
  status.push(`Cadence's next step for the rider: ${next.title}.`);

  const about = [
    i.bike.trim() && `<div><dt>Bike</dt><dd>${esc(i.bike.trim())}</dd></div>`,
    `<div><dt>Riding</dt><dd>${DISCIPLINE[i.discipline]}${i.experience.trim() ? ", " + esc(i.experience.trim().toLowerCase()) : ""}</dd></div>`,
    i.goal.trim() && `<div><dt>Goal</dt><dd>${esc(i.goal.trim())}</dd></div>`,
    i.mechanicalLimits &&
      `<div><dt>Limits</dt><dd>The rider confirmed the bike's adjustment limits and torque values before changing anything.</dd></div>`,
  ]
    .filter(Boolean)
    .join("");

  const context = [
    i.outsideCycling && "symptoms also happen off the bike",
    i.trainingChange && "training load changed recently",
    i.equipmentIssue && "equipment changed recently",
    i.persistent && "symptoms have lasted a long time",
  ].filter(Boolean) as string[];

  const riderNotes = options.notes
    ? ([
        i.onset.trim() && ["When it started", i.onset],
        i.limitations.trim() && ["Injuries and limits", i.limitations],
        i.cockpit.trim() && ["Cockpit and contact points", i.cockpit],
        i.notes.trim() && ["Other notes", i.notes],
      ].filter(Boolean) as [string, string][])
    : [];

  const summary = `
<section aria-labelledby="h-summary">
  <h2 id="h-summary">Handoff</h2>
  <div class="question">
    <h3>The rider's question</h3>
    ${question ? para(question) : `<p class="quiet">The rider did not add a question.</p>`}
  </div>
  <ul class="status">${status.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
  ${about ? `<dl class="about">${about}</dl>` : ""}
  ${
    symptomRows.length
      ? `<table class="symptoms"><caption>Symptoms, rated by the rider from 0 (gone) to 10</caption><thead><tr><th scope="col">Where</th><th scope="col" class="num">At the start</th><th scope="col" class="num">Latest</th></tr></thead><tbody>${symptomRows.join("")}</tbody></table>`
      : `<p>The rider reported no symptoms. The goal is ${esc((i.goal.trim() || "comfort").toLowerCase())}.</p>`
  }
  ${context.length ? `<p>The rider also said: ${esc(context.join("; "))}.</p>` : ""}
  ${riderNotes.map(([h, t]) => `<div class="note"><h3>${esc(h)}</h3>${para(t)}</div>`).join("")}
</section>`;

  // ---- Current setup ---------------------------------------------------
  const base = session.baseline ?? i;
  const setupRows = measurements.map((m) => {
    const v = i[m.key],
      b = base[m.key];
    const show = (x: number | null) =>
      x === null
        ? `<span class="quiet">not measured</span>`
        : `${x}${m.unit === "°" ? "°" : " " + m.unit}`;
    return `<tr><th scope="row">${esc(settingName(m))}</th><td class="num">${show(v)}</td><td class="num">${b === v ? `<span class="quiet">same</span>` : show(b)}</td><td class="fill" aria-label="Blank for the fitter"></td></tr>`;
  });
  const setup = `
<section aria-labelledby="h-setup">
  <h2 id="h-setup">Current setup</h2>
  <p>Measured by the rider at home. Saddle height runs from the centre of the crank axle to the top of the saddle along the seat tube.</p>
  <table class="setup"><thead><tr><th scope="col">Setting</th><th scope="col" class="num">Now</th><th scope="col" class="num">At the first recording</th><th scope="col">Changed to <span class="quiet">(fitter)</span></th></tr></thead><tbody>${setupRows.join("")}</tbody></table>
</section>`;

  // ---- History ---------------------------------------------------------
  const rev = revisionAfter(session);
  const rideRow = (e: FitEvent) => {
    const bits = [
      e.duration !== undefined &&
        `${e.duration} min${e.intensity ? " " + e.intensity : ""}`,
      e.comfort !== undefined && `comfort ${e.comfort}/10`,
      e.response && RESPONSE[e.response],
      e.symptoms?.length &&
        e.symptoms
          .map(
            (r) =>
              `${symptomName({ ...r, severity: Math.max(1, r.severity), warning: false })} ${r.severity}/10`,
          )
          .join(", "),
    ].filter(Boolean) as string[];
    const note =
      options.notes && e.detail.trim()
        ? `<div class="ride-note">${para(e.detail)}</div>`
        : "";
    return `<li><span class="when">${date(e.at)}</span> ${esc(cap(bits.join("; ")) || "Ride logged")}.${note}</li>`;
  };
  const firstChange = events.findIndex(
    (e) => e.kind === "adjustment" || e.kind === "revert",
  );
  const baselineRides = events
    .slice(0, firstChange < 0 ? events.length : firstChange)
    .filter((e) => e.kind === "ride");
  const firstClip = [...session.clips].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )[0];
  const entries: string[] = [];
  entries.push(`<li class="entry">
  <h3>Starting point</h3>
  <p class="meta">${firstClip ? `First recording ${date(firstClip.createdAt)}` : "No recording yet"}</p>
  ${baselineRides.length ? `<ul class="rides">${baselineRides.map(rideRow).join("")}</ul>` : ""}
</li>`);
  for (const e of adjustments) {
    const o = outcomes.get(e.id)!;
    const d = decision(e.id);
    const rides = events.filter(
      (x) => x.kind === "ride" && x.experimentId === e.id,
    );
    const why =
      e.setting && e.setting !== "other" && options.notes && e.detail.trim()
        ? `<p class="why">${esc(e.detail.trim())}</p>`
        : "";
    const end = d
      ? `${d.kind === "retain" ? "Kept" : "Reverted"} ${date(d.at)}.${d.kind === "revert" && options.notes && d.detail.trim() ? " " + esc(d.detail.trim()) : ""}`
      : "Still being tried.";
    const symptomTable = o.symptoms.length
      ? `<table class="compact"><thead><tr><th scope="col">Symptom</th><th scope="col" class="num">Before</th><th scope="col" class="num">Latest ride</th></tr></thead><tbody>${o.symptoms.map((s) => `<tr><th scope="row">${esc(cap(s.name))}</th><td class="num">${s.before}/10</td><td class="num">${s.after}/10</td></tr>`).join("")}</tbody></table>`
      : "";
    entries.push(`<li class="entry">
  <h3>${esc(describeChange(e, session))}</h3>
  <p class="meta">Logged ${date(e.at)}, setup ${(rev.get(e.id) ?? 0) + 1}. ${end}</p>
  ${why}
  <p class="verdict ${VERDICT_CLASS[o.verdict]}"><strong>${esc(o.title)}</strong></p>
  <ul class="reasons">${o.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}<li>${o.video ? "Video: " + esc(o.video.text) : `<span class="quiet">No side-view recording after this change.</span>`}</li></ul>
  ${symptomTable}
  ${rides.length ? `<ul class="rides">${rides.map(rideRow).join("")}</ul>` : ""}
</li>`);
  }
  const history = `
<section aria-labelledby="h-history">
  <h2 id="h-history">History</h2>
  <p>Cadence asks riders to change one thing at a time. A verdict comes from the rider's symptom ratings and how rides felt: a rating change of 2 or more out of 10 counts, two rides are needed unless the change made things worse, and the video only says whether the position actually moved.</p>
  <ol class="history">${entries.join("")}</ol>
</section>`;

  // ---- Position --------------------------------------------------------
  const setups = sideSetups(session);
  let position = "";
  if (setups.length) {
    const lastRev = setups[setups.length - 1],
      firstRev = setups[0];
    const after = sideAt(session, lastRev)!;
    const before =
      firstRev === lastRev ? undefined : sideAt(session, firstRev, after.view);
    const shown = before ? [before, after] : [after];
    const label = (c: ClipAnalysis) =>
      c === before
        ? `First recording, ${date(c.createdAt)}`
        : `${before ? "Latest" : "Only"} recording, ${date(c.createdAt)}`;
    const compared: MetricChange[] = before
      ? compareClips(before, after, i)
      : [];
    const metricIds = [
      "knee-min",
      "knee-max",
      "hip",
      "torso",
      "shoulder-angle",
      "elbow",
      "ankle-rom",
      "kops",
    ];
    const rows = metricIds.flatMap((id) => {
      const a = after.metrics.find((m) => m.id === id);
      if (!a) return [];
      const b = before?.metrics.find((m) => m.id === id);
      const range = targetRange(id, i);
      const c = compared.find((x) => x.id === id);
      const spread = (s?: number) => (s ? ` <small>±${s}</small>` : "");
      return [
        `<tr><th scope="row">${esc(a.label)}</th>${before ? `<td class="num" data-label="First">${b ? esc(showMetric(b.value, b.unit)) + spread(b.spread) : "—"}</td>` : ""}<td class="num" data-label="${before ? "Latest" : "Value"}">${esc(showMetric(a.value, a.unit))}${spread(a.spread)}</td><td data-label="Target">${range ? esc(rangeText(range, a.unit)) : `<span class="quiet">none</span>`}</td>${before ? `<td class="change">${c ? esc(c.verdict) : ""}</td>` : ""}</tr>`,
      ];
    });
    const moments: KeyMoment["position"][] = ["extension", "top"];
    const stills = options.stills
      ? moments.flatMap((pos) => {
          const figs = shown.flatMap((c) => {
            const k = (c.keyframes ?? []).find(
              (x) => x.position === pos && x.image,
            );
            const svg = k ? stillSvg(c, k) : "";
            return svg
              ? [
                  `<figure>${svg}<figcaption>${esc(label(c))}</figcaption></figure>`,
                ]
              : [];
          });
          return figs.length
            ? [
                `<div class="moment"><h3>${MOMENT_NAME[pos]}</h3><div class="pair">${figs.join("")}</div></div>`,
              ]
            : [];
        })
      : [];
    const unreviewed = shown.filter((c) => !c.reviewed);
    position = `
<section aria-labelledby="h-position">
  <h2 id="h-position">Position on the bike</h2>
  <p>${viewLabel(after.view)} view${before ? `. First recording at setup ${firstRev + 1}, latest at setup ${lastRev + 1}` : `, setup ${lastRev + 1}`}. Angles are medians across every pedal stroke analyzed; ± is the spread of the middle half of strokes.${unreviewed.length ? ` The tracking on ${unreviewed.length === shown.length && shown.length > 1 ? "these recordings was" : "the " + (unreviewed[0] === before ? "first" : "latest") + " recording was"} not checked by the rider frame by frame.` : ""}</p>
  ${stills.join("")}
  ${!options.stills ? `<p class="quiet">The rider chose not to include still frames.</p>` : !stills.length ? `<p class="quiet">These recordings were analyzed before Cadence kept still frames, so only the numbers are shown.</p>` : ""}
  <table class="metrics"><thead><tr><th scope="col">Measurement</th>${before ? `<th scope="col" class="num">First</th>` : ""}<th scope="col" class="num">${before ? "Latest" : "Value"}</th><th scope="col">Target</th>${before ? `<th scope="col">Change</th>` : ""}</tr></thead><tbody>${rows.join("")}</tbody></table>
</section>`;
  }

  // Front and rear views: numbers only.
  const frontRear = (["front", "rear"] as const).flatMap((v) => {
    const c = session.clips
      .filter((x) => x.view === v && usable(x))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!c) return [];
    const rows = c.metrics
      .filter((m) => m.id !== "cycles" && m.id !== "cadence")
      .map(
        (m) =>
          `<tr><th scope="row">${esc(m.label)}</th><td class="num">${esc(showMetric(m.value, m.unit))}${m.spread ? ` <small>±${m.spread}</small>` : ""}</td></tr>`,
      );
    return [
      `<h3>${viewLabel(v)} view, ${date(c.createdAt)}, setup ${c.setupRevision + 1}</h3><table class="compact"><tbody>${rows.join("")}</tbody></table>`,
    ];
  });
  const otherViews = frontRear.length
    ? `<section aria-labelledby="h-views"><h2 id="h-views">Front and rear</h2>${frontRear.join("")}</section>`
    : "";

  // ---- What Cadence couldn't tell --------------------------------------
  const unknowns: string[] = [];
  for (const e of adjustments) {
    const o = outcomes.get(e.id)!;
    if (o.verdict === "too-early" || o.verdict === "mixed")
      unknowns.push(
        `${describeChange(e, session)}: ${o.title.toLowerCase()}. ${o.reasons[0]}`,
      );
    if (o.video?.change.withinNoise && o.verdict !== "too-early")
      unknowns.push(
        `${describeChange(e, session)}: the video showed no measurable change in position, so the verdict rests on how riding felt.`,
      );
  }
  const bad = session.clips.filter(rejected);
  if (bad.length)
    unknowns.push(
      `${plural(bad.length, "recording")} could not be measured and ${bad.length === 1 ? "was" : "were"} left out: ${bad
        .map((c) => {
          const why = c.quality.find((q) => q.severity === "reject");
          return `${viewLabel(c.view).toLowerCase()} view on ${date(c.createdAt)}${why ? " (" + why.message.replace(/\.$/, "").toLowerCase() + ")" : ""}`;
        })
        .join("; ")}.`,
    );
  if (!session.clips.some((c) => isSide(c) && usable(c)))
    unknowns.push(
      "No usable side view, so knee, hip and torso angles were not measured.",
    );
  const hasFront = session.clips.some(
    (c) => (c.view === "front" || c.view === "rear") && usable(c),
  );
  if (!hasFront)
    unknowns.push(
      "No front or rear view, so side-to-side knee movement, hip rocking and shoulder tilt were not measured. Cleat rotation and stance width cannot be seen on video at all.",
    );
  const unmeasured = measurements.filter((m) => i[m.key] === null);
  if (unmeasured.length)
    unknowns.push(
      `Not measured by the rider: ${unmeasured.map((m) => settingName(m).toLowerCase()).join(", ")}.`,
    );
  const low = session.clips
    .filter(usable)
    .flatMap((c) => c.metrics.filter((m) => m.confidence === "low"));
  if (low.length)
    unknowns.push(
      `Low confidence (wide stroke-to-stroke spread or few strokes): ${[...new Set(low.map((m) => m.label.toLowerCase()))].join(", ")}.`,
    );
  if (urgent)
    unknowns.unshift(
      `The rider's safety answers say: ${urgent.title.toLowerCase()}. Cadence stopped giving bike changes.`,
    );
  const gaps = `
<section aria-labelledby="h-gaps">
  <h2 id="h-gaps">What Cadence couldn't tell</h2>
  ${unknowns.length ? `<ul class="gaps">${unknowns.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : `<p>Nothing flagged. That does not mean the record is complete; see the limits below.</p>`}
</section>`;

  // ---- Limits and the way back ----------------------------------------
  const limits = `
<section aria-labelledby="h-back">
  <h2 id="h-back">If you change anything</h2>
  <p>Write the new value in the “Changed to” column, in millimetres or degrees, and how you measured it. The rider logs each change in Cadence as an ordinary adjustment and rides with it, so the next file shows whether it helped. Cadence judges one change at a time; if several settings change together, the rider logs them as one change and Cadence cannot say which one mattered.</p>
</section>
<section aria-labelledby="h-limits" class="limits">
  <h2 id="h-limits">Limits of this record</h2>
  <ul>
    <li>Angles come from a pose model run on ordinary 2D video at home. Camera angle, distance, clothing and lighting all move them. Cadence's accuracy has been checked on synthetic and sample videos only, not against measurements of real riders by a fitter.</li>
    <li>Lengths in millimetres that come from video scale the body by the rider's height using average proportions, so they carry roughly ±40% uncertainty.</li>
    <li>Setup values and symptom ratings are entered by the rider and were not checked by Cadence.</li>
    <li>Target ranges are research findings for the knee and common fitting practice elsewhere, not rules for this rider.</li>
    <li>Cadence is not a medical device and does not diagnose. Pain that is sharp, sudden, worsening or lasts after riding needs a clinician.</li>
  </ul>
  <p class="quiet">No video is included. Decision rules ${RULE_VERSION}.</p>
</section>`;

  const title = riderName
    ? `Fit history: ${riderName}`
    : "Fit history for a bike fitter";
  const subtitle = [
    riderName ? "" : "Rider's name not shared",
    i.bike.trim(),
    `Prepared ${date(now.toISOString())} with Cadence`,
  ]
    .filter(Boolean)
    .map(esc)
    .join(". ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<meta name="referrer" content="no-referrer">
<meta name="generator" content="Cadence">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<header>
  <h1>${esc(title)}</h1>
  <p class="sub">${subtitle}.</p>
</header>
${urgent ? `<p class="alert" role="alert"><strong>${esc(urgent.title)}.</strong> ${esc(urgent.action)}</p>` : ""}
${summary}
${setup}
${history}
${position}
${otherViews}
${gaps}
${limits}
</main>
</body>
</html>
`;
}

const CSS = `
:root{color-scheme:light;--ink:#233c35;--muted:#57685f;--line:#dfe5de;--green:#164d3e;--lime:#d6edb2;--good:#1f6b3a;--bad:#9b2c1f;--unsure:#7a5a12}
*{box-sizing:border-box}
body{margin:0;background:#f7f8f5;color:var(--ink);font:16px/1.55 "Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:880px;margin:0 auto;padding:40px 24px 64px;background:#fff;min-height:100vh}
header{border-bottom:2px solid var(--green);padding-bottom:16px;margin-bottom:8px}
h1{font-size:30px;line-height:1.2;margin:0 0 6px;color:var(--green);letter-spacing:-.01em}
h2{font-size:21px;margin:40px 0 10px;color:var(--green)}
h3{font-size:16px;margin:20px 0 6px}
p{margin:0 0 10px}
.sub,.meta,.quiet,figcaption,caption,small{color:var(--muted)}
.sub{margin:0}
.alert{border-left:4px solid var(--bad);padding:10px 14px;background:#fbefed;margin-top:20px}
.question{border-left:4px solid var(--green);padding:2px 0 2px 16px;margin:14px 0 18px}
.question h3{margin-top:0}
.question p:last-child{margin-bottom:0}
.status{padding-left:20px;margin:0 0 16px}
.about{display:grid;grid-template-columns:max-content 1fr;gap:4px 18px;margin:0 0 16px}
.about div{display:contents}
.about dt{color:var(--muted)}
.about dd{margin:0}
.flag{display:block;font-weight:400;color:var(--bad);font-size:14px}
.note h3{font-size:15px;margin-bottom:2px}
table{width:100%;border-collapse:collapse;margin:8px 0 14px;font-size:15px}
caption{text-align:left;font-size:14px;padding-bottom:6px}
th,td{text-align:left;padding:7px 10px 7px 0;border-bottom:1px solid var(--line);vertical-align:top}
thead th{font-size:13px;font-weight:600;color:var(--muted);border-bottom:1px solid var(--ink)}
tbody th{font-weight:500}
.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.metrics td[data-label=Target]{white-space:nowrap}
td.fill{min-width:120px;border-bottom:1px solid var(--muted)}
.setup td.num{width:1%}
table.compact{max-width:520px}
.history{list-style:none;padding:0;margin:0}
.entry{border-top:1px solid var(--line);padding:4px 0 10px}
.entry h3{font-size:17px}
.why{font-style:italic}
.verdict{margin:8px 0 4px}
.verdict strong{padding-left:10px;border-left:4px solid var(--muted)}
.verdict.good strong{border-color:var(--good);color:var(--good)}
.verdict.bad strong{border-color:var(--bad);color:var(--bad)}
.verdict.unsure strong{border-color:var(--unsure);color:var(--unsure)}
.reasons,.rides,.gaps,.limits ul{padding-left:20px;margin:4px 0 10px}
.rides{font-size:15px}
.rides li{margin-bottom:3px}
.when{font-variant-numeric:tabular-nums;color:var(--muted);margin-right:4px}
.ride-note{border-left:2px solid var(--line);padding-left:10px;margin:4px 0;color:var(--ink)}
.ride-note p{margin:0}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
figure{margin:0}
figure svg{display:block;width:100%;height:auto;max-height:70vh;border-radius:4px;background:#0d1d17}
figcaption{font-size:14px;margin-top:6px}
svg .under{fill:none;stroke:#0d1d17;stroke-opacity:.45;stroke-linejoin:round;stroke-linecap:round}
svg .limb{fill:none;stroke:#fff;stroke-linejoin:round;stroke-linecap:round}
svg .ref{stroke:#fff;stroke-opacity:.9}
svg .arc{fill:none;stroke:var(--lime)}
svg .joint{fill:var(--green);stroke:#fff}
svg text{fill:#fff;font-weight:600;paint-order:stroke;stroke:#0d1d17;stroke-width:.22em;stroke-opacity:.75;font-family:inherit}
.limits{font-size:15px}
@media (max-width:560px){main{padding:24px 16px 48px}.metrics,.metrics tbody{display:block}.metrics .num{white-space:normal}.metrics thead{display:none}.metrics tr{display:block;border-bottom:1px solid var(--line);padding:8px 0}.metrics th,.metrics td{display:inline;border:0;padding:0}.metrics tbody th{display:block;font-weight:600}.metrics td[data-label]::before{content:attr(data-label) " ";color:var(--muted)}.metrics td[data-label]::after{content:".  "}.metrics td.change{display:block;margin-top:2px}h1{font-size:25px}.setup th:nth-child(3),.setup td:nth-child(3){display:none}table{font-size:14px}td.fill{min-width:80px}}
@media print{@page{margin:14mm}body{background:#fff;font-size:11pt}main{padding:0;max-width:none;min-height:0}h2{margin-top:22px;break-after:avoid}.entry,figure,tr,.question{break-inside:avoid}.moment{break-inside:avoid}figure svg{max-height:95mm}}
`;
