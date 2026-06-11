// components/ui/modal.tsx — centered modal shell (overlay-click + close button to dismiss).
"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center" onClick={onClose}>
      <div className="w-[560px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center sticky top-0 bg-panel">
          <div className="font-semibold">{title}</div>
          <button className="ml-auto text-fg-muted hover:text-fg" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
