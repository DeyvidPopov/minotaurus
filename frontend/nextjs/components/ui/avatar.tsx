// components/ui/avatar.tsx
import type { User } from "@/lib/types";

export function Avatar({ user, size = 24 }: { user: User; size?: number }) {
  const initials = user.initials || (user.firstName?.[0] || "") + (user.lastName?.[0] || "");
  return (
    <span
      className="inline-grid place-items-center font-semibold rounded-full bg-panel-hover border border-border text-fg shrink-0"
      style={{ width: size, height: size, fontSize: size < 24 ? 10 : 11.5 }}
    >
      {initials}
    </span>
  );
}
