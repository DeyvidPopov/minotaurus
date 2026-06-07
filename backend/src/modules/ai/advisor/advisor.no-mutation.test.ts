// advisor.no-mutation.test.ts — structural guarantee that the Advisor never
// mutates ARCHITECTURE state. After the consolidation it persists its OWN result
// (an AiSession(ADVISOR) audit row) so advisories survive refresh — that single
// write is allowed (it stores AI output, not architecture state). What remains
// forbidden, and is asserted here at the source level: any write to an SSOT model
// (artifacts, relations, diagrams, API specs, DB models, validation issues, …)
// and any raw SQL execution. AI proposes/explains; it never writes architecture.
// Run with: npm run test:unit

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Resolved from the package root (npm run test:unit runs with cwd = backend/).
const ADVISOR_DIR = join(process.cwd(), "src", "modules", "ai", "advisor");

/** Every source file in the advisor module except tests. */
function advisorSourceFiles(): string[] {
  return readdirSync(ADVISOR_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(ADVISOR_DIR, f));
}

// The ONLY Prisma model the Advisor is permitted to write: its own audit/history
// record. Any other model is architecture/SSOT state and is off-limits.
const ALLOWED_WRITE_MODELS = new Set(["aiSession"]);

// `<obj>.<model>.<writeMethod>(` — captures the model name so we can assert it is
// allow-listed. Requires an opening paren so prose/comments never false-positive.
const WRITE_CALL_RE = /\.(\w+)\.(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/g;

test("the advisor module ships its source files", () => {
  assert.ok(advisorSourceFiles().length >= 6, "expected the advisor module sources to be present");
});

test("advisor sources use the shared Prisma singleton, never their own client", () => {
  for (const file of advisorSourceFiles()) {
    const src = readFileSync(file, "utf8");
    assert.ok(!/new\s+PrismaClient/.test(src), `${file} must not instantiate its own PrismaClient`);
  }
});

test("no advisor source writes to a non-AiSession (SSOT/architecture) model", () => {
  for (const file of advisorSourceFiles()) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(WRITE_CALL_RE)) {
      const model = m[1];
      assert.ok(
        ALLOWED_WRITE_MODELS.has(model),
        `${file} writes to "${model}" via .${m[2]}() — the Advisor may only write its own aiSession record`,
      );
    }
  }
});

test("no advisor source executes raw SQL", () => {
  for (const file of advisorSourceFiles()) {
    const src = readFileSync(file, "utf8");
    assert.ok(!/\$executeRaw/.test(src), `${file} must not run $executeRaw`);
    assert.ok(!/\$queryRaw/.test(src), `${file} must not run $queryRaw`);
  }
});
