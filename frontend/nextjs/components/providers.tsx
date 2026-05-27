// components/providers.tsx — theme + tweaks store + toaster
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";
import { Toaster } from "sonner";

type Theme = "light" | "dark";
type Density = "compact" | "regular" | "comfy";
type Sidebar = "expanded" | "icons" | "floating";
type FontPair = "geist" | "inter" | "plex";
type GraphNodeStyle = "shape" | "color" | "minimal";

interface TweakState {
  theme: Theme;
  accent: string;
  density: Density;
  sidebar: Sidebar;
  fontPair: FontPair;
  graphNodeStyle: GraphNodeStyle;
  set: <K extends keyof Omit<TweakState, "set">>(key: K, value: TweakState[K]) => void;
}

export const useTweaks = create<TweakState>()(
  persist(
    (set) => ({
      theme: "dark",
      accent: "#3b82f6",
      density: "regular",
      sidebar: "expanded",
      fontPair: "geist",
      graphNodeStyle: "color",
      set: (key, value) => set({ [key]: value } as Partial<TweakState>),
    }),
    { name: "mino:tweaks" }
  )
);

export function Providers({ children }: { children: React.ReactNode }) {
  const { theme, density, sidebar, fontPair, accent } = useTweaks();

  // sync data-attributes on <html>
  useEffect(() => {
    const h = document.documentElement;
    h.setAttribute("data-theme", theme);
    h.setAttribute("data-density", density);
    h.setAttribute("data-sidebar", sidebar);
    h.setAttribute("data-font", fontPair);
    h.style.setProperty("--accent", accent);
    h.style.setProperty("--accent-fg", accent.toLowerCase() === "#e5e5e5" ? "#0a0a0a" : "#ffffff");
  }, [theme, density, sidebar, fontPair, accent]);

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
