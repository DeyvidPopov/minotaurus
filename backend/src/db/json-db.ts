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
    | "VERSIONING";
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

export interface DbShape {
  users: UserRow[];
  projects: ProjectRow[];
  artifacts: ArtifactRow[];
  relations: RelationRow[];
  validationIssues: ValidationIssueRow[];
  exports: ExportPackageRow[];
}

const empty: DbShape = {
  users: [],
  projects: [],
  artifacts: [],
  relations: [],
  validationIssues: [],
  exports: [],
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
