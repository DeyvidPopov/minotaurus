import { test } from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { respondAccessError, respondProjectAccessDenied } from "./response.js";

// Minimal Response stub capturing the status + JSON body the mapper emits.
function mockRes() {
  const calls: { status?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, calls };
}

test("respondAccessError maps not_found to 404 NOT_FOUND with the given message", () => {
  const { res, calls } = mockRes();
  respondAccessError(res, "not_found", "Database model not found");
  assert.equal(calls.status, 404);
  assert.deepEqual(calls.body, {
    success: false,
    error: { code: "NOT_FOUND", message: "Database model not found" },
  });
});

test("respondAccessError maps forbidden to a fixed 403 FORBIDDEN / 'Forbidden' (message arg ignored)", () => {
  const { res, calls } = mockRes();
  // The not_found message must NOT leak into the forbidden branch — it is always generic.
  respondAccessError(res, "forbidden", "Database model not found");
  assert.equal(calls.status, 403);
  assert.deepEqual(calls.body, {
    success: false,
    error: { code: "FORBIDDEN", message: "Forbidden" },
  });
});

test("respondAccessError falls through to 403 for the (unreachable) undefined case, like the original ternary", () => {
  const { res, calls } = mockRes();
  respondAccessError(res, undefined, "Database model not found");
  assert.equal(calls.status, 403);
  assert.deepEqual(calls.body, {
    success: false,
    error: { code: "FORBIDDEN", message: "Forbidden" },
  });
});

test("respondProjectAccessDenied returns false and sends nothing when access is ok", () => {
  const { res, calls } = mockRes();
  const denied = respondProjectAccessDenied(res, "ok");
  assert.equal(denied, false);
  assert.equal(calls.status, undefined);
  assert.equal(calls.body, undefined);
});

test("respondProjectAccessDenied: not_found → true + 404 'Project not found' (byte-equivalent to the B1 pair)", () => {
  const { res, calls } = mockRes();
  const denied = respondProjectAccessDenied(res, "not_found");
  assert.equal(denied, true);
  assert.equal(calls.status, 404);
  assert.deepEqual(calls.body, {
    success: false,
    error: { code: "NOT_FOUND", message: "Project not found" },
  });
});

test("respondProjectAccessDenied: forbidden → true + 403 'Forbidden' (byte-equivalent to the B1 pair)", () => {
  const { res, calls } = mockRes();
  const denied = respondProjectAccessDenied(res, "forbidden");
  assert.equal(denied, true);
  assert.equal(calls.status, 403);
  assert.deepEqual(calls.body, {
    success: false,
    error: { code: "FORBIDDEN", message: "Forbidden" },
  });
});

test("respondProjectAccessDenied honours a custom not_found message (forbidden stays generic)", () => {
  const a = mockRes();
  respondProjectAccessDenied(a.res, "not_found", "Widget not found");
  assert.deepEqual(a.calls, { status: 404, body: { success: false, error: { code: "NOT_FOUND", message: "Widget not found" } } });

  const b = mockRes();
  respondProjectAccessDenied(b.res, "forbidden", "Widget not found");
  assert.deepEqual(b.calls, { status: 403, body: { success: false, error: { code: "FORBIDDEN", message: "Forbidden" } } });
});

test("respondAccessError is byte-equivalent to the inline ternary it replaces", () => {
  // Pin the exact prior expression so a future edit to the mapper can't silently drift.
  for (const message of ["Entity not found", "Field not found", "API spec not found"]) {
    const a = mockRes();
    respondAccessError(a.res, "not_found", message);
    assert.deepEqual(a.calls, { status: 404, body: { success: false, error: { code: "NOT_FOUND", message } } });

    const b = mockRes();
    respondAccessError(b.res, "forbidden", message);
    assert.deepEqual(b.calls, { status: 403, body: { success: false, error: { code: "FORBIDDEN", message: "Forbidden" } } });
  }
});
