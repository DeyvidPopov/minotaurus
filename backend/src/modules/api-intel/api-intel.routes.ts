import { Router } from "express";
import { getApiIntel } from "./api-intel.controller.js";

// Mounted at /projects/:projectId/api-intel (read-only, VIEWER+).
export const projectApiIntelRouter = Router({ mergeParams: true });
projectApiIntelRouter.get("/", getApiIntel);
