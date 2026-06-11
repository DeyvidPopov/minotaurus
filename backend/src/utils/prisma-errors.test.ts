import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { isUniqueViolation } from "./prisma-errors.js";

test("isUniqueViolation matches only a P2002 known-request error", () => {
  const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
    code: "P2002",
    clientVersion: "test",
  });
  assert.equal(isUniqueViolation(p2002), true);
});

test("isUniqueViolation rejects other Prisma error codes and non-Prisma values", () => {
  const p2025 = new Prisma.PrismaClientKnownRequestError("not found", {
    code: "P2025",
    clientVersion: "test",
  });
  assert.equal(isUniqueViolation(p2025), false);
  assert.equal(isUniqueViolation(new Error("boom")), false);
  assert.equal(isUniqueViolation(null), false);
  assert.equal(isUniqueViolation(undefined), false);
  // A plain object that merely looks like a P2002 is not an instance of the class.
  assert.equal(isUniqueViolation({ code: "P2002" }), false);
});
