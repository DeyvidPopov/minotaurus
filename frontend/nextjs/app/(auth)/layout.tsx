// app/(auth)/layout.tsx — no chrome, full-bleed auth screen
import { BrandLogo } from "@/components/shell/brand-logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center p-6" style={{
      background: `
        radial-gradient(800px 400px at 20% 0%, var(--accent-soft), transparent 60%),
        radial-gradient(700px 360px at 100% 100%, color-mix(in srgb, var(--c-purple) 14%, transparent), transparent 60%),
        var(--bg)
      `,
    }}>
      <div className="flex flex-col items-center gap-7 w-full">
        <BrandLogo layout="stacked" markSize={44} title="Back to landing" />
        {children}
      </div>
    </div>
  );
}
