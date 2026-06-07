// Types for the notification side-effect layer. Pure types only (no runtime
// exports), so importing them never pulls provider/transport code into a caller.
//
// This layer is INTENTIONALLY isolated from the deterministic validation core:
// the engine computes findings and returns them; this layer decides whether/whom
// to email and never feeds anything back into validation/analysis.

/** A newly-created OPEN ERROR validation issue, reduced to what an alert needs. */
export interface ValidationErrorIssue {
  artifactId: string;
  category: string;
  message: string;
}

/** A candidate alert recipient with their resolved notification preference. */
export interface AlertRecipient {
  userId: string;
  email: string;
  firstName: string;
  validationAlertsEnabled: boolean;
}

/** Rendered email parts (HTML + plain text). */
export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Outcome of a dispatch attempt. Returned for logging/observability only — the
 * dispatcher never throws, so callers don't have to handle failures.
 */
export interface ValidationAlertOutcome {
  /** Recipients with the alert enabled that we attempted to email. */
  attempted: number;
  sent: number;
  failed: number;
  /** True when nothing was dispatched (no new ERROR issues, or no project). */
  skipped: boolean;
}
