"use client";

// Shown app-wide while the signed-in account has a pending soft-deletion. Lets the
// user cancel the scheduled purge in-app (the email link does the same while
// signed out). Renders nothing for a normal account. Mounted inside the AppShell
// content column (below the Topbar) so it never pushes the sidebar/logo/topbar
// down — it's a strip atop the content, not a layout-shifting page-level bar.
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { authApi } from "@/lib/api/auth";
import { accountApi } from "@/lib/api/account";
import { Button } from "@/components/ui/button";

export function ReactivationBanner() {
  const { user, setUser } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!user?.deletionPending) return null;

  const reactivate = async () => {
    setBusy(true);
    try {
      await accountApi.reactivate();
      const res = await authApi.me();
      setUser(res.user);
      toast.success("Welcome back — your account is active again.");
    } catch {
      toast.error("Could not reactivate your account.");
      setBusy(false);
    }
  };

  return (
    <div className="shrink-0 flex items-center justify-center gap-x-3 gap-y-1.5 flex-wrap px-4 py-2 text-[12.5px] text-danger bg-[var(--c-danger-soft)] border-b border-[color-mix(in_srgb,var(--c-danger)_40%,transparent)]">
      <span className="inline-flex items-center gap-2">
        <AlertTriangle size={14} aria-hidden className="shrink-0" />
        Your account is scheduled for deletion and is currently deactivated.
      </span>
      <Button size="sm" onClick={reactivate} disabled={busy} className="shrink-0">
        {busy ? "Reactivating…" : "Reactivate account"}
      </Button>
    </div>
  );
}
