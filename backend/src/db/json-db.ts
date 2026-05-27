import fs from "node:fs";
import path from "node:path";

export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "ENGINEER" | "ARCHITECT";
  createdAt: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

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
  | "COMMUNICATES_WITH";

export interface ArtifactRow {
  id: string;
  projectId: string;
  title: string;
  type: ArtifactType;
  status: ArtifactStatus;
  description: string;
  tags: string[];
  gx: number;
  gy: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  documentationContent?: string;
}

export interface RelationRow {
  id: string;
  sourceArtifactId: string;
  targetArtifactId: string;
  relationType: RelationType;
  description: string;
  createdBy: string;
  createdAt: string;
}

export interface ValidationIssueRow {
  id: string;
  projectId: string;
  artifactId: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  category:
    | "DOCUMENTATION"
    | "API"
    | "DATABASE"
    | "SECURITY"
    | "ARCHITECTURE"
    | "RELATIONSHIP"
    | "VERSIONING"
    | "DIAGRAM";
  message: string;
  status: "OPEN" | "RESOLVED" | "IGNORED";
  createdAt: string;
  updatedAt: string;
}

export interface ExportPackageRow {
  id: string;
  projectId: string;
  format: "JSON" | "MARKDOWN" | "PDF" | "ZIP";
  sections: string[];
  content: unknown;
  createdBy: string;
  createdAt: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiSpecRow {
  id: string;
  projectId: string;
  artifactId: string | null;
  title: string;
  version: string;
  baseUrl: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEndpointRow {
  id: string;
  apiSpecId: string;
  path: string;
  method: HttpMethod;
  summary: string;
  requestSchema: string;
  responseSchema: string;
  requiresAuth: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DatabaseType =
  | "PostgreSQL"
  | "MySQL"
  | "MongoDB"
  | "Redis"
  | "SQLite";

export interface DatabaseModelRow {
  id: string;
  projectId: string;
  artifactId: string | null;
  title: string;
  databaseType: DatabaseType;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseEntityRow {
  id: string;
  databaseModelId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseFieldRow {
  id: string;
  entityId: string;
  name: string;
  type: string;
  required: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesEntityId: string | null;
  description: string;
}

export type DiagramType =
  | "FLOWCHART"
  | "SEQUENCE"
  | "ERD"
  | "CLASS"
  | "STATE"
  | "GANTT"
  | "ARCHITECTURE";

export interface DiagramRow {
  id: string;
  projectId: string;
  artifactId: string | null;
  title: string;
  type: DiagramType;
  mermaidSource: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DbShape {
  users: UserRow[];
  projects: ProjectRow[];
  artifacts: ArtifactRow[];
  relations: RelationRow[];
  validationIssues: ValidationIssueRow[];
  exports: ExportPackageRow[];
  apiSpecs: ApiSpecRow[];
  apiEndpoints: ApiEndpointRow[];
  databaseModels: DatabaseModelRow[];
  databaseEntities: DatabaseEntityRow[];
  databaseFields: DatabaseFieldRow[];
  diagrams: DiagramRow[];
}

const empty: DbShape = {
  users: [],
  projects: [],
  artifacts: [],
  relations: [],
  validationIssues: [],
  exports: [],
  apiSpecs: [],
  apiEndpoints: [],
  databaseModels: [],
  databaseEntities: [],
  databaseFields: [],
  diagrams: [],
};

const DATA_FILE =
  process.env.DATA_FILE ||
  path.join(process.cwd(), "src", "db", "data.json");

let cache: DbShape | null = null;

function readDisk(): DbShape {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(empty);
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    if (!raw.trim()) return structuredClone(empty);
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    return { ...structuredClone(empty), ...parsed };
  } catch {
    return structuredClone(empty);
  }
}

function writeDisk(data: DbShape) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function db(): DbShape {
  if (!cache) cache = readDisk();
  return cache;
}

export function persist() {
  if (cache) writeDisk(cache);
}

export function resetDbForTests(seed: Partial<DbShape> = {}) {
  cache = { ...structuredClone(empty), ...seed };
  persist();
}
