import { test } from "node:test";
import assert from "node:assert/strict";
import { hitFixedWindow, type WindowState } from "./rate-limit.engine.js";

const WINDOW = 60_000; // 1 min
const MAX = 3;

test("first hit on a fresh key opens a window and is allowed", () => {
  const d = hitFixedWindow(null, 1_000, WINDOW, MAX);
  assert.ok(d.allowed);
  assert.equal(d.remaining, 2);
  assert.equal(d.retryAfterSeconds, 0);
  assert.deepEqual(d.state, { count: 1, resetAt: 1_000 + WINDOW });
});

test("hits up to max are allowed, then blocked within the same window", () => {
  let state: WindowState | null = null;
  let now = 0;
  // 3 allowed hits
  for (let i = 0; i < MAX; i++) {
    const d = hitFixedWindow(state, now, WINDOW, MAX);
    assert.ok(d.allowed, `hit ${i + 1} should be allowed`);
    state = d.state;
    now += 1_000;
  }
  // 4th hit blocked
  const blocked = hitFixedWindow(state, now, WINDOW, MAX);
  assert.ok(!blocked.allowed);
  assert.equal(blocked.remaining, 0);
  // window opened at t=0, resetAt=60000, now=3000 → 57s
  assert.equal(blocked.retryAfterSeconds, 57);
  // blocked hits do not advance the count or extend the window
  assert.deepEqual(blocked.state, state);
});

test("a blocked key is allowed again once the window elapses", () => {
  let state: WindowState = { count: MAX, resetAt: WINDOW };
  const stillBlocked = hitFixedWindow(state, WINDOW - 1, WINDOW, MAX);
  assert.ok(!stillBlocked.allowed);

  // At resetAt the window restarts fresh.
  const reopened = hitFixedWindow(state, WINDOW, WINDOW, MAX);
  assert.ok(reopened.allowed);
  assert.equal(reopened.state.count, 1);
  assert.equal(reopened.state.resetAt, WINDOW + WINDOW);
});

test("retryAfter rounds up to whole seconds", () => {
  const state: WindowState = { count: MAX, resetAt: 10_500 };
  const d = hitFixedWindow(state, 0, WINDOW, MAX);
  assert.equal(d.retryAfterSeconds, 11);
});
