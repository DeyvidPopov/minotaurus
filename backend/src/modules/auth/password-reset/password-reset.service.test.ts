// Orchestration tests for the forgot-password service. No real DB / no real mail:
// an in-memory fake Prisma + a capturing EmailService are injected via
// __setPasswordResetDeps. The pure decision logic is already covered by
// registration.engine.test.ts (the same engine); this pins the flow wiring
// (enumeration-neutral request, attempt cap, token handoff, password update).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  __setPasswordResetDeps,
  requestPasswordReset,
  resendResetCode,
  resetPassword,
  verifyResetCode,
  type PasswordResetDeps,
} from "./password-reset.service.js";
import type {
  EmailService,
  SendPasswordResetCodeInput,
  SendVerificationCodeInput,
} from "../../email/email.service.js";

const NOW = new Date("2026-06-05T12:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

// ───────────────────────── fakes ─────────────────────────

interface PRRow {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  resendCount: number;
  resendAvailableAt: Date;
  verifiedAt: Date | null;
  resetTokenHash: string | null;
  resetTokenExpiresAt: Date | null;
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
  prs: PRRow[] = [];
  users: UserRow[] = [];
  private seq = 0;

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  passwordReset = {
    deleteMany: async ({
      where,
    }: {
      where: { email: string; expiresAt?: { lt: Date }; verifiedAt?: null };
    }) => {
      const before = this.prs.length;
      this.prs = this.prs.filter((r) => {
        if (r.email !== where.email) return true;
        if (where.verifiedAt === null && r.verifiedAt !== null) return true;
        if (where.expiresAt?.lt && !(r.expiresAt.getTime() < where.expiresAt.lt.getTime())) return true;
        return false;
      });
      return { count: before - this.prs.length };
    },
    findUnique: async ({ where }: { where: { email: string } }) =>
      this.prs.find((r) => r.email === where.email) ?? null,
    findFirst: async ({ where }: { where: { resetTokenHash?: string } }) =>
      this.prs.find((r) => r.resetTokenHash === where.resetTokenHash) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { email: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const existing = this.prs.find((r) => r.email === where.email);
      if (existing) {
        applyData(existing, update);
        return existing;
      }
      const row = { id: this.id("pr"), ...(create as object) } as PRRow;
      this.prs.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.prs.find((r) => r.id === where.id);
      if (!row) throw new Error("not found");
      applyData(row, data);
      return row;
    },
    // Mirrors Prisma's conditional updateMany used by the atomic attempt reservation.
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; attempts?: { lt: number } };
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const r of this.prs) {
        if (where.id !== undefined && r.id !== where.id) continue;
        if (where.attempts?.lt !== undefined && !(r.attempts < where.attempts.lt)) continue;
        applyData(r, data);
        count += 1;
      }
      return { count };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      this.prs = this.prs.filter((r) => r.id !== where.id);
      return {} as PRRow;
    },
  };

  user = {
    findFirst: async ({ where }: { where: { email: { equals: string; mode: string } } }) => {
      const target = where.email.equals.toLowerCase();
      return this.users.find((u) => u.email.toLowerCase() === target) ?? null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.users.find((u) => u.id === where.id);
      if (!row) throw new Error("not found");
      applyData(row, data);
      return row;
    },
  };

  seedUser(email: string, opts: Partial<UserRow> = {}): UserRow {
    const row: UserRow = {
      id: this.id("user"),
      email,
      passwordHash: bcrypt.hashSync("OldPassw0rd", 10),
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
  sent: SendPasswordResetCodeInput[] = [];
  async sendVerificationCode(_input: SendVerificationCodeInput): Promise<void> {
    /* unused in this flow */
  }
  async sendPasswordResetCode(input: SendPasswordResetCodeInput): Promise<void> {
    this.sent.push(input);
  }
  async sendEmailChangeCode(): Promise<void> {
    /* not exercised by the password-reset flow */
  }
  async sendEmailChangeNotice(): Promise<void> {
    /* not exercised by the password-reset flow */
  }
  async sendMail(): Promise<void> {
    /* not exercised by the password-reset flow */
  }
  get lastCode(): string | undefined {
    return this.sent[this.sent.length - 1]?.code;
  }
}

let db: FakeDb;
let mail: CapturingEmail;

beforeEach(() => {
  db = new FakeDb();
  mail = new CapturingEmail();
  __setPasswordResetDeps({ db: db as unknown as PasswordResetDeps["db"], email: mail });
});

afterEach(() => {
  __setPasswordResetDeps(null);
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

test("request: a known account gets a pending record + a 6-digit code (hashed, never stored plaintext)", async () => {
  db.seedUser("jane@example.com", { firstName: "Jane" });
  const res = await requestPasswordReset({ email: "Jane@Example.COM" }, NOW);
  assert.equal(res.resendAvailableAt.getTime(), later(30_000).getTime());
  assert.equal(db.prs.length, 1);
  assert.equal(db.prs[0]!.email, "jane@example.com");
  assert.match(mail.lastCode ?? "", /^\d{6}$/);
  // The greeting carries the user's first name.
  assert.equal(mail.sent[0]!.firstName, "Jane");
  // Plaintext code is never stored — only its hash.
  assert.notEqual(db.prs[0]!.codeHash, mail.lastCode);
  assert.ok(await bcrypt.compare(mail.lastCode!, db.prs[0]!.codeHash));
});

test("request: an unknown email is enumeration-neutral (same shape, NO record, NO mail)", async () => {
  const res = await requestPasswordReset({ email: "ghost@example.com" }, NOW);
  assert.equal(res.resendAvailableAt.getTime(), later(30_000).getTime());
  assert.equal(db.prs.length, 0);
  assert.equal(mail.sent.length, 0);
});

test("request: re-requesting restarts the flow with a fresh code (one record per email)", async () => {
  db.seedUser("jane@example.com");
  await requestPasswordReset({ email: "jane@example.com" }, NOW);
  const firstHash = db.prs[0]!.codeHash;
  await requestPasswordReset({ email: "jane@example.com" }, later(5_000));
  assert.equal(db.prs.length, 1);
  assert.equal(mail.sent.length, 2);
  assert.notEqual(db.prs[0]!.codeHash, firstHash);
});

test("request: a mail provider failure is swallowed — the response stays neutral and the record is kept", async () => {
  db.seedUser("jane@example.com");
  const throwing: EmailService = {
    name: "boom",
    async sendVerificationCode() {},
    async sendPasswordResetCode() {
      throw new Error("provider down");
    },
    async sendEmailChangeCode() {},
    async sendEmailChangeNotice() {},
    async sendMail() {},
  };
  __setPasswordResetDeps({ db: db as unknown as PasswordResetDeps["db"], email: throwing });
  const res = await requestPasswordReset({ email: "jane@example.com" }, NOW);
  assert.equal(res.resendAvailableAt.getTime(), later(30_000).getTime());
  assert.equal(db.prs.length, 1);
});

// ───────────────────────── verify ─────────────────────────

async function seedPending(now = NOW) {
  db.seedUser("jane@example.com");
  await requestPasswordReset({ email: "jane@example.com" }, now);
  return mail.lastCode!;
}

test("verify: wrong code increments attempts and returns INVALID_CODE", async () => {
  await seedPending();
  await expectHttp(() => verifyResetCode({ email: "jane@example.com", code: "000000" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.prs[0]!.attempts, 1);
});

test("verify: malformed code is INVALID_CODE without touching attempts", async () => {
  await seedPending();
  await expectHttp(() => verifyResetCode({ email: "jane@example.com", code: "12" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.prs[0]!.attempts, 0);
});

test("verify: an unknown email is INVALID_CODE (no record path, no enumeration)", async () => {
  await expectHttp(() => verifyResetCode({ email: "ghost@example.com", code: "000000" }, NOW), 400, "INVALID_CODE");
});

test("verify: expired code returns CODE_EXPIRED", async () => {
  const code = await seedPending();
  await expectHttp(
    () => verifyResetCode({ email: "jane@example.com", code }, later(11 * 60_000)),
    410,
    "CODE_EXPIRED",
  );
});

test("verify: the final allowed guess is admitted, the next is blocked atomically", async () => {
  await seedPending();
  db.prs[0]!.attempts = 4; // one slot left
  await expectHttp(() => verifyResetCode({ email: "jane@example.com", code: "000000" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.prs[0]!.attempts, 5);
  await expectHttp(() => verifyResetCode({ email: "jane@example.com", code: "000000" }, NOW), 429, "TOO_MANY_ATTEMPTS");
  assert.equal(db.prs[0]!.attempts, 5);
});

test("verify: concurrent wrong guesses cannot exceed the cap (atomic reservation)", async () => {
  await seedPending();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => verifyResetCode({ email: "jane@example.com", code: "000000" }, NOW)),
  );
  const codes = results.map((r) => (r.status === "rejected" ? (r.reason as { code?: string }).code : "OK"));
  assert.equal(codes.filter((c) => c === "INVALID_CODE").length, 5);
  assert.equal(codes.filter((c) => c === "TOO_MANY_ATTEMPTS").length, 3);
  assert.equal(db.prs[0]!.attempts, 5);
});

test("verify: correct code returns a reset token and marks verified", async () => {
  const code = await seedPending();
  const res = await verifyResetCode({ email: "jane@example.com", code }, NOW);
  assert.ok(res.resetToken.length > 20);
  assert.equal(res.expiresAt.getTime(), later(15 * 60_000).getTime());
  assert.ok(db.prs[0]!.verifiedAt);
  assert.equal(db.prs[0]!.attempts, 0);
  // The stored token hash is not the raw token.
  assert.notEqual(db.prs[0]!.resetTokenHash, res.resetToken);
});

// ───────────────────────── reset ─────────────────────────

async function seedVerified() {
  const code = await seedPending();
  const { resetToken } = await verifyResetCode({ email: "jane@example.com", code }, NOW);
  return resetToken;
}

test("reset: password mismatch is rejected", async () => {
  const token = await seedVerified();
  await expectHttp(
    () => resetPassword({ resetToken: token, password: "Abcd1234", confirmPassword: "x" }, NOW),
    400,
    "PASSWORD_MISMATCH",
  );
});

test("reset: weak password is rejected with the unmet rules", async () => {
  const token = await seedVerified();
  await assert.rejects(
    () => resetPassword({ resetToken: token, password: "abcdef", confirmPassword: "abcdef" }, NOW),
    (err: unknown) => {
      const e = err as { code?: string; details?: { failures?: string[] } };
      assert.equal(e.code, "WEAK_PASSWORD");
      assert.ok(e.details?.failures?.includes("MIN_LENGTH"));
      assert.ok(e.details?.failures?.includes("REQUIRE_NUMBER"));
      return true;
    },
  );
});

test("reset: invalid token returns INVALID_RESET_TOKEN", async () => {
  await seedVerified();
  await expectHttp(
    () => resetPassword({ resetToken: "nope", password: "Abcd1234", confirmPassword: "Abcd1234" }, NOW),
    401,
    "INVALID_RESET_TOKEN",
  );
});

test("reset: expired reset token returns RESET_TOKEN_EXPIRED", async () => {
  const token = await seedVerified();
  await expectHttp(
    () =>
      resetPassword(
        { resetToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" },
        later(16 * 60_000),
      ),
    410,
    "RESET_TOKEN_EXPIRED",
  );
});

test("reset: success updates the password hash, backfills emailVerifiedAt, and consumes the record", async () => {
  const user = db.seedUser("verified@example.com", { emailVerifiedAt: null });
  await requestPasswordReset({ email: "verified@example.com" }, NOW);
  const code = mail.lastCode!;
  const { resetToken } = await verifyResetCode({ email: "verified@example.com", code }, NOW);

  const res = await resetPassword(
    { resetToken, password: "Abcd1234", confirmPassword: "Abcd1234" },
    NOW,
  );
  assert.equal(res.email, "verified@example.com");
  // New password verifies; old one no longer does.
  assert.ok(await bcrypt.compare("Abcd1234", user.passwordHash));
  assert.ok(!(await bcrypt.compare("OldPassw0rd", user.passwordHash)));
  // A reset proves email ownership → emailVerifiedAt backfilled.
  assert.ok(user.emailVerifiedAt);
  // The pending record is consumed (token can't be replayed).
  assert.equal(db.prs.length, 0);
});

test("reset: token can't be replayed after success", async () => {
  const token = await seedVerified();
  await resetPassword({ resetToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" }, NOW);
  await expectHttp(
    () => resetPassword({ resetToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" }, NOW),
    401,
    "INVALID_RESET_TOKEN",
  );
});

// ───────────────────────── resend ─────────────────────────

test("resend: within cooldown returns RESEND_COOLDOWN with retryAfterSeconds", async () => {
  await seedPending();
  await assert.rejects(
    () => resendResetCode({ email: "jane@example.com" }, later(5_000)),
    (err: unknown) => {
      const e = err as { status?: number; code?: string; details?: { retryAfterSeconds?: number } };
      assert.equal(e.status, 429);
      assert.equal(e.code, "RESEND_COOLDOWN");
      assert.equal(e.details?.retryAfterSeconds, 25);
      return true;
    },
  );
});

test("resend: after cooldown issues a fresh code and resets attempts", async () => {
  await seedPending();
  db.prs[0]!.attempts = 3;
  const res = await resendResetCode({ email: "jane@example.com" }, later(31_000));
  assert.equal(res.resendAvailableAt.getTime(), later(31_000 + 30_000).getTime());
  assert.equal(db.prs[0]!.attempts, 0);
  assert.equal(db.prs[0]!.resendCount, 1);
  assert.equal(mail.sent.length, 2);
  assert.ok(await bcrypt.compare(mail.lastCode!, db.prs[0]!.codeHash));
});

test("resend: unknown email is neutral (no error, no mail)", async () => {
  const res = await resendResetCode({ email: "ghost@example.com" }, NOW);
  assert.equal(res.resendAvailableAt.getTime(), later(30_000).getTime());
  assert.equal(mail.sent.length, 0);
});

test("resend: an already-verified reset is neutral (no new code, record untouched)", async () => {
  await seedVerified(); // sets verifiedAt + resetTokenHash
  const sentBefore = mail.sent.length;
  const hashBefore = db.prs[0]!.codeHash;
  const res = await resendResetCode({ email: "jane@example.com" }, later(31_000));
  assert.equal(res.resendAvailableAt.getTime(), later(31_000 + 30_000).getTime());
  assert.equal(mail.sent.length, sentBefore);
  assert.equal(db.prs[0]!.codeHash, hashBefore);
  assert.equal(db.prs[0]!.resendCount, 0);
});
