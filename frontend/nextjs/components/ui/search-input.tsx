// components/ui/search-input.tsx
"use client";

import { Search } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Search…", className }: Props) {
  return (
    <div className={`relative ${className || ""}`}>
      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
      <input
        className="w-full bg-panel border border-border rounded-sm py-2 pl-8 pr-3 text-[13.5px] text-fg outline-none focus:border-accent focus:ring-3 focus:ring-accent-soft"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
