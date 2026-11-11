import { openDB } from "idb";
import { sessionSchema, type Session } from "../domain/types";
import {
  diskAvailable,
  diskDelete,
  diskDeleteVideo,
  diskGetVideo,
  diskHasVideo,
  diskList,
  diskPut,
  diskPutVideo,
  diskVideoList,
  mergeSessions,
} from "./disk";
const db = () =>
  openDB("cadence-fit", 1, {
    upgrade(d) {
      d.createObjectStore("sessions", { keyPath: "id" });
      d.createObjectStore("videos");
    },
  });
/** The fit was saved in the browser but its copy on disk was not updated. */
export class DiskSaveError extends Error {}
export async function saveSession(s: Session) {
  const d = await db();
  const clean = sessionSchema.parse(s);
  await d.put("sessions", clean);
  try {
    await diskPut(clean);
  } catch (e) {
    throw new DiskSaveError(e instanceof Error ? e.message : String(e));
  }
}
/** Where fit history is kept on disk, once loadSessions has run. */
export let diskFolder = "";
export const savedWhere = () =>
  diskFolder ? "Saved on this computer" : "Saved in this browser";
export async function loadSessions(): Promise<Session[]> {
  const d = await db();
  const local = (await d.getAll("sessions")).flatMap((r) => {
    const p = sessionSchema.safeParse(r);
    return p.success ? [p.data] : [];
  });
  const disk = await diskList();
  if (!disk)
    return local.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  diskFolder = disk.folder;
  const { merged, toLocal, toDisk, dropLocal } = mergeSessions(local, disk);
  for (const s of toLocal) await d.put("sessions", s);
  for (const s of dropLocal) {
    await d.delete("sessions", s.id);
    for (const c of s.clips) await d.delete("videos", c.id);
  }
  for (const s of toDisk) await diskPut(s).catch(() => undefined);
  // Move kept videos out of the browser in the background; video calls
  // wait for it, so nothing races the move.
  migration = moveVideosToDisk(merged).then(
    () => undefined,
    () => undefined,
  );
  return merged;
}
/** Restore many sessions at once (a full backup). Newest copy wins. */
export async function mergeImported(incoming: Session[]) {
  const d = await db();
  for (const s of incoming) {
    const have = await d.get("sessions", s.id);
    if (have && have.updatedAt >= s.updatedAt) continue;
    await saveSession(s);
  }
}
export async function deleteSession(s: Session) {
  const d = await db(),
    tx = d.transaction(["sessions", "videos"], "readwrite");
  await tx.objectStore("sessions").delete(s.id);
  for (const c of s.clips) await tx.objectStore("videos").delete(c.id);
  await tx.done;
  await diskDelete(s.id);
  if (diskAvailable()) {
    await migration;
    for (const c of s.clips) await diskDeleteVideo(c.id);
  }
}
let migration: Promise<void> = Promise.resolve();

/**
 * Copy each kept video from browser storage to disk, then drop the browser
 * copy once the launcher reports the same size. Videos of clips no fit
 * refers to are left where they are.
 */
export async function moveVideosToDisk(sessions: Session[]): Promise<number> {
  const listed = await diskVideoList();
  if (!listed) return 0;
  const d = await db();
  const onDisk = new Map(listed.map((v) => [v.id, v.size]));
  const wanted = new Set(sessions.flatMap((s) => s.clips.map((c) => c.id)));
  let moved = 0;
  for (const key of await d.getAllKeys("videos")) {
    const id = String(key);
    if (!wanted.has(id)) continue;
    const file = (await d.get("videos", id)) as Blob | undefined;
    if (!file) continue;
    let size = onDisk.get(id);
    if (size !== file.size) size = await diskPutVideo(id, file);
    if (size === file.size) {
      await d.delete("videos", id);
      moved++;
    }
  }
  return moved;
}
/** Where kept videos go: the launcher's disk store, or else this browser. */
export async function saveVideo(id: string, file: File) {
  if (diskAvailable()) {
    await migration;
    const size = await diskPutVideo(id, file);
    if (size !== file.size) throw Error("The saved video is incomplete.");
    return;
  }
  await (await db()).put("videos", file, id);
}
export async function loadVideo(id: string): Promise<File | undefined> {
  if (diskAvailable()) {
    await migration;
    const f = await diskGetVideo(id);
    if (f) return f;
  }
  return (await db()).get("videos", id);
}
export async function hasVideo(id: string): Promise<boolean> {
  if (diskAvailable()) {
    await migration;
    if (await diskHasVideo(id)) return true;
  }
  return (await (await db()).getKey("videos", id)) !== undefined;
}
export async function deleteVideo(id: string) {
  await (await db()).delete("videos", id);
  if (diskAvailable()) {
    await migration;
    await diskDeleteVideo(id);
  }
}
