// payload-analyzer.ts — the pure, deterministic API Payload Intelligence core.
// Reads endpoint payloads + DB models + artifacts + relations and produces
// EndpointIntel (Architecture Links + Workflow Impact). No AI, no IO, no DB
// writes, no persistence. Same snapshot ⇒ deep-equal output.

import {
  CONFIDENCE_RANK,
  type AnalyzerInput,
  type ArtifactInput,
  type ArtifactLink,
  type Confidence,
  type EndpointInput,
  type EndpointIntel,
  type EntityMatch,
  type FieldLocation,
  type FieldRef,
  type InferredEdge,
  type InferredEdgeKind,
  type ModelInput,
  type ProjectApiIntel,
  type RelationInput,
  type SpecInput,
  type Warning,
} from "./api-intel.types.js";
import {
  CREDENTIAL_TOKENS,
  ENTITY_TOKEN_STOP,
  FREETEXT_STOP,
  GENERIC_FIELDS,
  PII_TOKENS,
  TITLE_TOKEN_STOP,
} from "./api-intel.constants.js";
import { idStem, normalizeToken, parsePath, singularize, titleCase } from "./text.js";
import { inferWorkflow, type WorkflowContext } from "./workflow-infer.js";

const BUCKET_CAP = 8;

// ─────────────── Field extraction ───────────────

/** Extract field names from a request/response schema string. JSON → keys
 *  (recursively); free text → identifier tokens. Empty → []. */
export function extractFieldNames(schema: string, location: FieldLocation): FieldRef[] {
  const trimmed = (schema ?? "").trim();
  if (!trimmed) return [];
  const out: FieldRef[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const n = name.trim();
    if (!n) return;
    const key = n.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: n, location });
  };

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      walkKeys(parsed, push, 0);
      return out;
    }
  } catch {
    /* not JSON — fall through to free-text tokenization */
  }

  for (const tok of trimmed.split(/[^A-Za-z0-9_]+/)) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok) && tok.length > 1 && !FREETEXT_STOP.has(tok.toLowerCase())) {
      push(tok);
    }
  }
  return out;
}

function walkKeys(node: unknown, push: (n: string) => void, depth: number): void {
  if (depth > 6 || node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const it of node) walkKeys(it, push, depth + 1);
    return;
  }
  if (typeof node === "object") {
    for (const k of Object.keys(node as Record<string, unknown>)) {
      push(k);
      walkKeys((node as Record<string, unknown>)[k], push, depth + 1);
    }
  }
}

// ─────────────── Sensitive detection ───────────────

export function sensitiveKind(name: string): "credential" | "pii" | null {
  const n = normalizeToken(name);
  if (!n) return null;
  if (CREDENTIAL_TOKENS.some((t) => n.includes(t))) return "credential";
  if (PII_TOKENS.some((t) => n.includes(t))) return "pii";
  return null;
}

// ─────────────── Entity matching (Tier 1) ───────────────

interface IndexedEntity {
  entityId: string;
  entityName: string;
  modelId: string;
  modelTitle: string;
  artifactId: string | null;
  norm: string; // normalized entity name
  singular: string;
  fieldNorms: string[];
  hasAvailabilityField: boolean;
}

function buildEntityIndex(models: ModelInput[]): IndexedEntity[] {
  const out: IndexedEntity[] = [];
  for (const m of models) {
    for (const e of m.entities) {
      const norm = normalizeToken(e.name);
      const fieldNorms = e.fields.map((f) => normalizeToken(f.name)).filter(Boolean);
      out.push({
        entityId: e.id,
        entityName: e.name,
        modelId: m.id,
        modelTitle: m.title,
        artifactId: m.artifactId,
        norm,
        singular: singularize(norm),
        fieldNorms,
        hasAvailabilityField: fieldNorms.some((f) => f.includes("avail")),
      });
    }
  }
  // Stable order so "first match wins" is deterministic.
  return out.sort((a, b) => cmp(a.norm, b.norm) || cmp(a.entityId, b.entityId));
}

/**
 * Build a reusable predicate: does a referent stem resolve to any entity? Used
 * by the API validation rules (api-validation.ts) so entity-matching heuristics
 * live in exactly one place.
 */
/** No context → matchers fall back to deterministic (index-order) behavior. */
const NO_PREFERENCE: ReadonlySet<string> = new Set();

export function buildEntityMatcher(models: ModelInput[]): (stem: string) => boolean {
  const index = buildEntityIndex(models);
  return (stem: string) => matchEntityByToken(stem, index, NO_PREFERENCE) !== null;
}

/**
 * Among candidates (already in deterministic index order: norm, then id), prefer
 * one in the context set; otherwise keep the deterministic first. This is the
 * ONLY place context changes the result — it just breaks ties for ambiguous
 * names. Empty `preferred` ⇒ identical to the old first-match behavior.
 */
function pickPreferred(candidates: IndexedEntity[], preferred: ReadonlySet<string>): IndexedEntity | null {
  if (candidates.length === 0) return null;
  for (const c of candidates) if (preferred.has(c.entityId)) return c;
  return candidates[0];
}

/** Match a referent token (entity-name-ish) to an entity. Exact singular first,
 *  then a contains match (e.g. "slot" → "timeslot"). Context breaks ties. */
function matchEntityByToken(token: string, index: IndexedEntity[], preferred: ReadonlySet<string>): IndexedEntity | null {
  const t = singularize(normalizeToken(token));
  if (t.length < 3 || ENTITY_TOKEN_STOP.has(t)) return null;
  const exact = index.filter((e) => e.singular === t || e.norm === t);
  if (exact.length) return pickPreferred(exact, preferred);
  if (t.length >= 4) {
    const contains = index.filter((e) => e.norm.includes(t) || t.includes(e.singular));
    if (contains.length) return pickPreferred(contains, preferred);
  }
  return null;
}

/** Match a non-id field name to an entity by its field names (e.g. password →
 *  password_hash). Context breaks ties when a field exists on several entities. */
function matchEntityByField(fieldNorm: string, index: IndexedEntity[], preferred: ReadonlySet<string>): IndexedEntity | null {
  if (fieldNorm.length < 3 || GENERIC_FIELDS.has(fieldNorm)) return null;
  const candidates = index.filter((e) =>
    e.fieldNorms.some((fn) => fn === fieldNorm || (fieldNorm.length >= 4 && (fn.includes(fieldNorm) || fieldNorm.includes(fn)))),
  );
  return pickPreferred(candidates, preferred);
}

interface EntityMatchResult {
  matches: EntityMatch[];
  primary: EntityMatch | null;
  references: { match: EntityMatch; field: string }[];
  evidenceFields: string[];
  availabilityRef: string | null; // entity name of a referenced entity with an availability field
}

function toEntityMatch(e: IndexedEntity, via: string, basis: string): EntityMatch {
  return {
    entityId: e.entityId,
    entityName: e.entityName,
    modelId: e.modelId,
    modelTitle: e.modelTitle,
    artifactId: e.artifactId,
    via,
    basis,
    confidence: "medium", // Tier 1
  };
}

function matchEntities(
  fields: FieldRef[],
  pathResource: string | null,
  pathParent: string | null,
  index: IndexedEntity[],
  preferred: ReadonlySet<string>,
): EntityMatchResult {
  const byId = new Map<string, EntityMatch>();
  const idxById = new Map<string, IndexedEntity>(index.map((e) => [e.entityId, e]));
  const references: { match: EntityMatch; field: string }[] = [];
  const evidence = new Set<string>();
  let primary: EntityMatch | null = null;

  const ensure = (e: IndexedEntity, via: string, basis: string): EntityMatch => {
    let m = byId.get(e.entityId);
    if (!m) {
      m = toEntityMatch(e, via, basis);
      byId.set(e.entityId, m);
    }
    return m;
  };

  // 1. Primary from the path resource (and parent as a secondary path signal).
  if (pathResource) {
    const e = matchEntityByToken(pathResource, index, preferred);
    if (e) primary = ensure(e, `path:${pathResource}`, `path resource "${pathResource}" → ${e.entityName} entity`);
  }
  if (pathParent) {
    const e = matchEntityByToken(pathParent, index, preferred);
    if (e) ensure(e, `path:${pathParent}`, `parent path "${pathParent}" → ${e.entityName} entity`);
  }

  // 2. id-like fields → entity references.
  for (const f of fields) {
    const stem = idStem(f.name);
    if (!stem) continue;
    const e = matchEntityByToken(stem, index, preferred);
    if (!e) continue;
    const m = ensure(e, `field:${f.name}`, `id-like field "${f.name}" → ${e.entityName} entity`);
    evidence.add(f.name);
    if (!primary || m.entityId !== primary.entityId) {
      if (!references.some((r) => r.match.entityId === m.entityId)) references.push({ match: m, field: f.name });
    }
  }

  // 3. non-id fields → entity by field-name match (evidence only).
  for (const f of fields) {
    if (idStem(f.name)) continue;
    const fn = normalizeToken(f.name);
    const e = matchEntityByField(fn, index, preferred);
    if (!e) continue;
    ensure(e, `field:${f.name}`, `field "${f.name}" matches ${e.entityName}`);
    evidence.add(f.name);
  }

  // availability: a referenced entity (id-like) that has an availability field.
  let availabilityRef: string | null = null;
  for (const r of references) {
    const ie = idxById.get(r.match.entityId);
    if (ie?.hasAvailabilityField) {
      availabilityRef = ie.entityName;
      break;
    }
  }

  const matches = Array.from(byId.values()).sort(
    (a, b) => cmp(a.entityName, b.entityName) || cmp(a.entityId, b.entityId),
  );
  return { matches, primary, references, evidenceFields: Array.from(evidence), availabilityRef };
}

// ─────────────── Architecture links (Tier 2 + Tier 3) ───────────────

function titleTokens(title: string): string[] {
  return title
    .split(/[^A-Za-z0-9]+/)
    .map((t) => normalizeToken(t))
    .filter((t) => t.length >= 3 && !TITLE_TOKEN_STOP.has(t));
}

interface LinkBuckets {
  related: Map<string, ArtifactLink>;
  documentation: Map<string, ArtifactLink>;
  security: Map<string, ArtifactLink>;
  anchors: Set<string>;
}

function setLink(map: Map<string, ArtifactLink>, link: ArtifactLink): void {
  const existing = map.get(link.artifactId);
  // Prefer higher-confidence reason (relation > name-match).
  if (!existing || CONFIDENCE_RANK[link.confidence] < CONFIDENCE_RANK[existing.confidence]) {
    map.set(link.artifactId, link);
  }
}

function bucketForType(type: string): keyof Omit<LinkBuckets, "anchors"> | null {
  if (type === "SECURITY_POLICY") return "security";
  if (type === "DOCUMENTATION") return "documentation";
  if (type === "SERVICE" || type === "EXTERNAL_SYSTEM" || type === "API_SPEC") return "related";
  return null;
}

/** Two title/resource tokens correspond (exact, or one is a ≥4-char prefix of the
 *  other) — so "auth" matches "Authentication", "patient" matches "Patient". */
function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.startsWith(a)) return true;
  if (b.length >= 4 && a.startsWith(b)) return true;
  return false;
}

function buildArchitectureLinks(
  primary: EntityMatch | null,
  tokens: string[],
  artifacts: ArtifactInput[],
  relations: RelationInput[],
): { related: ArtifactLink[]; documentation: ArtifactLink[]; security: ArtifactLink[]; anchors: string[] } {
  const byId = new Map<string, ArtifactInput>(artifacts.map((a) => [a.id, a]));
  const buckets: LinkBuckets = {
    related: new Map(),
    documentation: new Map(),
    security: new Map(),
    anchors: new Set(),
  };

  // Anchor: ONLY the primary entity's owning model artifact (the entity the path
  // resource resolves to). CROSS-REFERENCED entities (e.g. a `patientId` field on
  // an appointment endpoint) must NOT anchor the relation walk — otherwise the
  // appointment endpoint inherits Patient's docs/policies/services. Cross
  // references are still reported under "Touches" (databaseEntities), just not as
  // implementing/documenting/securing artifacts. (Also deliberately NOT the spec's
  // own artifact — for ClinicBridge that is the API Gateway, which floods Related.)
  if (primary?.artifactId && byId.has(primary.artifactId)) buckets.anchors.add(primary.artifactId);

  // Tier 3: name-match typed artifacts on the endpoint's tokens. Also become anchors.
  const tokenSet = tokens.filter((t) => t.length >= 3);
  for (const a of artifacts) {
    const bucket = bucketForType(a.type);
    if (!bucket) continue;
    const aTokens = titleTokens(a.title);
    if (!aTokens.some((at) => tokenSet.some((t) => tokenMatches(t, at)))) continue;
    buckets.anchors.add(a.id);
    setLink(buckets[bucket], {
      artifactId: a.id,
      title: a.title,
      type: a.type,
      status: a.status,
      reason: "name-match",
      basis: `title matches endpoint resource`,
      confidence: "low",
    });
  }

  // Tier 2: walk existing relations from every anchor (confirmed SSOT → high).
  const anchorIds = new Set(buckets.anchors);
  for (const r of relations) {
    const aIsSrc = anchorIds.has(r.sourceArtifactId);
    const aIsTgt = anchorIds.has(r.targetArtifactId);
    if (!aIsSrc && !aIsTgt) continue;

    if (r.relationType === "SECURES") {
      const securer = byId.get(r.sourceArtifactId);
      if (securer && !anchorIds.has(securer.id)) {
        setLink(buckets.security, relLink(securer, r.relationType, `${securer.title} SECURES this area`));
      }
      continue;
    }
    if (r.relationType === "DOCUMENTS") {
      const doc = byId.get(r.sourceArtifactId);
      if (doc && !anchorIds.has(doc.id)) {
        setLink(buckets.documentation, relLink(doc, r.relationType, `${doc.title} DOCUMENTS this area`));
      }
      continue;
    }
    // Generic structural relation → the non-anchor neighbour (if service-ish).
    const neighborId = aIsSrc ? r.targetArtifactId : r.sourceArtifactId;
    const n = byId.get(neighborId);
    if (!n || anchorIds.has(n.id)) continue;
    const bucket = bucketForType(n.type);
    if (bucket === "related") {
      setLink(buckets.related, relLink(n, r.relationType, `${r.relationType} relation`));
    } else if (bucket === "security") {
      setLink(buckets.security, relLink(n, r.relationType, `${r.relationType} relation`));
    } else if (bucket === "documentation") {
      setLink(buckets.documentation, relLink(n, r.relationType, `${r.relationType} relation`));
    }
  }

  // An artifact shown as Security or Documentation should not also appear in
  // the generic Related bucket (security/doc are the more specific signal).
  const claimed = new Set<string>([...buckets.security.keys(), ...buckets.documentation.keys()]);
  for (const id of claimed) buckets.related.delete(id);

  return {
    related: sortLinks(buckets.related),
    documentation: sortLinks(buckets.documentation),
    security: sortLinks(buckets.security),
    anchors: Array.from(buckets.anchors).sort(),
  };
}

function relLink(a: ArtifactInput, relationType: string, basis: string): ArtifactLink {
  return {
    artifactId: a.id,
    title: a.title,
    type: a.type,
    status: a.status,
    reason: "relation",
    relationType,
    basis,
    confidence: "high",
  };
}

function sortLinks(map: Map<string, ArtifactLink>): ArtifactLink[] {
  return Array.from(map.values())
    .sort(
      (a, b) =>
        CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
        cmp(a.title, b.title) ||
        cmp(a.artifactId, b.artifactId),
    )
    .slice(0, BUCKET_CAP);
}

// ─────────────── Orchestration ───────────────

function analyzeEndpoint(
  endpoint: EndpointInput,
  specId: string,
  entityIndex: IndexedEntity[],
  artifacts: ArtifactInput[],
  relations: RelationInput[],
  preferred: ReadonlySet<string>,
): EndpointIntel {
  const parsed = parsePath(endpoint.path);
  const fields: FieldRef[] = [
    ...extractFieldNames(endpoint.requestSchema, "request"),
    ...extractFieldNames(endpoint.responseSchema, "response"),
  ];

  const em = matchEntities(fields, parsed.resource, parsed.parent, entityIndex, preferred);

  // Tokens for Tier-3 name matching: the endpoint's OWN resource/parent + the
  // PRIMARY entity name only. Deliberately NOT every matched entity name — a
  // cross-referenced `patientId` must not make an appointment/auth endpoint
  // name-match "Patient …" documentation/services.
  const tokens = [
    parsed.resource,
    parsed.parent,
    em.primary ? singularize(normalizeToken(em.primary.entityName)) : null,
  ].filter((t): t is string => !!t);

  const links = buildArchitectureLinks(em.primary, tokens, artifacts, relations);

  // Warnings — sensitive fields in any payload location.
  const warnings: Warning[] = [];
  const warnSeen = new Set<string>();
  for (const f of fields) {
    const kind = sensitiveKind(f.name);
    if (!kind) continue;
    const key = `${f.location}:${f.name.toLowerCase()}`;
    if (warnSeen.has(key)) continue;
    warnSeen.add(key);
    warnings.push({
      field: f.name,
      kind,
      location: f.location,
      message:
        kind === "credential"
          ? `Credential field "${f.name}" detected in ${f.location} payload`
          : `Sensitive (PII) field "${f.name}" detected in ${f.location} payload`,
    });
  }
  warnings.sort((a, b) => cmp(a.location, b.location) || cmp(a.field, b.field));

  // Payload fields = EVERY extracted request/response field (deduped
  // case-insensitively, original casing kept). This is the complete payload
  // surface — nothing is filtered out.
  const payloadFields = Array.from(
    new Map(fields.map((f) => [f.name.toLowerCase(), f.name])).values(),
  ).sort((a, b) => cmp(a.toLowerCase(), b.toLowerCase()));

  // Referenced fields = the SUBSET that drove inference (id-like + fields that
  // matched a database entity). A field like "firstName" is a real payload field
  // but maps to nothing, so it appears in payloadFields, not referencedFields.
  const referencedFields = Array.from(
    new Set([...em.evidenceFields, ...fields.filter((f) => idStem(f.name)).map((f) => f.name)]),
  ).sort((a, b) => cmp(a.toLowerCase(), b.toLowerCase()));

  // Workflow inference.
  const requestFields = new Set(
    extractFieldNames(endpoint.requestSchema, "request").map((f) => normalizeToken(f.name)),
  );
  const responseFields = new Set(
    extractFieldNames(endpoint.responseSchema, "response").map((f) => normalizeToken(f.name)),
  );
  const primaryObject = em.primary?.entityName ?? (parsed.resource ? titleCase(parsed.resource) : null);
  const ctx: WorkflowContext = {
    method: endpoint.method,
    path: parsed,
    requiresAuth: endpoint.requiresAuth,
    primaryObject,
    primaryEntityId: em.primary?.entityId,
    primaryMatched: !!em.primary,
    references: em.references.map((r) => ({ object: r.match.entityName, entityId: r.match.entityId })),
    requestFields,
    responseFields,
    availabilityRef: em.availabilityRef ? { object: em.availabilityRef } : undefined,
  };
  const workflow = inferWorkflow(ctx);

  return {
    endpointId: endpoint.id,
    apiSpecId: specId,
    method: endpoint.method,
    path: endpoint.path,
    requiresAuth: endpoint.requiresAuth,
    databaseEntities: em.matches,
    payloadFields,
    referencedFields,
    relatedArtifacts: links.related,
    documentation: links.documentation,
    security: links.security,
    workflow,
    warnings,
    anchors: links.anchors,
  };
}

/**
 * Per-spec "preferred entity" context: entities in the DB models reachable (1-hop,
 * either direction) from the spec's linked service/database artifact via existing
 * ArtifactRelation edges. This only breaks ties for ambiguous field names (e.g.
 * `email` on both User and Patient) so an Authentication API prefers User/Session.
 * No linked artifact ⇒ empty set ⇒ deterministic fallback (Rule 4).
 */
function buildPreferredEntitiesBySpec(input: AnalyzerInput): Map<string, ReadonlySet<string>> {
  const neighbors = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let s = neighbors.get(a);
    if (!s) { s = new Set(); neighbors.set(a, s); }
    s.add(b);
  };
  for (const r of input.relations) {
    link(r.sourceArtifactId, r.targetArtifactId);
    link(r.targetArtifactId, r.sourceArtifactId);
  }
  const entityIdsByModelArtifact = new Map<string, string[]>();
  for (const m of input.models) {
    if (m.artifactId) entityIdsByModelArtifact.set(m.artifactId, m.entities.map((e) => e.id));
  }

  const result = new Map<string, ReadonlySet<string>>();
  for (const spec of input.specs) {
    const preferred = new Set<string>();
    if (spec.artifactId) {
      const reach = new Set<string>([spec.artifactId, ...(neighbors.get(spec.artifactId) ?? [])]);
      for (const artId of reach) for (const id of entityIdsByModelArtifact.get(artId) ?? []) preferred.add(id);
    }
    result.set(spec.id, preferred);
  }
  return result;
}

/** Entry point: analyze every endpoint in the project. Pure + deterministic. */
export function analyzeProjectApiIntel(input: AnalyzerInput): ProjectApiIntel {
  const entityIndex = buildEntityIndex(input.models);
  const preferredBySpec = buildPreferredEntitiesBySpec(input);
  const endpoints: EndpointIntel[] = [];
  const specs = [...input.specs].sort((a, b) => cmp(a.id, b.id));
  for (const spec of specs) {
    const preferred = preferredBySpec.get(spec.id) ?? NO_PREFERENCE;
    const eps = [...spec.endpoints].sort((a, b) => cmp(a.id, b.id));
    for (const ep of eps) {
      endpoints.push(analyzeEndpoint(ep, spec.id, entityIndex, input.artifacts, input.relations, preferred));
    }
  }
  const inferredEdges = buildInferredEdges(input.specs, endpoints, input.relations, input.artifacts);
  return { endpoints, inferredEdges };
}

// ─────────────── Phase 2: artifact-level inferred graph edges ───────────────

const KIND_RANK: Record<InferredEdgeKind, number> = {
  TOUCHES: 0, // API ↔ data model — the genuinely invisible link
  SECURED_BY: 1,
  DOCUMENTED_BY: 2,
  RELATED: 3,
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Aggregate per-endpoint intel into artifact-level edges anchored on each API
 * spec's artifact. Excludes any pair that is already a real ArtifactRelation, so
 * the overlay only adds connections the graph cannot already show. Deterministic.
 */
function buildInferredEdges(
  specs: SpecInput[],
  intels: EndpointIntel[],
  relations: RelationInput[],
  artifacts: ArtifactInput[],
): InferredEdge[] {
  const artifactIds = new Set(artifacts.map((a) => a.id));
  const realPairs = new Set<string>();
  for (const r of relations) realPairs.add(pairKey(r.sourceArtifactId, r.targetArtifactId));
  const specArtifactById = new Map(specs.map((s) => [s.id, s.artifactId]));

  const bySpec = new Map<string, EndpointIntel[]>();
  for (const e of intels) {
    const list = bySpec.get(e.apiSpecId) ?? [];
    list.push(e);
    bySpec.set(e.apiSpecId, list);
  }

  const edges: InferredEdge[] = [];
  for (const [specId, eps] of bySpec) {
    const src = specArtifactById.get(specId) ?? null;
    if (!src || !artifactIds.has(src)) continue; // spec must itself be a graph node

    const agg = new Map<string, { kind: InferredEdgeKind; conf: Confidence; basis: string; count: number }>();
    const consider = (targetId: string | null, kind: InferredEdgeKind, conf: Confidence, basis: string) => {
      if (!targetId || targetId === src || !artifactIds.has(targetId)) return;
      if (realPairs.has(pairKey(src, targetId))) return; // already drawn as a solid edge
      const cur = agg.get(targetId);
      if (!cur) {
        agg.set(targetId, { kind, conf, basis, count: 1 });
        return;
      }
      cur.count += 1;
      if (CONFIDENCE_RANK[conf] < CONFIDENCE_RANK[cur.conf]) cur.conf = conf;
      if (KIND_RANK[kind] < KIND_RANK[cur.kind]) {
        cur.kind = kind;
        cur.basis = basis;
      }
    };

    // Only the high-signal, genuinely-additive kinds become graph edges: the
    // API surface ↔ the data it touches, the policy that governs it, and the doc
    // that describes it. "Related service" guesses are deliberately NOT drawn as
    // edges (they'd invent a spec→neighbour link from a neighbour that related to
    // a different anchor) — they stay in the per-endpoint Architecture Links panel.
    for (const ep of eps) {
      for (const e of ep.databaseEntities) {
        if (e.artifactId) consider(e.artifactId, "TOUCHES", e.confidence, `${ep.method} ${ep.path} touches ${e.entityName}`);
      }
      for (const a of ep.security) consider(a.artifactId, "SECURED_BY", a.confidence, `${ep.method} ${ep.path} governed by ${a.title}`);
      for (const a of ep.documentation) consider(a.artifactId, "DOCUMENTED_BY", a.confidence, `${ep.method} ${ep.path} documented by ${a.title}`);
    }

    for (const [target, info] of agg) {
      edges.push({ source: src, target, kind: info.kind, confidence: info.conf, basis: info.basis, endpointCount: info.count });
    }
  }

  return edges.sort((a, b) => cmp(a.source, b.source) || cmp(a.target, b.target) || cmp(a.kind, b.kind));
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export type { Confidence };
