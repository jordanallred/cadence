import { openDB } from "idb";
import { sessionSchema, type Session } from "../domain/types";
import { diskDelete, diskList, diskPut, mergeSessions } from "./disk";
const db = () =>
  openDB("cadence-fit", 1, {
    upgrade(d) {
      d.createObjectStore("sessions", { keyPath: "id" });
      d.createObjectStore("videos");
    },
  });
export async function saveSession(s: Session) {
  const d = await db();
  const clean = sessionSchema.parse(s);
  await d.put("sessions", clean);
  await diskPut(clean);
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
}
export async function saveVideo(id: string, file: File) {
  await (await db()).put("videos", file, id);
}
export async function loadVideo(id: string): Promise<File | undefined> {
  return (await db()).get("videos", id);
}
export async function deleteVideo(id: string) {
  await (await db()).delete("videos", id);
}
