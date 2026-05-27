import { Router } from "express";
import {
  getVersionEvent,
  listVersionHistory,
} from "./versions.controller.js";
import { analyzeImpact } from "./impact.controller.js";

export const projectVersionsRouter = Router({ mergeParams: true });
projectVersionsRouter.get("/version-history", listVersionHistory);
projectVersionsRouter.get("/impact/:artifactId", analyzeImpact);

export const versionEventsRouter = Router();
versionEventsRouter.get("/:eventId", getVersionEvent);
