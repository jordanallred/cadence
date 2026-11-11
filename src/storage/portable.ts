import { sessionSchema, type Session } from "../domain/types";
const BUNDLE = "cadence-backup";
/** A backup file holds one fit, or every fit (format "cadence-backup"). */
export function parseBackup(text: string): {
  all: boolean;
  sessions: Session[];
} {
  if (text.length > 200_000_000)
    throw Error("Backup is too large (200 MB limit).");
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
  if (text.length > 30_000_000)
    throw Error("Backup is too large (30 MB limit).");
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
export function exportAll(sessions: Session[]) {
  const day = new Date().toISOString().slice(0, 10);
  download(
    "cadence-all-fits-" + day + ".json",
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
    ),
  );
}
