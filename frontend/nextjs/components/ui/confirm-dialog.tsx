// components/ui/confirm-dialog.tsx — app-wide branded confirmation dialog.
//
// Replaces the browser-native `confirm()` (unstyled, browser-localized, thread-
// blocking) with a dark/branded modal exposed through a promise-based hook:
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title, message, destructive, confirmPhrase }))) return;
//
// Mount <ConfirmProvider> once in the app shell. For destructive actions, pass
// `confirmPhrase` (the entity's name/path) — the confirm button stays disabled
// until the user types it exactly, GitHub-style, to prevent accidental deletes.
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + "Type the name to confirm" affordance for deletes. */
  destructive?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  confirmPhrase?: string;
  /** Overrides the default `Type <phrase> to confirm` label. */
  confirmPhraseLabel?: ReactNode;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a <ConfirmProvider>");
  return ctx;
}

interface DialogState {
  opts: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const [typed, setTyped] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setTyped("");
    return new Promise<boolean>((resolve) => setState({ opts, resolve }));
  }, []);

  const close = useCallback((result: boolean) => {
    setState((s) => {
      s?.resolve(result);
      return null;
    });
  }, []);

  const opts = state?.opts;
  const needsPhrase = !!opts?.confirmPhrase;
  const phraseOk = !needsPhrase || typed.trim() === opts!.confirmPhrase!.trim();

  // Esc cancels; Enter confirms when allowed. Re-bound as `phraseOk` changes.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      else if (e.key === "Enter" && phraseOk) close(true);
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [state, phraseOk, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && opts && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => close(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={opts.title}
            className="w-[440px] max-w-full bg-panel border border-border rounded-lg shadow-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h2 className="text-[15px] font-semibold m-0 mb-1.5">{opts.title}</h2>
              {opts.message && <div className="text-[13.5px] text-fg-muted leading-relaxed">{opts.message}</div>}
              {needsPhrase && (
                <div className="mt-4">
                  <label className="block text-[12.5px] text-fg-muted mb-1.5">
                    {opts.confirmPhraseLabel ?? (
                      <>Type <span className="font-mono text-fg">{opts.confirmPhrase}</span> to confirm</>
                    )}
                  </label>
                  <input
                    ref={inputRef}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full h-9 px-2.5 bg-panel-2 border border-border rounded-sm text-[13.5px] outline-none focus:border-border-strong"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-panel-2">
              <Button onClick={() => close(false)}>{opts.cancelLabel ?? "Cancel"}</Button>
              <Button
                variant={opts.destructive ? "default" : "primary"}
                disabled={!phraseOk}
                onClick={() => close(true)}
                className={opts.destructive ? "bg-danger text-white border-transparent hover:bg-danger hover:brightness-95" : undefined}
              >
                {opts.confirmLabel ?? (opts.destructive ? "Delete" : "Confirm")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
