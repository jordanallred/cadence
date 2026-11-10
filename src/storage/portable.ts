import { sessionSchema, type Session } from "../domain/types";
export function parseSession(text: string): Session {
  if (text.length > 30_000_000)
    throw Error("Backup is too large (30 MB limit).");
  const result = sessionSchema.safeParse(JSON.parse(text));
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
