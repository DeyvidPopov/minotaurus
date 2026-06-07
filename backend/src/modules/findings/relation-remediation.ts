// relation-remediation.ts — pure, deterministic candidate generators for the
// REVIEW-REQUIRED validation remediations (V2: confidence & evidence engine).
//
// These are NOT safe one-click fixes: the generators only SUGGEST candidates; a
// human must pick one and confirm before anything is written. Code here is pure
// (no IO, no clock, no randomness, no DB, no AI) so the same inputs always yield
// the same candidates. The controller loads project data, calls these, and (only
// after the user confirms a candidate that these functions actually produced)
// applies the change through the existing controller logic.
//
// V2 turns each candidate into an EXPLAINABLE recommendation: a weighted list of
// deterministic evidence → a 0–100 score → a HIGH/MEDIUM/LOW confidence band. The
// caller (and UI) can show exactly why a candidate exists and why it ranks where
// it does. Still deterministic, still review-required, still no AI.
//
// Three remediations, by finding code:
//   DIAGRAM_UNLINKED          → LINK_DIAGRAM_ARTIFACT  (mechanic: set diagram.artifactId — NOT a relation)
//   SECURITY_POLICY_NOT_LINKED→ LINK_SECURITY_POLICY   (mechanic: create a SECURES relation)
//   ORPHAN_ARTIFACT           → LINK_ORPHAN_ARTIFACT   (mechanic: create a relation, type per candidate)
//
// Exclusions enforced everywhere: self-loops, DEPRECATED targets, existing
// relations, and (by construction — callers pass project-scoped data) cross-project
// targets. A candidate is only emitted when it has at least one real signal
// (title/token/mermaid/api), so we never suggest an unrelated artifact.

export type RelationRemediationId =
  | "LINK_DIAGRAM_ARTIFACT"
  | "LINK_SECURITY_POLICY"
  | "LINK_ORPHAN_ARTIFACT";

// SET_DIAGRAM_ARTIFACT writes diagram.artifactId (a nullable FK, reversible, not a
// graph edge). CREATE_RELATION writes an ArtifactRelation edge.
export type RemediationMechanic = "SET_DIAGRAM_ARTIFACT" | "CREATE_RELATION";

export type RemediationConfidence = "HIGH" | "MEDIUM" | "LOW";

// ── Evidence model (V2) ──
export type EvidenceType =
  | "TITLE_MATCH"
  | "TOKEN_MATCH"
  | "PHRASE_TITLE_MATCH"
  | "MERMAID_NODE_MATCH"
  | "API_INTELLIGENCE"
  | "EXISTING_NEIGHBORHOOD"
  | "ARTIFACT_TYPE_COMPATIBILITY";

// Deterministic, additive weights. (ARTIFACT_TYPE_COMPATIBILITY is 15 to match the
// worked spec example — Authentication Service: TITLE 40 + API 25 + TYPE 15 = 80
// HIGH — which the "suggested weights" table understated as 10.)
export const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
  TITLE_MATCH: 40,
  MERMAID_NODE_MATCH: 30,
  PHRASE_TITLE_MATCH: 25,
  API_INTELLIGENCE: 25,
  TOKEN_MATCH: 20,
  EXISTING_NEIGHBORHOOD: 15,
  ARTIFACT_TYPE_COMPATIBILITY: 15,
};

export interface RemediationEvidence {
  type: EvidenceType;
  weight: number;
  explanation: string;
}

export interface RemediationCandidate {
  targetId: string;
  targetTitle: string;
  targetType: string;
  /** Present for CREATE_RELATION mechanics; absent for the diagram-link FK. */
  relationType?: string;
  /** Derived from `score` via the threshold bands below. */
  confidence: RemediationConfidence;
  /** 0–100 (sum of evidence weights, capped at 100). */
  score: number;
  evidence: RemediationEvidence[];
}

export interface RemediationPreview {
  remediationId: RelationRemediationId;
  findingCode: string;
  mechanic: RemediationMechanic;
  title: string;
  relationType?: string;
  candidates: RemediationCandidate[];
  /** True when NO candidate reaches the MEDIUM (≥50) bar — UI shows the manual path. */
  manualFallback: boolean;
}

// ── plain inputs (no Prisma types) ──
export interface RArtifact {
  id: string;
  title: string;
  type: string;
  status: string;
}
export interface RRelation {
  sourceArtifactId: string;
  targetArtifactId: string;
  relationType: string;
}
export interface RInferredEdge {
  source: string;
  target: string;
  kind: string; // TOUCHES | SECURED_BY | DOCUMENTED_BY | RELATED
  confidence: string; // high | medium | low (api-intel lowercase)
  basis: string;
}

const REMEDIATION_BY_CODE: Record<string, RelationRemediationId> = {
  DIAGRAM_UNLINKED: "LINK_DIAGRAM_ARTIFACT",
  SECURITY_POLICY_NOT_LINKED: "LINK_SECURITY_POLICY",
  ORPHAN_ARTIFACT: "LINK_ORPHAN_ARTIFACT",
};

/** The review-required remediation a finding code maps to, or null. */
export function getRelationRemediationIdForCode(code: string): RelationRemediationId | null {
  return REMEDIATION_BY_CODE[code] ?? null;
}

/** Score → confidence band: 80+ HIGH, 50–79 MEDIUM, 0–49 LOW. */
export function confidenceFromScore(score: number): RemediationConfidence {
  return score >= 80 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
}

/**
 * Whether the preview should surface the manual path: true when NO candidate
 * reaches the MEDIUM (≥50) bar (also true when there are no candidates at all).
 * Single source of truth so every remediation branch stays consistent — see
 * RemediationPreview.manualFallback.
 */
export function isManualFallback(candidates: RemediationCandidate[]): boolean {
  return !candidates.some((c) => c.score >= 50);
}

// Target types that can sensibly be SECURED by a policy (for the title-match path;
// an inferred SECURED_BY edge is trusted regardless of type).
const SECURABLE_TYPES: ReadonlySet<string> = new Set([
  "SERVICE",
  "API_SPEC",
  "API_ENDPOINT",
  "DATABASE_MODEL",
  "EXTERNAL_SYSTEM",
]);

// ── title tokenization (deterministic, local — titles aren't payload fields) ──
const STOPWORDS: ReadonlySet<string> = new Set([
  "service", "services", "api", "apis", "policy", "policies", "flow", "flows",
  "system", "systems", "model", "models", "spec", "specs", "module", "modules",
  "component", "components", "documentation", "doc", "docs", "diagram", "diagrams",
  "database", "databases", "the", "a", "an", "of", "and", "for", "to", "test",
]);

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

function singular(token: string): string {
  return token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;
}

function significantTokens(title: string): Set<string> {
  const out = new Set<string>();
  for (const raw of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2) continue;
    const t = singular(raw);
    if (STOPWORDS.has(raw) || STOPWORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

const CONF_RANK: Record<RemediationConfidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const ev = (type: EvidenceType, explanation: string): RemediationEvidence => ({
  type,
  weight: EVIDENCE_WEIGHTS[type],
  explanation,
});

const niceType = (t: string): string => t.toLowerCase().replace(/_/g, " ");

/**
 * Deterministic title-similarity evidence, or null when there is no overlap.
 * TITLE_MATCH (strong): exact title or equal significant-token sets.
 * TOKEN_MATCH (weaker): some shared significant token but the sets differ.
 */
function titleEvidence(
  subjectTitle: string,
  candidateTitle: string,
): { type: "TITLE_MATCH" | "TOKEN_MATCH"; explanation: string } | null {
  const st = significantTokens(subjectTitle);
  const ct = significantTokens(candidateTitle);
  const shared = [...st].filter((t) => ct.has(t));
  if (shared.length === 0) return null;
  const setsEqual = st.size > 0 && st.size === ct.size && shared.length === st.size;
  if (normalizeTitle(subjectTitle) === normalizeTitle(candidateTitle) || setsEqual) {
    return { type: "TITLE_MATCH", explanation: `Title strongly matches “${candidateTitle}”` };
  }
  return { type: "TOKEN_MATCH", explanation: `Shares “${shared.join(", ")}” with “${candidateTitle}”` };
}

/**
 * True when the candidate's full normalized title appears as whole contiguous words
 * inside the subject title (e.g. "Billing Service" ⊂ "Billing Service Architecture").
 * Requires ≥1 significant (non-stopword) token so an all-generic title (e.g.
 * "Service") can't create a false phrase match. Word-boundary containment (via
 * space padding) prevents partial-word matches.
 */
function phraseTitleMatch(subjectTitle: string, candidateTitle: string): boolean {
  if (significantTokens(candidateTitle).size === 0) return false; // only generic words
  const cn = normalizeTitle(candidateTitle);
  if (!cn) return false;
  return ` ${normalizeTitle(subjectTitle)} `.includes(` ${cn} `);
}

/**
 * EXISTING_NEIGHBORHOOD: the candidate already has a relation to some OTHER artifact
 * whose title overlaps the subject's — i.e. it sits in the subject's topical
 * neighbourhood, so linking to it integrates the subject into the real graph.
 */
function neighborhoodEvidence(
  candidateId: string,
  subjectId: string,
  subjectTokens: Set<string>,
  relations: RRelation[],
  tokensById: Map<string, Set<string>>,
): RemediationEvidence | null {
  for (const r of relations) {
    let other: string | null = null;
    if (r.sourceArtifactId === candidateId) other = r.targetArtifactId;
    else if (r.targetArtifactId === candidateId) other = r.sourceArtifactId;
    if (!other || other === subjectId || other === candidateId) continue;
    const ot = tokensById.get(other);
    if (ot && [...subjectTokens].some((t) => ot.has(t))) {
      return ev("EXISTING_NEIGHBORHOOD", "Already connected to related artifacts in this area");
    }
  }
  return null;
}

interface Building {
  a: RArtifact;
  relationType?: string;
  evidence: RemediationEvidence[];
}

function finalize(items: Building[]): RemediationCandidate[] {
  return items
    .map(({ a, relationType, evidence }) => {
      const score = Math.min(100, evidence.reduce((s, e) => s + e.weight, 0));
      return {
        targetId: a.id,
        targetTitle: a.title,
        targetType: a.type,
        ...(relationType ? { relationType } : {}),
        confidence: confidenceFromScore(score),
        score,
        evidence,
      };
    })
    .sort(
      (x, y) =>
        y.score - x.score || // 1. score desc
        CONF_RANK[x.confidence] - CONF_RANK[y.confidence] || // 2. confidence desc (redundant w/ score, explicit)
        (x.targetTitle < y.targetTitle ? -1 : x.targetTitle > y.targetTitle ? 1 : 0) || // 3. title asc
        (x.targetId < y.targetId ? -1 : x.targetId > y.targetId ? 1 : 0), // stable id tiebreak
    );
}

// ── Phase 1: DIAGRAM_UNLINKED (set diagram.artifactId) ──
// Prefers MERMAID_NODE_MATCH: a node label is the authoritative signal that the
// diagram draws an artifact, so the diagram-TITLE hint is only ever TOKEN_MATCH
// (20) — keeping a node match (30) ranked above a title-only match.
export function candidatesForDiagramUnlinked(
  diagram: { title: string },
  nodeLabels: string[],
  artifacts: RArtifact[],
): RemediationCandidate[] {
  const labelSet = new Set(nodeLabels.map(normalizeTitle));
  const items: Building[] = [];
  for (const a of artifacts) {
    if (a.status === "DEPRECATED") continue;
    const evidence: RemediationEvidence[] = [];
    const isNode = labelSet.has(normalizeTitle(a.title));
    if (isNode) evidence.push(ev("MERMAID_NODE_MATCH", "Drawn as a node in this diagram"));
    const te = titleEvidence(diagram.title, a.title);
    if (te) {
      evidence.push(ev("TOKEN_MATCH", te.type === "TITLE_MATCH" ? `Diagram title matches “${a.title}”` : te.explanation));
    }
    // PHRASE_TITLE_MATCH refines ranking AMONG drawn nodes — the candidate's full
    // title appears as whole words in the diagram title. Node-gated on purpose: a
    // title-only candidate must never outrank a candidate actually drawn in the
    // diagram (a title-only phrase would otherwise reach 45 > a node's 30).
    if (isNode && phraseTitleMatch(diagram.title, a.title)) {
      evidence.push(ev("PHRASE_TITLE_MATCH", `“${a.title}” is named in the diagram title`));
    }
    if (evidence.length === 0) continue;
    items.push({ a, evidence }); // no relationType — sets diagram.artifactId
  }
  return finalize(items);
}

// ── Phase 2: SECURITY_POLICY_NOT_LINKED (create SECURES relation) ──
// Prefers API_INTELLIGENCE (an inferred SECURED_BY edge) over pure title matching,
// and only suggests targets with a real signal — never a random securable service.
export function candidatesForSecurityPolicy(
  policy: RArtifact,
  artifacts: RArtifact[],
  relations: RRelation[],
  inferredEdges: RInferredEdge[],
): RemediationCandidate[] {
  const existingSecures = new Set(
    relations
      .filter((r) => r.sourceArtifactId === policy.id && r.relationType === "SECURES")
      .map((r) => r.targetArtifactId),
  );
  const securedBy = new Set(
    inferredEdges.filter((e) => e.kind === "SECURED_BY" && e.target === policy.id).map((e) => e.source),
  );
  const tokensById = new Map(artifacts.map((a) => [a.id, significantTokens(a.title)] as const));
  const subjectTokens = significantTokens(policy.title);

  const items: Building[] = [];
  for (const a of artifacts) {
    if (a.id === policy.id || a.status === "DEPRECATED" || !SECURABLE_TYPES.has(a.type) || existingSecures.has(a.id)) continue;
    const evidence: RemediationEvidence[] = [];
    if (securedBy.has(a.id)) evidence.push(ev("API_INTELLIGENCE", "API Intelligence inferred endpoints governed by this policy"));
    const te = titleEvidence(policy.title, a.title);
    if (te) evidence.push(ev(te.type, te.explanation));
    if (evidence.length === 0) continue; // no real signal → don't randomly secure
    evidence.push(ev("ARTIFACT_TYPE_COMPATIBILITY", `A policy can secure a ${niceType(a.type)}`));
    const neigh = neighborhoodEvidence(a.id, policy.id, subjectTokens, relations, tokensById);
    if (neigh) evidence.push(neigh);
    items.push({ a, relationType: "SECURES", evidence });
  }
  return finalize(items);
}

// ── Phase 3: ORPHAN_ARTIFACT (create a relation, orphan as source) ──
// Default relation type by target type for the title-match path. Kept conservative;
// the human confirms and can use the manual graph path for anything else.
function defaultRelationType(targetType: string): string | null {
  switch (targetType) {
    case "DATABASE_MODEL":
      return "USES";
    case "DOCUMENTATION":
      // A DOCUMENTS edge goes doc(source) → documented-thing(target) everywhere else
      // (documentation-rule, impact analysis, payload-analyzer). The orphan is the
      // SOURCE here, so emitting DOCUMENTS would write a backwards edge that doesn't
      // even satisfy the MISSING_DOCUMENTATION guard. Skip — a doc should be linked
      // from the doc side (or via the manual graph path).
      return null;
    case "SERVICE":
    case "API_SPEC":
    case "EXTERNAL_SYSTEM":
      return "DEPENDS_ON";
    case "SECURITY_POLICY":
      return null; // an orphan shouldn't "secure" a policy — skip
    default:
      return "DEPENDS_ON";
  }
}

export function candidatesForOrphan(
  orphan: RArtifact,
  artifacts: RArtifact[],
  relations: RRelation[],
  inferredEdges: RInferredEdge[],
): RemediationCandidate[] {
  const tokensById = new Map(artifacts.map((a) => [a.id, significantTokens(a.title)] as const));
  const subjectTokens = significantTokens(orphan.title);
  // Inferred TOUCHES edges (orphan as source) → orphan USES the touched model.
  // (SECURED_BY / DOCUMENTED_BY are incoming-direction signals and would flip the
  // edge, so they're intentionally not used for the orphan-as-source model here.)
  const touches = new Set(
    inferredEdges.filter((e) => e.source === orphan.id && e.kind === "TOUCHES").map((e) => e.target),
  );
  const existing = new Set(
    relations.filter((r) => r.sourceArtifactId === orphan.id).map((r) => `${r.targetArtifactId}|${r.relationType}`),
  );

  const items: Building[] = [];
  for (const a of artifacts) {
    if (a.id === orphan.id || a.status === "DEPRECATED") continue;
    const relationType = touches.has(a.id) ? "USES" : defaultRelationType(a.type);
    if (!relationType) continue;
    if (existing.has(`${a.id}|${relationType}`)) continue;
    const evidence: RemediationEvidence[] = [];
    if (touches.has(a.id)) evidence.push(ev("API_INTELLIGENCE", "API Intelligence: a payload references this data model"));
    const te = titleEvidence(orphan.title, a.title);
    if (te) evidence.push(ev(te.type, te.explanation));
    if (evidence.length === 0) continue; // no real signal → manual fallback
    evidence.push(ev("ARTIFACT_TYPE_COMPATIBILITY", `${relationType} → ${niceType(a.type)} is a natural relationship`));
    const neigh = neighborhoodEvidence(a.id, orphan.id, subjectTokens, relations, tokensById);
    if (neigh) evidence.push(neigh);
    items.push({ a, relationType, evidence });
  }
  return finalize(items);
}
