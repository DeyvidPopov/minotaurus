import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../utils/response.js";
import {
  DevEmailService,
  ResendEmailService,
  SmtpEmailService,
  getEmailService,
  maskEmail,
} from "./email.service.js";

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
  try {
    const out = fn();
    if (out instanceof Promise) return out.finally(restore) as T;
    restore();
    return out;
  } catch (err) {
    restore();
    throw err;
  }
}

/** Capture console.log output for the duration of fn. */
async function captureLog(fn: () => Promise<void>): Promise<string> {
  const orig = console.log;
  let buf = "";
  // eslint-disable-next-line no-console
  console.log = (...args: unknown[]) => {
    buf += args.map(String).join(" ") + "\n";
  };
  try {
    await fn();
  } finally {
    console.log = orig;
  }
  return buf;
}

/** Swap global fetch for a stub for the duration of fn (Resend transport tests). */
async function withFetch(
  stub: (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>,
  fn: () => Promise<void>,
): Promise<void> {
  const orig = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

/** Silence console.error for the duration of fn (Resend logs failures). */
async function muteError(fn: () => Promise<void>): Promise<void> {
  const orig = console.error;
  console.error = () => {};
  try {
    await fn();
  } finally {
    console.error = orig;
  }
}

test("maskEmail hides the local part across edge cases", () => {
  assert.equal(maskEmail("deyvid@minotaurus.dev"), "d****d@minotaurus.dev");
  assert.equal(maskEmail("ab@x.com"), "a*@x.com");
  assert.equal(maskEmail("a@x.com"), "a*@x.com");
  assert.equal(maskEmail("noatsign"), "***");
  assert.equal(maskEmail("@x.com"), "***");
});

test("DevEmailService logs the code ONLY outside production", async () => {
  const dev = new DevEmailService();

  const outDev = await withEnv({ NODE_ENV: "development" }, () =>
    captureLog(() => dev.sendVerificationCode({ email: "jane@example.com", code: "123456" })),
  );
  assert.match(outDev, /123456/);
  assert.match(outDev, /j\*+e@example\.com/); // email masked even in dev

  const outProd = await withEnv({ NODE_ENV: "production" }, () =>
    captureLog(() => dev.sendVerificationCode({ email: "jane@example.com", code: "123456" })),
  );
  assert.doesNotMatch(outProd, /123456/); // code must NEVER be logged in production
});

test("SmtpEmailService throws 503 EMAIL_NOT_CONFIGURED when creds are missing", async () => {
  const smtp = new SmtpEmailService({ from: "x@y.z" });
  await assert.rejects(
    () => smtp.sendVerificationCode({ email: "a@b.c", code: "000000" }),
    (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 503);
      assert.equal(err.code, "EMAIL_NOT_CONFIGURED");
      return true;
    },
  );
});

test("SmtpEmailService with full creds still refuses (transport not implemented yet)", async () => {
  const smtp = new SmtpEmailService({
    host: "smtp.example.com",
    port: 587,
    user: "u",
    pass: "p",
    from: "x@y.z",
  });
  await assert.rejects(
    () => smtp.sendVerificationCode({ email: "a@b.c", code: "000000" }),
    (err: unknown) => err instanceof HttpError && err.code === "EMAIL_NOT_CONFIGURED",
  );
});

test("getEmailService selects the provider from EMAIL_PROVIDER", async () => {
  await withEnv({ EMAIL_PROVIDER: "resend" }, () => {
    assert.equal(getEmailService().name, "resend");
  });
  await withEnv({ EMAIL_PROVIDER: "smtp" }, () => {
    assert.equal(getEmailService().name, "smtp");
  });
  await withEnv({ EMAIL_PROVIDER: "dev" }, () => {
    assert.equal(getEmailService().name, "dev");
  });
  await withEnv({ EMAIL_PROVIDER: undefined }, () => {
    assert.equal(getEmailService().name, "dev"); // default
  });
});

test("ResendEmailService throws 503 EMAIL_NOT_CONFIGURED without an API key", async () => {
  const svc = new ResendEmailService({ from: "x@y.z" });
  await assert.rejects(
    () => svc.sendVerificationCode({ email: "a@b.c", code: "000000" }),
    (err: unknown) =>
      err instanceof HttpError && err.status === 503 && err.code === "EMAIL_NOT_CONFIGURED",
  );
});

test("ResendEmailService POSTs to the Resend API and resolves on a 2xx", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const stub = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => '{"id":"abc"}' };
  };
  await withFetch(stub, async () => {
    const svc = new ResendEmailService({
      apiKey: "re_test_key",
      from: "Minotaurus Team <noreply@minotaurus.dev>",
    });
    await svc.sendVerificationCode({
      email: "jane@example.com",
      code: "048213",
      firstName: "Jane",
      expiresInMinutes: 10,
    });
  });
  assert.equal(calls.length, 1, "fetch should have been called once");
  const { url, init } = calls[0]!;
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.method, "POST");
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_test_key");
  assert.equal(headers["Content-Type"], "application/json");
  const body = JSON.parse(init.body as string);
  assert.equal(body.from, "Minotaurus Team <noreply@minotaurus.dev>");
  assert.deepEqual(body.to, ["jane@example.com"]);
  assert.match(body.subject, /048213/);
  assert.match(body.text, /048213/);
  assert.match(body.html, /048213/);
  // The plaintext greeting uses the recipient's first name.
  assert.match(body.text, /Jane/);
});

test("ResendEmailService throws 502 EMAIL_PROVIDER_ERROR on a non-2xx response", async () => {
  const stub = async () => ({
    ok: false,
    status: 422,
    text: async () => '{"message":"The minotaurus.dev domain is not verified"}',
  });
  await muteError(async () => {
    await withFetch(stub, async () => {
      const svc = new ResendEmailService({ apiKey: "re_test_key", from: "x@y.z" });
      await assert.rejects(
        () => svc.sendVerificationCode({ email: "a@b.c", code: "000000" }),
        (err: unknown) =>
          err instanceof HttpError && err.status === 502 && err.code === "EMAIL_PROVIDER_ERROR",
      );
    });
  });
});

test("ResendEmailService throws 502 EMAIL_PROVIDER_ERROR on a transport failure", async () => {
  const stub = async () => {
    throw new Error("network down");
  };
  await muteError(async () => {
    await withFetch(stub, async () => {
      const svc = new ResendEmailService({ apiKey: "re_test_key", from: "x@y.z" });
      await assert.rejects(
        () => svc.sendVerificationCode({ email: "a@b.c", code: "000000" }),
        (err: unknown) =>
          err instanceof HttpError && err.status === 502 && err.code === "EMAIL_PROVIDER_ERROR",
      );
    });
  });
});
