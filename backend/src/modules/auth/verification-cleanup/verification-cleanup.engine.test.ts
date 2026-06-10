import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deadEmailChangeWhere,
  deadEmailVerificationWhere,
  deadPasswordResetWhere,
} from "./verification-cleanup.engine.js";

const NOW = new Date("2026-06-10T12:00:00.000Z");

// The load-bearing invariant for the two token-carrying tables: the where clause
// must require BOTH the code window to have lapsed AND any live handoff token to
// have expired (or be absent) — otherwise the sweep would delete a verified row
// the user can still complete/reset. These pin that the token guard stays.

test("deadEmailVerificationWhere guards on the registration token expiry", () => {
  assert.deepEqual(deadEmailVerificationWhere(NOW), {
    expiresAt: { lt: NOW },
    OR: [
      { registrationTokenExpiresAt: null },
      { registrationTokenExpiresAt: { lt: NOW } },
    ],
  });
});

test("deadPasswordResetWhere guards on the reset token expiry", () => {
  assert.deepEqual(deadPasswordResetWhere(NOW), {
    expiresAt: { lt: NOW },
    OR: [
      { resetTokenExpiresAt: null },
      { resetTokenExpiresAt: { lt: NOW } },
    ],
  });
});

test("deadEmailChangeWhere keys on code expiry only (2-step, no handoff token)", () => {
  assert.deepEqual(deadEmailChangeWhere(NOW), { expiresAt: { lt: NOW } });
});
