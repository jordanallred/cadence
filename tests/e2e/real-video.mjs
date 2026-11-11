// End-to-end check with real pedaling video, run against the built desktop
// launcher in a real browser:
//
//   npm run build && npm run build:desktop && npm run e2e
//   CADENCE_BIN=path/to/downloaded/cadence npm run e2e   # test a release
//
// It catches what unit tests cannot: the pose engine failing to load in the
// browser, video decoding, auto-trim and the measurements on a real rider.
// The pose model is downloaded on first run, as for users.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const VIDEOS = resolve("tests/e2e/videos");
const PORT = Number(process.env.CADENCE_PORT || 5280);
const URL = `http://127.0.0.1:${PORT}/`;

async function launcher() {
  if (process.env.CADENCE_BIN) return resolve(process.env.CADENCE_BIN);
  const ext = process.platform === "win32" ? ".exe" : "";
  const built = (await readdir("release")).filter(
    (f) =>
      f.startsWith("cadence-") &&
      f.includes(
        process.platform === "darwin"
          ? "macos"
          : process.platform === "win32"
            ? "windows"
            : "linux",
      ) &&
      f.includes(process.arch === "arm64" ? "arm64" : "amd64") &&
      (ext ? f.endsWith(ext) : !/\.(zip|gz|txt)$/.test(f)),
  );
  if (!built.length)
    throw Error("No launcher in release/. Run npm run build:desktop.");
  return resolve("release", built[0]);
}

async function start(bin, home) {
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    APPDATA: home,
  };
  const proc = spawn(
    bin,
    ["--no-browser", "--no-phone", "--port", String(PORT)],
    { env },
  );
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  for (let n = 0; n < 240; n++) {
    try {
      if ((await fetch(URL + "__cadence")).ok) return { proc, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  throw Error("Launcher did not start:\n" + log);
}

/** Import a video on the Recordings page, wait for auto-trim and analysis. */
async function analyze(page, file) {
  await page.goto(URL);
  await page.getByText("Recordings", { exact: true }).first().click();
  await page
    .locator("input[type=file]")
    .first()
    .setInputFiles(join(VIDEOS, file));
  await page.waitForFunction(
    () => /picked|Couldn't find|didn't work/.test(document.body.innerText),
    null,
    { timeout: 180_000 },
  );
  const trim = await page
    .locator("input[type=number]")
    .evaluateAll((es) => es.map((e) => Number(e.value)));
  await page.getByRole("button", { name: /^Analyze/ }).click();
  await page.waitForFunction(
    () =>
      /I checked the tracking|ModuleFactory|Could not|timed out|cannot decode|failed/i.test(
        document.body.innerText,
      ),
    null,
    { timeout: 600_000, polling: 1000 },
  );
  const text = await page.locator("body").innerText();
  const num = (label) => {
    const m = text.match(new RegExp(label + "\\s*\\n?\\s*(-?[\\d.]+)"));
    return m ? Number(m[1]) : NaN;
  };
  return {
    trim,
    text,
    cycles: num("Complete cycles"),
    cadence: num("Estimated cadence"),
    kneeExtension: num("Knee flexion · extension"),
  };
}

const failures = [];
const check = (ok, what, knownIssue) => {
  // A known, open bug is reported but does not fail the run. Remove the
  // issue number once it is fixed so the check guards against regressions.
  console.log(
    (ok ? "  ok    " : knownIssue ? `  KNOWN #${knownIssue} ` : "  FAIL  ") +
      what,
  );
  if (!ok && !knownIssue) failures.push(what);
};

const home = await mkdtemp(join(tmpdir(), "cadence-e2e-"));
const bin = await launcher();
const server = await start(bin, home);
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // A rider pedaling steadily on a trainer, filmed from the left side.
  // Reference: 69 rpm, counted independently from the raw video frames.
  console.log("side-trainer.mp4");
  const a = await analyze(page, "side-trainer.mp4");
  check(
    !/ModuleFactory|pose engine|Pose worker failed|timed out/i.test(a.text),
    "pose engine loads and runs",
  );
  check(
    a.trim[0] <= 1 && a.trim[1] >= 14,
    `auto-trim keeps the steady pedaling (${a.trim.join("–")} s)`,
  );
  check(
    a.cycles >= 15 && a.cycles <= 19,
    `pedal strokes ${a.cycles} (expected 15–19)`,
  );
  check(
    Math.abs(a.cadence - 69) <= 4,
    `cadence ${a.cadence} rpm (expected 69 ± 4)`,
  );
  check(
    a.kneeExtension >= 15 && a.kneeExtension <= 35,
    `knee flexion at extension ${a.kneeExtension}° (plausible 15–35°)`,
  );

  // The same ride with 6 s of sitting still first, as hands-free recording
  // produces: auto-trim must skip the still part and the result must analyze.
  console.log("side-trainer-late-start.mp4");
  const b = await analyze(page, "side-trainer-late-start.mp4");
  check(
    b.trim[0] >= 4 && b.trim[0] <= 7,
    `auto-trim finds the pedaling (${b.trim.join("–")} s)`,
  );
  check(
    b.trim[0] >= 5.5,
    `auto-trim leaves out the still part (starts at ${b.trim[0]} s, pedaling starts at 6 s)`,
  );
  check(
    b.cycles >= 13,
    `auto-trimmed clip analyzes (${b.cycles} pedal strokes, expected ≥ 13)`,
  );

  // The original, uncropped clip: a life-size cardboard cutout of a person
  // stands against the wall behind the bike. Cadence must follow the rider
  // and still find the same cadence.
  console.log("side-trainer-cutout.mp4");
  const c = await analyze(page, "side-trainer-cutout.mp4");
  check(
    c.trim[0] <= 1 && c.trim[1] >= 14,
    `auto-trim works with a cutout in the shot (${c.trim.join("–")} s)`,
  );
  check(
    c.cycles >= 15 && c.cycles <= 19,
    `pedal strokes with a cutout in the shot ${c.cycles} (expected 15–19)`,
  );
  // The rider speeds up from about 67 to 84 rpm in this clip, so one stroke
  // found a frame (67 ms) later moves the median-period cadence by ~4 rpm.
  // Following the cutout instead would break the count or the numbers.
  check(
    Math.abs(c.cadence - a.cadence) <= 5,
    `cadence with a cutout in the shot ${c.cadence} rpm (cropped clip ${a.cadence})`,
  );
  check(
    Math.abs(c.kneeExtension - a.kneeExtension) <= 3,
    `knee extension matches the cropped clip (${c.kneeExtension}° vs ${a.kneeExtension}°)`,
  );

  await page.waitForTimeout(2000);
  const saved = await readdir(
    join(home, ".config", "Cadence", "sessions"),
  ).catch(() => []);
  check(
    saved.some((f) => f.endsWith(".json")),
    "fit saved to disk by the launcher",
  );

  const bad = errors.filter((e) =>
    /ModuleFactory|Uncaught|TypeError|ReferenceError/.test(e),
  );
  check(
    !bad.length,
    "no script errors" + (bad.length ? ": " + bad.join(" | ") : ""),
  );
} finally {
  await browser.close();
  server.proc.kill();
  await rm(home, { recursive: true, force: true });
}
if (failures.length) {
  console.error(
    `\n${failures.length} check(s) failed. Launcher output:\n${server.log()}`,
  );
  process.exit(1);
}
console.log("\nAll end-to-end checks passed.");
