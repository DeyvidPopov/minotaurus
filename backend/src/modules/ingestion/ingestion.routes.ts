import { Router } from "express";
import {
  confirmMarkdownEndpoint,
  confirmMermaidEndpoint,
  confirmOpenApiJsonEndpoint,
  confirmSqlSchemaEndpoint,
  createDraft,
  deleteIngestionRecord,
  getIngestionRecord,
  listIngestionRecords,
  parseMarkdownEndpoint,
  parseMermaidEndpoint,
  parseOpenApiJsonEndpoint,
  parseSqlSchemaEndpoint,
} from "./ingestion.controller.js";

export const projectIngestionRouter = Router({ mergeParams: true });
projectIngestionRouter.get("/", listIngestionRecords);
projectIngestionRouter.post("/draft", createDraft);

export const ingestionRouter = Router();
ingestionRouter.get("/:ingestionId", getIngestionRecord);
ingestionRouter.delete("/:ingestionId", deleteIngestionRecord);
ingestionRouter.post("/:ingestionId/parse-markdown", parseMarkdownEndpoint);
ingestionRouter.post("/:ingestionId/confirm-markdown", confirmMarkdownEndpoint);
ingestionRouter.post("/:ingestionId/parse-openapi-json", parseOpenApiJsonEndpoint);
ingestionRouter.post("/:ingestionId/confirm-openapi-json", confirmOpenApiJsonEndpoint);
ingestionRouter.post("/:ingestionId/parse-mermaid", parseMermaidEndpoint);
ingestionRouter.post("/:ingestionId/confirm-mermaid", confirmMermaidEndpoint);
ingestionRouter.post("/:ingestionId/parse-sql-schema", parseSqlSchemaEndpoint);
ingestionRouter.post("/:ingestionId/confirm-sql-schema", confirmSqlSchemaEndpoint);
