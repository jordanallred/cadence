import { sessionSchema, type Session } from "../domain/types";
import { isZip, makeZip, readZip } from "./zip";
const BUNDLE = "cadence-backup";
/** Largest single fit; matches maxSessionBytes in desktop/store.go. */
export const MAX_FIT_BYTES = 256 << 20;
/** Largest all-fits backup, near what a browser can hold as one string. */
const MAX_BUNDLE_BYTES = 500_000_000;
/** A backup file holds one fit, or every fit (format "cadence-backup"). */
export function parseBackup(text: string): {
  all: boolean;
  sessions: Session[];
} {
  if (text.length > MAX_BUNDLE_BYTES)
    throw Error("Backup is too large (500 MB limit).");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error(
      "This file is not a Cadence backup. Existing fits were not changed.",
    );
  }
  if (
    data &&
    typeof data === "object" &&
    (data as { format?: unknown }).format === BUNDLE
  ) {
    const list = (data as { sessions?: unknown }).sessions;
    if (!Array.isArray(list))
      throw Error("This backup is damaged. Existing fits were not changed.");
    return { all: true, sessions: list.map((s) => checkSession(s)) };
  }
  return { all: false, sessions: [checkSession(data)] };
}
export function parseSession(text: string): Session {
  if (text.length > MAX_FIT_BYTES)
    throw Error("Backup is too large (256 MB limit).");
  return checkSession(JSON.parse(text));
}
function checkSession(raw: unknown): Session {
  const result = sessionSchema.safeParse(raw);
  if (!result.success)
    throw Error(
      "This backup is damaged or uses an unsupported format. Existing sessions were not changed.",
    );
  const s = result.data;
  if (
    new Set(s.clips.map((c) => c.id)).size !== s.clips.length ||
    new Set(s.events.map((e) => e.id)).size !== s.events.length
  )
    throw Error("Backup has duplicate identifiers.");
  return s;
}
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportSession(s: Session) {
  download(
    "cadence-fit-" + s.id.slice(0, 8) + ".json",
    new Blob([JSON.stringify(s)], { type: "application/json" }),
  );
}
const bundle = (sessions: Session[]) =>
  new Blob(
    [
      JSON.stringify({
        format: BUNDLE,
        version: 1,
        exported: new Date().toISOString(),
        sessions,
      }),
    ],
    { type: "application/json" },
  );
const today = () => new Date().toISOString().slice(0, 10);
export function exportAll(sessions: Session[]) {
  download("cadence-all-fits-" + today() + ".json", bundle(sessions));
}

const extensions: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-matroska": ".mkv",
};
const typeOf = (name: string) =>
  Object.entries(extensions).find(([, e]) => name.endsWith(e))?.[0] ?? "";

/**
 * Every fit plus each kept video, as one ZIP: fits.json (the same file
 * "Back up all fits" writes) and videos/<clip id>.<ext>.
 */
export async function buildFullBackup(
  sessions: Session[],
  load: (id: string) => Promise<Blob | undefined>,
): Promise<{ zip: Blob; videos: number }> {
  const entries = [{ name: "fits.json", data: bundle(sessions) }];
  for (const s of sessions)
    for (const c of s.clips) {
      const v = await load(c.id);
      if (v)
        entries.push({
          name: "videos/" + c.id + (extensions[v.type] ?? ".video"),
          data: v,
        });
    }
  return { zip: await makeZip(entries), videos: entries.length - 1 };
}
export async function exportAllWithVideos(
  sessions: Session[],
  load: (id: string) => Promise<Blob | undefined>,
) {
  const { zip, videos } = await buildFullBackup(sessions, load);
  download("cadence-fits-and-videos-" + today() + ".zip", zip);
  return videos;
}

/** Reads a .json backup or a fits-and-videos .zip. */
export async function readBackupFile(file: Blob): Promise<{
  all: boolean;
  sessions: Session[];
  videos: Map<string, File>;
}> {
  const videos = new Map<string, File>();
  if (!(await isZip(file)))
    return { ...parseBackup(await file.text()), videos };
  const entries = await readZip(file);
  const fits = entries.get("fits.json");
  if (!fits)
    throw Error(
      "This ZIP is not a Cadence backup. Existing fits were not changed.",
    );
  const parsed = parseBackup(await fits.text());
  const clips = new Set(
    parsed.sessions.flatMap((s) => s.clips.map((c) => c.id)),
  );
  for (const [name, data] of entries) {
    const m = /^videos\/([A-Za-z0-9_-]{1,80})\.[a-z0-9]+$/.exec(name);
    if (m && clips.has(m[1]))
      videos.set(m[1], new File([data], name.slice(7), { type: typeOf(name) }));
  }
  return { ...parsed, all: true, videos };
}
