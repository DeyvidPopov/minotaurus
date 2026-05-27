// lib/api/database-models.ts — typed database model wrappers
import { apiClient } from "./client";

export type DatabaseType = "PostgreSQL" | "MySQL" | "MongoDB" | "Redis" | "SQLite";

export const DATABASE_TYPES: DatabaseType[] = [
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "SQLite",
];

export interface DatabaseField {
  id: string;
  entityId: string;
  name: string;
  type: string;
  required: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesEntityId: string | null;
  description: string;
}

export interface DatabaseEntity {
  id: string;
  databaseModelId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  fields: DatabaseField[];
}

export interface DatabaseModel {
  id: string;
  projectId: string;
  artifactId: string | null;
  title: string;
  databaseType: DatabaseType;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  entityCount: number;
}

export const databaseModelsApi = {
  list: (projectId: string, params?: { search?: string; artifactId?: string; databaseType?: DatabaseType }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.artifactId) qs.set("artifactId", params.artifactId);
    if (params?.databaseType) qs.set("databaseType", params.databaseType);
    const tail = qs.toString();
    return apiClient.get<DatabaseModel[]>(
      `/projects/${projectId}/database-models${tail ? `?${tail}` : ""}`,
    );
  },
  create: (
    projectId: string,
    body: Partial<Pick<DatabaseModel, "title" | "databaseType" | "description" | "artifactId">>,
  ) => apiClient.post<DatabaseModel>(`/projects/${projectId}/database-models`, body),
  get: (id: string) => apiClient.get<DatabaseModel>(`/database-models/${id}`),
  update: (
    id: string,
    body: Partial<Pick<DatabaseModel, "title" | "databaseType" | "description" | "artifactId">>,
  ) => apiClient.patch<DatabaseModel>(`/database-models/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`/database-models/${id}`),
};

export const databaseEntitiesApi = {
  list: (databaseModelId: string) =>
    apiClient.get<DatabaseEntity[]>(`/database-models/${databaseModelId}/entities`),
  create: (databaseModelId: string, body: Pick<DatabaseEntity, "name"> & { description?: string }) =>
    apiClient.post<DatabaseEntity>(`/database-models/${databaseModelId}/entities`, body),
  update: (entityId: string, body: Partial<Pick<DatabaseEntity, "name" | "description">>) =>
    apiClient.patch<DatabaseEntity>(`/database-entities/${entityId}`, body),
  remove: (entityId: string) => apiClient.delete<void>(`/database-entities/${entityId}`),
};

export const databaseFieldsApi = {
  create: (
    entityId: string,
    body: Partial<Pick<DatabaseField, "name" | "type" | "required" | "isPrimaryKey" | "isForeignKey" | "referencesEntityId" | "description">>,
  ) => apiClient.post<DatabaseField>(`/database-entities/${entityId}/fields`, body),
  update: (
    fieldId: string,
    body: Partial<Pick<DatabaseField, "name" | "type" | "required" | "isPrimaryKey" | "isForeignKey" | "referencesEntityId" | "description">>,
  ) => apiClient.patch<DatabaseField>(`/database-fields/${fieldId}`, body),
  remove: (fieldId: string) => apiClient.delete<void>(`/database-fields/${fieldId}`),
};
