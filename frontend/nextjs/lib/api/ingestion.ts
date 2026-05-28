// lib/api/ingestion.ts — typed ingestion endpoints

import { apiClient } from "./client";
import type { ArtifactType } from "@/lib/types";
import type { HttpMethod } from "./api-specs";

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

export interface ParsedOpenApiEndpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  requiresAuth: boolean;
  requestSchema?: string;
  responseSchema?: string;
}

export interface OpenApiParserResult {
  source: "OPENAPI_JSON";
  title: string;
  version: string;
  baseUrl: string;
  availableBaseUrls?: string[];
  description: string;
  endpointCount: number;
  endpoints: ParsedOpenApiEndpoint[];
}

export interface CreatedRecordRef {
  type: "ARTIFACT" | "API_SPEC" | "API_ENDPOINT";
  id: string;
  mode?: "LINK_EXISTING" | "CREATE_NEW" | "CREATE_API_SPEC";
}

export interface IngestionRecord {
  id: string;
  projectId: string;
  sourceType: IngestionSourceType;
  status: IngestionStatus;
  title: string;
  sourceName: string;
  createdRecords: CreatedRecordRef[] | unknown;
  parserResult: MarkdownParserResult | OpenApiParserResult | null;
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

export interface OpenApiParseResponse {
  record: IngestionRecord;
  preview: OpenApiParserResult;
}

export interface ConfirmOpenApiBody {
  mode: "CREATE_API_SPEC";
  artifactId?: string | null;
  baseUrl?: string;
}

export interface ConfirmOpenApiResponse {
  record: IngestionRecord;
  apiSpec: {
    id: string;
    title: string;
    version: string;
    baseUrl: string;
    endpointCount: number;
    linkedArtifactId: string | null;
  };
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
  parseOpenApiJson: (ingestionId: string, openapiJson: string) =>
    apiClient.post<OpenApiParseResponse>(`/ingestion/${ingestionId}/parse-openapi-json`, { openapiJson }),
  confirmOpenApiJson: (ingestionId: string, body: ConfirmOpenApiBody) =>
    apiClient.post<ConfirmOpenApiResponse>(`/ingestion/${ingestionId}/confirm-openapi-json`, body),
};
