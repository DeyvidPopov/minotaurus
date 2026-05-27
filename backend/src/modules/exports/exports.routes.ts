import { Router } from "express";
import { createExport, getExport, listExports } from "./exports.controller.js";

export const projectExportsRouter = Router({ mergeParams: true });
projectExportsRouter.post("/export", createExport);
projectExportsRouter.get("/exports", listExports);

export const exportsRouter = Router();
exportsRouter.get("/:exportId", getExport);
