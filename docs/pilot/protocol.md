# Pilot protocol

Version 0.1 (draft, 2026-11-11). Owner: pilot lead.

## 1. Questions the pilot answers

1. **Do riders complete the loop?** Baseline recording → one change → at least one ride with it → re-record → keep or revert. This is the main product metric.
2. **How close are Cadence's angles to a fitter's?** Bias, mean absolute error and 95% limits of agreement for knee extension, knee flexion at the top of the stroke, torso angle and elbow flexion, from `npm run validate`.
3. **How often does capture fail, and why?** Every rejected or failed analysis with its reason code, from the pilot logs and the fitters' [capture log](capture-log.csv).
4. **When does Cadence say "not enough evidence", and is it right to?** Every *review the overlays*, *start with a side view*, *check the difference between side views* or rejected-recording answer, and whether the fitter agreed it was the right call.
5. **Would riders keep using it or recommend it, and would fitters refer riders or pay for a review workflow?** From the [day-90 interview](day-90-interview.md).

What it does not answer: whether Cadence's advice reduces pain. The sample is too small and there is no control group. Report symptom changes descriptively and never as an effect.

## 2. People

**Riders: 20–30.** Adults (18+) who ride at least twice a week and are willing to make one bike change and record again. Aim for spread in height, sex, bike type (road, gravel, mountain, indoor trainer) and experience. Around half with a current discomfort, half without.

Exclude, and refer on, anyone who at screening falls in one of the app's emergency or urgent groups (*Your starting point → safety check*): for example back pain with symptoms in both legs, new numbness around the groin, bladder or bowel changes, sudden severe or rapidly worsening back pain, or a knee that locks, gives way, cannot bear weight or is hot and swollen. Exclude anyone under active treatment for a cycling injury unless their clinician agrees.

**Fitters: 5.** Independent, with at least two years of paid fitting and their own measurement method (a long-arm goniometer at minimum). Not paid by or connected to the project beyond a visit fee, so their readings and opinions are independent.

**Pilot lead:** recruits, assigns participant codes, keeps the code list, collects files, runs the analysis. The code list (code → name and contact) is the only place a name meets a code. Keep it separate from every other pilot file.

## 3. Participant codes and file names

- Riders: `P01`–`P30`. Fitters: `F1`–`F5`.
- In Cadence, the rider leaves *Name* blank or enters their code.
- Videos for the measurement comparison are named `<code>-<visit>-<view>.mp4` before import, for example `P07-v1-left.mp4`. `npm run validate` matches fitter readings to clips by this name. Webcam recordings in the app are all called `camera-recording`, so measurement-visit clips must be recorded on a phone or camera and imported.

## 4. Timeline per rider

| Day | What happens | Who | Collected |
|---|---|---|---|
| 0 | Consent, code, screening, install Cadence | Pilot lead | Signed consent, code list entry |
| 0–7 | **Visit 1** with a fitter: rider records a baseline in Cadence while the fitter takes goniometer readings on the same pedaling bout | Rider, fitter | Fitter readings → `references.csv`; capture problems → `capture-log.csv`; fit backup (if consented) |
| 7–80 | Rider uses Cadence on their own: change one thing, ride, re-record, keep or revert, as many cycles as they like. No prompts from the team beyond one reminder at day 30 and day 60 | Rider | Nothing until day 90 |
| ~60 | **Visit 2** (optional, for 10+ riders): repeat the measurement visit on the rider's current setup | Rider, fitter | As visit 1 |
| 90 | Rider downloads the pilot log and sends it. Closing interview | Rider, pilot lead | Pilot log, interview notes |

Fitters are interviewed once, after their last visit.

## 5. Measurement visit

Follow [fitter-guide.md](fitter-guide.md). In short: camera set up the way Cadence's framing guide asks; rider warms up 5 minutes; the fitter marks hip, knee, ankle, shoulder, elbow and wrist; the rider pedals steadily at their usual cadence on a trainer while one 20–30 s clip per view is recorded; the fitter takes their readings during the same bout. The rider imports the clip into Cadence and reviews the overlay as any rider would. The fitter does not help with Cadence beyond what the app's own text says, because we are testing the app, not the fitter's coaching.

Every failed capture, rejected clip and "not enough evidence" answer goes in `capture-log.csv` with what the fitter saw, whether a second attempt worked, and whether the fitter agreed the answer was right.

## 6. Data handling

- **Pilot log:** anonymous by design (see `src/fit/pilot.ts`). Stored with the participant code only.
- **Fit backup:** contains still frames, joint positions, symptoms and anything the rider typed. Collected only with the separate consent box ticked. Stored encrypted, opened only by the pilot lead for `npm run validate`, deleted within 30 days of the results being published.
- **Videos:** not collected. Riders keep their own.
- **References and capture log:** codes only, no names.
- **Interview notes:** codes only. Quotes are published only with a code and only if the rider agreed.
- Nothing from the pilot is uploaded to any service by the app. Riders send files themselves, to the destination Jordan chooses.

## 7. Analysis

1. **Loop.** From the pilot logs: per rider, `loop.cyclesComplete`, hours from baseline to first keep-or-revert, and where riders who never completed a cycle stopped (no baseline, no change, no ride, no re-record, no decision).
2. **Measurement.** `npm run validate -- docs/pilot/references.csv backups/*.json`, once per reference method (`--method goniometer-dynamic`, then each other method used). Report every metric, including ones that miss the target or have fewer than 10 pairs.
3. **Capture.** Accepted / rejected / failed per view and per reason code, from `captures` in the pilot logs plus `capture-log.csv`. First-visit success: share of riders with an accepted side view within three attempts.
4. **Not enough evidence.** Count each kind, and the fitter's agree/disagree.
5. **Keep using and recommend.** From the interviews: would-keep-using, 0–10 recommend score (NPS), fitter referral and willingness to pay.
6. **Safety.** Any case where the app suggested a bike change while the rider had a warning sign for that area, or where a rider reports harm. Each one is investigated and reported individually.

Fill in [results-template.md](results-template.md) and publish it in `docs/evidence.md`, whatever the outcome. Until then the README and the app must keep saying real-rider accuracy has not been measured.

## 8. Stopping rules

Stop and review the whole pilot if any rider reports an injury they link to a change Cadence suggested, or if the app gives bike advice for an area marked with a warning sign. Remove a rider at their request at any time; delete their files unless they agree otherwise.
