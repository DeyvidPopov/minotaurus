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

export interface IssueMeta {
  ruleId: string;
  code: string | null;
  cleanMessage: string;
  why: string;
  suggestedFix: string;
  deterministic: boolean;
  target: IssueTarget | null;
}

export interface ValidationIssue {
  id: string;
  severity: Severity;
  category: Category;
  message: string;
  artifactId: string;
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
