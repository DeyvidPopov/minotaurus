import { Router } from "express";
import {
  confirmMarkdownEndpoint,
  createDraft,
  deleteIngestionRecord,
  getIngestionRecord,
  listIngestionRecords,
  parseMarkdownEndpoint,
} from "./ingestion.controller.js";

export const projectIngestionRouter = Router({ mergeParams: true });
projectIngestionRouter.get("/", listIngestionRecords);
projectIngestionRouter.post("/draft", createDraft);

export const ingestionRouter = Router();
ingestionRouter.get("/:ingestionId", getIngestionRecord);
ingestionRouter.delete("/:ingestionId", deleteIngestionRecord);
ingestionRouter.post("/:ingestionId/parse-markdown", parseMarkdownEndpoint);
ingestionRouter.post("/:ingestionId/confirm-markdown", confirmMarkdownEndpoint);
