import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { ConfigError, getJwtSecret, validateConfig } from "./env.js";

const STRONG_SECRET = "a-sufficiently-long-random-secret-value-123456";

function withJwtSecret(value: string | undefined, fn: () => void): void {
  const prev = process.env.JWT_SECRET;
  if (value === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = value;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = prev;
  }
}

test("getJwtSecret throws when JWT_SECRET is missing", () => {
  withJwtSecret(undefined, () => {
    assert.throws(() => getJwtSecret(), ConfigError);
  });
});

test("getJwtSecret throws when JWT_SECRET is empty/whitespace", () => {
  withJwtSecret("   ", () => {
    assert.throws(() => getJwtSecret(), ConfigError);
  });
});

test("getJwtSecret throws for known placeholder values (case-insensitive)", () => {
  for (const placeholder of [
    "dev-secret-change-me",
    "change-me-in-production",
    "replace-with-a-long-random-secret",
    "CHANGE-ME-IN-PRODUCTION",
    "  Secret  ",
  ]) {
    withJwtSecret(placeholder, () => {
      assert.throws(() => getJwtSecret(), ConfigError, `expected ${placeholder} to be rejected`);
    });
  }
});

test("getJwtSecret throws for too-short secrets", () => {
  withJwtSecret("short", () => {
    assert.throws(() => getJwtSecret(), ConfigError);
  });
});

test("getJwtSecret returns the raw secret for a strong value", () => {
  withJwtSecret(STRONG_SECRET, () => {
    assert.equal(getJwtSecret(), STRONG_SECRET);
    assert.doesNotThrow(() => validateConfig());
  });
});

test("signing and verification share the same validated secret source", () => {
  withJwtSecret(STRONG_SECRET, () => {
    // Sign with the validated source, verify with the same source: round-trips.
    const token = jwt.sign({ userId: "u1", email: "a@b.c" }, getJwtSecret());
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
    assert.equal(decoded.userId, "u1");
    // A token signed under a different secret must NOT verify against ours.
    const forged = jwt.sign({ userId: "u1" }, "some-other-unrelated-secret");
    assert.throws(() => jwt.verify(forged, getJwtSecret()));
  });
});
