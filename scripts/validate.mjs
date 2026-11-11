#!/usr/bin/env node
// Compare Cadence measurements with reference measurements on real riders.
//
//   node scripts/validate.mjs validation/references.csv backup1.json [backup2.json ...]
//   node scripts/validate.mjs references.csv backups/*.json --method goniometer-dynamic
//
// Backups can be single fits or "Back up all fits" files.
// references.csv columns: clip,view,metric,reference
//   clip      = the original video file name, as shown in the app
//   view      = left | right | front | rear
//   metric    = a Cadence metric id, e.g. knee-min, knee-bdc, torso, elbow
//   reference = the reference value (goniometer, marker-based system, or
//               expert landmarks) in the metric's unit
//   method    = optional; with --method, only rows with that method count
//               (static and dynamic readings differ, so compare them apart)
//   Other columns (participant, fitter, notes, ...) are ignored.
//
// Prints, per metric: count, bias, mean absolute error and 95% limits of
// agreement (Bland–Altman), then flags metrics that miss the targets below.
import { readFileSync } from "node:fs";

const TARGET = { maxAbsBias: 2, maxMae: 3, maxLoa: 6 };

const args = process.argv.slice(2);
const methodAt = args.indexOf("--method");
const method = methodAt >= 0 ? args.splice(methodAt, 2)[1] : null;
const [csvPath, ...backups] = args;
if (!csvPath || !backups.length || (methodAt >= 0 && !method)) {
  console.error(
    "Usage: node scripts/validate.mjs references.csv backup.json [...] [--method name]",
  );
  process.exit(2);
}
const rows = readFileSync(csvPath, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
const header = rows
  .shift()
  .split(",")
  .map((h) => h.trim().toLowerCase());
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw Error(`references.csv is missing the "${name}" column`);
  return i;
};
const [ci, vi, mi, ri] = ["clip", "view", "metric", "reference"].map(col);
const methodCol = method ? col("method") : -1;

// Latest analysis of each clip name + view across all backups.
const clips = new Map();
for (const file of backups) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const sessions =
    data.format === "cadence-backup" ? (data.sessions ?? []) : [data];
  for (const c of sessions.flatMap((s) => s.clips ?? [])) {
    const key = `${c.name}|${c.view}`;
    const prev = clips.get(key);
    if (!prev || c.createdAt > prev.createdAt) clips.set(key, c);
  }
}

const pairs = new Map();
const missing = [];
for (const line of rows) {
  const cells = line.split(",").map((x) => x.trim());
  if (method && cells[methodCol] !== method) continue;
  const key = `${cells[ci]}|${cells[vi]}`;
  const clip = clips.get(key);
  const m = clip?.metrics.find((x) => x.id === cells[mi]);
  // An empty cell means the reading could not be taken, not 0.
  const ref = cells[ri] ? Number(cells[ri]) : NaN;
  if (!m || !Number.isFinite(ref)) {
    missing.push(line);
    continue;
  }
  if (!pairs.has(cells[mi])) pairs.set(cells[mi], []);
  pairs.get(cells[mi]).push({ measured: m.value, ref });
}

if (method) console.log(`Reference method: ${method}\n`);
let failed = !pairs.size;
console.log("metric          n    bias    MAE    LoA (95%)        result");
for (const [metric, list] of pairs) {
  const d = list.map((p) => p.measured - p.ref);
  const n = d.length;
  const bias = d.reduce((a, b) => a + b, 0) / n;
  const mae = d.reduce((a, b) => a + Math.abs(b), 0) / n;
  const sd =
    n > 1
      ? Math.sqrt(d.reduce((a, b) => a + (b - bias) ** 2, 0) / (n - 1))
      : NaN;
  const lo = bias - 1.96 * sd,
    hi = bias + 1.96 * sd;
  const ok =
    n >= 10 &&
    Math.abs(bias) <= TARGET.maxAbsBias &&
    mae <= TARGET.maxMae &&
    Math.max(Math.abs(lo), Math.abs(hi)) <= TARGET.maxLoa;
  if (!ok) failed = true;
  console.log(
    `${metric.padEnd(14)} ${String(n).padStart(3)} ${bias.toFixed(2).padStart(7)} ${mae.toFixed(2).padStart(6)}    ${lo.toFixed(1)} to ${hi.toFixed(1)}`.padEnd(
      58,
    ) + (n < 10 ? "need ≥10 pairs" : ok ? "meets target" : "misses target"),
  );
}
if (missing.length)
  console.log(
    `\n${missing.length} reference row(s) had no matching clip, metric or reading:\n  ` +
      missing.join("\n  "),
  );
console.log(
  `\nTargets: |bias| ≤ ${TARGET.maxAbsBias}°, MAE ≤ ${TARGET.maxMae}°, limits of agreement within ±${TARGET.maxLoa}°, at least 10 pairs.`,
);
process.exit(failed ? 1 : 0);
