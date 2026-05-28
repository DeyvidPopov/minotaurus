// lib/api/documentation.ts — typed artifact documentation endpoints
import { apiClient } from "./client";
import type { ArtifactStatus, ArtifactType } from "@/lib/types";

export interface ArtifactDocumentation {
  artifactId: string;
  content: string;
  updatedAt: string;
}

export interface DocumentedArtifact {
  artifactId: string;
  artifactTitle: string;
  artifactType: ArtifactType;
  artifactStatus: ArtifactStatus;
  hasDocumentation: true;
  markdownContent: string;
  excerpt: string;
  updatedAt: string;
}

export interface MissingDocumentation {
  artifactId: string;
  artifactTitle: string;
  artifactType: ArtifactType;
  artifactStatus: ArtifactStatus;
}

export interface DocumentationOverview {
  summary: {
    totalArtifacts: number;
    documentedArtifacts: number;
    missingDocumentation: number;
    coveragePercent: number;
  };
  documents: DocumentedArtifact[];
  missing: MissingDocumentation[];
}

export const documentationApi = {
  get: (artifactId: string) =>
    apiClient.get<ArtifactDocumentation>(`/artifacts/${artifactId}/documentation`),
  save: (artifactId: string, markdownContent: string) =>
    apiClient.put<ArtifactDocumentation>(`/artifacts/${artifactId}/documentation`, {
      markdownContent,
    }),
  overview: (projectId: string) =>
    apiClient.get<DocumentationOverview>(`/projects/${projectId}/documentation`),
};
