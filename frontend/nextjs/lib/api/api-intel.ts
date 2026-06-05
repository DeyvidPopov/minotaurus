// lib/api/api-intel.ts — typed wrapper for the read-only API Payload
// Intelligence endpoint. All values are INFERRED, deterministic, never persisted.

import { apiClient } from "./client";

export type Confidence = "high" | "medium" | "low";

export interface IntelEntityMatch {
  entityId: string;
  entityName: string;
  modelId: string;
  modelTitle: string;
  artifactId: string | null;
  via: string;
  basis: string;
  confidence: Confidence;
}

export type LinkReason = "spec-artifact" | "entity-model" | "relation" | "name-match";

export interface IntelArtifactLink {
  artifactId: string;
  title: string;
  type: string;
  status: string;
  reason: LinkReason;
  relationType?: string;
  basis: string;
  confidence: Confidence;
}

export type WorkflowKind =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "REFERENCE"
  | "READ"
  | "AUTHENTICATE"
  | "GENERATE"
  | "START"
  | "TRIGGER"
  | "REQUIRE"
  | "END";

export interface IntelWorkflowSignal {
  kind: WorkflowKind;
  label: string;
  object: string;
  entityId?: string;
  confidence: Confidence;
  basis: string;
}

export interface IntelWarning {
  field: string;
  kind: "credential" | "pii";
  location: "request" | "response" | "path";
  message: string;
}

export interface EndpointIntel {
  endpointId: string;
  apiSpecId: string;
  method: string;
  path: string;
  requiresAuth: boolean;
  databaseEntities: IntelEntityMatch[];
  /** EVERY extracted request/response field. */
  payloadFields: string[];
  /** The subset of fields that drove inference (id-like or entity-matched). */
  referencedFields: string[];
  relatedArtifacts: IntelArtifactLink[];
  documentation: IntelArtifactLink[];
  security: IntelArtifactLink[];
  workflow: IntelWorkflowSignal[];
  warnings: IntelWarning[];
  anchors: string[];
}

export type InferredEdgeKind = "TOUCHES" | "SECURED_BY" | "DOCUMENTED_BY" | "RELATED";

export interface InferredEdge {
  source: string;
  target: string;
  kind: InferredEdgeKind;
  confidence: Confidence;
  basis: string;
  endpointCount: number;
}

export interface ProjectApiIntel {
  endpoints: EndpointIntel[];
  inferredEdges: InferredEdge[];
}

export const apiIntelApi = {
  get: (projectId: string) => apiClient.get<ProjectApiIntel>(`/projects/${projectId}/api-intel`),
};
