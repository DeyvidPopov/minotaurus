// Pure, deterministic helpers for user notification preferences. No Prisma, no
// IO — just the default shape, the row → DTO projection, and the patch merge,
// so the controller stays thin and these can be unit-tested without a DB.

export interface NotificationPreferences {
  emailDigestEnabled: boolean;
  validationAlertsEnabled: boolean;
}

/** Defaults for a user who has never saved a preference (no row yet). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailDigestEnabled: false,
  validationAlertsEnabled: false,
};

/**
 * Project a (possibly absent) persisted row to the public DTO. An absent row
 * means "all defaults" — reads never have to create a row.
 */
export function toNotificationPreferences(
  row: { emailDigestEnabled: boolean; validationAlertsEnabled: boolean } | null | undefined,
): NotificationPreferences {
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    emailDigestEnabled: row.emailDigestEnabled,
    validationAlertsEnabled: row.validationAlertsEnabled,
  };
}

/**
 * Merge a partial patch over the current preferences. Only keys present in the
 * patch change; everything else is preserved. Pure — never mutates its inputs.
 */
export function mergeNotificationPreferences(
  current: NotificationPreferences,
  patch: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    emailDigestEnabled: patch.emailDigestEnabled ?? current.emailDigestEnabled,
    validationAlertsEnabled: patch.validationAlertsEnabled ?? current.validationAlertsEnabled,
  };
}
