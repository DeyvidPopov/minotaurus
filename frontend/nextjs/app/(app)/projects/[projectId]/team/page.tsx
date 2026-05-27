// app/(app)/projects/[projectId]/team/page.tsx — project team management
"use client";

import { useEffect, useMemo, useState } from "react";
import { UserPlus, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty";
import { membersApi, type ProjectMember, type ProjectRole } from "@/lib/api/members";
import { projectsApi } from "@/lib/api/projects";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth-context";
import type { Project } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

const ROLE_OPTIONS: { value: ProjectRole; label: string; hint: string }[] = [
  { value: "OWNER",     label: "Owner",     hint: "Full access · manage members · delete project" },
  { value: "ARCHITECT", label: "Architect", hint: "Validation + exports + edit everything" },
  { value: "DEVELOPER", label: "Developer", hint: "Edit artifacts, APIs, DB, diagrams, docs" },
  { value: "VIEWER",    label: "Viewer",    hint: "Read-only" },
];

const ROLE_TONE: Record<ProjectRole, "warning" | "success" | "info" | "default"> = {
  OWNER: "warning",
  ARCHITECT: "info",
  DEVELOPER: "success",
  VIEWER: "default",
};

export default function TeamPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const { user: me } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("DEVELOPER");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const [p, list] = await Promise.all([
        projectsApi.get(projectId),
        membersApi.list(projectId),
      ]);
      setProject(p);
      setMembers(list);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to load team";
      setError(message);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const myMembership = useMemo(
    () => members?.find((m) => m.userId === me?.id) ?? null,
    [members, me],
  );
  const isOwner = myMembership?.role === "OWNER";

  if (error) {
    return (
      <div className="px-8 py-6">
        <Empty title="Team unavailable" message={error} />
      </div>
    );
  }
  if (!project || members === null) {
    return <div className="px-8 py-6 text-fg-muted">Loading…</div>;
  }

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await membersApi.add(projectId, { email: email.trim().toLowerCase(), role });
      toast.success(`Added ${email.trim()} as ${role}`);
      setEmail("");
      setRole("DEVELOPER");
      await refresh();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const code = (apiErr?.body as { error?: { code?: string } } | undefined)?.error?.code ?? "";
      if (code === "USER_NOT_FOUND") {
        toast.error(`No user with email ${email.trim()}. They need to sign up first.`);
      } else if (code === "ALREADY_MEMBER") {
        toast.error("That user is already a member of this project.");
      } else {
        toast.error(apiErr?.message ?? "Failed to add member");
      }
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (member: ProjectMember, newRole: ProjectRole) => {
    if (member.role === newRole) return;
    try {
      await membersApi.updateRole(projectId, member.id, newRole);
      toast.success(`${member.user.name || member.user.email} → ${newRole}`);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to change role";
      toast.error(msg);
    }
  };

  const removeMember = async (member: ProjectMember) => {
    const label = member.user.name || member.user.email;
    if (!window.confirm(`Remove ${label} from this project?`)) return;
    try {
      await membersApi.remove(projectId, member.id);
      toast.success(`Removed ${label}`);
      await refresh();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to remove member";
      toast.error(msg);
    }
  };

  return (
    <div className="px-8 py-6">
      <PageHeader
        title={
          <div>
            <h1 className="text-2xl font-semibold tracking-tight m-0">Team</h1>
            <div className="text-fg-muted text-[13.5px] mt-1">
              {members.length} member{members.length === 1 ? "" : "s"} ·{" "}
              {isOwner
                ? "You can invite, promote, demote and remove members."
                : "Only project owners can manage team membership."}
            </div>
          </div>
        }
      />

      {isOwner && (
        <Card title="Invite member" className="mb-5">
          <form onSubmit={addMember} className="flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1 min-w-[260px] flex-1">
              <span className="text-[12px] text-fg-muted">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className="h-8 px-2.5 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
              />
            </label>
            <label className="flex flex-col gap-1 min-w-[180px]">
              <span className="text-[12px] text-fg-muted">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectRole)}
                className="h-8 px-2 bg-panel-2 border border-border rounded-sm text-[13px] focus:outline-none focus:border-border-strong"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="primary" icon={<UserPlus size={14} />} disabled={busy || !email.trim()}>
              {busy ? "Adding…" : "Add member"}
            </Button>
          </form>
          <div className="text-[12px] text-fg-muted mt-2.5">
            The user must already have a Minotaurus account. Roles can be changed later.
          </div>
        </Card>
      )}

      <Card title="Members" padded={false}>
        {members.length === 0 ? (
          <div className="px-4 py-8 text-center text-fg-muted text-[13px]">No members yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => {
              const isSelf = m.userId === me?.id;
              const label = m.user.name || m.user.email;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="inline-grid place-items-center font-semibold rounded-full bg-panel-hover border border-border shrink-0"
                    style={{ width: 34, height: 34, fontSize: 12 }}
                  >
                    {m.user.initials || "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium flex items-center gap-2">
                      <span className="truncate">{label}</span>
                      {isSelf && <Badge tone="info">You</Badge>}
                    </div>
                    <div className="text-[12px] text-fg-muted truncate">
                      {m.user.email} · joined {timeAgo(m.joinedAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    {isOwner && !isSelf ? (
                      <select
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value as ProjectRole)}
                        className="h-7 px-2 bg-panel-2 border border-border rounded-sm text-[12.5px] focus:outline-none focus:border-border-strong"
                        title={ROLE_OPTIONS.find((o) => o.value === m.role)?.hint}
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge tone={ROLE_TONE[m.role]}>
                        {m.role}
                      </Badge>
                    )}
                    {isOwner && !isSelf && (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={13} />}
                        onClick={() => removeMember(m)}
                        title="Remove member"
                        aria-label={`Remove ${label}`}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="text-[12px] text-fg-muted mt-4 flex items-center gap-1.5">
        <Shield size={13} /> Roles: <strong className="text-fg">OWNER</strong> manages members + project ·
        <strong className="text-fg">ARCHITECT</strong> validation + exports ·
        <strong className="text-fg">DEVELOPER</strong> edits artifacts, APIs, DB, diagrams, docs ·
        <strong className="text-fg">VIEWER</strong> read-only.
      </div>
    </div>
  );
}
