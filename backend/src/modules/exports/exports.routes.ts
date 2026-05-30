import { Router } from "express";
import { createExport, downloadExport, getExport, listExports } from "./exports.controller.js";

export const projectExportsRouter = Router({ mergeParams: true });
projectExportsRouter.post("/export", createExport);
projectExportsRouter.get("/exports", listExports);

export const exportsRouter = Router();
// Specific route before the catch-all ":exportId" so it isn't shadowed.
exportsRouter.get("/:exportId/download", downloadExport);
exportsRouter.get("/:exportId", getExport);
