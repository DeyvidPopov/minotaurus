// lib/api/auth.ts — typed auth endpoints
import { apiClient, setAccessToken } from "./client";
import type { User } from "@/lib/types";

export interface AuthResponse {
  token: string;
  user: User;
}

export const authApi = {
  login: async (body: { email: string; password: string }) => {
    const data = await apiClient.post<AuthResponse>("/auth/login", body);
    setAccessToken(data.token);
    return data;
  },
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
  me: () => apiClient.get<{ user: User }>("/auth/me"),
  updateMe: (body: Partial<Pick<User, "firstName" | "lastName" | "email" | "defaultProjectId">>) =>
    apiClient.patch<{ user: User }>("/auth/me", body),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiClient.post<{ user: User }>("/auth/change-password", body),
  logout: () => setAccessToken(null),
};
