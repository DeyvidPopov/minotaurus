// app/page.tsx — public landing ("/"). Story-driven marketing page that walks a
// visitor through the requirement → architecture → validation → documentation →
// SSOT workflow, with the animated pipeline theater as its centerpiece. The page
// itself is a server component; its interactive islands (the nav burger menu, the
// auth-aware brand logo and the theater state machine) opt into "use client"
// individually.

import { LandingPage } from "@/components/landing/landing-page";

export default function Page() {
  return <LandingPage />;
}
