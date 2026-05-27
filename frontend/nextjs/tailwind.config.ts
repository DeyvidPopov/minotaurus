import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // map to CSS variables so theme switching just swaps the variables
        bg: "var(--bg)",
        "bg-2": "var(--bg-2)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        "panel-hover": "var(--panel-hover)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        fg: "var(--fg)",
        "fg-muted": "var(--fg-muted)",
        "fg-subtle": "var(--fg-subtle)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-fg": "var(--accent-fg)",
        success: "var(--c-success)",
        warning: "var(--c-warning)",
        danger: "var(--c-danger)",
        info: "var(--c-info)",
      },
      borderRadius: {
        xs: "var(--r-xs)",
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      keyframes: {
        skel: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        spin: {
          to: { transform: "rotate(360deg)" },
        },
      },
      animation: {
        skel: "skel 1.4s ease-in-out infinite",
        spin: "spin 1s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
