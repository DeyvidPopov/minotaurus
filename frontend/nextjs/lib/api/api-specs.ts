// lib/api/api-specs.ts — typed API spec + endpoint wrappers
import { apiClient } from "./client";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiSpec {
  id: string;
  projectId: string;
  artifactId: string | null;
  title: string;
  version: string;
  baseUrl: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  endpointCount: number;
}

export interface ApiEndpoint {
  id: string;
  apiSpecId: string;
  path: string;
  method: HttpMethod;
  summary: string;
  requestSchema: string;
  responseSchema: string;
  requiresAuth: boolean;
  createdAt: string;
  updatedAt: string;
}

export const apiSpecsApi = {
  list: (projectId: string, params?: { search?: string; artifactId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.artifactId) qs.set("artifactId", params.artifactId);
    const tail = qs.toString();
    return apiClient.get<ApiSpec[]>(
      `/projects/${projectId}/api-specs${tail ? `?${tail}` : ""}`,
    );
  },
  create: (
    projectId: string,
    body: Partial<Pick<ApiSpec, "title" | "version" | "baseUrl" | "description" | "artifactId">>,
  ) => apiClient.post<ApiSpec>(`/projects/${projectId}/api-specs`, body),
  get: (id: string) => apiClient.get<ApiSpec>(`/api-specs/${id}`),
  update: (
    id: string,
    body: Partial<Pick<ApiSpec, "title" | "version" | "baseUrl" | "description" | "artifactId">>,
  ) => apiClient.patch<ApiSpec>(`/api-specs/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`/api-specs/${id}`),
};

export const apiEndpointsApi = {
  list: (apiSpecId: string) =>
    apiClient.get<ApiEndpoint[]>(`/api-specs/${apiSpecId}/endpoints`),
  create: (
    apiSpecId: string,
    body: Partial<Pick<ApiEndpoint, "path" | "method" | "summary" | "requestSchema" | "responseSchema" | "requiresAuth">>,
  ) => apiClient.post<ApiEndpoint>(`/api-specs/${apiSpecId}/endpoints`, body),
  update: (
    endpointId: string,
    body: Partial<Pick<ApiEndpoint, "path" | "method" | "summary" | "requestSchema" | "responseSchema" | "requiresAuth">>,
  ) => apiClient.patch<ApiEndpoint>(`/api-endpoints/${endpointId}`, body),
  remove: (endpointId: string) => apiClient.delete<void>(`/api-endpoints/${endpointId}`),
};
