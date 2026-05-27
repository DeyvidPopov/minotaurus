// app/(app)/layout.tsx — authenticated workspace
import { AppShell } from "@/components/shell/app-shell";
import { AuthProvider } from "@/lib/auth-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider requireAuth>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
