import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  BCRYPT_COST,
  DUMMY_BCRYPT_HASH,
  generateCode,
  hashCode,
  verifyCode,
  generateSecureToken,
  hashToken,
} from "./auth-crypto.js";

// bcrypt hash prefix for the configured cost (bcryptjs emits $2a$ / $2b$).
const BCRYPT_COST10 = /^\$2[aby]\$10\$/;

test("BCRYPT_COST is 10", () => {
  assert.equal(BCRYPT_COST, 10);
});

test("generateCode is always a zero-padded 6-digit numeric string", () => {
  for (let i = 0; i < 500; i++) {
    assert.match(generateCode(), /^\d{6}$/);
  }
});

test("hashCode emits a cost-10 bcrypt hash that verifyCode round-trips", async () => {
  const code = "123456";
  const hash = await hashCode(code);
  assert.match(hash, BCRYPT_COST10);
  assert.equal(await verifyCode(code, hash), true);
  assert.equal(await verifyCode("000000", hash), false);
});

test("DUMMY_BCRYPT_HASH is a valid cost-10 hash that no real code matches", async () => {
  assert.match(DUMMY_BCRYPT_HASH, BCRYPT_COST10);
  assert.equal(await verifyCode("123456", DUMMY_BCRYPT_HASH), false);
});

test("generateSecureToken is a 256-bit base64url token, unique per call", () => {
  const a = generateSecureToken();
  const b = generateSecureToken();
  // 32 bytes base64url with no padding = 43 chars.
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
});

test("hashToken is deterministic sha256 hex matching node:crypto", () => {
  const token = "some-high-entropy-token";
  const expected = crypto.createHash("sha256").update(token).digest("hex");
  assert.equal(hashToken(token), expected);
  assert.match(hashToken(token), /^[0-9a-f]{64}$/);
});
