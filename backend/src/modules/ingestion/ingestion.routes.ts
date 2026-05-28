import { Router } from "express";
import {
  createDraft,
  deleteIngestionRecord,
  getIngestionRecord,
  listIngestionRecords,
} from "./ingestion.controller.js";

export const projectIngestionRouter = Router({ mergeParams: true });
projectIngestionRouter.get("/", listIngestionRecords);
projectIngestionRouter.post("/draft", createDraft);

export const ingestionRouter = Router();
ingestionRouter.get("/:ingestionId", getIngestionRecord);
ingestionRouter.delete("/:ingestionId", deleteIngestionRecord);
