# Real-rider pilot kit

Cadence's promise is **private bike fit tracking: see your position, change one thing, learn whether it helped.** Nothing so far shows that it keeps that promise for real riders. Every accuracy figure we have comes from a synthetic pedaling model, and nobody outside the project has used the full loop. This pilot is how we find out.

**Goal:** about 20–30 riders and 5 independent fitters, over 90 days. Watch complete fit cycles, measure Cadence against a fitter's goniometer, count failed captures and "not enough evidence" answers, and ask whether people would keep using or recommend it. At day 90, decide against the [gate](gate.md).

## What is in this folder

| File | Who uses it | When |
|---|---|---|
| [protocol.md](protocol.md) | Pilot lead | Start to finish: recruiting, visits, what to collect, analysis |
| [consent-draft.md](consent-draft.md) | Pilot lead, then a qualified reviewer | Before recruiting. **Draft only. It must be reviewed before anyone signs it.** |
| [fitter-guide.md](fitter-guide.md) | Fitters | At each measurement visit |
| [references.csv](references.csv) | Fitters, pilot lead | Fitter readings, in the format `npm run validate` reads |
| [capture-log.csv](capture-log.csv) | Fitters, pilot lead | Every failed capture and every "not enough evidence" answer seen at a visit |
| [day-90-interview.md](day-90-interview.md) | Pilot lead | Closing interview with each rider and each fitter |
| [results-template.md](results-template.md) | Pilot lead | The write-up we publish, good or bad |
| [gate.md](gate.md) | Jordan | Proposed day-90 thresholds. Jordan sets the final numbers before recruiting starts. |

## What the app gives the pilot

**Pilot log** (footer of every screen → *Pilot log*). The rider types the participant code they were given (for example `P07`), can read the whole file on screen, and downloads it. It holds loop timing in hours since the fit started, recording counts, every rejected or failed analysis with its reason code, symptom ratings at the start and now, ride ratings, which setting changed and by how much, the advice given, and the app, rule and pose-model versions. It holds no name, no typed text, no body or bike measurements, no video, stills or joint positions, and no file names. Field list: `src/fit/pilot.ts`.

**Fit backup** (*Back up this fit*). Needed only for the measurement comparison, because `npm run validate` reads clip metrics from it. A backup contains still frames of the rider and joint positions, so it is collected only from riders who agree to that separately in the consent form.

## Decisions Jordan needs to make before recruiting

1. Final gate numbers in [gate.md](gate.md).
2. Who reviews the consent form (see the note at the top of [consent-draft.md](consent-draft.md)).
3. Where pilot logs and backups are sent and stored, and who can open them.
4. How riders and fitters are recruited, and whether fitters are paid for visits.
