import { create } from "zustand";

// Live override for the sidebar's Validation badge (open-issue count per project).
//
// The sidebar fetches `project.validationIssueCount` once per navigation, so
// resolving / ignoring / quick-fixing an issue on the Validation page would leave
// the badge stale until the next project refetch. This ephemeral store closes that
// gap: the sidebar SEEDS it with the server count on fetch (the source of truth),
// and the Validation page UPDATES it whenever its open-issue count changes, so the
// badge tracks fixes live. Not persisted — purely in-session UI sync.
interface ValidationCountState {
  /** projectId → current OPEN validation-issue count. */
  counts: Record<string, number>;
  setCount: (projectId: string, count: number) => void;
}

export const useValidationCounts = create<ValidationCountState>((set) => ({
  counts: {},
  setCount: (projectId, count) =>
    set((s) => (s.counts[projectId] === count ? s : { counts: { ...s.counts, [projectId]: count } })),
}));
