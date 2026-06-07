"use client";

// Email-link target for the one-click "undo account deletion" flow. Token-based,
// so it works while the user is signed out. Reads ?token= and cancels the pending
// deletion, then points the user back to sign in.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { accountApi } from "@/lib/api/account";
import { BrandLogo } from "@/components/shell/brand-logo";

type Status = "working" | "done" | "error";

export default function ReactivatePage() {
  const [status, setStatus] = useState<Status>("working");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      return;
    }
    accountApi
      .cancelDeletion(token)
      .then(() => setStatus("done"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen grid place-items-center px-4" style={{ background: "var(--bg)" }}>
      <div className="w-[400px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg p-7 flex flex-col items-center gap-4 text-center">
        <BrandLogo layout="stacked" />

        {status === "working" && (
          <>
            <Loader2 size={28} className="text-accent motion-safe:animate-spin" />
            <p className="m-0 text-[13.5px] text-fg-muted">Cancelling your account deletion…</p>
          </>
        )}

        {status === "done" && (
          <>
            <CheckCircle2 size={28} className="text-[var(--c-green,#1f8a5b)]" />
            <div>
              <h1 className="m-0 text-[16px] font-semibold">Your account is safe</h1>
              <p className="mt-1 mb-0 text-[13px] text-fg-muted">The scheduled deletion has been cancelled. You can sign in as usual.</p>
            </div>
            <Link href="/login" className="text-[13px] font-medium text-accent hover:underline">Go to sign in</Link>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle size={28} className="text-danger" />
            <div>
              <h1 className="m-0 text-[16px] font-semibold">This link didn’t work</h1>
              <p className="mt-1 mb-0 text-[13px] text-fg-muted">It may have already been used, expired, or the deletion was already undone. If your account still works, no action is needed.</p>
            </div>
            <Link href="/login" className="text-[13px] font-medium text-accent hover:underline">Go to sign in</Link>
          </>
        )}
      </div>
    </div>
  );
}
