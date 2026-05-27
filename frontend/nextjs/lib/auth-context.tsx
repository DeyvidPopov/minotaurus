// lib/auth-context.tsx — React context for the authed user
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api/auth";
import { setAccessToken } from "@/lib/api/client";
import type { User } from "@/lib/types";

interface AuthState {
  user: User | null;
  status: "loading" | "ready" | "anonymous";
}

interface AuthValue extends AuthState {
  setUser: (u: User | null) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ user: null, status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const token =
      typeof window !== "undefined" ? localStorage.getItem("mino:token") : null;
    if (!token) {
      setState({ user: null, status: "anonymous" });
      return;
    }
    authApi
      .me()
      .then((res) => {
        if (cancelled) return;
        setState({ user: res.user, status: "ready" });
      })
      .catch(() => {
        if (cancelled) return;
        setAccessToken(null);
        setState({ user: null, status: "anonymous" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (requireAuth && state.status === "anonymous") {
      router.replace("/login");
    }
  }, [requireAuth, state.status, router]);

  const signOut = useCallback(() => {
    setAccessToken(null);
    setState({ user: null, status: "anonymous" });
    router.replace("/login");
  }, [router]);

  const setUser = useCallback((u: User | null) => {
    setState({ user: u, status: u ? "ready" : "anonymous" });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      status: "loading",
      setUser: () => {},
      signOut: () => {},
    };
  }
  return ctx;
}
