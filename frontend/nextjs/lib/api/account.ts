// lib/api/account.ts — account-deletion endpoints (soft-delete + 30d grace).
import { apiClient } from "./client";

export interface TransferTarget {
  userId: string;
  name: string;
  email: string;
  role: string;
}

export interface DeletionSimpleProject {
  id: string;
  name: string;
  memberCount: number;
}

export interface DeletionSharedProject extends DeletionSimpleProject {
  targets: TransferTarget[];
}

export interface DeletionPreview {
  /** Sole-owner, no other members → deleted on purge (covered by the data export). */
  soloOwned: DeletionSimpleProject[];
  /** Sole-owner WITH other members → require a Transfer/Delete decision. */
  sharedOwned: DeletionSharedProject[];
  /** Survive without you (co-owned / member-only) — authorship reattributed; no decision. */
  continuing: DeletionSimpleProject[];
  graceDays: number;
}

export interface DeletionPlanItem {
  projectId: string;
  action: "TRANSFER" | "DELETE";
  transferToUserId?: string;
}

const apiBase = () =>
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "/api";

export const accountApi = {
  deletionPreview: () => apiClient.get<DeletionPreview>("/auth/account/deletion-preview"),
  deletionStatus: () =>
    apiClient.get<{ pending: boolean; scheduledFor: string | null }>("/auth/account/deletion-status"),
  requestDeletion: (body: { password: string; plan: DeletionPlanItem[] }) =>
    apiClient.post<{ scheduledFor: string; graceDays: number }>("/auth/account/deletion", body),
  /** Authenticated in-app reactivate (the banner). */
  reactivate: () => apiClient.post<null>("/auth/account/reactivate"),
  /** Token-based undo from the email link (no auth). */
  cancelDeletion: (token: string) =>
    apiClient.post<null>("/auth/account/cancel-deletion", { token }),
  /** Stream the data-export .zip and trigger a browser download. */
  downloadBundle: async (): Promise<void> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("mino:token") : null;
    const res = await fetch(`${apiBase()}/auth/account/export-bundle`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "{}",
    });
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "minotaurus-export.zip";
    a.click();
    URL.revokeObjectURL(url);
  },
};
