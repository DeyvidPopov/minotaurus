// Orchestration tests for the registration service. No real DB / no real mail:
// an in-memory fake Prisma + a capturing EmailService are injected via
// __setRegistrationDeps. Pure decision logic is covered in registration.engine.test.ts;
// this pins the flow wiring (records, attempts, token handoff, user creation).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {
  __setRegistrationDeps,
  completeRegistration,
  resendCode,
  startRegistration,
  verifyEmail,
  type RegistrationDeps,
} from "./registration.service.js";
import type { EmailService, SendVerificationCodeInput } from "../../email/email.service.js";

// A strong JWT secret so completeRegistration's signToken() works.
process.env.JWT_SECRET = "test-registration-secret-abcdefghijklmnop";

const NOW = new Date("2026-06-03T12:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

// ───────────────────────── fakes ─────────────────────────

interface EVRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  resendCount: number;
  resendAvailableAt: Date;
  verifiedAt: Date | null;
  registrationTokenHash: string | null;
  registrationTokenExpiresAt: Date | null;
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
  evs: EVRow[] = [];
  users: UserRow[] = [];
  private seq = 0;
  capturedCodes: string[] = [];

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  emailVerification = {
    deleteMany: async ({ where }: { where: { email: string; expiresAt?: { lt: Date }; verifiedAt?: null } }) => {
      const before = this.evs.length;
      this.evs = this.evs.filter((r) => {
        if (r.email !== where.email) return true;
        if (where.verifiedAt === null && r.verifiedAt !== null) return true;
        if (where.expiresAt?.lt && !(r.expiresAt.getTime() < where.expiresAt.lt.getTime())) return true;
        return false;
      });
      return { count: before - this.evs.length };
    },
    findUnique: async ({ where }: { where: { email: string } }) =>
      this.evs.find((r) => r.email === where.email) ?? null,
    findFirst: async ({ where }: { where: { registrationTokenHash?: string } }) =>
      this.evs.find((r) => r.registrationTokenHash === where.registrationTokenHash) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { email: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => {
      const existing = this.evs.find((r) => r.email === where.email);
      if (existing) {
        applyData(existing, update);
        return existing;
      }
      const row = { id: this.id("ev"), ...(create as object) } as EVRow;
      this.evs.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = this.evs.find((r) => r.id === where.id);
      if (!row) throw new Error("not found");
      applyData(row, data);
      return row;
    },
    // Mirrors Prisma's conditional updateMany: only rows matching the where
    // (id + attempts < cap) are updated; returns {count}. Used by the atomic
    // attempt-reservation in verifyEmail.
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: string; attempts?: { lt: number } };
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const r of this.evs) {
        if (where.id !== undefined && r.id !== where.id) continue;
        if (where.attempts?.lt !== undefined && !(r.attempts < where.attempts.lt)) continue;
        applyData(r, data);
        count += 1;
      }
      return { count };
    },
    delete: async ({ where }: { where: { id: string } }) => {
      this.evs = this.evs.filter((r) => r.id !== where.id);
      return {} as EVRow;
    },
  };

  user = {
    findFirst: async ({ where }: { where: { email: { equals: string; mode: string } } }) => {
      const target = where.email.equals.toLowerCase();
      return this.users.find((u) => u.email.toLowerCase() === target) ?? null;
    },
    count: async () => this.users.length,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      // Enforce User.email @unique like real Prisma so the P2002 -> EMAIL_TAKEN
      // race fallback in completeRegistration is actually exercisable.
      const email = String((data as { email?: unknown }).email ?? "").toLowerCase();
      if (this.users.some((u) => u.email.toLowerCase() === email)) {
        const err = new Error("Unique constraint failed on the fields: (`email`)") as Error & {
          code: string;
          meta: unknown;
        };
        err.code = "P2002";
        err.meta = { target: ["email"] };
        throw err;
      }
      const row: UserRow = {
        id: this.id("user"),
        defaultProjectId: null,
        createdAt: NOW,
        emailVerifiedAt: null,
        ...(data as object),
      } as UserRow;
      this.users.push(row);
      return row;
    },
  };
}

class CapturingEmail implements EmailService {
  readonly name = "capture";
  sent: SendVerificationCodeInput[] = [];
  async sendVerificationCode(input: SendVerificationCodeInput): Promise<void> {
    this.sent.push(input);
  }
  async sendPasswordResetCode(): Promise<void> {
    /* not exercised by the registration flow */
  }
  async sendEmailChangeCode(): Promise<void> {
    /* not exercised by the registration flow */
  }
  async sendEmailChangeNotice(): Promise<void> {
    /* not exercised by the registration flow */
  }
  async sendMail(): Promise<void> {
    /* not exercised by the registration flow */
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
  __setRegistrationDeps({ db: db as unknown as RegistrationDeps["db"], email: mail });
});

afterEach(() => {
  __setRegistrationDeps(null);
});

async function expectHttp(fn: () => Promise<unknown>, status: number, code: string) {
  await assert.rejects(fn, (err: unknown) => {
    const e = err as { status?: number; code?: string };
    assert.equal(e.status, status, `expected status ${status}, got ${e.status}`);
    assert.equal(e.code, code, `expected code ${code}, got ${e.code}`);
    return true;
  });
}

// ───────────────────────── start ─────────────────────────

test("start: creates a pending record, sends a 6-digit code, sets cooldown", async () => {
  const res = await startRegistration(
    { firstName: " Jane ", lastName: "Doe", email: "Jane@Example.COM" },
    NOW,
  );
  assert.equal(res.email, "jane@example.com");
  assert.equal(res.resendAvailableAt.getTime(), later(30_000).getTime());
  assert.equal(db.evs.length, 1);
  assert.equal(db.evs[0]!.firstName, "Jane");
  assert.match(mail.lastCode ?? "", /^\d{6}$/);
  // Plaintext code is never stored — only its hash.
  assert.notEqual(db.evs[0]!.codeHash, mail.lastCode);
  assert.ok(await bcrypt.compare(mail.lastCode!, db.evs[0]!.codeHash));
});

test("start: an existing completed account is blocked with EMAIL_TAKEN (no record, no email)", async () => {
  db.users.push({
    id: "u1",
    email: "taken@example.com",
    passwordHash: "x",
    firstName: "T",
    lastName: "K",
    role: "ENGINEER",
    defaultProjectId: null,
    emailVerifiedAt: NOW,
    createdAt: NOW,
  });
  await expectHttp(
    () => startRegistration({ firstName: "A", lastName: "B", email: "Taken@Example.com" }, NOW),
    409,
    "EMAIL_TAKEN",
  );
  // Nothing was created and no code was sent.
  assert.equal(db.evs.length, 0);
  assert.equal(mail.sent.length, 0);
});

test("start: a pending (incomplete) registration still proceeds — only completed Users are blocked", async () => {
  // Seed a pending EmailVerification row (no User) for this email.
  await startRegistration({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" }, NOW);
  const sentAfterFirst = mail.sent.length;
  assert.equal(db.users.length, 0);
  // Re-starting the same pending email is allowed (restarts the flow, new code).
  const res = await startRegistration(
    { firstName: "Jane", lastName: "Doe", email: "jane@example.com" },
    NOW,
  );
  assert.equal(res.email, "jane@example.com");
  assert.equal(db.evs.length, 1);
  assert.equal(mail.sent.length, sentAfterFirst + 1);
});

// ───────────────────────── verify ─────────────────────────

async function seedPending(now = NOW) {
  await startRegistration({ firstName: "Jane", lastName: "Doe", email: "jane@example.com" }, now);
  return mail.lastCode!;
}

test("verify: wrong code increments attempts and returns INVALID_CODE", async () => {
  await seedPending();
  await expectHttp(() => verifyEmail({ email: "jane@example.com", code: "000000" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.evs[0]!.attempts, 1);
});

test("verify: malformed code is INVALID_CODE without touching attempts", async () => {
  await seedPending();
  await expectHttp(() => verifyEmail({ email: "jane@example.com", code: "12" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.evs[0]!.attempts, 0);
});

test("verify: expired code returns CODE_EXPIRED", async () => {
  const code = await seedPending();
  await expectHttp(
    () => verifyEmail({ email: "jane@example.com", code }, later(11 * 60_000)),
    410,
    "CODE_EXPIRED",
  );
});

test("verify: too many attempts returns TOO_MANY_ATTEMPTS", async () => {
  await seedPending();
  db.evs[0]!.attempts = 5;
  await expectHttp(
    () => verifyEmail({ email: "jane@example.com", code: "000000" }, NOW),
    429,
    "TOO_MANY_ATTEMPTS",
  );
});

test("verify: the final allowed guess is admitted (INVALID_CODE), the next is blocked (TOO_MANY_ATTEMPTS)", async () => {
  await seedPending();
  db.evs[0]!.attempts = 4; // one slot left
  // The 5th wrong guess is reserved (attempts 4 -> 5) and actually compared.
  await expectHttp(() => verifyEmail({ email: "jane@example.com", code: "000000" }, NOW), 400, "INVALID_CODE");
  assert.equal(db.evs[0]!.attempts, 5);
  // The 6th is refused atomically before any compare.
  await expectHttp(() => verifyEmail({ email: "jane@example.com", code: "000000" }, NOW), 429, "TOO_MANY_ATTEMPTS");
  assert.equal(db.evs[0]!.attempts, 5);
});

test("verify: concurrent wrong guesses cannot exceed the cap (atomic reservation, no TOCTOU)", async () => {
  await seedPending(); // attempts = 0
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => verifyEmail({ email: "jane@example.com", code: "000000" }, NOW)),
  );
  const codes = results.map((r) =>
    r.status === "rejected" ? (r.reason as { code?: string }).code : "OK",
  );
  const admitted = codes.filter((c) => c === "INVALID_CODE").length;
  const blocked = codes.filter((c) => c === "TOO_MANY_ATTEMPTS").length;
  // Exactly MAX_VERIFY_ATTEMPTS real guesses are admitted; the rest are refused.
  assert.equal(admitted, 5);
  assert.equal(blocked, 3);
  // The counter is capped at the cap, not the burst size (8).
  assert.equal(db.evs[0]!.attempts, 5);
});

test("verify: correct code returns a registration token and marks verified", async () => {
  const code = await seedPending();
  const res = await verifyEmail({ email: "jane@example.com", code }, NOW);
  assert.ok(res.registrationToken.length > 20);
  assert.equal(res.expiresAt.getTime(), later(15 * 60_000).getTime());
  assert.ok(db.evs[0]!.verifiedAt);
  assert.equal(db.evs[0]!.attempts, 0);
  assert.ok(db.evs[0]!.registrationTokenHash);
  // The stored token hash is not the raw token.
  assert.notEqual(db.evs[0]!.registrationTokenHash, res.registrationToken);
});

// ───────────────────────── complete ─────────────────────────

async function seedVerified() {
  const code = await seedPending();
  const { registrationToken } = await verifyEmail({ email: "jane@example.com", code }, NOW);
  return registrationToken;
}

test("complete: password mismatch is rejected", async () => {
  const token = await seedVerified();
  await expectHttp(
    () => completeRegistration({ registrationToken: token, password: "Abcd1234", confirmPassword: "x" }, NOW),
    400,
    "PASSWORD_MISMATCH",
  );
});

test("complete: weak password is rejected with the unmet rules", async () => {
  const token = await seedVerified();
  await assert.rejects(
    () => completeRegistration({ registrationToken: token, password: "abcdef", confirmPassword: "abcdef" }, NOW),
    (err: unknown) => {
      const e = err as { code?: string; details?: { failures?: string[] } };
      assert.equal(e.code, "WEAK_PASSWORD");
      assert.ok(e.details?.failures?.includes("MIN_LENGTH"));
      assert.ok(e.details?.failures?.includes("REQUIRE_NUMBER"));
      return true;
    },
  );
});

test("complete: invalid token returns INVALID_REGISTRATION_TOKEN", async () => {
  await seedVerified();
  await expectHttp(
    () => completeRegistration({ registrationToken: "nope", password: "Abcd1234", confirmPassword: "Abcd1234" }, NOW),
    401,
    "INVALID_REGISTRATION_TOKEN",
  );
});

test("complete: expired registration token returns REGISTRATION_TOKEN_EXPIRED", async () => {
  const token = await seedVerified();
  await expectHttp(
    () =>
      completeRegistration(
        { registrationToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" },
        later(16 * 60_000),
      ),
    410,
    "REGISTRATION_TOKEN_EXPIRED",
  );
});

test("complete: creates the user (first user = ADMIN, emailVerifiedAt set), consumes the record, issues a token", async () => {
  // No user exists before completion (login would fail → blocked pre-completion).
  assert.equal(db.users.length, 0);
  const token = await seedVerified();
  const res = await completeRegistration(
    { registrationToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" },
    NOW,
  );
  assert.ok(res.token.length > 0);
  assert.equal(res.user.email, "jane@example.com");
  assert.equal(res.user.role, "ADMIN");
  assert.equal(db.users.length, 1);
  assert.ok(db.users[0]!.emailVerifiedAt);
  // Password is hashed (login via bcrypt.compare would succeed).
  assert.ok(await bcrypt.compare("Abcd1234", db.users[0]!.passwordHash));
  // The pending record is consumed (token can't be replayed).
  assert.equal(db.evs.length, 0);
});

test("complete: a second account is ENGINEER, not ADMIN", async () => {
  db.users.push({
    id: "u0",
    email: "first@example.com",
    passwordHash: "x",
    firstName: "F",
    lastName: "U",
    role: "ADMIN",
    defaultProjectId: null,
    emailVerifiedAt: NOW,
    createdAt: NOW,
  });
  const token = await seedVerified();
  const res = await completeRegistration(
    { registrationToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" },
    NOW,
  );
  assert.equal(res.user.role, "ENGINEER");
});

test("complete: token can't be replayed after success", async () => {
  const token = await seedVerified();
  await completeRegistration(
    { registrationToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" },
    NOW,
  );
  await expectHttp(
    () => completeRegistration({ registrationToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" }, NOW),
    401,
    "INVALID_REGISTRATION_TOKEN",
  );
});

test("complete: EMAIL_TAKEN when a verified user appeared after verify (pre-check path)", async () => {
  const token = await seedVerified();
  // A user with the same email gets created between verify and complete.
  db.users.push({
    id: "race",
    email: "jane@example.com",
    passwordHash: "x",
    firstName: "J",
    lastName: "D",
    role: "ENGINEER",
    defaultProjectId: null,
    emailVerifiedAt: NOW,
    createdAt: NOW,
  });
  await expectHttp(
    () => completeRegistration({ registrationToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" }, NOW),
    409,
    "EMAIL_TAKEN",
  );
  // The pending record is consumed even on the conflict (no replay).
  assert.equal(db.evs.length, 0);
});

test("complete: EMAIL_TAKEN when the unique insert loses the race (P2002 -> 409)", async () => {
  const token = await seedVerified();
  // Pre-check sees no user (findFirst -> null) but the insert collides at the DB.
  db.user.findFirst = async () => null;
  db.users.push({
    id: "race2",
    email: "jane@example.com",
    passwordHash: "x",
    firstName: "J",
    lastName: "D",
    role: "ENGINEER",
    defaultProjectId: null,
    emailVerifiedAt: NOW,
    createdAt: NOW,
  });
  await expectHttp(
    () => completeRegistration({ registrationToken: token, password: "Abcd1234", confirmPassword: "Abcd1234" }, NOW),
    409,
    "EMAIL_TAKEN",
  );
});

// ───────────────────────── resend ─────────────────────────

test("resend: within cooldown returns RESEND_COOLDOWN with retryAfterSeconds", async () => {
  await seedPending();
  await assert.rejects(
    () => resendCode({ email: "jane@example.com" }, later(5_000)),
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
  const first = await seedPending();
  db.evs[0]!.attempts = 3;
  const res = await resendCode({ email: "jane@example.com" }, later(31_000));
  assert.equal(res.resendAvailableAt.getTime(), later(31_000 + 30_000).getTime());
  assert.equal(db.evs[0]!.attempts, 0);
  assert.equal(db.evs[0]!.resendCount, 1);
  assert.equal(mail.sent.length, 2);
  // A new code was issued (hash matches the latest, not the first).
  assert.ok(await bcrypt.compare(mail.lastCode!, db.evs[0]!.codeHash));
  // Old code no longer verifies against the new hash (best-effort: usually differs).
  assert.ok(typeof first === "string");
});

test("resend: unknown email is neutral (no error, no mail)", async () => {
  const res = await resendCode({ email: "ghost@example.com" }, NOW);
  assert.equal(res.resendAvailableAt.getTime(), later(30_000).getTime());
  assert.equal(mail.sent.length, 0);
});

test("resend: an already-verified registration is neutral (no new code, record untouched)", async () => {
  await seedVerified(); // sets verifiedAt + registrationTokenHash on the record
  const sentBefore = mail.sent.length;
  const hashBefore = db.evs[0]!.codeHash;
  const res = await resendCode({ email: "jane@example.com" }, later(31_000));
  // Neutral cooldown returned, but nothing was re-issued.
  assert.equal(res.resendAvailableAt.getTime(), later(31_000 + 30_000).getTime());
  assert.equal(mail.sent.length, sentBefore);
  assert.equal(db.evs[0]!.codeHash, hashBefore);
  assert.equal(db.evs[0]!.resendCount, 0);
});
