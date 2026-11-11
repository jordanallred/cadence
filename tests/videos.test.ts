import "fake-indexeddb/auto";
import { openDB } from "idb";
import { beforeAll, describe, expect, it } from "vitest";
import {
  newSession,
  type ClipAnalysis,
  type Session,
} from "../src/domain/types";
import {
  deleteSession,
  hasVideo,
  loadSessions,
  loadVideo,
  saveSession,
  saveVideo,
} from "../src/storage/db";
import { buildFullBackup, readBackupFile } from "../src/storage/portable";
import { crc32, makeZip, readZip } from "../src/storage/zip";

// A stand-in for the desktop launcher's /api/store endpoints.
const disk = {
  sessions: new Map<string, string>(),
  videos: new Map<string, Blob>(),
};
const json = (v: unknown) =>
  new Response(JSON.stringify(v), {
    headers: { "content-type": "application/json" },
  });
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input),
    method = init?.method ?? "GET";
  if (path === "/api/store/sessions")
    return json({
      sessions: [...disk.sessions.values()].map((s) => JSON.parse(s)),
      deleted: [],
      folder: "/home/rider/.config/Cadence/sessions",
    });
  if (path === "/api/store/videos")
    return json({
      videos: [...disk.videos].map(([id, b]) => ({ id, size: b.size })),
    });
  const sid = path.match(/^\/api\/store\/sessions\/(.+)$/)?.[1];
  if (sid) {
    if (method === "PUT") disk.sessions.set(sid, String(init?.body));
    if (method === "DELETE") disk.sessions.delete(sid);
    return new Response(null, { status: 204 });
  }
  const vid = path.match(/^\/api\/store\/videos\/(.+)$/)?.[1];
  if (vid) {
    if (method === "PUT") {
      disk.videos.set(vid, init?.body as Blob);
      return json({ id: vid, size: (init?.body as Blob).size });
    }
    if (method === "DELETE") {
      disk.videos.delete(vid);
      return new Response(null, { status: 204 });
    }
    const b = disk.videos.get(vid);
    if (!b) return new Response("", { status: 404 });
    return new Response(method === "HEAD" ? null : b, {
      headers: { "content-type": "video/webm" },
    });
  }
  return new Response("", { status: 404 });
}) as typeof fetch;

const clip = (id: string): ClipAnalysis => ({
  id,
  view: "left",
  name: id + ".webm",
  size: 5,
  duration: 1,
  width: 640,
  height: 480,
  frames: [],
  quality: [],
  metrics: [],
  modelVersion: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  setupRevision: 0,
  reviewed: false,
});
const fit = (...clips: string[]): Session => ({
  ...newSession(),
  clips: clips.map(clip),
});
const text = async (b?: Blob) => (b ? await b.text() : undefined);

describe("kept videos on disk", () => {
  let old: Session;
  beforeAll(async () => {
    // A video kept before this change lives only in the browser.
    old = fit("old-clip");
    const d = await openDB("cadence-fit", 1, {
      upgrade(d) {
        d.createObjectStore("sessions", { keyPath: "id" });
        d.createObjectStore("videos");
      },
    });
    await d.put("sessions", old);
    await d.put(
      "videos",
      new File(["older"], "a.webm", { type: "video/webm" }),
      "old-clip",
    );
    await d.put("videos", new File(["stray"], "b.webm"), "no-fit-uses-this");
    d.close();
    await loadSessions();
  });

  it("moves browser-stored videos to disk and frees the browser copy", async () => {
    expect(await text(await loadVideo("old-clip"))).toBe("older");
    expect(await text(disk.videos.get("old-clip"))).toBe("older");
    const d = await openDB("cadence-fit", 1);
    expect(await d.getKey("videos", "old-clip")).toBeUndefined();
    // Videos no fit refers to are left alone.
    expect(await d.getKey("videos", "no-fit-uses-this")).toBe(
      "no-fit-uses-this",
    );
    d.close();
  });

  it("saves new kept videos straight to disk", async () => {
    await saveVideo(
      "new-clip",
      new File(["fresh"], "n.webm", { type: "video/webm" }),
    );
    expect(await text(disk.videos.get("new-clip"))).toBe("fresh");
    expect(await hasVideo("new-clip")).toBe(true);
    const d = await openDB("cadence-fit", 1);
    expect(await d.getKey("videos", "new-clip")).toBeUndefined();
    d.close();
  });

  it("deletes a fit's videos from disk with the fit", async () => {
    const s = fit("gone-clip");
    await saveSession(s);
    await saveVideo(
      "gone-clip",
      new File(["bye"], "g.webm", { type: "video/webm" }),
    );
    await deleteSession(s);
    expect(disk.videos.has("gone-clip")).toBe(false);
    expect(disk.sessions.has(s.id)).toBe(false);
  });

  it("round-trips fits and videos through a ZIP backup", async () => {
    const zip = (await buildFullBackup([old], loadVideo)).zip;
    const back = await readBackupFile(zip);
    expect(back.all).toBe(true);
    expect(back.sessions.map((s) => s.id)).toEqual([old.id]);
    expect(await back.videos.get("old-clip")?.text()).toBe("older");
    expect(back.videos.get("old-clip")?.type).toBe("video/webm");
  });
});

describe("zip", () => {
  it("matches the standard CRC-32", async () => {
    expect(await crc32(new Blob(["123456789"]))).toBe(0xcbf43926);
  });
  it("writes entries any reader can find, and refuses other files", async () => {
    const z = await makeZip([
      { name: "fits.json", data: new Blob(["{}"]) },
      { name: "videos/a.mp4", data: new Blob([new Uint8Array(70000).fill(7)]) },
    ]);
    const e = await readZip(z);
    expect([...e.keys()]).toEqual(["fits.json", "videos/a.mp4"]);
    expect(e.get("videos/a.mp4")?.size).toBe(70000);
    await expect(readBackupFile(new Blob(["not a backup"]))).rejects.toThrow(
      /not a Cadence backup/,
    );
    await expect(
      readBackupFile(await makeZip([{ name: "x.txt", data: new Blob(["x"]) }])),
    ).rejects.toThrow(/not a Cadence backup/);
  });
});
