// app/(app)/settings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Save, Lock, LogOut, Upload, Construction, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { useAuth } from "@/lib/auth-context";
import { useTweaks } from "@/components/providers";
import { authApi } from "@/lib/api/auth";
import { projectsApi } from "@/lib/api/projects";
import { ApiError } from "@/lib/api/client";
import type { Project } from "@/lib/types";

type TabId = "profile" | "workspace" | "notifications" | "tokens" | "danger";

export default function SettingsPage() {
  const [tab, setTab] = useState<TabId>("profile");

  return (
    <div className="px-8 py-6 max-w-[920px] mx-auto">
      <PageHeader title="Settings" subtitle="Manage your account and workspace preferences." />

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as TabId)}
        tabs={[
          { id: "profile", label: "Profile" },
          { id: "workspace", label: "Workspace" },
          { id: "notifications", label: "Notifications" },
          { id: "tokens", label: "API tokens" },
          { id: "danger", label: "Danger zone" },
        ]}
      />

      {tab === "profile" && <ProfileTab />}
      {tab === "workspace" && <WorkspaceTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "tokens" && <TokensTab />}
      {tab === "danger" && <DangerTab />}
    </div>
  );
}

// ────────────────────────── Profile ──────────────────────────

function ProfileTab() {
  const { user, setUser } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
    }
  }, [user]);

  if (!user) {
    return <div className="text-fg-muted text-[13px]">Loading profile…</div>;
  }

  const dirty =
    firstName.trim() !== user.firstName ||
    lastName.trim() !== user.lastName ||
    email.trim() !== user.email;

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || user.initials;

  const save = async () => {
    setSaving(true);
    try {
      const res = await authApi.updateMe({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
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
        <div className="flex items-start gap-5 flex-wrap">
          <div className="flex flex-col items-center gap-2">
            <div
              className="grid place-items-center rounded-full bg-accent-soft text-accent font-semibold border border-border"
              style={{ width: 72, height: 72, fontSize: 24 }}
              aria-label="Avatar"
            >
              {initials || "?"}
            </div>
            <Button size="sm" icon={<Upload size={12} />} disabled title="Photo upload coming next">
              Upload photo
            </Button>
            <span className="text-[10.5px] text-fg-subtle">Coming next</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 flex-1 min-w-[240px]">
            <Field label="First name">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)}
                className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
            </Field>
            <Field label="Last name">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)}
                className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
            </Field>
            <Field label="Email">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-panel border border-border rounded-sm px-2.5 py-2 text-[13.5px] outline-none focus:border-accent" />
            </Field>
            <Field label="Role">
              <div className="flex items-center gap-2">
                <Badge mono>{user.role}</Badge>
                <span className="text-[11.5px] text-fg-subtle">Read-only</span>
              </div>
            </Field>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button onClick={() => { setFirstName(user.firstName); setLastName(user.lastName); setEmail(user.email); }}
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

function NotificationsTab() {
  return (
    <Card title="Notifications" subtitle="Coming next — none of these are wired yet.">
      <div className="flex flex-col gap-2.5">
        {[
          { label: "Email digest", hint: "Weekly summary of validation issues across your projects." },
          { label: "Validation alerts", hint: "Email me when a new ERROR-severity issue appears." },
          { label: "Slack notifications", hint: "Post to a Slack channel on export creation." },
        ].map((row) => (
          <label key={row.label} className="flex items-start gap-3 p-3 bg-panel-2 border border-border rounded-md cursor-not-allowed opacity-70">
            <input type="checkbox" disabled className="mt-1" />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-medium">{row.label}</div>
              <div className="text-[12px] text-fg-muted">{row.hint}</div>
            </div>
            <Badge mono>SOON</Badge>
          </label>
        ))}
      </div>
    </Card>
  );
}

// ────────────────────────── API tokens ──────────────────────────

function TokensTab() {
  return (
    <Card>
      <Empty
        icon={<Construction size={28} />}
        title="API tokens — coming next"
        message="Personal access tokens will let external tools and CI pipelines hit the SSOT API without the browser login flow. Planned scopes: read-only export, read/write artifacts, full admin."
      />
    </Card>
  );
}

// ────────────────────────── Danger zone ──────────────────────────

function DangerTab() {
  const { user, signOut } = useAuth();

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

      <Card title="Delete account" subtitle="Coming next — currently disabled.">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[13px] text-fg-muted max-w-[480px]">
            Permanently delete your account along with every project, artifact, relation, documentation page and export you own. This action cannot be undone.
          </div>
          <Button disabled title="Account deletion not yet implemented">Delete account</Button>
        </div>
      </Card>
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
