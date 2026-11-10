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
  await fetch("/api/store/sessions/" + encodeURIComponent(id), {
    method: "DELETE",
  });
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
