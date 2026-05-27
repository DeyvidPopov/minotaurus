// lib/api/versions.ts — version history + impact analysis wrappers
import { apiClient } from "./client";

export type VersionEntityType =
  | "PROJECT"
  | "ARTIFACT"
  | "RELATION"
  | "DOCUMENTATION"
  | "API_SPEC"
  | "API_ENDPOINT"
  | "DATABASE_MODEL"
  | "DATABASE_ENTITY"
  | "DATABASE_FIELD"
  | "DIAGRAM"
  | "EXPORT"
  | "VALIDATION";

export type VersionAction =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "LINKED"
  | "UNLINKED"
  | "VALIDATED"
  | "EXPORTED";

export const VERSION_ENTITY_TYPES: VersionEntityType[] = [
  "PROJECT",
  "ARTIFACT",
  "RELATION",
  "DOCUMENTATION",
  "API_SPEC",
  "API_ENDPOINT",
  "DATABASE_MODEL",
  "DATABASE_ENTITY",
  "DATABASE_FIELD",
  "DIAGRAM",
  "EXPORT",
  "VALIDATION",
];

export const VERSION_ACTIONS: VersionAction[] = [
  "CREATED",
  "UPDATED",
  "DELETED",
  "LINKED",
  "UNLINKED",
  "VALIDATED",
  "EXPORTED",
];

export interface VersionEvent {
  id: string;
  projectId: string;
  entityType: VersionEntityType;
  entityId: string;
  action: VersionAction;
  title: string;
  description: string;
  triggeredBy: string;
  triggeredByName?: string | null;
  triggeredByInitials?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ImpactArtifactRef {
  id: string;
  title: string;
  type: string;
  status: string;
}

export interface ImpactRelation {
  relationId: string;
  artifact: ImpactArtifactRef;
  relationType: string;
  description: string;
}

export interface ImpactResponse {
  artifact: ImpactArtifactRef & { description: string };
  directDependencies: ImpactRelation[];
  dependentArtifacts: ImpactRelation[];
  apiSpecs: { id: string; title: string; version: string; baseUrl: string; endpointCount: number }[];
  databaseModels: { id: string; title: string; databaseType: string; entityCount: number }[];
  diagrams: { id: string; title: string; type: string }[];
  documentation: { artifactId: string; title: string; excerpt: string; source: "self" | "documenter" }[];
  recentEvents: VersionEvent[];
  impactSummary: {
    affectedArtifacts: number;
    affectedApis: number;
    affectedDatabases: number;
    affectedDiagrams: number;
    affectedDocumentation: number;
  };
}

export const versionsApi = {
  list: (
    projectId: string,
    params?: {
      entityType?: VersionEntityType;
      action?: VersionAction;
      search?: string;
      limit?: number;
    },
  ) => {
    const qs = new URLSearchParams();
    if (params?.entityType) qs.set("entityType", params.entityType);
    if (params?.action) qs.set("action", params.action);
    if (params?.search) qs.set("search", params.search);
    if (params?.limit) qs.set("limit", String(params.limit));
    const tail = qs.toString();
    return apiClient.get<VersionEvent[]>(
      `/projects/${projectId}/version-history${tail ? `?${tail}` : ""}`,
    );
  },
  get: (eventId: string) => apiClient.get<VersionEvent>(`/version-events/${eventId}`),
  impact: (projectId: string, artifactId: string) =>
    apiClient.get<ImpactResponse>(`/projects/${projectId}/impact/${artifactId}`),
};
