// Build the Cadence desktop launcher from an existing `npm run build`.
//
//   npm run build && npm run build:desktop            # this computer
//   npm run build && npm run build:desktop -- --all   # every release target
//
// Needs Go 1.22+. Output goes to release/. The pose model is never bundled:
// the launcher downloads and verifies it on first run.
import { cp, rm, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const targets = [
  ["windows", "amd64"],
  ["windows", "arm64"],
  ["darwin", "amd64"],
  ["darwin", "arm64"],
  ["linux", "amd64"],
  ["linux", "arm64"],
];
if (!existsSync("dist/index.html")) throw Error("Run `npm run build` first.");
if (!existsSync("dist/wasm"))
  throw Error(
    "dist/wasm is missing. Run `npm run prepare:wasm` (or prepare:models) before building.",
  );
await rm("desktop/web", { recursive: true, force: true });
await cp("dist", "desktop/web", {
  recursive: true,
  filter: (src) => !src.replaceAll("\\", "/").includes("dist/models"),
});
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const tag = process.env.CADENCE_VERSION || "v" + version;
await mkdir("release", { recursive: true });
const all = process.argv.includes("--all");
const list = all
  ? targets
  : [
      [
        execFileSync("go", ["env", "GOOS"]).toString().trim(),
        execFileSync("go", ["env", "GOARCH"]).toString().trim(),
      ],
    ];
for (const [os, arch] of list) {
  const out = `release/cadence-${tag}-${os === "darwin" ? "macos" : os}-${arch}${os === "windows" ? ".exe" : ""}`;
  execFileSync(
    "go",
    [
      "build",
      "-trimpath",
      "-ldflags",
      `-s -w -X main.version=${tag}`,
      "-o",
      "../" + out,
      ".",
    ],
    {
      cwd: "desktop",
      stdio: "inherit",
      env: { ...process.env, GOOS: os, GOARCH: arch, CGO_ENABLED: "0" },
    },
  );
  console.log("Built", out);
}
