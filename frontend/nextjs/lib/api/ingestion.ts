// lib/api/ingestion.ts — typed ingestion endpoints

import { apiClient } from "./client";

export type IngestionSourceType =
  | "MARKDOWN"
  | "OPENAPI_JSON"
  | "MERMAID"
  | "SQL_SCHEMA";

export type IngestionStatus = "DRAFT" | "PARSED" | "CONFIRMED" | "FAILED";

export interface IngestionRecord {
  id: string;
  projectId: string;
  sourceType: IngestionSourceType;
  status: IngestionStatus;
  title: string;
  sourceName: string;
  createdRecords: unknown;
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

export const ingestionApi = {
  list: (projectId: string) =>
    apiClient.get<IngestionRecord[]>(`/projects/${projectId}/ingestion`),
  createDraft: (projectId: string, body: { sourceType: IngestionSourceType; title: string; sourceName?: string }) =>
    apiClient.post<IngestionRecord>(`/projects/${projectId}/ingestion/draft`, body),
  get: (ingestionId: string) =>
    apiClient.get<IngestionRecord>(`/ingestion/${ingestionId}`),
  remove: (ingestionId: string) =>
    apiClient.delete<void>(`/ingestion/${ingestionId}`),
};
