// lib/api/client.ts — central API client.
// Per the implementation contract: frontend never hits the DB directly.
// All requests go through this client, which attaches the auth token,
// handles JSON, and unwraps the { success, data, message } envelope.

import type { ApiResponse } from "@/lib/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "/api";

let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("mino:token", token);
    else localStorage.removeItem("mino:token");
  }
}

if (typeof window !== "undefined") {
  accessToken = localStorage.getItem("mino:token");
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  if (accessToken) (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  let body: unknown = null;
  try { body = await res.json(); } catch { /* not JSON */ }

  if (!res.ok) {
    const b = body as { error?: { message?: string }; message?: string } | null;
    const message = b?.error?.message || b?.message || res.statusText;
    throw new ApiError(res.status, message, body);
  }
  const env = body as ApiResponse<T>;
  if (env && typeof env === "object" && "data" in env) return env.data;
  return body as T;
}

export const apiClient = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch:  <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put:    <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
