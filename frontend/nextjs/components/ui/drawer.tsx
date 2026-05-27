// components/ui/drawer.tsx — right-side slide-in panel
"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  width?: number;
  footer?: ReactNode;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, width = 400, footer, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);

  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110]" />}
      <div
        className={cn(
          "fixed right-0 top-0 bottom-0 bg-panel border-l border-border shadow-lg z-[111] flex flex-col transition-transform duration-200 max-w-full",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width }}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <div className="font-semibold text-[13.5px]">{title}</div>
          <Button variant="ghost" size="sm" icon={<X size={14} />} onClick={onClose} />
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
        {footer && (
          <div className="border-t border-border px-4 py-3 flex gap-2 justify-end">{footer}</div>
        )}
      </div>
    </>
  );
}
