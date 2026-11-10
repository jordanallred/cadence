import "fake-indexeddb/auto";
import { it, expect } from "vitest";
import { newSession } from "../src/domain/types";
import {
  saveSession,
  loadSessions,
  deleteSession,
  saveVideo,
  loadVideo,
} from "../src/storage/db";
it("persists a session and deletes only its own retained video", async () => {
  const s = newSession();
  await saveSession(s);
  expect((await loadSessions()).some((x) => x.id === s.id)).toBe(true);
  await saveVideo("unrelated", new File(["x"], "x.webm"));
  await deleteSession(s);
  expect((await loadSessions()).some((x) => x.id === s.id)).toBe(false);
  expect(await loadVideo("unrelated")).toBeDefined();
});
