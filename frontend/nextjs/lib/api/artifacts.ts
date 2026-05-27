// lib/api/artifacts.ts — typed artifact + relation endpoints

import { apiClient } from "./client";
import type { Artifact, Relation, ArtifactType, ArtifactStatus, RelationType } from "@/lib/types";

export const artifactsApi = {
  list: (projectId: string, params?: { type?: ArtifactType; status?: ArtifactStatus; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    const tail = qs.toString();
    return apiClient.get<Artifact[]>(`/projects/${projectId}/artifacts${tail ? `?${tail}` : ""}`);
  },
  create: (projectId: string, body: Partial<Artifact>) =>
    apiClient.post<Artifact>(`/projects/${projectId}/artifacts`, body),
  get:    (id: string) => apiClient.get<Artifact>(`/artifacts/${id}`),
  update: (id: string, body: Partial<Artifact>) => apiClient.patch<Artifact>(`/artifacts/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`/artifacts/${id}`),
};

export const relationsApi = {
  list: (artifactId: string) =>
    apiClient.get<{ incoming: Relation[]; outgoing: Relation[] }>(`/artifacts/${artifactId}/relations`),
  create: (artifactId: string, body: { targetArtifactId: string; relationType: RelationType; description?: string }) =>
    apiClient.post<Relation>(`/artifacts/${artifactId}/relations`, body),
  remove: (id: string) => apiClient.delete<void>(`/relations/${id}`),
};
