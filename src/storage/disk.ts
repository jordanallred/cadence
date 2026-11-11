import { sessionSchema, type Session } from "../domain/types";

/**
 * Fit history mirrored to disk by the desktop launcher. Absent in the
 * development server or a plain static host, where every call is a no-op.
 */
export type DiskList = {
  sessions: Session[];
  deleted: string[];
  folder: string;
};

let available: boolean | null = null;

export async function diskList(): Promise<DiskList | null> {
  if (available === false) return null;
  try {
    const r = await fetch("/api/store/sessions");
    if (!r.ok || !r.headers.get("content-type")?.includes("json")) {
      available = false;
      return null;
    }
    const raw = (await r.json()) as {
      sessions: unknown[];
      deleted: string[];
      folder: string;
    };
    available = true;
    const sessions = raw.sessions.flatMap((s) => {
      const p = sessionSchema.safeParse(s);
      return p.success ? [p.data] : [];
    });
    return { sessions, deleted: raw.deleted ?? [], folder: raw.folder ?? "" };
  } catch {
    available = false;
    return null;
  }
}

export async function diskPut(s: Session) {
  if (!available) return;
  const r = await fetch("/api/store/sessions/" + encodeURIComponent(s.id), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(s),
  });
  if (!r.ok) throw Error("Could not save to disk: " + (await r.text()));
}

export async function diskDelete(id: string) {
  if (!available) return;
  const r = await fetch("/api/store/sessions/" + encodeURIComponent(id), {
    method: "DELETE",
  });
  // Without this, a failed delete would quietly bring the fit back on the
  // next start, because the disk copy would still be there.
  if (!r.ok) throw Error("Could not delete from disk: " + (await r.text()));
}

/**
 * Merge browser and disk copies: the newest updatedAt wins, and a session
 * deleted on disk is dropped. Returns what each side is missing.
 */
export function mergeSessions(
  local: Session[],
  disk: DiskList,
): {
  merged: Session[];
  toLocal: Session[];
  toDisk: Session[];
  dropLocal: Session[];
} {
  const gone = new Set(disk.deleted);
  const byId = new Map<string, Session>();
  const toLocal: Session[] = [],
    toDisk: Session[] = [],
    dropLocal: Session[] = [];
  const onDisk = new Map(disk.sessions.map((s) => [s.id, s]));
  for (const s of local) {
    if (gone.has(s.id) && !onDisk.has(s.id)) {
      dropLocal.push(s);
      continue;
    }
    const d = onDisk.get(s.id);
    if (!d || s.updatedAt > d.updatedAt) {
      toDisk.push(s);
      byId.set(s.id, s);
    } else byId.set(s.id, d);
    if (d && d.updatedAt > s.updatedAt) toLocal.push(d);
  }
  for (const d of disk.sessions)
    if (!byId.has(d.id)) {
      byId.set(d.id, d);
      toLocal.push(d);
    }
  const merged = [...byId.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return { merged, toLocal, toDisk, dropLocal };
}

/** True once diskList has found the desktop launcher's store. */
export const diskAvailable = () => available === true;

export type DiskVideo = { id: string; size: number };

export async function diskVideoList(): Promise<DiskVideo[] | null> {
  if (!available) return null;
  const r = await fetch("/api/store/videos");
  if (!r.ok) return null;
  return ((await r.json()) as { videos: DiskVideo[] }).videos ?? [];
}

/** Saves a video to disk and returns the size the launcher wrote. */
export async function diskPutVideo(id: string, file: Blob): Promise<number> {
  const r = await fetch("/api/store/videos/" + encodeURIComponent(id), {
    method: "PUT",
    headers: {
      "Content-Type": file.type.startsWith("video/")
        ? file.type
        : "application/octet-stream",
    },
    body: file,
  });
  if (!r.ok)
    throw Error("Could not save the video to disk: " + (await r.text()));
  return ((await r.json()) as DiskVideo).size;
}

export async function diskGetVideo(id: string): Promise<File | undefined> {
  const r = await fetch("/api/store/videos/" + encodeURIComponent(id));
  if (r.status === 404) return undefined;
  if (!r.ok)
    throw Error("Could not read the video from disk: " + (await r.text()));
  const blob = await r.blob();
  return new File([blob], id, { type: blob.type });
}

export async function diskHasVideo(id: string): Promise<boolean> {
  const r = await fetch("/api/store/videos/" + encodeURIComponent(id), {
    method: "HEAD",
  });
  return r.ok;
}

export async function diskDeleteVideo(id: string) {
  const r = await fetch("/api/store/videos/" + encodeURIComponent(id), {
    method: "DELETE",
  });
  if (!r.ok)
    throw Error("Could not delete the video from disk: " + (await r.text()));
}
