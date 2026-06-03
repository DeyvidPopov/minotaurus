// components/ui/shortcut-hint.tsx — platform-aware keyboard-shortcut label.
//
// The command palette is bound to ⌘K (macOS) AND Ctrl+K (Windows/Linux) — the
// handler in app-shell.tsx already listens for `metaKey || ctrlKey`. This only
// fixes the *display*: macOS users see "⌘K", everyone else sees "Ctrl K",
// instead of the Mac-only ⌘ symbol leaking onto Windows/Linux.
//
// SSR note: the server can't know the platform, so we render the Windows/Linux
// form ("Ctrl …") on the server and first client paint, then upgrade to ⌘ after
// mount on macOS. `suppressHydrationWarning` keeps that swap from warning.
"use client";

import { useEffect, useState } from "react";

/** True once mounted on a macOS / iOS device. SSR-safe (false until mounted). */
export function useIsMac(): boolean {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    const p =
      (typeof navigator !== "undefined" &&
        ((navigator as Navigator & { userAgentData?: { platform?: string } })
          .userAgentData?.platform ||
          navigator.platform ||
          navigator.userAgent)) ||
      "";
    setMac(/mac|iphone|ipad|ipod/i.test(p));
  }, []);
  return mac;
}

/**
 * The platform's command/modifier key label: "⌘" on macOS, "Ctrl" elsewhere.
 */
export function useModKey(): string {
  return useIsMac() ? "⌘" : "Ctrl";
}

/**
 * Renders a single shortcut, platform-aware. `keyName` is the non-modifier key
 * (default "K"). macOS joins tightly ("⌘K"); other platforms add a space
 * ("Ctrl K") since a bare "CtrlK" reads poorly.
 */
export function ShortcutHint({
  keyName = "K",
  className,
}: {
  keyName?: string;
  className?: string;
}) {
  const isMac = useIsMac();
  return (
    <span className={className} suppressHydrationWarning>
      {isMac ? `⌘${keyName}` : `Ctrl ${keyName}`}
    </span>
  );
}
