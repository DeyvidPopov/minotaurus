// Orchestration tests for the verified email-change service. No real DB / mail:
// an in-memory fake Prisma + a capturing EmailService are injected via
// __setEmailChangeDeps. Pure decision logic is covered by registration.engine.test.ts
// (the same engine); this pins the flow wiring (step-up auth, uniqueness checks,
// attempt cap, the swap, the old-address notice).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  __setEmailChangeDeps,
  requestEmailChange,
  resendEmailChangeCode,
  verifyEmailChange,
  type EmailChangeDeps,
} from "./email-change.service.js";
import type {
  EmailService,
  SendEmailChangeCodeInput,
  SendEmailChangeNoticeInput,
} from "../../email/email.service.js";

const NOW = new Date("2026-06-05T12:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const CURRENT_PW = "CurrentPw1";

// ───────────────────────── fakes ─────────────────────────

interface ECRow {
  id: string;
  userId: string;
  newEmail: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  resendCount: number;
  resendAvailableAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: string;
  defaultProjectId: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}

function applyData(target: object, data: Record<string, unknown>): void {
  const row = target as Record<string, unknown>;
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in (v as object)) {
      row[k] = (Number(row[k]) || 0) + Number((v as { increment: number }).increment);
    } else {
      row[k] = v;
    }
  }
}

class FakeDb {
  ecs: ECRow[] = [];
  users: UserRow[] = [];
  private seq = 0;
  private id(p: string): string {
    this.seq += 1;
    return `${p}_${this.seq}`;
  }

  emailChange = {
    findUnique: async ({ where }: { where: { userId: string } }) =>
      this.ecs.find((r) => r.userId === where.userId) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { userId: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const existing = this.ecs.find((r) => r.userId === where.userId);
      if (existing) {
        applyData(existing, update);
        return existing;
      }
      const row = { id: this.id("ec"), ...(create as object) } as ECRow;
      this.ecs.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { userId: string }; data: Record<string, unknown> }) => {
      const row = this.ecs.find((r) => r.userId === where.userId);
      if (!row) throw new Error("not found");
      applyData(row, data);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { userId?: string; attempts?: { lt: number } };
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const r of this.ecs) {
        if (where.userId !== undefined && r.userId !== where.userId) continue;
        if (where.attempts?.lt !== undefined && !(r.attempts < where.attempts.lt)) continue;
        applyData(r, data);
        count += 1;
      }
      return { count };
    },
    delete: async ({ where }: { where: { userId: string } }) => {
      this.ecs = this.ecs.filter((r) => r.userId !== where.userId);
      return {} as ECRow;
    },
  };

  user = {
    findUnique: async ({ where }: { where: { id: string } }) =>
      this.users.find((u) => u.id === where.id) ?? null,
    findFirst: async ({
      where,
    }: {
      where: { id?: { not: string }; email: { equals: string; mode: string } };
    }) => {
      const target = where.email.equals.toLowerCase();
      return (
        this.users.find(
          (u) =>
            u.email.toLowerCase() === target && (where.id ? u.id !== where.id.not : true),
        ) ?? null
      );
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.users.find((u) => u.id === where.id);
      if (!row) throw new Error("not found");
      // Enforce email @unique so the P2002 → EMAIL_TAKEN race path is exercisable.
      const nextEmail = (data as { email?: string }).email;
      if (nextEmail && this.users.some((u) => u.id !== row.id && u.email.toLowerCase() === nextEmail.toLowerCase())) {
        const err = new Error("Unique constraint failed") as Error & { code: string };
        err.code = "P2002";
        throw err;
      }
      applyData(row, data);
      return row;
    },
  };

  seedUser(email: string, opts: Partial<UserRow> = {}): UserRow {
    const row: UserRow = {
      id: this.id("user"),
      email,
      passwordHash: bcrypt.hashSync(CURRENT_PW, 10),
      firstName: "Jane",
      lastName: "Doe",
      role: "ENGINEER",
      defaultProjectId: null,
      emailVerifiedAt: NOW,
      createdAt: NOW,
      ...opts,
    };
    this.users.push(row);
    return row;
  }
}

class CapturingEmail implements EmailService {
  readonly name = "capture";
  codes: SendEmailChangeCodeInput[] = [];
  notices: SendEmailChangeNoticeInput[] = [];
  async sendVerificationCode(): Promise<void> {}
  async sendPasswordResetCode(): Promise<void> {}
  async sendEmailChangeCode(input: SendEmailChangeCodeInput): Promise<void> {
    this.codes.push(input);
  }
  async sendEmailChangeNotice(input: SendEmailChangeNoticeInput): Promise<void> {
    this.notices.push(input);
  }
  async sendMail(): Promise<void> {
    /* not exercised by the email-change flow */
  }
  get lastCode(): string | undefined {
    return this.codes[this.codes.length - 1]?.code;
  }
}

let db: FakeDb;
let mail: CapturingEmail;

beforeEach(() => {
  db = new FakeDb();
  mail = new CapturingEmail();
  __setEmailChangeDeps({ db: db as unknown as EmailChangeDeps["db"], email: mail });
});

afterEach(() => {
  __setEmailChangeDeps(null);
});

async function expectHttp(fn: () => Promise<unknown>, status: number, code: string) {
  await assert.rejects(fn, (err: unknown) => {
    const e = err as { status?: number; code?: string };
    assert.equal(e.status, status, `expected status ${status}, got ${e.status}`);
    assert.equal(e.code, code, `expected code ${code}, got ${e.code}`);
    return true;
  });
}

// ───────────────────────── request ─────────────────────────

test("request: wrong current password is rejected (step-up auth)", async () => {
  const u = db.seedUser("jane@example.com");
  await expectHttp(
    () => requestEmailChange({ userId: u.id, newEmail: "new@example.com", currentPassword: "wrong" }, NOW),
    401,
    "INVALID_CREDENTIALS",
  );
  assert.equal(db.ecs.length, 0);
  assert.equal(mail.codes.length, 0);
});

test("request: changing to your own current email is SAME_EMAIL", async () => {
  const u = db.seedUser("jane@example.com");
  await expectHttp(
    () => requestEmailChange({ userId: u.id, newEmail: "Jane@Example.com", currentPassword: CURRENT_PW }, NOW),
    400,
    "SAME_EMAIL",
  );
});

test("request: a new email already used by another account is EMAIL_TAKEN", async () => {
  const u = db.seedUser("jane@example.com");
  db.seedUser("taken@example.com");
  await expectHttp(
    () => requestEmailChange({ userId: u.id, newEmail: "Taken@Example.com", currentPassword: CURRENT_PW }, NOW),
    409,
    "EMAIL_TAKEN",
  );
});

test("request: success creates a pending change and emails a code to the NEW address", async () => {
  const u = db.seedUser("jane@example.com", { firstName: "Jane" });
  const res = await requestEmailChange(
    { userId: u.id, newEmail: "New@Example.COM", currentPassword: CURRENT_PW },
    NOW,
  );
  assert.equal(res.newEmail, "new@example.com");
  assert.equal(res.resendAvailableAt.getTime(), later(30_000).getTime());
  assert.equal(db.ecs.length, 1);
  assert.equal(db.ecs[0]!.newEmail, "new@example.com");
  // Code went to the NEW address, with the user's name, hashed (never plaintext).
  assert.equal(mail.codes[0]!.email, "new@example.com");
  assert.equal(mail.codes[0]!.firstName, "Jane");
  assert.match(mail.lastCode ?? "", /^\d{6}$/);
  assert.ok(await bcrypt.compare(mail.lastCode!, db.ecs[0]!.codeHash));
  // The user's email is unchanged until verify.
  assert.equal(u.email, "jane@example.com");
});

test("request: re-requesting a different target replaces the pending change", async () => {
  const u = db.seedUser("jane@example.com");
  await requestEmailChange({ userId: u.id, newEmail: "one@example.com", currentPassword: CURRENT_PW }, NOW);
  await requestEmailChange({ userId: u.id, newEmail: "two@example.com", currentPassword: CURRENT_PW }, later(5_000));
  assert.equal(db.ecs.length, 1);
  assert.equal(db.ecs[0]!.newEmail, "two@example.com");
  assert.equal(mail.codes.length, 2);
});

// ───────────────────────── verify ─────────────────────────

async function seedPending(target = "new@example.com") {
  const u = db.seedUser("jane@example.com");
  await requestEmailChange({ userId: u.id, newEmail: target, currentPassword: CURRENT_PW }, NOW);
  return { user: u, code: mail.lastCode! };
}

test("verify: malformed code is INVALID_CODE without touching attempts", async () => {
  const { user } = await seedPending();
  await expectHttp(() => verifyEmailChange({ userId: user.id, code: "12" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.ecs[0]!.attempts, 0);
});

test("verify: no pending change is INVALID_CODE", async () => {
  const u = db.seedUser("jane@example.com");
  await expectHttp(() => verifyEmailChange({ userId: u.id, code: "000000" }, NOW), 400, "INVALID_CODE");
});

test("verify: wrong code increments attempts", async () => {
  const { user } = await seedPending();
  await expectHttp(() => verifyEmailChange({ userId: user.id, code: "000000" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.ecs[0]!.attempts, 1);
});

test("verify: expired code is CODE_EXPIRED", async () => {
  const { user, code } = await seedPending();
  await expectHttp(() => verifyEmailChange({ userId: user.id, code }, later(11 * 60_000)), 410, "CODE_EXPIRED");
});

test("verify: the cap blocks further guesses atomically", async () => {
  const { user } = await seedPending();
  db.ecs[0]!.attempts = 5;
  await expectHttp(() => verifyEmailChange({ userId: user.id, code: "000000" }, NOW), 429, "TOO_MANY_ATTEMPTS");
});

test("verify: correct code swaps the email, marks verified, consumes the record, notifies the OLD address", async () => {
  const u = db.seedUser("jane@example.com", { emailVerifiedAt: null, firstName: "Jane" });
  await requestEmailChange({ userId: u.id, newEmail: "new@example.com", currentPassword: CURRENT_PW }, NOW);
  const code = mail.lastCode!;

  const res = await verifyEmailChange({ userId: u.id, code }, NOW);
  assert.equal(res.user.email, "new@example.com");
  assert.equal(u.email, "new@example.com");
  assert.ok(u.emailVerifiedAt); // backfilled — the new address is proven
  assert.equal(db.ecs.length, 0); // record consumed
  // Security notice went to the OLD address, with the new one masked.
  assert.equal(mail.notices.length, 1);
  assert.equal(mail.notices[0]!.email, "jane@example.com");
  assert.match(mail.notices[0]!.newEmailMasked, /@example\.com$/);
  assert.notEqual(mail.notices[0]!.newEmailMasked, "new@example.com"); // masked, not raw
});

test("verify: a target claimed by someone else after request is EMAIL_TAKEN and consumes the record", async () => {
  const { user, code } = await seedPending("new@example.com");
  // Another account grabs the target between request and verify.
  db.seedUser("new@example.com");
  await expectHttp(() => verifyEmailChange({ userId: user.id, code }, NOW), 409, "EMAIL_TAKEN");
  assert.equal(db.ecs.length, 0);
  assert.equal(user.email, "jane@example.com"); // unchanged
});

test("verify: code can't be replayed after a successful change", async () => {
  const { user, code } = await seedPending();
  await verifyEmailChange({ userId: user.id, code }, NOW);
  await expectHttp(() => verifyEmailChange({ userId: user.id, code }, NOW), 400, "INVALID_CODE");
});

// ───────────────────────── resend ─────────────────────────

test("resend: with no pending change is NO_PENDING_CHANGE", async () => {
  const u = db.seedUser("jane@example.com");
  await expectHttp(() => resendEmailChangeCode({ userId: u.id }, NOW), 404, "NO_PENDING_CHANGE");
});

test("resend: within cooldown is RESEND_COOLDOWN with retryAfterSeconds", async () => {
  const { user } = await seedPending();
  await assert.rejects(
    () => resendEmailChangeCode({ userId: user.id }, later(5_000)),
    (err: unknown) => {
      const e = err as { status?: number; code?: string; details?: { retryAfterSeconds?: number } };
      assert.equal(e.status, 429);
      assert.equal(e.code, "RESEND_COOLDOWN");
      assert.equal(e.details?.retryAfterSeconds, 25);
      return true;
    },
  );
});

test("resend: after cooldown issues a fresh code to the new address and resets attempts", async () => {
  const { user } = await seedPending();
  db.ecs[0]!.attempts = 3;
  const res = await resendEmailChangeCode({ userId: user.id }, later(31_000));
  assert.equal(res.newEmail, "new@example.com");
  assert.equal(db.ecs[0]!.attempts, 0);
  assert.equal(db.ecs[0]!.resendCount, 1);
  assert.equal(mail.codes.length, 2);
  assert.equal(mail.codes[1]!.email, "new@example.com");
  assert.ok(await bcrypt.compare(mail.lastCode!, db.ecs[0]!.codeHash));
});
