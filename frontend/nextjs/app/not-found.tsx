// app/not-found.tsx
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <div className="font-mono text-fg-subtle text-[12px] tracking-wider mb-2">
          404
        </div>
        <h1 className="text-3xl font-semibold tracking-tight m-0 mb-2">
          Not found
        </h1>
        <p className="text-fg-muted m-0 mb-5">
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <Link
          href="/dashboard"
          className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-accent text-accent-fg rounded-sm text-[13.5px] font-medium hover:brightness-95"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
