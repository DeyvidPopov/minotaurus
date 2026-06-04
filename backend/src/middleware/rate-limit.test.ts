// Tests the Express rate-limit middleware wiring (the pure window math lives in
// rate-limit.engine.test.ts). Uses stub req/res so no server is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { bodyEmail, clientIp, rateLimit } from "./rate-limit.js";

function makeReq(opts: { ip?: string; remote?: string; body?: unknown; headers?: Record<string, string> } = {}): Request {
  return {
    ip: opts.ip,
    socket: { remoteAddress: opts.remote } as Request["socket"],
    headers: opts.headers ?? {},
    body: opts.body,
  } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = String(v);
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(o: unknown) {
      this.body = o;
      return this;
    },
  };
  return res;
}

test("clientIp uses req.ip / socket and never parses X-Forwarded-For", () => {
  assert.equal(clientIp(makeReq({ ip: "9.9.9.9" })), "9.9.9.9");
  assert.equal(clientIp(makeReq({ remote: "5.5.5.5" })), "5.5.5.5");
  // A spoofed XFF header must NOT win over req.ip.
  assert.equal(
    clientIp(makeReq({ ip: "9.9.9.9", headers: { "x-forwarded-for": "1.2.3.4" } })),
    "9.9.9.9",
  );
  assert.equal(clientIp(makeReq({})), "unknown");
});

test("bodyEmail trims + lowercases, and is empty for missing/non-string", () => {
  assert.equal(bodyEmail(makeReq({ body: { email: "  JANE@Example.COM " } })), "jane@example.com");
  assert.equal(bodyEmail(makeReq({ body: {} })), "");
  assert.equal(bodyEmail(makeReq({ body: { email: 42 } })), "");
  assert.equal(bodyEmail(makeReq({})), "");
});

test("allows up to max, sets X-RateLimit headers, then 429s with the standard envelope", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 2, keyGenerator: () => "k" });
  const req = makeReq({ ip: "1.1.1.1" });

  let nextCount = 0;
  const next = () => {
    nextCount += 1;
  };

  const r1 = makeRes();
  mw(req, r1 as unknown as Response, next);
  assert.equal(nextCount, 1);
  assert.equal(r1.headers["x-ratelimit-limit"], "2");
  assert.equal(r1.headers["x-ratelimit-remaining"], "1");

  const r2 = makeRes();
  mw(req, r2 as unknown as Response, next);
  assert.equal(nextCount, 2);
  assert.equal(r2.headers["x-ratelimit-remaining"], "0");

  // 3rd hit in the window is blocked.
  const r3 = makeRes();
  mw(req, r3 as unknown as Response, next);
  assert.equal(nextCount, 2, "next must NOT be called when blocked");
  assert.equal(r3.statusCode, 429);
  const body = r3.body as { success: boolean; error: { code: string; details?: { retryAfterSeconds: number } } };
  assert.equal(body.success, false);
  assert.equal(body.error.code, "RATE_LIMITED");
  assert.ok(typeof body.error.details?.retryAfterSeconds === "number");
  assert.ok(r3.headers["retry-after"] !== undefined);
});

test("different keys get independent windows", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1, keyGenerator: (req) => clientIp(req) });
  let blocked = 0;
  const next = () => {};
  const run = (ip: string) => {
    const res = makeRes();
    mw(makeReq({ ip }), res as unknown as Response, next);
    if (res.statusCode === 429) blocked += 1;
  };
  run("1.1.1.1"); // ok
  run("2.2.2.2"); // ok (different bucket)
  run("1.1.1.1"); // blocked (same bucket, 2nd hit, max 1)
  assert.equal(blocked, 1);
});
