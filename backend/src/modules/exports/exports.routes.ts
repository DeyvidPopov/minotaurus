import { Router } from "express";
import {
  createExport,
  downloadExport,
  getExport,
  getProjectAnalysis,
  listExports,
} from "./exports.controller.js";

export const projectExportsRouter = Router({ mergeParams: true });
projectExportsRouter.post("/export", createExport);
projectExportsRouter.get("/exports", listExports);
// Deterministic, AI-free read of the project's AnalysisResult (Decision Support).
projectExportsRouter.get("/analysis", getProjectAnalysis);

export const exportsRouter = Router();
// Specific route before the catch-all ":exportId" so it isn't shadowed.
exportsRouter.get("/:exportId/download", downloadExport);
exportsRouter.get("/:exportId", getExport);
