// lib/api/members.ts — project team management

import { apiClient } from "./client";

export type ProjectRole = "OWNER" | "ARCHITECT" | "DEVELOPER" | "VIEWER";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    name: string | null;
    initials: string | null;
    globalRole: string;
  };
}

export const membersApi = {
  list: (projectId: string) =>
    apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`),
  add: (projectId: string, body: { email: string; role: ProjectRole }) =>
    apiClient.post<ProjectMember>(`/projects/${projectId}/members`, body),
  updateRole: (projectId: string, memberId: string, role: ProjectRole) =>
    apiClient.patch<ProjectMember>(`/projects/${projectId}/members/${memberId}`, { role }),
  remove: (projectId: string, memberId: string) =>
    apiClient.delete<void>(`/projects/${projectId}/members/${memberId}`),
};
