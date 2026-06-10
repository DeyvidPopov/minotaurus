// components/activity/activity-row.tsx — the single version-event activity row.
// Used by every activity feed (dashboard "Recent activity", project overview
// "Recent changes", and the Version History page) so the marker, wording
// (describeEvent), timestamp and detail layout stay identical and can't drift.
// Page-specific extras layer in through two slots: `secondary` (an extra line
// under the body — e.g. the dashboard's project chip or Version History's
// entity/action badges) and `trailing` (under the timestamp — e.g. an Open link).
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { VersionEvent } from "@/lib/api/versions";
import { ACTION_COLOR, actorName, describeEvent } from "@/lib/activity";
import { timeAgo } from "@/lib/utils";

export function ActivityRow({
  event,
  count = 1,
  href,
  secondary,
  trailing,
}: {
  event: VersionEvent;
  /** Merged-run count (the overview groups consecutive validation runs); >1 shows "· N runs". */
  count?: number;
  /** When set, the whole row becomes a link. Omit for a static row (e.g. when a child Open link handles nav). */
  href?: string;
  /** Extra content on its own line under the body — project chip, entity/action badges, … */
  secondary?: ReactNode;
  /** Extra content under the timestamp in the right column — e.g. an Open link. */
  trailing?: ReactNode;
}) {
  const c = ACTION_COLOR[event.action];
  const { verb, subject, detail } = describeEvent(event);
  // A relation's detail is just its short type ("uses") — keep it inline on the
  // main line; richer details (validation breakdowns, changed-field lists) drop
  // to their own line below.
  const isRelation = event.entityType === "RELATION";

  const inner = (
    <>
      <span
        aria-hidden="true"
        className="relative z-[1] mt-1 w-2.5 h-2.5 rounded-full shrink-0"
        style={{ borderWidth: 2, borderStyle: "solid", borderColor: c, background: "var(--panel)" }}
        title={event.entityType}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-snug truncate">
          <strong className="text-fg font-semibold">{actorName(event)}</strong>{" "}
          <span className="text-fg-muted">{verb}</span>
          {subject && <> <span className="text-fg">{subject}</span></>}
          {isRelation && detail && (
            <>
              <span className="text-fg-subtle"> · </span>
              <span className="text-fg-muted">{detail}</span>
            </>
          )}
          {count > 1 && (
            <>
              <span className="text-fg-subtle"> · </span>
              <span className="text-fg-muted">{count} runs</span>
            </>
          )}
        </div>
        {!isRelation && detail && (
          <div className="text-[12px] text-fg-muted truncate mt-0.5">{detail}</div>
        )}
        {secondary && <div className="mt-1 min-w-0">{secondary}</div>}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1 text-[11.5px] text-fg-subtle">
        <span className="whitespace-nowrap">{timeAgo(event.createdAt)}</span>
        {trailing}
      </div>
    </>
  );

  // Timeline rail: a vertical line through the dots. Drawn as two pseudo-element
  // segments on the <li> (above + below the dot, which sits at y≈21px: py-3 12 +
  // mt-1 4 + half-dot 5) so the dot's panel fill masks the crossing. `first`/`last`
  // trim the ends so the line never overshoots the top/bottom of the list. The dot
  // column is at x≈19px (px-3.5 14 + half-dot 5) in both link/static layouts.
  const rail =
    "relative " +
    "before:content-[''] before:absolute before:left-[18.5px] before:top-0 before:h-[21px] before:w-px before:bg-[var(--border)] first:before:hidden " +
    "after:content-[''] after:absolute after:left-[18.5px] after:top-[21px] after:bottom-0 after:w-px after:bg-[var(--border)] last:after:hidden";
  const row = "flex items-start gap-3 px-3.5 py-3";

  return (
    <li className={rail}>
      {href ? (
        <Link href={href} className={`${row} hover:bg-panel-hover transition-colors`}>{inner}</Link>
      ) : (
        <div className={row}>{inner}</div>
      )}
    </li>
  );
}
