// lib/api/ingestion.ts — typed ingestion endpoints

import { apiClient } from "./client";
import type { ArtifactType } from "@/lib/types";

export type IngestionSourceType =
  | "MARKDOWN"
  | "OPENAPI_JSON"
  | "MERMAID"
  | "SQL_SCHEMA";

export type IngestionStatus = "DRAFT" | "PARSED" | "CONFIRMED" | "FAILED";

export interface MarkdownParserResult {
  title: string;
  excerpt: string;
  headings: string[];
  wordCount: number;
  suggestedArtifactType: ArtifactType;
  /** The raw markdown body; kept so confirm can run without a separate upload. */
  markdown?: string;
}

export interface CreatedRecordRef {
  type: "ARTIFACT";
  id: string;
  mode?: "LINK_EXISTING" | "CREATE_NEW";
}

export interface IngestionRecord {
  id: string;
  projectId: string;
  sourceType: IngestionSourceType;
  status: IngestionStatus;
  title: string;
  sourceName: string;
  createdRecords: CreatedRecordRef[] | unknown;
  parserResult: MarkdownParserResult | null;
  errorMessage: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    email: string;
    name: string | null;
    initials: string | null;
  } | null;
}

export interface MarkdownParseResponse {
  record: IngestionRecord;
  preview: MarkdownParserResult;
}

export type ConfirmMarkdownBody =
  | { mode: "LINK_EXISTING"; artifactId: string }
  | { mode: "CREATE_NEW"; artifactTitle: string; artifactType?: ArtifactType };

export interface ConfirmMarkdownResponse {
  record: IngestionRecord;
  artifact: { id: string; title: string; type: ArtifactType };
}

export const ingestionApi = {
  list: (projectId: string) =>
    apiClient.get<IngestionRecord[]>(`/projects/${projectId}/ingestion`),
  createDraft: (projectId: string, body: { sourceType: IngestionSourceType; title: string; sourceName?: string }) =>
    apiClient.post<IngestionRecord>(`/projects/${projectId}/ingestion/draft`, body),
  get: (ingestionId: string) =>
    apiClient.get<IngestionRecord>(`/ingestion/${ingestionId}`),
  remove: (ingestionId: string) =>
    apiClient.delete<void>(`/ingestion/${ingestionId}`),
  parseMarkdown: (ingestionId: string, markdown: string) =>
    apiClient.post<MarkdownParseResponse>(`/ingestion/${ingestionId}/parse-markdown`, { markdown }),
  confirmMarkdown: (ingestionId: string, body: ConfirmMarkdownBody) =>
    apiClient.post<ConfirmMarkdownResponse>(`/ingestion/${ingestionId}/confirm-markdown`, body),
};
