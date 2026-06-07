import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  toNotificationPreferences,
} from "./settings.engine.js";

test("an absent row projects to all-false defaults", () => {
  assert.deepEqual(toNotificationPreferences(null), {
    emailDigestEnabled: false,
    validationAlertsEnabled: false,
  });
  assert.deepEqual(toNotificationPreferences(undefined), DEFAULT_NOTIFICATION_PREFERENCES);
});

test("a present row projects its stored booleans verbatim", () => {
  assert.deepEqual(
    toNotificationPreferences({ emailDigestEnabled: true, validationAlertsEnabled: false }),
    { emailDigestEnabled: true, validationAlertsEnabled: false },
  );
});

test("merge applies only the keys present in the patch", () => {
  const current = { emailDigestEnabled: false, validationAlertsEnabled: true };
  assert.deepEqual(mergeNotificationPreferences(current, { emailDigestEnabled: true }), {
    emailDigestEnabled: true,
    validationAlertsEnabled: true,
  });
});

test("merge with an empty patch returns the current values unchanged", () => {
  const current = { emailDigestEnabled: true, validationAlertsEnabled: false };
  assert.deepEqual(mergeNotificationPreferences(current, {}), current);
});

test("a false in the patch turns a flag off (not treated as 'unset')", () => {
  const current = { emailDigestEnabled: true, validationAlertsEnabled: true };
  assert.deepEqual(mergeNotificationPreferences(current, { validationAlertsEnabled: false }), {
    emailDigestEnabled: true,
    validationAlertsEnabled: false,
  });
});

test("merge does not mutate its inputs", () => {
  const current = { emailDigestEnabled: false, validationAlertsEnabled: false };
  const frozen = Object.freeze({ ...current });
  mergeNotificationPreferences(frozen, { emailDigestEnabled: true });
  assert.deepEqual(current, { emailDigestEnabled: false, validationAlertsEnabled: false });
});
