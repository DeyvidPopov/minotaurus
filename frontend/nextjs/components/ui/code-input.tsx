// components/ui/code-input.tsx — 6-digit OTP input.
//
// Shared by the registration / forgot-password wizards and the Settings
// email-change modal. Fill-only (no auto-submit): the parent decides when to
// submit. Handles per-box typing, multi-char distribution (iOS SMS autofill),
// paste, backspace chaining, and arrow navigation. Clears + refocuses the first
// box whenever `resetSignal` changes.
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function CodeInput({
  length,
  resetSignal,
  disabled,
  invalid,
  errorId,
  onChange,
}: {
  length: number;
  resetSignal: number;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
  onChange: (value: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(""));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // Clear + refocus the first box on mount and whenever the parent resets.
  useEffect(() => {
    setDigits(Array(length).fill(""));
    refs.current[0]?.focus();
  }, [resetSignal, length]);

  const commit = (next: string[]) => {
    setDigits(next);
    // Fill only — no auto-submit. The parent submits via its button (or Enter
    // while the form is focused and the button is enabled).
    onChange(next.join(""));
  };

  const handleChange = (i: number, raw: string) => {
    // Empty value = an explicit clear (Delete / cut / select-all+Delete). Keep
    // the box state in sync rather than letting the controlled value snap back.
    if (raw === "") {
      const next = [...digits];
      next[i] = "";
      commit(next);
      return;
    }
    const typed = raw.replace(/\D/g, "");
    if (!typed) return; // a non-digit char was typed → ignore it
    const next = [...digits];
    // Distribute multiple chars (e.g. iOS SMS autofill into the first box).
    for (let k = 0; k < typed.length && i + k < length; k++) next[i + k] = typed[k]!;
    commit(next);
    refs.current[Math.min(i + typed.length, length - 1)]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[i]) {
        next[i] = "";
        commit(next);
      } else if (i > 0) {
        next[i - 1] = "";
        commit(next);
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === "ArrowRight" && i < length - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    const next = Array.from({ length }, (_, k) => text[k] ?? "");
    commit(next);
    refs.current[Math.min(text.length, length - 1)]?.focus();
  };

  return (
    <div
      role="group"
      aria-label={`${length}-digit verification code`}
      aria-describedby={invalid && errorId ? errorId : undefined}
      className="flex justify-between gap-2"
      onPaste={handlePaste}
    >
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          className={cn(
            "aspect-square w-full rounded-md border bg-panel text-center text-lg font-semibold outline-none",
            "focus:border-accent focus:ring-2 focus:ring-[var(--accent-ring)] motion-safe:transition-colors",
            invalid ? "border-danger" : "border-border",
            "disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
