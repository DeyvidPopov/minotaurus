// app/(app)/layout.tsx — authenticated workspace
import { AppShell } from "@/components/shell/app-shell";
import { AuthProvider } from "@/lib/auth-context";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider requireAuth>
      <ConfirmProvider>
        <AppShell>{children}</AppShell>
      </ConfirmProvider>
    </AuthProvider>
  );
}
