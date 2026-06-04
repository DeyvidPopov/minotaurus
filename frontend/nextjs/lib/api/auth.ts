// lib/api/auth.ts — typed auth endpoints
import { apiClient, setAccessToken } from "./client";
import type { User } from "@/lib/types";

export interface AuthResponse {
  token: string;
  user: User;
}

// Multi-step verified registration. The frontend wizard drives these in order:
//   start → verify → complete (and resend as needed). Only `complete` returns a
//   token + user (same shape as login); start/verify/resend never log the user in.
export interface RegisterStartResponse {
  email: string;
  resendAvailableAt: string; // ISO timestamp
}
export interface RegisterVerifyResponse {
  registrationToken: string;
  expiresAt: string; // ISO timestamp
}
export interface RegisterResendResponse {
  resendAvailableAt: string; // ISO timestamp
}

export const authApi = {
  login: async (body: { email: string; password: string }) => {
    const data = await apiClient.post<AuthResponse>("/auth/login", body);
    setAccessToken(data.token);
    return data;
  },
  // DEPRECATED: single-step, unverified registration. Prefer the multi-step
  // register.* flow below. Kept until the wizard UI replaces the register page.
  register: async (body: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => {
    const data = await apiClient.post<AuthResponse>("/auth/register", body);
    setAccessToken(data.token);
    return data;
  },
  registerStart: (body: { firstName: string; lastName: string; email: string }) =>
    apiClient.post<RegisterStartResponse>("/auth/register/start", body),
  registerVerify: (body: { email: string; code: string }) =>
    apiClient.post<RegisterVerifyResponse>("/auth/register/verify", body),
  registerComplete: async (body: {
    registrationToken: string;
    password: string;
    confirmPassword: string;
  }) => {
    const data = await apiClient.post<AuthResponse>("/auth/register/complete", body);
    setAccessToken(data.token);
    return data;
  },
  registerResend: (body: { email: string }) =>
    apiClient.post<RegisterResendResponse>("/auth/register/resend", body),
  me: () => apiClient.get<{ user: User }>("/auth/me"),
  updateMe: (body: Partial<Pick<User, "firstName" | "lastName" | "email" | "defaultProjectId">>) =>
    apiClient.patch<{ user: User }>("/auth/me", body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiClient.post<{ user: User }>("/auth/change-password", body),
  logout: () => setAccessToken(null),
};
