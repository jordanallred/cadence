import { it, expect, vi, beforeEach } from "vitest";

// The launcher answers /__cadence with "cadence <version>" (#18).
let answer: string | Error = "cadence v0.7.0";
beforeEach(() => {
  vi.resetModules();
  answer = "cadence v0.7.0";
  vi.stubGlobal("fetch", async () => {
    if (answer instanceof Error) throw answer;
    return new Response(answer, { status: 200 });
  });
  vi.stubGlobal("window", new EventTarget());
});

it("stays quiet while the same Cadence serves the page", async () => {
  const v = await import("../src/storage/version");
  await v.rememberVersion();
  expect(await v.updatedSinceLoad()).toBe(false);
});

it("notices a newer Cadence replacing the one that served the page", async () => {
  const v = await import("../src/storage/version");
  await v.rememberVersion();
  answer = "cadence v0.8.0";
  const heard = vi.fn();
  window.addEventListener(v.UPDATED_EVENT, heard);
  expect(await v.updatedSinceLoad()).toBe(true);
  expect(heard).toHaveBeenCalled();
});

it("does nothing without a launcher (dev server, launcher closed)", async () => {
  answer = "<!doctype html><html></html>";
  const v = await import("../src/storage/version");
  await v.rememberVersion();
  answer = "cadence v0.8.0";
  expect(await v.updatedSinceLoad()).toBe(false);
});

it("does not report an update when the launcher has stopped", async () => {
  const v = await import("../src/storage/version");
  await v.rememberVersion();
  answer = new Error("connection refused");
  expect(await v.updatedSinceLoad()).toBe(false);
});
