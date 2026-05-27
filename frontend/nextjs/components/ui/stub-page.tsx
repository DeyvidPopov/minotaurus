// components/ui/stub-page.tsx — placeholder page used while a feature is being wired
import { Empty } from "./empty";
import { Construction } from "lucide-react";
import type { ReactNode } from "react";

export function StubPage({ title, description, todo }: { title: string; description?: string; todo?: ReactNode }) {
  return (
    <div className="px-8 py-6 max-w-[820px] mx-auto">
      <Empty
        icon={<Construction size={28} />}
        title={title}
        message={description || "This screen is part of the contract but not yet implemented in the Next.js scaffold. The prototype has a full implementation — see ../index.html in the prototype directory."}
        action={todo}
      />
    </div>
  );
}
