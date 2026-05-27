// lib/api/documentation.ts — typed artifact documentation endpoints
import { apiClient } from "./client";

export interface ArtifactDocumentation {
  artifactId: string;
  content: string;
  updatedAt: string;
}

export const documentationApi = {
  get: (artifactId: string) =>
    apiClient.get<ArtifactDocumentation>(`/artifacts/${artifactId}/documentation`),
  save: (artifactId: string, markdownContent: string) =>
    apiClient.put<ArtifactDocumentation>(`/artifacts/${artifactId}/documentation`, {
      markdownContent,
    }),
};
