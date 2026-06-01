import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkDestructiveSafety,
  extractDbHost,
  type DestructiveSafetyInput,
} from "./destructive-guard.js";

const LOCAL_URL = "postgresql://postgres:admin123!@localhost:5433/minotaurus";

function check(overrides: Partial<DestructiveSafetyInput> = {}) {
  return checkDestructiveSafety({
    databaseUrl: LOCAL_URL,
    nodeEnv: "development",
    allowOverride: false,
    ...overrides,
  });
}

test("extractDbHost parses host across connection-string shapes", () => {
  assert.equal(extractDbHost("postgresql://u:p@localhost:5433/db"), "localhost");
  assert.equal(extractDbHost("postgres://u:p@127.0.0.1/db"), "127.0.0.1");
  // password containing '@' — host is taken from the LAST '@'
  assert.equal(extractDbHost("postgresql://u:p@ss@db.neon.tech:5432/db"), "db.neon.tech");
  // bracketed IPv6
  assert.equal(extractDbHost("postgresql://u:p@[::1]:5432/db"), "::1");
  // no credentials
  assert.equal(extractDbHost("postgresql://localhost:5432/db"), "localhost");
});

test("local dev database is allowed", () => {
  assert.equal(check().allowed, true);
  assert.equal(check({ databaseUrl: "postgresql://u:p@127.0.0.1:5432/db" }).allowed, true);
  assert.equal(check({ databaseUrl: "postgresql://u:p@localhost/db" }).allowed, true);
  assert.equal(check({ nodeEnv: undefined }).allowed, true); // unset NODE_ENV is fine
});

test("NODE_ENV=production is blocked (even with override)", () => {
  const r = check({ nodeEnv: "production" });
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /production/i);
  // override does not rescue production
  assert.equal(check({ nodeEnv: "production", allowOverride: true }).allowed, false);
  // case-insensitive
  assert.equal(check({ nodeEnv: "PRODUCTION" }).allowed, false);
});

test("remote/managed database hosts are blocked", () => {
  const remoteUrls = [
    "postgresql://u:p@containers-us-west-1.railway.app:6543/railway",
    "postgresql://u:p@db.abcdefgh.supabase.co:5432/postgres",
    "postgresql://u:p@ep-cool-name.neon.tech/neondb",
    "postgresql://u:p@mydb.123456789012.us-east-1.rds.amazonaws.com:5432/db",
    "postgresql://u:p@dpg-xxxx.render.com/mydb",
  ];
  for (const url of remoteUrls) {
    const r = check({ databaseUrl: url });
    assert.equal(r.allowed, false, `expected blocked: ${url}`);
    assert.match(r.reason ?? "", /remote/i);
  }
});

test("remote host stays blocked even with the override flag", () => {
  const r = check({
    databaseUrl: "postgresql://u:p@ep-cool.neon.tech/db",
    allowOverride: true,
  });
  assert.equal(r.allowed, false);
});

test("missing DATABASE_URL is blocked", () => {
  assert.equal(check({ databaseUrl: undefined }).allowed, false);
  assert.equal(check({ databaseUrl: "  " }).allowed, false);
});

test("unrecognized (non-local, non-remote) host is blocked, override rescues it", () => {
  const url = "postgresql://u:p@db:5432/app"; // e.g. a docker-compose service name
  assert.equal(check({ databaseUrl: url }).allowed, false);
  assert.equal(check({ databaseUrl: url, allowOverride: true }).allowed, true);
});
