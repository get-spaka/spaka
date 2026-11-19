import { expect, test } from "vitest";
import type { UpdateState } from "../shared/ipc";
import { CHECK_EVERY_MS, type Updater, Updates, updatedSince } from "./update";

function fakeUpdater() {
  const handlers = new Map<string, (arg?: unknown) => void>();
  let checks = 0;
  let installs = 0;
  const updater: Updater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: ((event: string, fn: (arg?: unknown) => void) => {
      handlers.set(event, fn);
      return updater;
    }) as Updater["on"],
    async checkForUpdates() {
      checks++;
    },
    quitAndInstall() {
      installs++;
    },
  };
  return {
    updater,
    fire: (event: string, arg?: unknown) => handlers.get(event)?.(arg),
    checks: () => checks,
    installs: () => installs,
  };
}

function updates(enabled = true) {
  const fake = fakeUpdater();
  const states: UpdateState[] = [];
  let tick: (() => void) | undefined;
  let every = 0;
  const u = new Updates({
    updater: fake.updater,
    enabled,
    emit: (s) => states.push(s),
    setInterval: (fn, ms) => {
      tick = fn;
      every = ms;
      return 0;
    },
  });
  return { u, fake, states, tick: () => tick?.(), every: () => every };
}

test("a packaged app checks at launch, then every four hours, and downloads by itself", () => {
  const { u, fake, tick, every } = updates();
  u.start();
  expect(fake.updater.autoDownload).toBe(true);
  expect(fake.updater.autoInstallOnAppQuit).toBe(true);
  expect(fake.checks()).toBe(1);
  expect(every()).toBe(CHECK_EVERY_MS);
  tick();
  expect(fake.checks()).toBe(2);
});

test("a development run or a check in the background never checks", () => {
  const { u, fake, tick } = updates(false);
  u.start();
  tick();
  expect(fake.checks()).toBe(0);
  expect(u.state()).toEqual({ state: "idle" });
});

test("a found version downloads, then is ready to restart into; Restart installs it", () => {
  const { u, fake, states, tick } = updates();
  u.start();
  u.restart();
  expect(fake.installs()).toBe(0);
  fake.fire("update-available", { version: "0.2.1" });
  fake.fire("update-downloaded", { version: "0.2.1" });
  expect(states).toEqual([
    { state: "downloading", version: "0.2.1" },
    { state: "ready", version: "0.2.1" },
  ]);
  // Ready: no more checks, and a failed one does not hide the note.
  tick();
  expect(fake.checks()).toBe(1);
  fake.fire("error", new Error("offline"));
  expect(u.state()).toEqual({ state: "ready", version: "0.2.1" });
  u.restart();
  expect(fake.installs()).toBe(1);
});

test("a failed check says nothing and the next one tries again", () => {
  const { u, fake, tick } = updates();
  u.start();
  fake.fire("error", new Error("offline"));
  expect(u.state()).toEqual({ state: "idle" });
  tick();
  expect(fake.checks()).toBe(2);
});

test("a launch is the first of a new version when the last one wrote another", () => {
  expect(updatedSince(undefined, "0.2.0")).toBe(false);
  expect(updatedSince("0.2.0", "0.2.0")).toBe(false);
  expect(updatedSince("0.2.0", "0.2.1")).toBe(true);
});
