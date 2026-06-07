// app/(auth)/register/page.tsx — multi-step verified registration wizard.
//
// Wired to the real backend contract (no simulated success — only local loading
// spinners): start → verify → complete, plus resend. Auth is persisted exactly
// like the login page (registerComplete sets the token via the API client), then
// step 4 routes to /dashboard.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { FieldError } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { CodeInput } from "@/components/ui/code-input";

const CODE_LENGTH = 6;
const STEPS = ["Account", "Verify", "Password", "Done"] as const;

// Mirror of the backend WEAK_PASSWORD failure codes → human guidance.
const PW_RULE_TEXT: Record<string, string> = {
  MIN_LENGTH: "at least 8 characters",
  REQUIRE_LETTER: "at least one letter",
  REQUIRE_NUMBER: "at least one number",
};

// Backend error codes that mean "the entered code itself is wrong" — only these
// should redden the OTP boxes (a cooldown/rate-limit/server error must not).
const CODE_ERROR_CODES = new Set(["INVALID_CODE", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS"]);

// ───────────────────────── error decoding ─────────────────────────

interface DecodedError {
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

function decodeError(err: unknown): DecodedError {
  if (err instanceof ApiError) {
    const body = err.body as
      | { error?: { code?: string; details?: Record<string, unknown> } }
      | undefined;
    return { code: body?.error?.code, status: err.status, details: body?.error?.details };
  }
  return {};
}

/** Human-friendly wait time — never raw "3563s". Rounds up to the coarsest unit. */
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 1) return "a moment";
  if (seconds < 60) return `${Math.ceil(seconds)} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Calm, user-facing copy for each backend error code (never raw/scary text). */
function messageFor(info: DecodedError): string {
  switch (info.code) {
    case "INVALID_CODE":
      return "That code isn't right. Check it and try again.";
    case "CODE_EXPIRED":
      return "That code has expired. Request a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many attempts. Request a new code to continue.";
    case "RESEND_COOLDOWN": {
      const s = Number(info.details?.retryAfterSeconds) || 30;
      return `Please wait ${formatDuration(s)} before requesting another code.`;
    }
    case "WEAK_PASSWORD": {
      const failures = info.details?.failures;
      if (Array.isArray(failures) && failures.length > 0) {
        const parts = failures.map((f) => PW_RULE_TEXT[String(f)] ?? String(f));
        return `Password needs ${parts.join(", ")}.`;
      }
      return "Please choose a stronger password.";
    }
    case "PASSWORD_MISMATCH":
      return "Passwords don't match.";
    case "INVALID_REGISTRATION_TOKEN":
    case "REGISTRATION_TOKEN_EXPIRED":
      return "Your registration session expired. Please start again.";
    case "EMAIL_TAKEN":
      return "This email is already registered. Try signing in instead.";
    case "EMAIL_NOT_CONFIGURED":
    case "EMAIL_PROVIDER_ERROR":
      // Never surface mail-infrastructure state to the user; diagnostics stay in server logs.
      return "We couldn't send your verification code right now. Please try again shortly.";
    case "RATE_LIMITED": {
      const s = Number(info.details?.retryAfterSeconds);
      return s
        ? `Too many requests. Please try again in ${formatDuration(s)}.`
        : "Too many requests. Please try again in a moment.";
    }
    case "VALIDATION_ERROR":
      return "Please check your details and try again.";
    default:
      if (info.status === 429) return "Too many requests. Please wait a moment and try again.";
      return "Something went wrong. Please try again.";
  }
}

// ───────────────────────── form schemas ─────────────────────────

const startSchema = z.object({
  firstName: z.string().trim().min(1, "Required"),
  lastName: z.string().trim().min(1, "Required"),
  email: z.string().trim().email("Enter a valid email"),
});
type StartValues = z.infer<typeof startSchema>;

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/\d/, "Include at least one number"),
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords don't match",
  });
type PasswordValues = z.infer<typeof passwordSchema>;

// ───────────────────────── page ─────────────────────────

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [account, setAccount] = useState<StartValues>({ firstName: "", lastName: "", email: "" });
  const [code, setCode] = useState("");
  const [codeResetSignal, setCodeResetSignal] = useState(0);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [registrationToken, setRegistrationToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startForm = useForm<StartValues>({
    resolver: zodResolver(startSchema),
    defaultValues: { firstName: "", lastName: "", email: "" },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  // Resend cooldown ticker — only runs while on the verify step.
  useEffect(() => {
    if (step !== 2 || resendAvailableAt == null) return;
    const update = () =>
      setSecondsLeft(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [step, resendAvailableAt]);

  // Cancel the post-success redirect timer if we unmount first.
  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  // Cooldown is active if the timer says so OR the deadline is still in the
  // future — the latter covers the first frame before the ticker effect runs.
  const cooldownActive =
    secondsLeft > 0 || (resendAvailableAt != null && resendAvailableAt > Date.now());

  const goToStep = (s: 1 | 2 | 3 | 4) => {
    if (loading) return; // never navigate out from under an in-flight request
    setError(null);
    setCodeInvalid(false);
    setStep(s);
  };

  const goToDashboard = () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
    router.push("/dashboard");
  };

  // Clear a stale inline error / red boxes as soon as the user edits the code.
  const onCodeChange = (value: string) => {
    setCode(value);
    if (error) setError(null);
    if (codeInvalid) setCodeInvalid(false);
  };

  // Step 1 → start registration.
  const onStart = startForm.handleSubmit(async (values) => {
    setError(null);
    setEmailTaken(false);
    setLoading(true);
    try {
      const res = await authApi.registerStart(values);
      setAccount(values);
      setCode("");
      setCodeInvalid(false);
      setCodeResetSignal((n) => n + 1);
      setResendAvailableAt(new Date(res.resendAvailableAt).getTime());
      setError(null);
      setStep(2);
    } catch (err) {
      const info = decodeError(err);
      if (info.code === "EMAIL_TAKEN") {
        // A completed account owns this email → stay on Step 1, show the inline
        // email error with a Sign in link. Do NOT advance to verify.
        setEmailTaken(true);
        startForm.setFocus("email");
      } else {
        setError(messageFor(info));
      }
    } finally {
      setLoading(false);
    }
  });

  // Step 2 → verify the emailed code.
  const onVerify = async () => {
    if (loading) return;
    const value = code.replace(/\D/g, "");
    if (value.length !== CODE_LENGTH) return;
    setError(null);
    setCodeInvalid(false);
    setLoading(true);
    try {
      const res = await authApi.registerVerify({ email: account.email, code: value });
      setRegistrationToken(res.registrationToken);
      passwordForm.reset({ password: "", confirmPassword: "" });
      setError(null);
      setStep(3);
    } catch (err) {
      const info = decodeError(err);
      setError(messageFor(info));
      // Only the code-validity errors should redden the boxes.
      setCodeInvalid(info.code ? CODE_ERROR_CODES.has(info.code) : true);
      // Clear the boxes so the user can retype the next code.
      setCode("");
      setCodeResetSignal((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  // Resend a fresh code (respects the 30s cooldown + backend cooldown error).
  const onResend = async () => {
    if (resending || cooldownActive || loading) return;
    setError(null);
    setCodeInvalid(false);
    setResending(true);
    try {
      const res = await authApi.registerResend({ email: account.email });
      setResendAvailableAt(new Date(res.resendAvailableAt).getTime());
      setCode("");
      setCodeResetSignal((n) => n + 1);
      toast.success("A new code is on its way");
    } catch (err) {
      const info = decodeError(err);
      if (info.code === "RESEND_COOLDOWN") {
        const secs = Number(info.details?.retryAfterSeconds) || 30;
        setResendAvailableAt(Date.now() + secs * 1000);
      }
      setError(messageFor(info)); // a resend error is never a code error → no red boxes
    } finally {
      setResending(false);
    }
  };

  // Step 3 → set password + create the account.
  const onComplete = passwordForm.handleSubmit(async (values) => {
    setError(null);
    setLoading(true);
    try {
      // registerComplete persists the token via the API client (same as login).
      await authApi.registerComplete({
        registrationToken,
        password: values.password,
        confirmPassword: values.confirmPassword,
      });
      toast.success("Account created");
      setStep(4);
      redirectTimer.current = setTimeout(() => router.push("/dashboard"), 1000);
    } catch (err) {
      const info = decodeError(err);
      if (info.code === "INVALID_REGISTRATION_TOKEN" || info.code === "REGISTRATION_TOKEN_EXPIRED") {
        setSessionExpired(true);
      }
      setError(messageFor(info));
    } finally {
      setLoading(false);
    }
  });

  const restart = () => {
    setSessionExpired(false);
    setRegistrationToken("");
    setCode("");
    setCodeInvalid(false);
    setCodeResetSignal((n) => n + 1);
    passwordForm.reset({ password: "", confirmPassword: "" });
    goToStep(1);
  };

  // Step 3 → back to verify: drop the consumed code so the boxes start fresh.
  const backToVerify = () => {
    if (loading) return;
    setCode("");
    setCodeInvalid(false);
    setCodeResetSignal((n) => n + 1);
    goToStep(2);
  };

  const codeComplete = code.replace(/\D/g, "").length === CODE_LENGTH;
  const passwordValue = passwordForm.watch("password");

  return (
    <div className="w-full max-w-[400px] bg-panel border border-border rounded-xl p-7 shadow-md">
      <Stepper current={step} />

      <StepPanel key={step}>
        {step === 1 && (
          <>
            <Heading title="Create your account" subtitle="Start documenting your architecture in minutes." />
            <form className="flex flex-col gap-3" onSubmit={onStart} noValidate>
              <div className="grid grid-cols-2 gap-2">
                <Field label="First name" htmlFor="reg-firstName" error={startForm.formState.errors.firstName?.message}>
                  <input
                    {...startForm.register("firstName")}
                    {...a11y("reg-firstName", startForm.formState.errors.firstName)}
                    autoFocus
                    autoComplete="given-name"
                    className={inputClass}
                    placeholder="First name"
                  />
                </Field>
                <Field label="Last name" htmlFor="reg-lastName" error={startForm.formState.errors.lastName?.message}>
                  <input
                    {...startForm.register("lastName")}
                    {...a11y("reg-lastName", startForm.formState.errors.lastName)}
                    autoComplete="family-name"
                    className={inputClass}
                    placeholder="Last name"
                  />
                </Field>
              </div>
              <Field label="Email" htmlFor="reg-email" error={startForm.formState.errors.email?.message}>
                <div className="relative">
                  <Mail size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                  <input
                    {...startForm.register("email", {
                      onChange: () => {
                        if (emailTaken) setEmailTaken(false);
                      },
                    })}
                    {...a11y("reg-email", startForm.formState.errors.email)}
                    type="email"
                    autoComplete="email"
                    aria-invalid={emailTaken || !!startForm.formState.errors.email || undefined}
                    aria-describedby={emailTaken ? "reg-email-taken" : undefined}
                    className={cn(inputClass, "pl-8")}
                    placeholder="you@company.com"
                  />
                </div>
              </Field>
              {emailTaken && (
                <p id="reg-email-taken" role="alert" className="-mt-1.5 text-[11px] text-danger">
                  An account with this email already exists.{" "}
                  <Link href="/login" className="text-accent font-medium">
                    Sign in
                  </Link>{" "}
                  instead.
                </p>
              )}
              {error && <InlineError>{error}</InlineError>}
              <Button type="submit" variant="primary" className="h-9 mt-1" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={14} className="motion-safe:animate-spin" /> Sending code…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight size={14} />
                  </>
                )}
              </Button>
            </form>
            <Footer>
              Already have an account?{" "}
              <Link href="/login" className="text-accent font-medium">
                Sign in
              </Link>
            </Footer>
          </>
        )}

        {step === 2 && (
          <>
            <Heading
              title="Verify your email"
              subtitle={
                <>
                  Enter the 6-digit code we sent to{" "}
                  <span className="text-fg font-medium">{account.email}</span>.
                </>
              }
            />
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void onVerify();
              }}
            >
              <CodeInput
                length={CODE_LENGTH}
                resetSignal={codeResetSignal}
                disabled={loading}
                invalid={codeInvalid}
                errorId={error ? "verify-error" : undefined}
                onChange={onCodeChange}
              />
              {error && <InlineError id="verify-error">{error}</InlineError>}
              <Button
                type="submit"
                variant="primary"
                className="h-9"
                disabled={loading || !codeComplete}
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="motion-safe:animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    Verify email <ArrowRight size={14} />
                  </>
                )}
              </Button>
              <div className="flex items-center justify-between text-[12.5px] text-fg-muted">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  disabled={loading || resending}
                  className="inline-flex items-center gap-1 hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft size={12} aria-hidden /> Change email
                </button>
                <button
                  type="button"
                  onClick={() => void onResend()}
                  disabled={resending || cooldownActive || loading}
                  className="font-medium text-accent disabled:text-fg-muted disabled:cursor-not-allowed"
                >
                  {resending ? "Sending…" : cooldownActive ? `Resend in ${secondsLeft}s` : "Resend code"}
                </button>
              </div>
              <p className="text-center text-[11.5px] text-fg-subtle leading-relaxed">
                The code expires in 10 minutes. Not in your inbox? Check your spam folder, or request a new code above.
              </p>
            </form>
          </>
        )}

        {step === 3 && (
          <>
            <Heading title="Set a password" subtitle="Choose a password to finish creating your account." />
            <form className="flex flex-col gap-3" onSubmit={onComplete} noValidate>
              <Field label="Password" htmlFor="reg-password" error={passwordForm.formState.errors.password?.message}>
                <div className="relative">
                  <Lock size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                  <input
                    {...passwordForm.register("password")}
                    {...a11y("reg-password", passwordForm.formState.errors.password)}
                    autoFocus
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className={cn(inputClass, "pl-8 pr-9")}
                    placeholder="Password (min 8 chars)"
                  />
                  <PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />
                </div>
              </Field>
              <PasswordChecklist value={passwordValue} />
              <Field
                label="Confirm password"
                htmlFor="reg-confirmPassword"
                error={passwordForm.formState.errors.confirmPassword?.message}
              >
                <div className="relative">
                  <Lock size={14} aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
                  <input
                    {...passwordForm.register("confirmPassword")}
                    {...a11y("reg-confirmPassword", passwordForm.formState.errors.confirmPassword)}
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    className={cn(inputClass, "pl-8 pr-9")}
                    placeholder="Confirm password"
                  />
                  <PasswordToggle shown={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
                </div>
              </Field>
              {error && <InlineError>{error}</InlineError>}
              {sessionExpired ? (
                <Button type="button" variant="primary" className="h-9 mt-1" onClick={restart}>
                  Start over <ArrowRight size={14} />
                </Button>
              ) : (
                <Button type="submit" variant="primary" className="h-9 mt-1" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 size={14} className="motion-safe:animate-spin" /> Creating account…
                    </>
                  ) : (
                    <>
                      Create account <ArrowRight size={14} />
                    </>
                  )}
                </Button>
              )}
              {!sessionExpired && (
                <button
                  type="button"
                  onClick={backToVerify}
                  disabled={loading}
                  className="inline-flex items-center gap-1 self-start text-[12.5px] text-fg-muted hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowLeft size={12} aria-hidden /> Back
                </button>
              )}
            </form>
          </>
        )}

        {step === 4 && (
          <div className="text-center py-2" role="status" aria-live="polite">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-fg motion-safe:animate-[pulse_1.2s_ease-in-out_1]">
              <Check size={22} aria-hidden />
            </div>
            <h1 className="m-0 mb-1 text-xl font-semibold tracking-tight">You&apos;re all set</h1>
            <p className="m-0 mb-5 text-[13px] text-fg-muted">Taking you to your workspace…</p>
            <Button type="button" variant="primary" className="h-9 w-full" autoFocus onClick={goToDashboard}>
              Enter workspace <ArrowRight size={14} />
            </Button>
          </div>
        )}
      </StepPanel>
    </div>
  );
}

// ───────────────────────── presentational helpers ─────────────────────────

const inputClass =
  "w-full bg-panel border border-border rounded-sm py-2 px-3 text-[13.5px] outline-none focus:border-accent";

/** Accessible-name + error wiring shared by every text input. */
function a11y(id: string, error?: FieldError) {
  return {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

/** Show/hide control for a password input — matches the login page. */
function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-sm text-fg-subtle hover:text-fg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] motion-safe:transition-colors"
    >
      {shown ? <EyeOff size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
    </button>
  );
}

/** Live password-policy checklist — mirrors the zod rules without changing them. */
function PasswordChecklist({ value }: { value: string }) {
  const rules = [
    { ok: value.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(value), label: "At least one letter" },
    { ok: /\d/.test(value), label: "At least one number" },
  ];
  return (
    <ul className="-mt-1 flex flex-col gap-1" aria-label="Password requirements">
      {rules.map((r) => (
        <li
          key={r.label}
          className={cn(
            "flex items-center gap-1.5 text-[11.5px] motion-safe:transition-colors",
            r.ok ? "text-success" : "text-fg-subtle",
          )}
        >
          <Check size={12} aria-hidden className={r.ok ? "opacity-100" : "opacity-40"} />
          <span>{r.label}</span>
          <span className="sr-only">{r.ok ? " met" : " not yet met"}</span>
        </li>
      ))}
    </ul>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="m-0 mb-1 text-xl font-semibold tracking-tight">{title}</h1>
      <p className="m-0 text-[13px] text-fg-muted">{subtitle}</p>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-[12.5px] text-fg-muted font-medium">
          {label}
        </label>
      )}
      {children}
      {error && (
        <span id={htmlFor ? `${htmlFor}-error` : undefined} className="text-[11px] text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

function InlineError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      role="alert"
      className="rounded-sm border border-[color-mix(in_srgb,var(--c-danger)_40%,transparent)] bg-[var(--c-danger-soft)] px-3 py-2 text-[12px] text-danger"
    >
      {children}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 text-center text-[12.5px] text-fg-muted">{children}</div>;
}

/** Per-step container: gentle fade/slide on mount, fully disabled under reduced motion. */
function StepPanel({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={cn(
        "motion-safe:transition-all motion-safe:duration-200",
        shown ? "opacity-100 translate-y-0" : "motion-safe:opacity-0 motion-safe:translate-y-1",
      )}
    >
      {children}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div className="mb-6 flex items-center" role="list" aria-label="Registration progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        // The terminal step counts as done once reached, so the wizard's
        // completion reads consistently between the stepper and the success panel.
        const state =
          n < current || current >= STEPS.length ? "done" : n === current ? "active" : "todo";
        const srState = state === "done" ? "Completed" : state === "active" ? "Current step" : "Step";
        return (
          <Fragment key={label}>
            <div role="listitem" className="flex items-center gap-2">
              <span
                aria-current={state === "active" ? "step" : undefined}
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold motion-safe:transition-colors",
                  state === "done" && "border-transparent bg-accent text-accent-fg",
                  state === "active" && "border-accent text-accent",
                  state === "todo" && "border-border text-fg-subtle",
                )}
              >
                <span aria-hidden>{state === "done" ? <Check size={12} /> : n}</span>
                <span className="sr-only">{`${srState} ${n} of ${STEPS.length}: ${label}`}</span>
              </span>
              {/* Labels collapse on mobile — only the numbered circles remain. */}
              <span
                aria-hidden
                className={cn(
                  "hidden text-[12px] font-medium sm:inline",
                  state === "active" ? "text-fg" : "text-fg-muted",
                )}
              >
                {label}
              </span>
            </div>
            {n < STEPS.length && (
              <span
                aria-hidden
                className={cn(
                  "mx-2 h-px flex-1 motion-safe:transition-colors",
                  n < current ? "bg-accent" : "bg-border",
                )}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

