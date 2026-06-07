// lib/api/index.ts — barrel re-exports of the per-module API wrappers, plus the
// inline graph / validation / export wrappers.

export * from "./client";
export * from "./auth";
export * from "./projects";
export * from "./artifacts";
export * from "./documentation";
export * from "./api-specs";
export * from "./database-models";
export * from "./diagrams";
export * from "./versions";
export * from "./members";
export * from "./ingestion";
export * from "./ai";

import { apiClient } from "./client";
import type {
  ValidationIssue, VersionEntry, IssueStatus,
  Severity, Category, EntityType, ChangeType, ExportFormat,
  QuickFixPreview, QuickFixApplyResult,
  RemediationPreview, RemediationApplyResult,
} from "@/lib/types";

export const graphApi = {
  get: (projectId: string) =>
    apiClient.get<{ nodes: unknown[]; edges: unknown[] }>(`/projects/${projectId}/graph`),
};

export const validationApi = {
  run:    (projectId: string) => apiClient.post<{ runId: string }>(`/projects/${projectId}/validate`),
  list:   (projectId: string, params?: { severity?: Severity; category?: Category; status?: IssueStatus }) => {
    const qs = new URLSearchParams();
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.category) qs.set("category", params.category);
    if (params?.status) qs.set("status", params.status);
    const tail = qs.toString();
    return apiClient.get<ValidationIssue[]>(`/projects/${projectId}/validation-issues${tail ? `?${tail}` : ""}`);
  },
  update: (id: string, body: { status: IssueStatus }) =>
    apiClient.patch<ValidationIssue>(`/validation-issues/${id}`, body),
  // Quick Fix Framework (V1): deterministic SAFE fix — preview + apply for a single issue.
  quickFixPreview: (issueId: string) =>
    apiClient.get<QuickFixPreview>(`/validation-issues/${issueId}/quick-fix/preview`),
  quickFixApply: (issueId: string) =>
    apiClient.post<QuickFixApplyResult>(`/validation-issues/${issueId}/quick-fix/apply`),
  // Relation Remediation (V1): REVIEW-required — deterministic candidates + confirmed apply.
  remediationPreview: (issueId: string) =>
    apiClient.get<RemediationPreview>(`/validation-issues/${issueId}/remediation/preview`),
  remediationApply: (issueId: string, body: { targetId: string; relationType?: string }) =>
    apiClient.post<RemediationApplyResult>(`/validation-issues/${issueId}/remediation/apply`, body),
};

export const versionsApi = {
  list: (projectId: string, params?: { entityType?: EntityType; changeType?: ChangeType }) => {
    const qs = new URLSearchParams();
    if (params?.entityType) qs.set("entityType", params.entityType);
    if (params?.changeType) qs.set("changeType", params.changeType);
    const tail = qs.toString();
    return apiClient.get<VersionEntry[]>(`/projects/${projectId}/versions${tail ? `?${tail}` : ""}`);
  },
};

export const exportApi = {
  create: (projectId: string, body: { format: ExportFormat; sections: string[] }) =>
    apiClient.post<{ id: string; status: string }>(`/projects/${projectId}/export`, body),
  list:   (projectId: string) => apiClient.get<unknown[]>(`/projects/${projectId}/exports`),
  download: (exportId: string) =>
    `${process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "/api"}/exports/${exportId}/download`,
};
