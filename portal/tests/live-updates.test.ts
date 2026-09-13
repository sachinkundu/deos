import assert from "node:assert/strict";
import test from "node:test";
import { createLiveUpdatePreference, LIVE_UPDATES_KEY } from "../src/live-updates.ts";
import { receiveConfirmedPoll, applyStaged, type PollState } from "../src/polling.ts";

function host(raw: string | null = null) {
  const listeners = new Set<(event: StorageEvent) => void>();
  return {
    raw,
    localStorage: { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } },
    addEventListener: (_type: "storage", listener: (event: StorageEvent) => void) => { listeners.add(listener); },
    removeEventListener: (_type: "storage", listener: (event: StorageEvent) => void) => { listeners.delete(listener); },
    fire: (newValue: string | null) => listeners.forEach(listener => listener({ key: LIVE_UPDATES_KEY, newValue } as StorageEvent)),
  };
}
test("defaults manual, saves one versioned value, reloads and keeps browsers separate", () => {
  const browser = host();
  const store = createLiveUpdatePreference(browser);
  assert.equal(store.getSnapshot().enabled, false);
  let updates = 0; store.subscribe(() => updates++);
  store.setEnabled(true);
  assert.equal(updates, 1);
  assert.deepEqual(JSON.parse(browser.localStorage.getItem()!), { version: 1, enabled: true });
  assert.equal(createLiveUpdatePreference(browser).getSnapshot().enabled, true);
  assert.equal(createLiveUpdatePreference(host()).getSnapshot().enabled, false);
});
test("storage invalidation reads current storage even for delayed events", () => {
  const browser = host(); const store = createLiveUpdatePreference(browser);
  browser.localStorage.setItem(LIVE_UPDATES_KEY, '{"version":1,"enabled":true}');
  browser.fire('{"version":1,"enabled":false}');
  assert.equal(store.getSnapshot().enabled, true);
  store.dispose();
  browser.localStorage.setItem(LIVE_UPDATES_KEY, '{"version":1,"enabled":false}');
  browser.fire(null);
  assert.equal(store.getSnapshot().enabled, true);
});
test("invalid values fail closed with local diagnostics", () => {
  const original = console.error; const reports: unknown[][] = [];
  console.error = (...args) => reports.push(args);
  try {
    for (const value of ['{', '{}', '{"version":2,"enabled":true}', '{"version":1,"enabled":"true"}']) {
      const store = createLiveUpdatePreference(host(value));
      assert.deepEqual(store.getSnapshot(), { enabled: false, notice: "preference_fallback" });
      assert.ok(reports.at(-1)?.[2] instanceof Error);
    }
  } finally { console.error = original; }
});
test("storage exceptions retain original errors and keep failed writes active for the page", () => {
  const original = console.error; const reports: unknown[][] = []; console.error = (...args) => reports.push(args);
  try {
    const error = new Error("storage denied"); const browser = host();
    browser.localStorage.getItem = () => { throw error; };
    browser.localStorage.setItem = () => { throw error; };
    const store = createLiveUpdatePreference(browser);
    assert.equal(store.getSnapshot().enabled, false);
    assert.equal(reports[0][2], error);
    store.setEnabled(true);
    assert.deepEqual(store.getSnapshot(), { enabled: true, notice: "preference_not_saved" });
    assert.equal(reports[1][2], error);
  } finally { console.error = original; }
});
test("baseline, latest pending snapshot, toggle promotion and subsequent manual updates", () => {
  type Snapshot = { status: string; graph: number; history: number; counts: number };
  const a = { status: "active", graph: 1, history: 1, counts: 1 };
  const b = { status: "active", graph: 2, history: 2, counts: 2 };
  const c = { status: "done", graph: 3, history: 3, counts: 3 };
  for (const live of [false, true]) {
    const first = receiveConfirmedPoll<Snapshot>({ applied: null, staged: null, error: null }, a, live);
    assert.equal(first.applied, a); assert.equal(first.staged, null);
  }
  let state: PollState<Snapshot> = receiveConfirmedPoll({ applied: null, staged: null, error: null }, a, false);
  state = receiveConfirmedPoll(state, b, false);
  state = receiveConfirmedPoll(state, c, false);
  assert.equal(state.applied, a); assert.equal(state.staged, c);
  state = applyStaged(state);
  assert.equal(state.applied, c); assert.equal(state.staged, null);
  state = receiveConfirmedPoll(state, c, true);
  assert.equal(state.staged, null);
  state = receiveConfirmedPoll(state, b, true);
  assert.equal(state.applied, b); assert.equal(state.staged, null);
  state = receiveConfirmedPoll(state, a, false);
  assert.equal(state.applied, b); assert.equal(state.staged, a);
});
