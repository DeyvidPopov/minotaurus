// lib/api/settings.ts — typed per-user settings endpoints.
import { apiClient } from "./client";

export interface NotificationPreferences {
  emailDigestEnabled: boolean;
  validationAlertsEnabled: boolean;
}

export const settingsApi = {
  getNotifications: () =>
    apiClient.get<{ preferences: NotificationPreferences }>("/settings/notifications"),
  // Partial patch — send only the toggle(s) that changed; the other flag is preserved server-side.
  updateNotifications: (body: Partial<NotificationPreferences>) =>
    apiClient.patch<{ preferences: NotificationPreferences }>("/settings/notifications", body),
};
