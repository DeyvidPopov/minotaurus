// Pure fixed-window rate-limit logic.
//
// The decision is a pure function over (state, now): no Map, no timers, no
// Express. The middleware owns the per-key store and clock; this owns the math,
// so the window/limit behavior is unit-testable in isolation.

export interface WindowState {
  /** Hits recorded in the current window. */
  count: number;
  /** Epoch ms when the current window ends (and count resets). */
  resetAt: number;
}

export interface RateDecision {
  allowed: boolean;
  /** Hits left in the window after this one (0 when blocked). */
  remaining: number;
  /** Whole seconds until the window resets (for Retry-After). */
  retryAfterSeconds: number;
  /** Next state to persist for this key. */
  state: WindowState;
}

/**
 * Record one hit against a fixed window. A `null`/expired state starts a fresh
 * window. Once `count` reaches `max` within the window, further hits are blocked
 * until `resetAt`.
 */
export function hitFixedWindow(
  prev: WindowState | null | undefined,
  now: number,
  windowMs: number,
  max: number,
): RateDecision {
  // Start (or restart) the window if there is no state or it has elapsed.
  if (!prev || now >= prev.resetAt) {
    const state: WindowState = { count: 1, resetAt: now + windowMs };
    return {
      allowed: true,
      remaining: Math.max(0, max - 1),
      retryAfterSeconds: 0,
      state,
    };
  }

  const retryAfterSeconds = Math.ceil((prev.resetAt - now) / 1_000);

  if (prev.count >= max) {
    // Blocked — do NOT extend the window (count stays put; window still drains).
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
      state: prev,
    };
  }

  const state: WindowState = { count: prev.count + 1, resetAt: prev.resetAt };
  return {
    allowed: true,
    remaining: Math.max(0, max - state.count),
    retryAfterSeconds: 0,
    state,
  };
}
