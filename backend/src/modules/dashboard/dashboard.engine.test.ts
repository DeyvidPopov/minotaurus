// modules/dashboard/dashboard.engine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyCounts, trendStat, countBySeverity } from "./dashboard.engine.js";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000; // fixed reference so results are deterministic

test("dailyCounts buckets timestamps per day within the window", () => {
  const ts = [NOW - 1, NOW - DAY - 1, NOW - 2 * DAY - 1];
  const out = dailyCounts(ts, 3, NOW);
  assert.equal(out.length, 3);
  assert.equal(out.reduce((a, b) => a + b, 0), 3);
  assert.equal(out[2], 1); // most recent lands in the last (newest) bucket
});

test("dailyCounts ignores timestamps outside the window", () => {
  const ts = [NOW - 10 * DAY, NOW + DAY];
  assert.deepEqual(dailyCounts(ts, 3, NOW), [0, 0, 0]);
});

test("dailyCounts returns an empty array for non-positive days", () => {
  assert.deepEqual(dailyCounts([NOW], 0, NOW), []);
});

test("trendStat computes delta and a cumulative spark ending at total", () => {
  const ts = [NOW - DAY, NOW - 2 * DAY, NOW - 10 * DAY, NOW - 11 * DAY, NOW - 12 * DAY];
  const s = trendStat(ts, 5, { nowMs: NOW, windowDays: 14, deltaDays: 7 });
  assert.equal(s.total, 5);
  assert.equal(s.delta, 2); // 2 created within the last 7 days
  assert.equal(s.spark.length, 14);
  assert.equal(s.spark[s.spark.length - 1], 5); // cumulative terminates at the real total
  for (let i = 1; i < s.spark.length; i++) assert.ok(s.spark[i] >= s.spark[i - 1]); // non-decreasing
});

test("trendStat folds pre-window entities into the base offset (flat spark)", () => {
  const ts = [NOW - 30 * DAY, NOW - 40 * DAY];
  const s = trendStat(ts, 4, { nowMs: NOW, windowDays: 7, deltaDays: 7 });
  assert.deepEqual(s.spark, [4, 4, 4, 4, 4, 4, 4]);
  assert.equal(s.delta, 0);
});

test("countBySeverity buckets case-insensitively and ignores unknowns", () => {
  const c = countBySeverity(["CRITICAL", "error", "Warning", "INFO", "bogus"]);
  assert.deepEqual(c, { critical: 1, error: 1, warning: 1, info: 1 });
});
