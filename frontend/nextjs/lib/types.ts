// lib/types.ts — shared DTO types (mirror the API contract)

export type ArtifactType =
  | "DOCUMENTATION"
  | "API_SPEC"
  | "API_ENDPOINT"
  | "SERVICE"
  | "DATABASE_MODEL"
  | "DATABASE_ENTITY"
  | "DIAGRAM"
  | "REQUIREMENT"
  | "SECURITY_POLICY"
  | "ENVIRONMENT"
  | "EXTERNAL_SYSTEM";

export type ArtifactStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";

export type RelationType =
  | "DEPENDS_ON"
  | "DOCUMENTS"
  | "IMPLEMENTS"
  | "USES"
  | "EXPOSES"
  | "BELONGS_TO"
  | "SECURES"
  | "VALIDATES"
  | "GENERATES"
  | "DEPLOYED_TO"
  | "COMMUNICATES_WITH";

export type Severity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type IssueStatus = "OPEN" | "RESOLVED" | "IGNORED";

export type Category =
  | "DOCUMENTATION"
  | "API"
  | "DATABASE"
  | "SECURITY"
  | "ARCHITECTURE"
  | "RELATIONSHIP"
  | "VERSIONING"
  | "DIAGRAM";

export type EntityType =
  | "ARTIFACT"
  | "RELATION"
  | "DOCUMENTATION"
  | "DIAGRAM"
  | "API_SPEC"
  | "EXPORT";

export type ChangeType =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "LINKED"
  | "UNLINKED"
  | "VALIDATED"
  | "EXPORTED";

export type DiagramType =
  | "MERMAID"
  | "UML"
  | "ERD"
  | "ARCHITECTURE_FLOW"
  | "SEQUENCE"
  | "COMPONENT";

export type ExportFormat = "JSON" | "MARKDOWN" | "PDF";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "ADMIN" | "ENGINEER" | "ARCHITECT";
  initials: string;
  defaultProjectId: string | null;
  /** True while a soft-deletion is pending its grace-window purge (drives the reactivation banner). */
  deletionPending?: boolean;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  artifactCount: number;
  validationIssueCount: number;
  members: number;
  updatedAt: string;
  starred: boolean;
  color: string;
}

export interface Artifact {
  id: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  description: string;
  tags: string[];
  /** Hand-laid coordinates for the graph view (saved server-side or per-user) */
  gx: number;
  gy: number;
  createdAt: string;
  updatedAt: string;
  author: User;
  relationCount?: number;
  validationIssueCount?: number;
  /** Markdown documentation body ("" when undocumented) — returned by the serializer. */
  documentationContent?: string;
  // optional type-specific:
  method?: string;
  diagramType?: DiagramType;
}

export interface Relation {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  description?: string;
}

// Actionable metadata derived deterministically by the backend presenter
// (validation.presenter.ts). Optional because only the list endpoint enriches.
export type IssueTargetKind = "TEAM" | "ARTIFACT" | "API_SPEC" | "DATABASE_MODEL" | "DIAGRAM";

export interface IssueTarget {
  kind: IssueTargetKind;
  id: string | null;
  title: string | null;
  tab?: string;
  endpoint?: { method: string; path: string };
}

// Quick Fix Action framework. A finding may expose actions. NAVIGATE reuses the
// finding's existing link; an AVAILABLE action with a `fixId` is backed by a
// deterministic quick fix (preview + apply); a PLANNED action is a placeholder
// the UI surfaces as "Not implemented yet". Mirrors backend findings/finding-actions.ts.
export type FindingActionKind = "NAVIGATE" | "GENERATE" | "CREATE_RELATION" | "CREATE_CONTENT";
export type FindingActionStatus = "AVAILABLE" | "PLANNED" | "DISABLED";
export type QuickFixId = "GENERATE_DOCUMENTATION_TEMPLATE" | "GENERATE_STARTER_DIAGRAM";

export interface FindingAction {
  id: string;
  label: string;
  kind: FindingActionKind;
  status: FindingActionStatus;
  /** When true the fix is review-required (candidate picker), not a one-click apply. */
  requiresReview?: boolean;
  /** Backing fix id — a QuickFixId (safe) or a relation-remediation id (review). */
  fixId?: string;
}

// Review-required relation remediation (GET .../remediation/preview). Mirrors
// backend findings/relation-remediation.ts. Deterministic candidates only.
export type RemediationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type EvidenceType =
  | "TITLE_MATCH"
  | "TOKEN_MATCH"
  | "PHRASE_TITLE_MATCH"
  | "MERMAID_NODE_MATCH"
  | "API_INTELLIGENCE"
  | "EXISTING_NEIGHBORHOOD"
  | "ARTIFACT_TYPE_COMPATIBILITY";

export interface RemediationEvidence {
  type: EvidenceType;
  weight: number;
  explanation: string;
}

export interface RemediationCandidate {
  targetId: string;
  targetTitle: string;
  targetType: string;
  relationType?: string;
  confidence: RemediationConfidence;
  /** 0–100. */
  score: number;
  evidence: RemediationEvidence[];
}

export interface RemediationPreview {
  remediationId: string;
  findingCode: string;
  mechanic: "SET_DIAGRAM_ARTIFACT" | "CREATE_RELATION";
  title: string;
  relationType?: string;
  candidates: RemediationCandidate[];
  manualFallback: boolean;
}

export interface RemediationApplyResult {
  remediationId: string;
  applied: { targetId: string; targetTitle: string; relationType: string | null };
  issues: ValidationIssue[];
}

// Deterministic quick-fix preview (GET .../quick-fix/preview). Mirrors backend
// findings/quick-fix.ts. `content` is the exact text Apply will write.
export interface QuickFixPreview {
  fixId: QuickFixId;
  code: string;
  targetKind: "ARTIFACT" | "DIAGRAM";
  title: string;
  description: string;
  contentKind: "markdown" | "mermaid";
  content: string;
  target: { kind: "ARTIFACT" | "DIAGRAM"; id: string; title: string };
  /** Whether the fix currently applies (resource still empty / eligible). */
  applicable: boolean;
  reason: string | null;
}

// Result of POST .../quick-fix/apply — the refreshed, enriched issue set.
export interface QuickFixApplyResult {
  fixId: QuickFixId;
  target: { kind: "ARTIFACT" | "DIAGRAM"; id: string; title: string };
  issues: ValidationIssue[];
}

export interface IssueMeta {
  ruleId: string;
  code: string | null;
  cleanMessage: string;
  why: string;
  suggestedFix: string;
  deterministic: boolean;
  target: IssueTarget | null;
  actions: FindingAction[];
}

export interface ValidationIssue {
  id: string;
  severity: Severity;
  category: Category;
  message: string;
  /** What the finding is about: artifact / api-spec / db-model / diagram / project. */
  subjectType: "ARTIFACT" | "API_SPEC" | "DATABASE_MODEL" | "DIAGRAM" | "PROJECT";
  /** Polymorphic subject id — drives the display lookup; navigation uses `meta.target`. */
  subjectId: string;
  /** Real Artifact FK — non-null only for ARTIFACT-subject findings. */
  artifactId: string | null;
  status: IssueStatus;
  createdAt: string;
  meta?: IssueMeta;
}

export interface VersionEntry {
  id: string;
  entityType: EntityType;
  entityId: string;
  changeType: ChangeType;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  changedBy: User;
  createdAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}
