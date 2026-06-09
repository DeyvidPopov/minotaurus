// modules/dashboard/dashboard.routes.ts
import { Router } from "express";
import { getDashboardSummary } from "./dashboard.controller.js";

// Mounted at /dashboard behind requireAuth (see routes.ts). Read-only.
export const dashboardRouter = Router();
dashboardRouter.get("/summary", getDashboardSummary);
