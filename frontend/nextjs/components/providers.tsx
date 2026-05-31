// components/providers.tsx — theme + tweaks store + toaster
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";
import { Toaster } from "sonner";

type Theme = "light" | "dark";
type FontPair = "geist" | "inter" | "plex";
type GraphNodeStyle = "shape" | "color" | "minimal";

interface TweakState {
  theme: Theme;
  accent: string;
  fontPair: FontPair;
  graphNodeStyle: GraphNodeStyle;
  graphLegendOpen: boolean;
  set: <K extends keyof Omit<TweakState, "set">>(key: K, value: TweakState[K]) => void;
}

export const useTweaks = create<TweakState>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "#8b5cf6",
      fontPair: "geist",
      graphNodeStyle: "color",
      graphLegendOpen: true,
      set: (key, value) => set({ [key]: value } as Partial<TweakState>),
    }),
    { name: "mino:tweaks" }
  )
);

export function Providers({ children }: { children: React.ReactNode }) {
  const { theme, fontPair } = useTweaks();

  // Sync global data-attributes on <html>. Note: the accent AND the light/dark
  // theme are intentionally NOT applied here — both are owned by AppShell so they
  // only affect authenticated pages. Public pages (landing + auth) keep the fixed
  // dark + purple CSS defaults with no flash. Only the font is global.
  useEffect(() => {
    document.documentElement.setAttribute("data-font", fontPair);
  }, [fontPair]);

  return (
    <>
      {children}
      <Toaster
        position="bottom-center"
        theme={theme}
        toastOptions={{
          style: {
            background: "var(--panel)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            fontSize: 13,
          },
        }}
      />
    </>
  );
}
