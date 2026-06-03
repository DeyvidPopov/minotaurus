import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
// Patches Express so rejected async-handler promises reach the error handler.
// Importing here mirrors app.ts and exercises the real mechanism under test.
import "express-async-errors";
import express from "express";
import { errorHandler, notFound } from "./error.js";
import { HttpError, ok } from "../utils/response.js";

// Build a tiny app that reuses the REAL errorHandler/notFound, with controlled
// async failure paths. This is the verification harness — it does not touch the
// production routes.
function buildHarness() {
  const app = express();

  // 1. Async handler that throws an HttpError (mapped-error contract).
  app.get("/throw-http", async () => {
    throw new HttpError(418, "TEAPOT", "I am a teapot");
  });

  // 2. Async handler whose awaited promise rejects with a generic Error.
  app.get("/throw-generic", async () => {
    await Promise.resolve();
    throw new Error("boom from async handler");
  });

  // 3. Async handler that rejects (no explicit throw) — same root cause.
  app.get("/reject", () => Promise.reject(new Error("rejected promise")));

  // 4. A normal async handler still succeeds.
  app.get("/ok", async (_req, res) => {
    await Promise.resolve();
    return ok(res, { fine: true }, "OK");
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function withServer(fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = buildHarness();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("async HttpError throw reaches errorHandler with preserved status/code", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/throw-http`);
    assert.equal(res.status, 418);
    const body = await res.json();
    assert.deepEqual(body, {
      success: false,
      error: { code: "TEAPOT", message: "I am a teapot" },
    });
  });
});

test("generic async throw becomes a 500 envelope WITHOUT leaking the internal message", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/throw-generic`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "INTERNAL_ERROR");
    // The client gets a generic message — never the raw internal error text.
    assert.equal(body.error.message, "Internal server error");
    assert.notEqual(body.error.message, "boom from async handler");
    // No stack / details leak into the response.
    assert.ok(!("details" in body.error));
    assert.ok(!("stack" in body.error));
    assert.ok(!JSON.stringify(body).includes("boom from async handler"));
  });
});

test("a rejected promise (no explicit throw) also returns the generic 500 envelope", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/reject`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error.code, "INTERNAL_ERROR");
    assert.equal(body.error.message, "Internal server error");
    assert.ok(!JSON.stringify(body).includes("rejected promise"));
  });
});

test("normal async handlers still succeed", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/ok`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { success: true, data: { fine: true }, message: "OK" });
  });
});
