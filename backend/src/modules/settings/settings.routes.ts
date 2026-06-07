// Per-user settings routes. Mounted at /settings behind requireAuth (see
// routes.ts), so every handler has an authenticated req.user.
import { Router } from "express";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./settings.controller.js";

export const settingsRouter = Router();

settingsRouter.get("/notifications", getNotificationPreferences);
settingsRouter.patch("/notifications", updateNotificationPreferences);
