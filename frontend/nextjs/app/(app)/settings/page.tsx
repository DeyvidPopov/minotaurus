// app/(app)/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Save, Lock, LogOut, Check, Mail, X, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeInput } from "@/components/ui/code-input";
import { useAuth } from "@/lib/auth-context";
import { useTweaks } from "@/components/providers";
import { authApi } from "@/lib/api/auth";
import { projectsApi } from "@/lib/api/projects";
import { settingsApi, type NotificationPreferences } from "@/lib/api/settings";
import { DeleteAccountModal } from "@/components/settings/delete-account-modal";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Project, User } from "@/lib/types";

type TabId = "profile" | "workspace" | "notifications" | "danger";

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("profile");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] mx-auto">
      <PageHeader title="Settings" subtitle="Manage your account and workspace preferences." />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as TabId)}
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "workspace", label: "Workspace" },
          { id: "notifications", label: "Notifications" },
          { id: "danger", label: "Danger zone" },
        ]}
      />

      {tab === "profile" && <ProfileTab />}
      {tab === "workspace" && <WorkspaceTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "danger" && <DangerTab />}
    </div>
  );
}

// ────────────────────────── Profile ──────────────────────────

function ProfileTab() {
  const { user, setUser } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [saving, setSaving] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
    }
  }, [user]);

  if (!user) {
    return <div className="text-fg-muted text-[13px]">Loading profile…</div>;
  }

  // Email is intentionally not editable here, so it never contributes to "dirty".
  const dirty =
    firstName.trim() !== user.firstName ||
    lastName.trim() !== user.lastName;

  const save = async () => {
    setSaving(true);
    try {
      const res = await authApi.updateMe({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setUser(res.user);
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  const submitPassword = async () => {
    if (newPw !== confirmPw) {
      toast.error("New password and confirmation do not match");
      return;
    }
    if (newPw.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    setPwBusy(true);
    try {
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw });
      toast.success("Password updated");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card title="Profile">
        <div className="grid sm:grid-cols-2 gap-3">
            <Field label="First name">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
            </Field>
            <Field label="Last name">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
            </Field>
            <Field label="Email">
              <div className="flex items-center gap-2">
                <input type="email" value={user.email} readOnly disabled aria-readonly
                  title="Verify a new address to change your email"
                  className="flex-1 min-w-0 bg-panel-2 border border-border rounded-sm px-2.5 py-2 text-[13.5px] text-fg-muted outline-none cursor-not-allowed" />
                <Button size="sm" onClick={() => setEmailModalOpen(true)}>Change</Button>
              </div>
              <span className="text-[11.5px] text-fg-subtle">Changing your email requires verifying the new address.</span>
            </Field>
            <Field label="Role">
              <div className="flex items-center gap-2">
                <Badge mono>{user.role}</Badge>
                <span className="text-[11.5px] text-fg-subtle">Read-only</span>
              </div>
            </Field>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={() => { setFirstName(user.firstName); setLastName(user.lastName); }}
            disabled={!dirty || saving}>
            Reset
          </Button>
          <Button variant="primary" icon={<Save size={13} />} onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Card>

      <Card title="Change password" subtitle="Use at least 6 characters.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Current password">
            <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} autoComplete="current-password"
              className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
          <Field label="New password">
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password"
              className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
          <Field label="Confirm">
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password"
              className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
          </Field>
        </div>
        <div className="flex justify-end mt-3">
          <Button variant="primary" icon={<Lock size={13} />}
            onClick={submitPassword}
            disabled={pwBusy || !currentPw || !newPw || !confirmPw}>
            {pwBusy ? "Updating…" : "Change password"}
          </Button>
        </div>
      </Card>

      <ChangeEmailModal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        onChanged={(u) => setUser(u)}
      />
    </div>
  );
}

// ────────────────────────── Change-email modal ──────────────────────────

/** Decode the backend error envelope to a code + details. */
function decodeApiError(err: unknown): { code?: string; details?: Record<string, unknown>; status?: number } {
  if (err instanceof ApiError) {
    const body = err.body as { error?: { code?: string; details?: Record<string, unknown> } } | undefined;
    return { code: body?.error?.code, details: body?.error?.details, status: err.status };
  }
  return {};
}

const CODE_ERROR_CODES = new Set(["INVALID_CODE", "CODE_EXPIRED", "TOO_MANY_ATTEMPTS"]);

/** Calm, user-facing copy for the email-change error codes. */
function emailChangeMessage(err: unknown): string {
  const { code, details, status } = decodeApiError(err);
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "That password is incorrect.";
    case "SAME_EMAIL":
      return "That's already your email address.";
    case "EMAIL_TAKEN":
      return "That email is already in use by another account.";
    case "INVALID_CODE":
      return "That code isn't right. Check it and try again.";
    case "CODE_EXPIRED":
      return "That code has expired. Request a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many attempts. Request a new code to continue.";
    case "RESEND_COOLDOWN": {
      const s = Number(details?.retryAfterSeconds) || 30;
      return `Please wait ${s} seconds before requesting another code.`;
    }
    case "NO_PENDING_CHANGE":
      return "This change is no longer active. Start again.";
    case "EMAIL_NOT_CONFIGURED":
      return "Email service isn't configured, so the code couldn't be sent.";
    case "EMAIL_PROVIDER_ERROR":
      return "We couldn't send the email. Please try again in a moment.";
    case "VALIDATION_ERROR":
      return "Please enter a valid email address.";
    default:
      if (status === 429) return "Too many requests. Please wait a moment and try again.";
      return "Something went wrong. Please try again.";
  }
}

function ModalInlineError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div id={id} role="alert"
      className="rounded-sm border border-[color-mix(in_srgb,var(--c-danger)_40%,transparent)] bg-[var(--c-danger-soft)] px-3 py-2 text-[12px] text-danger">
      {children}
    </div>
  );
}

function ChangeEmailModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: (user: User) => void;
}) {
  const [step, setStep] = useState<"request" | "verify">("request");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeResetSignal, setCodeResetSignal] = useState(0);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Reset all state each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setStep("request"); setNewEmail(""); setPassword(""); setPendingEmail("");
    setCode(""); setCodeInvalid(false); setError(null); setBusy(false);
    setResending(false); setResendAvailableAt(null);
  }, [open]);

  // Escape closes (unless a request is in flight).
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, busy, onClose]);

  // Resend cooldown ticker (verify step only).
  useEffect(() => {
    if (step !== "verify" || resendAvailableAt == null) return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [step, resendAvailableAt]);

  if (!open) return null;

  const cooldownActive =
    secondsLeft > 0 || (resendAvailableAt != null && resendAvailableAt > Date.now());
  const codeComplete = code.replace(/\D/g, "").length === 6;
  const close = () => { if (!busy) onClose(); };

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await authApi.emailChangeRequest({ newEmail: newEmail.trim(), currentPassword: password });
      setPendingEmail(res.newEmail);
      setCode(""); setCodeInvalid(false); setCodeResetSignal((n) => n + 1);
      setResendAvailableAt(new Date(res.resendAvailableAt).getTime());
      setStep("verify");
    } catch (err) {
      setError(emailChangeMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const value = code.replace(/\D/g, "");
    if (value.length !== 6) return;
    setError(null); setCodeInvalid(false); setBusy(true);
    try {
      const res = await authApi.emailChangeVerify({ code: value });
      onChanged(res.user);
      toast.success("Email updated");
      onClose();
    } catch (err) {
      const info = decodeApiError(err);
      setError(emailChangeMessage(err));
      setCodeInvalid(info.code ? CODE_ERROR_CODES.has(info.code) : false);
      setCode(""); setCodeResetSignal((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (resending || cooldownActive || busy) return;
    setError(null);
    setResending(true);
    try {
      const res = await authApi.emailChangeResend();
      setResendAvailableAt(new Date(res.resendAvailableAt).getTime());
      setCode(""); setCodeResetSignal((n) => n + 1);
      toast.success("A new code is on its way");
    } catch (err) {
      setError(emailChangeMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change email"
        className="w-[440px] max-w-[92vw] bg-panel border border-border rounded-lg shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
          <Mail size={15} className="text-accent" aria-hidden />
          <div className="font-semibold text-[14px]">Change email</div>
          <button className="ml-auto text-fg-muted hover:text-fg disabled:opacity-50" onClick={close} disabled={busy} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {step === "request" ? (
            <form onSubmit={(e) => { e.preventDefault(); void sendCode(); }} className="flex flex-col gap-3" noValidate>
              <p className="m-0 text-[12.5px] text-fg-muted">
                We&apos;ll email a 6-digit code to your new address to confirm you own it. Your email won&apos;t change until you enter it.
              </p>
              <Field label="New email">
                <input type="email" autoFocus value={newEmail} onChange={(e) => setNewEmail(e.target.value)} autoComplete="email"
                  placeholder="you@company.com"
                  className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
              </Field>
              <Field label="Current password">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
              </Field>
              {error && <ModalInlineError>{error}</ModalInlineError>}
              <div className="flex justify-end gap-2 mt-1">
                <Button type="button" onClick={close} disabled={busy}>Cancel</Button>
                <Button type="submit" variant="primary"
                  icon={busy ? <Loader2 size={13} className="motion-safe:animate-spin" /> : undefined}
                  disabled={busy || !newEmail.trim() || !password}>
                  {busy ? "Sending…" : "Send code"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void confirm(); }} className="flex flex-col gap-3">
              <p className="m-0 text-[12.5px] text-fg-muted">
                Enter the 6-digit code sent to <span className="text-fg font-medium">{pendingEmail}</span>.
              </p>
              <CodeInput
                length={6}
                resetSignal={codeResetSignal}
                disabled={busy}
                invalid={codeInvalid}
                errorId={error ? "ec-error" : undefined}
                onChange={(v) => { setCode(v); if (error) setError(null); if (codeInvalid) setCodeInvalid(false); }}
              />
              {error && <ModalInlineError id="ec-error">{error}</ModalInlineError>}
              <Button type="submit" variant="primary" className="mt-1"
                icon={busy ? <Loader2 size={13} className="motion-safe:animate-spin" /> : undefined}
                disabled={busy || !codeComplete}>
                {busy ? "Confirming…" : "Confirm change"}
              </Button>
              <div className="flex items-center justify-between text-[12.5px] text-fg-muted">
                <button type="button" onClick={() => { setStep("request"); setError(null); }} disabled={busy || resending}
                  className="inline-flex items-center gap-1 hover:text-fg disabled:opacity-50 disabled:cursor-not-allowed">
                  <ArrowLeft size={12} aria-hidden /> Use a different email
                </button>
                <button type="button" onClick={() => void resend()} disabled={resending || cooldownActive || busy}
                  className="font-medium text-accent disabled:text-fg-muted disabled:cursor-not-allowed">
                  {resending ? "Sending…" : cooldownActive ? `Resend in ${secondsLeft}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── Workspace ──────────────────────────

// Curated accent palette (carried over from the original UI template).
const ACCENTS: { value: string; label: string }[] = [
  { value: "#3b82f6", label: "Blue" },
  { value: "#d97757", label: "Terracotta" },
  { value: "#1f8a5b", label: "Green" },
  { value: "#8b5cf6", label: "Purple" },
];

function WorkspaceTab() {
  const tweaks = useTweaks();

  return (
    <div className="flex flex-col gap-5">
      <Card
        title="Appearance"
        subtitle="Saved in your browser only. Not synced with the backend yet."
      >
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Theme">
            <select value={tweaks.theme} onChange={(e) => tweaks.set("theme", e.target.value as "light" | "dark")}
              className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <Field label="Accent color">
            <div className="flex items-center gap-2.5 py-1.5">
              {ACCENTS.map((a) => {
                const selected = tweaks.accent.toLowerCase() === a.value.toLowerCase();
                return (
                  <button
                    key={a.value}
                    type="button"
                    title={a.label}
                    aria-label={a.label}
                    aria-pressed={selected}
                    onClick={() => tweaks.set("accent", a.value)}
                    className="grid place-items-center rounded-full transition-transform hover:scale-110"
                    style={{
                      width: 26,
                      height: 26,
                      background: a.value,
                      boxShadow: selected
                        ? `0 0 0 2px var(--bg), 0 0 0 4px ${a.value}`
                        : "inset 0 0 0 1px rgba(255,255,255,.18)",
                    }}
                  >
                    {selected && <Check size={14} color="#fff" strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Graph node style">
            <select value={tweaks.graphNodeStyle} onChange={(e) => tweaks.set("graphNodeStyle", e.target.value as "shape" | "color" | "minimal")}
              className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px]">
              <option value="color">Color</option>
              <option value="shape">Shape</option>
              <option value="minimal">Minimal</option>
            </select>
          </Field>
        </div>
      </Card>

      <DefaultWorkspaceCard />
    </div>
  );
}

function DefaultWorkspaceCard() {
  const { user, setUser } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    projectsApi
      .list()
      .then((list) => { if (!cancelled) setProjects(list); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, []);

  const change = async (value: string) => {
    const defaultProjectId = value === "" ? null : value;
    setSaving(true);
    try {
      const res = await authApi.updateMe({ defaultProjectId });
      setUser(res.user);
      toast.success(defaultProjectId ? "Default workspace updated" : "Default workspace cleared");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not update default workspace");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title="Default workspace"
      subtitle="The project you land in after signing in. Saved to your account."
    >
      <Field label="Default workspace">
        <select
          value={user?.defaultProjectId ?? ""}
          onChange={(e) => change(e.target.value)}
          disabled={saving || projects === null}
          className="w-full sm:max-w-[420px] bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] disabled:opacity-60"
        >
          <option value="">Dashboard (no default)</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Field>
      <div className="text-[11.5px] text-fg-subtle mt-2">
        Choose a project to open it directly on sign-in, or “Dashboard (no default)” to land on the dashboard.
      </div>
    </Card>
  );
}

// ────────────────────────── Notifications ──────────────────────────

// A toggle key maps 1:1 to a backend boolean preference.
type NotificationKey = keyof NotificationPreferences;

const NOTIFICATION_ROWS: { key: NotificationKey; label: string; hint: string }[] = [
  {
    key: "emailDigestEnabled",
    label: "Weekly email digest",
    hint: "Weekly summary of validation issues across your projects.",
  },
  {
    key: "validationAlertsEnabled",
    label: "Validation alerts",
    hint: "Email me when a new error or critical validation issue appears.",
  },
];

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loadError, setLoadError] = useState(false);
  // The key currently being saved (null = idle). Drives the per-row spinner and
  // disables the toggles so two writes can't interleave and fight the revert.
  const [savingKey, setSavingKey] = useState<NotificationKey | null>(null);

  const load = () => {
    setLoadError(false);
    setPrefs(null);
    let cancelled = false;
    settingsApi
      .getNotifications()
      .then((res) => { if (!cancelled) setPrefs(res.preferences); })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  };

  useEffect(load, []);

  const toggle = async (key: NotificationKey, next: boolean) => {
    if (!prefs || savingKey) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: next }); // optimistic
    setSavingKey(key);
    try {
      const res = await settingsApi.updateNotifications({ [key]: next });
      setPrefs(res.preferences);
      toast.success("Notification preferences saved");
    } catch (err) {
      setPrefs(previous); // revert on failure
      toast.error(err instanceof ApiError ? err.message : "Could not save notification preferences");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <Card title="Notifications" subtitle="Choose which emails Minotaurus sends you.">
      {loadError ? (
        <div className="flex items-center justify-between gap-3 p-3 bg-panel-2 border border-border rounded-md">
          <div className="text-[13px] text-fg-muted">Couldn’t load your notification preferences.</div>
          <Button size="sm" onClick={load}>Retry</Button>
        </div>
      ) : prefs === null ? (
        <div className="flex items-center gap-2 p-3 text-[13px] text-fg-muted">
          <Loader2 size={14} className="motion-safe:animate-spin" />
          Loading preferences…
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {NOTIFICATION_ROWS.map((row) => (
            <div key={row.key} className="flex items-start gap-3 p-3 bg-panel-2 border border-border rounded-md">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium">{row.label}</div>
                <div className="text-[12px] text-fg-muted">{row.hint}</div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {savingKey === row.key && (
                  <Loader2 size={13} className="motion-safe:animate-spin text-fg-muted" aria-label="Saving" />
                )}
                <Toggle
                  label={row.label}
                  checked={prefs[row.key]}
                  disabled={savingKey !== null}
                  onChange={(next) => void toggle(row.key, next)}
                />
              </div>
            </div>
          ))}

          <div className="text-[11.5px] text-fg-subtle mt-1">
            Email delivery will use your verified account email.
          </div>
        </div>
      )}
    </Card>
  );
}

/** Accent-tinted on/off switch. role="switch" + aria-checked for accessibility. */
function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors",
        "disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        checked ? "bg-accent border-accent" : "bg-panel border-border",
      )}
    >
      <span
        className={cn(
          "inline-block h-[16px] w-[16px] rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[19px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

// ────────────────────────── Danger zone ──────────────────────────

function DangerTab() {
  const { user, signOut } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const onScheduled = (scheduledFor: string) => {
    const date = scheduledFor.slice(0, 10);
    toast.success(`Account scheduled for deletion on ${date}. Check your email to undo.`);
    setDeleteOpen(false);
    // Deactivated now — sign out on this device (the email link / re-login reactivates).
    signOut();
  };

  return (
    <div className="flex flex-col gap-5">
      <Card title="Sign out" subtitle="End your session on this device.">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-fg-muted">
            Signed in as <strong className="text-fg">{user?.email}</strong>.
          </div>
          <Button icon={<LogOut size={13} />} onClick={() => signOut()}>Sign out</Button>
        </div>
      </Card>

      <Card title="Delete account" subtitle="Deactivates now, permanently deleted after a 30-day grace period.">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-fg-muted max-w-[480px]">
            Permanently delete your account and every project, artifact, relation, documentation page and export you own.
            You’ll choose what happens to shared projects, can download your data first, and have 30 days to undo.
          </div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>Delete account</Button>
        </div>
      </Card>

      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onScheduled={onScheduled} />
    </div>
  );
}

// ────────────────────────── shared ──────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12.5px] text-fg-muted font-medium">{label}</label>
      {children}
    </div>
  );
}
