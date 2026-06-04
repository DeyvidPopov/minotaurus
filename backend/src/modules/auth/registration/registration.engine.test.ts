import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_TTL_MINUTES,
  MAX_VERIFY_ATTEMPTS,
  PASSWORD_MIN_LENGTH,
  RESEND_COOLDOWN_SECONDS,
  codeExpiryFrom,
  evaluatePasswordStrength,
  generateNumericCode,
  hasExceededAttempts,
  isExpired,
  isResendAllowed,
  isValidCodeFormat,
  normalizeEmail,
  normalizeName,
  registrationTokenExpiryFrom,
  resendAvailableFrom,
  resendRetryAfterSeconds,
} from "./registration.engine.js";

const NOW = new Date("2026-06-03T12:00:00.000Z");

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Deyvid@Minotaurus.DEV "), "deyvid@minotaurus.dev");
});

test("normalizeName trims and collapses internal whitespace", () => {
  assert.equal(normalizeName("  Jane   Q   Doe "), "Jane Q Doe");
});

test("isValidCodeFormat accepts exactly 6 digits, rejects everything else", () => {
  assert.ok(isValidCodeFormat("000000"));
  assert.ok(isValidCodeFormat(" 123456 "));
  assert.ok(!isValidCodeFormat("12345"));
  assert.ok(!isValidCodeFormat("1234567"));
  assert.ok(!isValidCodeFormat("12a456"));
  assert.ok(!isValidCodeFormat(""));
});

test("generateNumericCode zero-pads to 6 digits and uses the injected RNG", () => {
  assert.equal(
    generateNumericCode(() => 42),
    "000042",
  );
  assert.equal(
    generateNumericCode(() => 999999),
    "999999",
  );
  assert.equal(
    generateNumericCode(() => 0),
    "000000",
  );
  // RNG must be asked for the full 10^6 space.
  let seen = -1;
  generateNumericCode((max) => {
    seen = max;
    return 1;
  });
  assert.equal(seen, 1_000_000);
});

test("codeExpiryFrom / resendAvailableFrom / registrationTokenExpiryFrom advance by the configured amounts", () => {
  assert.equal(
    codeExpiryFrom(NOW).getTime() - NOW.getTime(),
    CODE_TTL_MINUTES * 60_000,
  );
  assert.equal(
    resendAvailableFrom(NOW).getTime() - NOW.getTime(),
    RESEND_COOLDOWN_SECONDS * 1_000,
  );
  assert.equal(
    registrationTokenExpiryFrom(NOW).getTime() - NOW.getTime(),
    15 * 60_000,
  );
});

test("isExpired is true at/after expiry and for null", () => {
  const exp = codeExpiryFrom(NOW);
  assert.ok(!isExpired(exp, NOW));
  assert.ok(!isExpired(exp, new Date(exp.getTime() - 1)));
  assert.ok(isExpired(exp, exp)); // boundary: at expiry = expired
  assert.ok(isExpired(exp, new Date(exp.getTime() + 1)));
  assert.ok(isExpired(null, NOW));
  assert.ok(isExpired(undefined, NOW));
});

test("hasExceededAttempts caps at MAX_VERIFY_ATTEMPTS", () => {
  assert.ok(!hasExceededAttempts(0));
  assert.ok(!hasExceededAttempts(MAX_VERIFY_ATTEMPTS - 1));
  assert.ok(hasExceededAttempts(MAX_VERIFY_ATTEMPTS));
  assert.ok(hasExceededAttempts(MAX_VERIFY_ATTEMPTS + 3));
});

test("resend cooldown gating and retry-after seconds", () => {
  const available = resendAvailableFrom(NOW); // NOW + 30s
  assert.ok(!isResendAllowed(available, NOW));
  assert.equal(resendRetryAfterSeconds(available, NOW), RESEND_COOLDOWN_SECONDS);
  // mid-cooldown rounds up
  assert.equal(resendRetryAfterSeconds(available, new Date(NOW.getTime() + 10_500)), 20);
  // at/after the gate
  assert.ok(isResendAllowed(available, available));
  assert.equal(resendRetryAfterSeconds(available, available), 0);
  assert.ok(isResendAllowed(available, new Date(available.getTime() + 5_000)));
});

test("evaluatePasswordStrength enforces length + letter + number", () => {
  assert.deepEqual(evaluatePasswordStrength("Abcd1234"), { ok: true, failures: [] });

  const short = evaluatePasswordStrength("Ab1");
  assert.ok(!short.ok);
  assert.ok(short.failures.includes("MIN_LENGTH"));

  const noNumber = evaluatePasswordStrength("abcdefgh");
  assert.deepEqual(noNumber, { ok: false, failures: ["REQUIRE_NUMBER"] });

  const noLetter = evaluatePasswordStrength("12345678");
  assert.deepEqual(noLetter, { ok: false, failures: ["REQUIRE_LETTER"] });

  const allBad = evaluatePasswordStrength("a");
  assert.deepEqual(allBad.failures.sort(), ["MIN_LENGTH", "REQUIRE_NUMBER"].sort());

  assert.equal(PASSWORD_MIN_LENGTH, 8);
});
