// components/ui/clamped-text.tsx — multi-line text that clamps with a Show more/less toggle
"use client";

import { useLayoutEffect, useRef, useState } from "react";

interface Props {
  text: string;
  /** Lines to show when collapsed. */
  lines?: number;
  className?: string;
}

export function ClampedText({ text, lines = 3, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clampable, setClampable] = useState(false);

  // Measure once in the collapsed state (deps intentionally exclude `expanded`)
  // so the toggle keeps showing after expanding. Re-measures only when the text
  // or line count changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setClampable(el.scrollHeight > el.clientHeight + 1);
  }, [text, lines]);

  return (
    <div className={className}>
      <div
        ref={ref}
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {text}
      </div>
      {clampable && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-[12.5px] text-fg-subtle hover:text-fg underline underline-offset-2"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
