// lib/api/projects.ts — typed project endpoints

import { apiClient } from "./client";
import type { Project } from "@/lib/types";

export const projectsApi = {
  list:   () => apiClient.get<Project[]>("/projects"),
  create: (body: { name: string; description?: string }) => apiClient.post<Project>("/projects", body),
  get:    (id: string) => apiClient.get<Project>(`/projects/${id}`),
  update: (id: string, body: Partial<Project>) => apiClient.patch<Project>(`/projects/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`/projects/${id}`),
};
