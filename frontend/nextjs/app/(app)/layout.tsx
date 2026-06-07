// app/(app)/layout.tsx — authenticated workspace
import { AppShell } from "@/components/shell/app-shell";
import { ReactivationBanner } from "@/components/shell/reactivation-banner";
import { AuthProvider } from "@/lib/auth-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider requireAuth>
      <ReactivationBanner />
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
