// lib/api/ingestion.ts — typed ingestion endpoints

import { apiClient } from "./client";
import type { ArtifactType } from "@/lib/types";
import type { HttpMethod } from "./api-specs";
import type { DiagramType } from "./diagrams";
import type { DatabaseType } from "./database-models";

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

// DiagramType + DatabaseType are intentionally NOT re-exported from this
// module to avoid clashing with the same names on the diagrams /
// database-models modules through the api barrel. Consumers should import
// them from there directly.

export interface MermaidParserResult {
  source: "MERMAID";
  title: string;
  diagramType: DiagramType;
  lineCount: number;
  nodeHints: string[];
  mermaidSource: string;
}

export interface ParsedSqlField {
  name: string;
  type: string;
  required: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesEntity?: string;
  referencesField?: string;
  description?: string;
}

export interface ParsedSqlEntity {
  name: string;
  description?: string;
  fields: ParsedSqlField[];
}

export interface ParsedSqlRelationship {
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
}

export interface SqlSchemaParserResult {
  source: "SQL_SCHEMA";
  title: string;
  databaseType: DatabaseType;
  entityCount: number;
  fieldCount: number;
  entities: ParsedSqlEntity[];
  relationships: ParsedSqlRelationship[];
  rawSql?: string;
}

export interface CreatedRecordRef {
  type:
    | "ARTIFACT"
    | "API_SPEC"
    | "API_ENDPOINT"
    | "DIAGRAM"
    | "DATABASE_MODEL"
    | "DATABASE_ENTITY"
    | "DATABASE_FIELD";
  id: string;
  mode?:
    | "LINK_EXISTING"
    | "CREATE_NEW"
    | "CREATE_API_SPEC"
    | "CREATE_DIAGRAM"
    | "CREATE_DATABASE_MODEL";
}

export interface IngestionRecord {
  id: string;
  projectId: string;
  sourceType: IngestionSourceType;
  status: IngestionStatus;
  title: string;
  sourceName: string;
  createdRecords: CreatedRecordRef[] | unknown;
  parserResult:
    | MarkdownParserResult
    | OpenApiParserResult
    | MermaidParserResult
    | SqlSchemaParserResult
    | null;
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
  parseMermaid: (ingestionId: string, mermaidSource: string) =>
    apiClient.post<{ record: IngestionRecord; preview: MermaidParserResult }>(
      `/ingestion/${ingestionId}/parse-mermaid`,
      { mermaidSource },
    ),
  confirmMermaid: (ingestionId: string, body: { mode: "CREATE_DIAGRAM"; artifactId?: string | null; title: string; diagramType: DiagramType }) =>
    apiClient.post<{ record: IngestionRecord; diagram: { id: string; title: string; type: DiagramType; linkedArtifactId: string | null } }>(
      `/ingestion/${ingestionId}/confirm-mermaid`,
      body,
    ),
  parseSqlSchema: (ingestionId: string, sql: string) =>
    apiClient.post<{ record: IngestionRecord; preview: SqlSchemaParserResult }>(
      `/ingestion/${ingestionId}/parse-sql-schema`,
      { sql },
    ),
  confirmSqlSchema: (ingestionId: string, body: { mode: "CREATE_DATABASE_MODEL"; artifactId?: string | null; title: string; databaseType: DatabaseType }) =>
    apiClient.post<{ record: IngestionRecord; databaseModel: { id: string; title: string; databaseType: DatabaseType; entityCount: number; linkedArtifactId: string | null } }>(
      `/ingestion/${ingestionId}/confirm-sql-schema`,
      body,
    ),
};
