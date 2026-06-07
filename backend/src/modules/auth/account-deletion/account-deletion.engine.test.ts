import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyProjects,
  validateDeletionPlan,
  resolveOwnerRepoints,
  type ProjectLite,
  type PlanItem,
} from "./account-deletion.engine.js";

const ME = "user-me";

function member(userId: string, role: ProjectLite["members"][number]["role"] = "VIEWER") {
  return { userId, role, name: userId, email: `${userId}@x.dev` };
}

// ────────────────────────── classifyProjects ──────────────────────────

test("solo-owned project (only member is the user) → soloOwned", () => {
  const projects: ProjectLite[] = [
    { id: "p1", name: "Solo", ownerId: ME, members: [member(ME, "OWNER")] },
  ];
  const b = classifyProjects(ME, projects);
  assert.deepEqual(b.soloOwned.map((p) => p.id), ["p1"]);
  assert.equal(b.sharedOwned.length, 0);
  assert.equal(b.continuing.length, 0);
});

test("sole-owner project with other members → sharedOwned with those members as targets", () => {
  const projects: ProjectLite[] = [
    {
      id: "p1",
      name: "Shared",
      ownerId: ME,
      members: [member(ME, "OWNER"), member("alice", "DEVELOPER"), member("bob", "VIEWER")],
    },
  ];
  const b = classifyProjects(ME, projects);
  assert.equal(b.sharedOwned.length, 1);
  assert.deepEqual(
    b.sharedOwned[0].targets.map((t) => t.userId).sort(),
    ["alice", "bob"],
  );
  assert.equal(b.sharedOwned[0].memberCount, 3);
});

test("co-owned project (another OWNER remains) → continuing, not sharedOwned", () => {
  const projects: ProjectLite[] = [
    {
      id: "p1",
      name: "Co-owned",
      ownerId: ME,
      members: [member(ME, "OWNER"), member("alice", "OWNER")],
    },
  ];
  const b = classifyProjects(ME, projects);
  assert.deepEqual(b.continuing.map((p) => p.id), ["p1"]);
  assert.equal(b.sharedOwned.length, 0);
  assert.equal(b.soloOwned.length, 0);
});

test("member-only project (user is not an owner) → continuing", () => {
  const projects: ProjectLite[] = [
    {
      id: "p1",
      name: "Theirs",
      ownerId: "alice",
      members: [member("alice", "OWNER"), member(ME, "DEVELOPER")],
    },
  ];
  const b = classifyProjects(ME, projects);
  assert.deepEqual(b.continuing.map((p) => p.id), ["p1"]);
});

test("implicit owner (ownerId with no membership row) is treated as OWNER", () => {
  // The user is the creator pointer but has no ProjectMember row, and is the
  // only person → solo-owned (must still be classified as owned).
  const projects: ProjectLite[] = [
    { id: "p1", name: "Legacy", ownerId: ME, members: [] },
  ];
  const b = classifyProjects(ME, projects);
  assert.deepEqual(b.soloOwned.map((p) => p.id), ["p1"]);
});

// ────────────────────────── validateDeletionPlan ──────────────────────────

test("plan must cover every sharedOwned project", () => {
  const b = classifyProjects(ME, [
    { id: "p1", name: "A", ownerId: ME, members: [member(ME, "OWNER"), member("alice")] },
  ]);
  assert.equal(validateDeletionPlan(b.sharedOwned, []).length, 1);
  assert.deepEqual(
    validateDeletionPlan(b.sharedOwned, [{ projectId: "p1", action: "DELETE" }]),
    [],
  );
});

test("TRANSFER requires a target that is actually a member", () => {
  const b = classifyProjects(ME, [
    { id: "p1", name: "A", ownerId: ME, members: [member(ME, "OWNER"), member("alice")] },
  ]);
  const bad: PlanItem[] = [{ projectId: "p1", action: "TRANSFER", transferToUserId: "stranger" }];
  assert.equal(validateDeletionPlan(b.sharedOwned, bad).length, 1);
  const good: PlanItem[] = [{ projectId: "p1", action: "TRANSFER", transferToUserId: "alice" }];
  assert.deepEqual(validateDeletionPlan(b.sharedOwned, good), []);
});

test("a plan item for a project that needs no decision is rejected", () => {
  const b = classifyProjects(ME, [
    { id: "p1", name: "A", ownerId: ME, members: [member(ME, "OWNER"), member("alice")] },
  ]);
  const errs = validateDeletionPlan(b.sharedOwned, [
    { projectId: "p1", action: "DELETE" },
    { projectId: "other", action: "DELETE" },
  ]);
  assert.ok(errs.length >= 1);
});

// ────────────────────────── resolveOwnerRepoints ──────────────────────────

test("co-owned project where ownerId is the departing user → repoint to remaining owner", () => {
  // The critical cascade trap: ownerId === ME would cascade-delete a project that
  // should survive because alice is also an OWNER. Must repoint ownerId to alice.
  const projects: ProjectLite[] = [
    { id: "p1", name: "Co", ownerId: ME, members: [member(ME, "OWNER"), member("alice", "OWNER")] },
  ];
  assert.deepEqual(resolveOwnerRepoints(ME, projects, []), [{ projectId: "p1", newOwnerId: "alice" }]);
});

test("transferred sole-owned project → repoint to the chosen target", () => {
  const projects: ProjectLite[] = [
    { id: "p1", name: "Shared", ownerId: ME, members: [member(ME, "OWNER"), member("alice")] },
  ];
  const plan: PlanItem[] = [{ projectId: "p1", action: "TRANSFER", transferToUserId: "alice" }];
  assert.deepEqual(resolveOwnerRepoints(ME, projects, plan), [{ projectId: "p1", newOwnerId: "alice" }]);
});

test("deleted projects (solo, or sole-owned + DELETE) produce no repoint", () => {
  const projects: ProjectLite[] = [
    { id: "solo", name: "Solo", ownerId: ME, members: [member(ME, "OWNER")] },
    { id: "del", name: "Del", ownerId: ME, members: [member(ME, "OWNER"), member("alice")] },
  ];
  const plan: PlanItem[] = [{ projectId: "del", action: "DELETE" }];
  assert.deepEqual(resolveOwnerRepoints(ME, projects, plan), []);
});

test("stale TRANSFER target (no longer a member) yields no repoint → project falls through to deletion", () => {
  const projects: ProjectLite[] = [
    { id: "p1", name: "Shared", ownerId: ME, members: [member(ME, "OWNER"), member("alice")] },
  ];
  const plan: PlanItem[] = [{ projectId: "p1", action: "TRANSFER", transferToUserId: "departed" }];
  assert.deepEqual(resolveOwnerRepoints(ME, projects, plan), []);
});

test("member-only project never produces a repoint (ownerId isn't the user)", () => {
  const projects: ProjectLite[] = [
    { id: "p1", name: "Theirs", ownerId: "alice", members: [member("alice", "OWNER"), member(ME, "DEVELOPER")] },
  ];
  assert.deepEqual(resolveOwnerRepoints(ME, projects, []), []);
});
