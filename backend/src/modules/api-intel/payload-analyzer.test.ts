import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProjectApiIntel, extractFieldNames, sensitiveKind } from "./payload-analyzer.js";
import { idStem, parsePath } from "./text.js";
import type { AnalyzerInput, EndpointIntel } from "./api-intel.types.js";

// ─────────────── Low-level helpers ───────────────

test("extractFieldNames: JSON keys, nested, arrays", () => {
  const f = extractFieldNames('{ "email": "string", "user": { "id": "uuid", "role": "string" } }', "request");
  const names = f.map((x) => x.name).sort();
  assert.deepEqual(names, ["email", "id", "role", "user"]);
  assert.ok(f.every((x) => x.location === "request"));
});

test("extractFieldNames: empty string → []", () => {
  assert.deepEqual(extractFieldNames("", "request"), []);
  assert.deepEqual(extractFieldNames("   ", "response"), []);
});

test("extractFieldNames: free text falls back to identifier tokens", () => {
  const names = extractFieldNames("patient_id and accessToken", "request").map((x) => x.name);
  assert.ok(names.includes("patient_id"));
  assert.ok(names.includes("accessToken"));
});

test("sensitiveKind: credential vs pii vs none", () => {
  assert.equal(sensitiveKind("password"), "credential");
  assert.equal(sensitiveKind("accessToken"), "credential");
  assert.equal(sensitiveKind("resetToken"), "credential");
  assert.equal(sensitiveKind("ssn"), "pii");
  assert.equal(sensitiveKind("email"), null);
  assert.equal(sensitiveKind("firstName"), null);
});

test("idStem: id-like detection with boundaries", () => {
  assert.equal(idStem("patientId"), "patient");
  assert.equal(idStem("doctor_id"), "doctor");
  assert.equal(idStem("patientIds"), "patient");
  assert.equal(idStem("id"), null); // own key
  assert.equal(idStem("valid"), null); // no boundary
  assert.equal(idStem("paid"), null);
});

test("parsePath: resource / parent / action / scope", () => {
  assert.deepEqual(parsePath("/patients/register"), {
    literals: ["patients", "register"],
    resource: "patient",
    parent: null,
    action: "register",
    scope: "collection",
  });
  assert.equal(parsePath("/appointments/{id}").scope, "single");
  assert.equal(parsePath("/doctors/{id}/slots").parent, "doctor");
  assert.equal(parsePath("/doctors/{id}/slots").resource, "slot");
  assert.equal(parsePath("/auth/login").action, "login");
});

// ─────────────── ClinicBridge-like fixture ───────────────

function clinicBridge(): AnalyzerInput {
  return {
    specs: [
      {
        id: "spec_pb",
        artifactId: null, // exercises Tier-3/Tier-2 anchoring without a spec link
        title: "Patient & Booking API",
        endpoints: [
          {
            id: "ep_register",
            method: "POST",
            path: "/patients/register",
            summary: "Register a new patient account.",
            requestSchema: JSON.stringify({
              email: "string (email)",
              password: "string (min 8)",
              firstName: "string",
              lastName: "string",
              dateOfBirth: "string (YYYY-MM-DD)",
              phone: "string",
            }),
            responseSchema: JSON.stringify({ id: "string (uuid)", email: "string", role: "PATIENT", createdAt: "string" }),
            requiresAuth: false,
          },
          {
            id: "ep_appt",
            method: "POST",
            path: "/appointments",
            summary: "Book a new appointment.",
            requestSchema: JSON.stringify({
              patientId: "string (uuid)",
              doctorId: "string (uuid)",
              slotId: "string (uuid)",
              reason: "string",
              notes: "string",
            }),
            responseSchema: JSON.stringify({ id: "string", patientId: "string", status: "string" }),
            requiresAuth: true,
          },
          {
            id: "ep_login",
            method: "POST",
            path: "/auth/login",
            summary: "Authenticate a user.",
            requestSchema: JSON.stringify({ email: "string", password: "string" }),
            responseSchema: JSON.stringify({ token: "string (JWT)", expiresAt: "string", user: { id: "string", email: "string" } }),
            requiresAuth: false,
          },
          {
            id: "ep_get_patient",
            method: "GET",
            path: "/patients/{id}",
            summary: "Get a patient.",
            requestSchema: "",
            responseSchema: JSON.stringify({ id: "string", full_name: "string", email: "string", phone: "string" }),
            requiresAuth: true,
          },
          {
            id: "ep_empty",
            method: "POST",
            path: "/ping",
            summary: "",
            requestSchema: "",
            responseSchema: "",
            requiresAuth: false,
          },
        ],
      },
    ],
    models: [
      {
        id: "m_patient",
        artifactId: "art_patient_db",
        title: "Patient Database",
        entities: [
          {
            id: "e_patient",
            name: "Patient",
            fields: [
              { name: "id" },
              { name: "full_name" },
              { name: "email" },
              { name: "phone" },
              { name: "date_of_birth" },
              { name: "created_at" },
            ],
          },
          {
            id: "e_cred",
            name: "PatientCredential",
            fields: [{ name: "id" }, { name: "patient_id" }, { name: "password_hash" }, { name: "last_login" }],
          },
        ],
      },
      {
        id: "m_appt",
        artifactId: "art_appt_db",
        title: "Appointment Database",
        entities: [
          { id: "e_doctor", name: "Doctor", fields: [{ name: "id" }, { name: "full_name" }, { name: "specialty" }] },
          {
            id: "e_slot",
            name: "TimeSlot",
            fields: [{ name: "id" }, { name: "doctor_id" }, { name: "start_time" }, { name: "is_available" }],
          },
          {
            id: "e_appt",
            name: "Appointment",
            fields: [{ name: "id" }, { name: "patient_id" }, { name: "slot_id" }, { name: "status" }, { name: "notes" }],
          },
        ],
      },
    ],
    artifacts: [
      { id: "art_patient_reg", title: "Patient Registration", type: "SERVICE", status: "DRAFT" },
      { id: "art_auth", title: "Authentication & Authorization", type: "SERVICE", status: "DRAFT" },
      { id: "art_appt_book", title: "Appointment Booking", type: "SERVICE", status: "DRAFT" },
      { id: "art_hipaa", title: "HIPAA Compliance Policy", type: "SECURITY_POLICY", status: "DRAFT" },
      { id: "art_patient_db", title: "Patient Database", type: "DATABASE_MODEL", status: "DRAFT" },
      { id: "art_appt_db", title: "Appointment Database", type: "DATABASE_MODEL", status: "DRAFT" },
    ],
    relations: [
      { sourceArtifactId: "art_patient_reg", targetArtifactId: "art_patient_db", relationType: "USES" },
      { sourceArtifactId: "art_hipaa", targetArtifactId: "art_patient_reg", relationType: "SECURES" },
      { sourceArtifactId: "art_auth", targetArtifactId: "art_patient_reg", relationType: "SECURES" },
      { sourceArtifactId: "art_appt_book", targetArtifactId: "art_patient_reg", relationType: "DEPENDS_ON" },
      { sourceArtifactId: "art_appt_book", targetArtifactId: "art_appt_db", relationType: "USES" },
    ],
  };
}

const byId = (r: { endpoints: EndpointIntel[] }, id: string): EndpointIntel => {
  const e = r.endpoints.find((x) => x.endpointId === id);
  assert.ok(e, `endpoint ${id} present`);
  return e!;
};

test("register: entities, security, warnings, workflow", () => {
  const r = analyzeProjectApiIntel(clinicBridge());
  const ep = byId(r, "ep_register");

  const entities = ep.databaseEntities.map((e) => e.entityName).sort();
  assert.ok(entities.includes("Patient"), "matches Patient");
  assert.ok(entities.includes("PatientCredential"), "matches PatientCredential via password→password_hash");

  const sec = ep.security.map((s) => s.title).sort();
  assert.ok(sec.includes("HIPAA Compliance Policy"), "Tier-2 SECURES → HIPAA");
  assert.ok(sec.includes("Authentication & Authorization"), "Tier-2 SECURES → Auth");
  assert.ok(ep.security.every((s) => s.confidence === "high" && s.reason === "relation"));

  const related = ep.relatedArtifacts.map((a) => a.title);
  assert.ok(related.includes("Patient Registration"), "name-matched service surfaced");

  assert.ok(ep.warnings.some((w) => w.field === "password" && w.kind === "credential" && w.location === "request"));

  const wf = ep.workflow.map((w) => w.label);
  assert.ok(wf.includes("Creates Patient"), "Creates Patient");
  assert.ok(wf.includes("Starts Patient Onboarding"), "register → onboarding");
  // A public register endpoint HANDLES a credential — it does not require auth.
  assert.ok(wf.includes("Handles Credentials"), "password field → handles credentials");
  assert.ok(!wf.includes("Requires Authentication"), "public register must not read as requiring auth");
  assert.ok(wf.includes("Triggers Email Verification"), "register + email → verification");

  const create = ep.workflow.find((w) => w.label === "Creates Patient")!;
  assert.equal(create.confidence, "high");
  assert.ok(create.basis.length > 0, "basis is mandatory");
  assert.ok(ep.workflow.every((w) => w.basis.length > 0), "every signal carries a basis");
});

test("appointments: references + availability + requires auth", () => {
  const r = analyzeProjectApiIntel(clinicBridge());
  const ep = byId(r, "ep_appt");

  const entities = ep.databaseEntities.map((e) => e.entityName).sort();
  for (const want of ["Appointment", "Doctor", "Patient", "TimeSlot"]) {
    assert.ok(entities.includes(want), `matches ${want}`);
  }

  const wf = ep.workflow.map((w) => w.label).sort();
  assert.ok(wf.includes("Creates Appointment"));
  assert.ok(wf.includes("References Patient"));
  assert.ok(wf.includes("References Doctor"));
  assert.ok(wf.includes("Updates Availability"), "TimeSlot.is_available → availability");
  assert.ok(wf.includes("Requires Authentication"), "requiresAuth=true");

  const refs = ep.workflow.filter((w) => w.kind === "REFERENCE");
  assert.ok(refs.every((w) => w.confidence === "high"));
});

test("login: auth verbs, no spurious create", () => {
  const r = analyzeProjectApiIntel(clinicBridge());
  const ep = byId(r, "ep_login");
  const wf = ep.workflow.map((w) => w.label);
  assert.ok(wf.includes("Authenticates User"));
  assert.ok(wf.includes("Generates Access Token"), "token in response");
  assert.ok(wf.includes("Starts User Session"));
  assert.ok(!wf.some((l) => l.startsWith("Creates")), "login must not read as a Create");
  assert.ok(ep.warnings.some((w) => w.field === "token" && w.location === "response"));
});

test("GET reads, not creates", () => {
  const r = analyzeProjectApiIntel(clinicBridge());
  const ep = byId(r, "ep_get_patient");
  assert.ok(ep.workflow.some((w) => w.label === "Reads Patient"));
  assert.ok(!ep.workflow.some((w) => w.kind === "CREATE"));
});

test("empty payload → no entities/fields/warnings", () => {
  const r = analyzeProjectApiIntel(clinicBridge());
  const ep = byId(r, "ep_empty");
  assert.equal(ep.databaseEntities.length, 0);
  assert.equal(ep.referencedFields.length, 0);
  assert.equal(ep.warnings.length, 0);
});

test("payloadFields = ALL fields; referencedFields = inference subset", () => {
  const r = analyzeProjectApiIntel(clinicBridge());
  const ep = byId(r, "ep_register");

  // Every extracted request/response field is present — including unmapped ones.
  for (const want of ["firstName", "lastName", "email", "password", "dateOfBirth", "phone", "role"]) {
    assert.ok(ep.payloadFields.includes(want), `payloadFields includes "${want}"`);
  }
  // referencedFields is the SUBSET that drove inference: firstName/lastName map
  // to no entity field, so they appear only in payloadFields.
  assert.ok(ep.referencedFields.includes("email"), "email is inference evidence");
  assert.ok(!ep.referencedFields.includes("firstName"), "firstName not in referencedFields");
  assert.ok(!ep.referencedFields.includes("lastName"), "lastName not in referencedFields");
  // The subset is genuinely a subset of the full set.
  assert.ok(ep.referencedFields.every((f) => ep.payloadFields.includes(f)));
});

test("determinism: same input → deep-equal output twice", () => {
  const input = clinicBridge();
  assert.deepStrictEqual(analyzeProjectApiIntel(input), analyzeProjectApiIntel(input));
});

// ─────────────── Context-aware ambiguous field matching ───────────────

function contextFixture(): AnalyzerInput {
  return {
    specs: [
      { id: "spec_auth", artifactId: "art_authsvc", title: "Authentication API", endpoints: [
        { id: "ep_login", method: "POST", path: "/auth/login", summary: "", requiresAuth: false,
          requestSchema: JSON.stringify({ email: "string", password: "string" }),
          responseSchema: JSON.stringify({ accessToken: "string", user: { id: "string", email: "string" } }) },
      ] },
      { id: "spec_patient", artifactId: "art_patientsvc", title: "Patient API", endpoints: [
        { id: "ep_register", method: "POST", path: "/patients/register", summary: "", requiresAuth: false,
          requestSchema: JSON.stringify({ email: "string", password: "string", firstName: "string" }),
          responseSchema: JSON.stringify({ id: "string", email: "string" }) },
      ] },
      { id: "spec_appt", artifactId: "art_apptsvc", title: "Appointment API", endpoints: [
        { id: "ep_appt", method: "POST", path: "/appointments", summary: "", requiresAuth: true,
          requestSchema: JSON.stringify({ patientId: "string", doctorId: "string", slotId: "string" }),
          responseSchema: JSON.stringify({ id: "string", status: "string" }) },
      ] },
    ],
    models: [
      { id: "m_user", artifactId: "art_userdb", title: "User Database", entities: [
        { id: "e_user", name: "User", fields: [{ name: "id" }, { name: "email" }, { name: "passwordHash" }] },
        { id: "e_session", name: "Session", fields: [{ name: "id" }, { name: "userId" }, { name: "accessTokenHash" }] },
      ] },
      { id: "m_patient", artifactId: "art_patientdb", title: "Patient Database", entities: [
        { id: "e_patient", name: "Patient", fields: [{ name: "id" }, { name: "email" }, { name: "fullName" }] },
        { id: "e_cred", name: "PatientCredential", fields: [{ name: "id" }, { name: "patientId" }, { name: "passwordHash" }] },
      ] },
      { id: "m_appt", artifactId: "art_apptdb", title: "Appointment Database", entities: [
        { id: "e_appt", name: "Appointment", fields: [{ name: "id" }, { name: "patientId" }, { name: "slotId" }, { name: "status" }] },
        { id: "e_slot", name: "AvailabilitySlot", fields: [{ name: "id" }, { name: "isBooked" }] },
      ] },
    ],
    artifacts: [
      { id: "art_authsvc", title: "Authentication Service", type: "SERVICE", status: "ACTIVE" },
      { id: "art_patientsvc", title: "Patient Service", type: "SERVICE", status: "ACTIVE" },
      { id: "art_apptsvc", title: "Appointment Service", type: "SERVICE", status: "ACTIVE" },
      { id: "art_userdb", title: "User Database", type: "DATABASE_MODEL", status: "ACTIVE" },
      { id: "art_patientdb", title: "Patient Database", type: "DATABASE_MODEL", status: "ACTIVE" },
      { id: "art_apptdb", title: "Appointment Database", type: "DATABASE_MODEL", status: "ACTIVE" },
    ],
    relations: [
      { sourceArtifactId: "art_authsvc", targetArtifactId: "art_userdb", relationType: "USES" },
      { sourceArtifactId: "art_patientsvc", targetArtifactId: "art_patientdb", relationType: "USES" },
      { sourceArtifactId: "art_apptsvc", targetArtifactId: "art_apptdb", relationType: "USES" },
    ],
  };
}

const touched = (r: ReturnType<typeof analyzeProjectApiIntel>, path: string) =>
  r.endpoints.find((e) => e.path === path)!.databaseEntities.map((e) => e.entityName);

test("context-aware: ambiguous email resolves to User for the Authentication API", () => {
  const t = touched(analyzeProjectApiIntel(contextFixture()), "/auth/login");
  assert.ok(t.includes("User"), "email/password → User");
  assert.ok(t.includes("Session"), "accessToken → Session");
  assert.ok(!t.includes("Patient"), "must NOT touch Patient");
  assert.ok(!t.includes("PatientCredential"), "must NOT touch PatientCredential");
});

test("context-aware: the same email resolves to Patient for the Patient API", () => {
  const t = touched(analyzeProjectApiIntel(contextFixture()), "/patients/register");
  assert.ok(t.includes("Patient"), "email → Patient");
  assert.ok(t.includes("PatientCredential"), "password → PatientCredential");
  assert.ok(!t.includes("User"), "must NOT touch User");
});

test("context-aware: deterministic alphabetical fallback when no linked context", () => {
  const base = contextFixture();
  base.specs.forEach((s) => (s.artifactId = null)); // no spec→service link
  base.relations = []; // no service→db edges → no context anywhere
  const r1 = analyzeProjectApiIntel(base);
  assert.deepStrictEqual(r1, analyzeProjectApiIntel(base), "still deterministic");
  // With no context, the email tie breaks alphabetically → Patient (before User).
  assert.ok(touched(r1, "/auth/login").includes("Patient"), "alphabetical fallback → Patient");
});

test("context-aware: appointment patientId / slotId still match (no regression)", () => {
  const t = touched(analyzeProjectApiIntel(contextFixture()), "/appointments");
  assert.ok(t.includes("Appointment"), "path → Appointment");
  assert.ok(t.includes("Patient"), "patientId → Patient (unambiguous id-like)");
  assert.ok(t.includes("AvailabilitySlot"), "slotId → AvailabilitySlot");
});

// ─────────────── Phase 2: inferred graph edges ───────────────

function withSpecArtifact(): AnalyzerInput {
  const base = clinicBridge();
  // Link the spec to a real artifact so it becomes a graph anchor.
  base.specs[0].artifactId = "art_pb_api";
  base.artifacts.push({ id: "art_pb_api", title: "Patient & Booking API", type: "API_SPEC", status: "DRAFT" });
  return base;
}

test("inferred edges: API spec → data model (TOUCHES), deduped vs real relations", () => {
  const r = analyzeProjectApiIntel(withSpecArtifact());
  const edges = r.inferredEdges.filter((e) => e.source === "art_pb_api");
  assert.ok(edges.length > 0, "spec produces inferred edges");

  // Patient & Booking endpoints touch Patient + Appointment data models.
  const touches = edges.filter((e) => e.kind === "TOUCHES").map((e) => e.target);
  assert.ok(touches.includes("art_patient_db"), "TOUCHES Patient Database");
  assert.ok(touches.includes("art_appt_db"), "TOUCHES Appointment Database");

  // Security policies become SECURED_BY edges.
  const secured = edges.filter((e) => e.kind === "SECURED_BY").map((e) => e.target);
  assert.ok(secured.includes("art_hipaa") || secured.includes("art_auth"));

  // No self-edge, and every endpoint is a real artifact node.
  assert.ok(edges.every((e) => e.source !== e.target));
  assert.ok(edges.every((e) => e.endpointCount >= 1 && e.basis.length > 0));

  // Low-signal "related service" guesses are NOT drawn as graph edges.
  assert.ok(!r.inferredEdges.some((e) => e.kind === "RELATED"), "no RELATED overlay edges");
});

test("inferred edges: excluded when spec has no linked artifact", () => {
  const r = analyzeProjectApiIntel(clinicBridge()); // spec_pb.artifactId === null
  assert.equal(r.inferredEdges.length, 0);
});

test("inferred edges: never duplicate an existing real relation", () => {
  const input = withSpecArtifact();
  // Add a real relation art_pb_api → art_patient_db; the TOUCHES inferred edge must drop.
  input.relations.push({ sourceArtifactId: "art_pb_api", targetArtifactId: "art_patient_db", relationType: "USES" });
  const r = analyzeProjectApiIntel(input);
  assert.ok(
    !r.inferredEdges.some((e) => e.source === "art_pb_api" && e.target === "art_patient_db"),
    "real relation suppresses the inferred edge",
  );
});
