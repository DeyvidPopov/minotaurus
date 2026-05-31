// components/providers.tsx — theme + tweaks store + toaster
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";
import { Toaster } from "sonner";

type Theme = "light" | "dark";
type Density = "compact" | "regular" | "comfy";
type FontPair = "geist" | "inter" | "plex";
type GraphNodeStyle = "shape" | "color" | "minimal";

interface TweakState {
  theme: Theme;
  accent: string;
  density: Density;
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
      density: "regular",
      fontPair: "geist",
      graphNodeStyle: "color",
      graphLegendOpen: true,
      set: (key, value) => set({ [key]: value } as Partial<TweakState>),
    }),
    { name: "mino:tweaks" }
  )
);

export function Providers({ children }: { children: React.ReactNode }) {
  const { theme, density, fontPair } = useTweaks();

  // Sync global data-attributes on <html>. Note: the accent is intentionally NOT
  // applied here — it's owned by AppShell so it only affects authenticated pages.
  // Public pages (landing + auth) keep the fixed purple CSS default with no flash.
  useEffect(() => {
    const h = document.documentElement;
    h.setAttribute("data-theme", theme);
    h.setAttribute("data-density", density);
    h.setAttribute("data-font", fontPair);
  }, [theme, density, fontPair]);

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
