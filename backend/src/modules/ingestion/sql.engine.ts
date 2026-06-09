// sql.engine.ts — deterministic, deliberately small SQL DDL parser.
// Supports CREATE TABLE blocks with simple column definitions, PRIMARY KEY,
// NOT NULL, UNIQUE and FOREIGN KEY (...) REFERENCES table(column). No views,
// triggers, stored procedures, migrations, or vendor-specific extensions
// beyond best-effort handling of common type suffixes.

import { DatabaseType } from "@prisma/client";

export interface ParsedSqlField {
  name: string;
  type: string;
  required: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesEntity?: string;
  referencesField?: string;
  description: string;
}

export interface ParsedSqlEntity {
  name: string;
  description: string;
  fields: ParsedSqlField[];
}

export interface ParsedSqlRelationship {
  fromEntity: string;
  fromField: string;
  toEntity: string;
  toField: string;
}

export interface SqlSchemaPreview {
  source: "SQL_SCHEMA";
  title: string;
  databaseType: DatabaseType;
  entityCount: number;
  fieldCount: number;
  entities: ParsedSqlEntity[];
  relationships: ParsedSqlRelationship[];
}

export class SqlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlParseError";
  }
}

const CREATE_TABLE_HEAD_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"([^"]+)"|`([^`]+)`|(\[[^\]]+\])|([A-Za-z_][\w$]*\s*(?:\.\s*[A-Za-z_][\w$]*)?))\s*\(/gi;

/** Returns the index after the matching close paren for the open paren at `start`. */
function findMatchingParen(src: string, start: number): number {
  let depth = 1;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inSingle) {
      if (ch === "'" && src[i - 1] !== "\\") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && src[i - 1] !== "\\") inDouble = false;
      continue;
    }
    if (inBacktick) {
      if (ch === "`") inBacktick = false;
      continue;
    }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (ch === "`") { inBacktick = true; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stripIdentifier(raw: string): string {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("`") && s.endsWith("`"))) {
    s = s.slice(1, -1);
  }
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  // Drop optional schema prefix: schema.table → table
  const dot = s.lastIndexOf(".");
  if (dot >= 0) s = s.slice(dot + 1);
  return s.trim();
}

function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function stripLineComments(src: string): string {
  return src
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, "").replace(/#.*$/, ""))
    // The hash comment is only valid in MySQL; we strip it anyway for
    // best-effort parsing. PostgreSQL identifiers using # would have to be
    // quoted, which our identifier patterns already handle.
    .join("\n");
}

interface SplitToken {
  text: string;
}

function splitColumnsBody(body: string): SplitToken[] {
  // Split on commas at parenthesis-depth 0, ignoring string literals.
  const tokens: SplitToken[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inSingle) {
      if (ch === "'" && body[i - 1] !== "\\") inSingle = false;
      buf += ch;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && body[i - 1] !== "\\") inDouble = false;
      buf += ch;
      continue;
    }
    if (inBacktick) {
      if (ch === "`") inBacktick = false;
      buf += ch;
      continue;
    }
    if (ch === "'") { inSingle = true; buf += ch; continue; }
    if (ch === '"') { inDouble = true; buf += ch; continue; }
    if (ch === "`") { inBacktick = true; buf += ch; continue; }
    if (ch === "(") { depth++; buf += ch; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); buf += ch; continue; }
    if (ch === "," && depth === 0) {
      const s = buf.trim();
      if (s) tokens.push({ text: s });
      buf = "";
      continue;
    }
    buf += ch;
  }
  const tail = buf.trim();
  if (tail) tokens.push({ text: tail });
  return tokens;
}

const TABLE_CONSTRAINT_KEYWORDS = /^(?:constraint\s+\S+\s+)?(primary\s+key|foreign\s+key|unique|check)\b/i;
const TABLE_LEVEL_PK_RE = /primary\s+key\s*\(([^)]+)\)/i;
const TABLE_LEVEL_UNIQUE_RE = /unique(?:\s+key)?\s*(?:\w+\s+)?\(([^)]+)\)/i;
const TABLE_LEVEL_FK_RE =
  /foreign\s+key\s*\(([^)]+)\)\s*references\s+(?:"([^"]+)"|`([^`]+)`|(\[[^\]]+\])|([\w.]+))\s*\(([^)]+)\)/i;

function splitColumnList(list: string): string[] {
  return list
    .split(",")
    .map((s) => stripIdentifier(s.trim()).trim())
    .filter(Boolean);
}

function parseColumn(token: string): ParsedSqlField | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Skip pure table-level constraints; those are handled by the caller.
  if (TABLE_CONSTRAINT_KEYWORDS.test(trimmed)) return null;

  // Identifier may be quoted/bracketed/backticked.
  const idMatch = /^("[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s+(.+)$/s.exec(trimmed);
  if (!idMatch) return null;
  const name = stripIdentifier(idMatch[1]);
  const rest = idMatch[2].trim();
  // Type token is everything up to the first whitespace OR up to the matching
  // closing paren for parameterised types like varchar(255).
  let type = "";
  let i = 0;
  for (; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === "(") {
      // include up to the matching close paren
      let depth = 1;
      type += ch;
      i++;
      while (i < rest.length && depth > 0) {
        if (rest[i] === "(") depth++;
        else if (rest[i] === ")") depth--;
        type += rest[i];
        i++;
      }
      // Continue past whitespace; suffix tokens like UNSIGNED handled below.
      break;
    }
    if (/\s/.test(ch)) break;
    type += ch;
  }
  const suffix = rest.slice(i).trim();
  const upperSuffix = " " + suffix.replace(/\s+/g, " ").toUpperCase() + " ";

  const inline = suffix;
  const required = / NOT NULL /.test(upperSuffix);
  const isPrimaryKey = / PRIMARY KEY /.test(upperSuffix);
  const isInlineUnique = / UNIQUE /.test(upperSuffix) && !isPrimaryKey;

  let referencesEntity: string | undefined;
  let referencesField: string | undefined;
  const refMatch = /references\s+(?:"([^"]+)"|`([^`]+)`|(\[[^\]]+\])|([\w.]+))\s*\(([^)]+)\)/i.exec(inline);
  if (refMatch) {
    referencesEntity = stripIdentifier(refMatch[1] || refMatch[2] || refMatch[3] || refMatch[4] || "");
    referencesField = stripIdentifier(refMatch[5] || "");
  }

  const isForeignKey = !!referencesEntity;
  const description = isInlineUnique ? "UNIQUE" : "";
  return {
    name,
    type: type.toLowerCase(),
    required,
    isPrimaryKey,
    isForeignKey,
    referencesEntity,
    referencesField,
    description,
  };
}

export function parseSqlSchema(rawSql: string): SqlSchemaPreview {
  const trimmed = rawSql?.trim();
  if (!trimmed) throw new SqlParseError("Empty SQL input");

  const cleaned = stripLineComments(stripBlockComments(trimmed));

  const entitiesByName = new Map<string, ParsedSqlEntity>();
  const entityOrder: string[] = [];
  const relationships: ParsedSqlRelationship[] = [];

  let any = false;
  CREATE_TABLE_HEAD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CREATE_TABLE_HEAD_RE.exec(cleaned)) !== null) {
    const rawName = m[1] || m[2] || m[3] || m[4] || "";
    const tableName = stripIdentifier(rawName);
    if (!tableName) continue;
    const openParenIdx = m.index + m[0].length - 1; // index of "(" in source
    const closeIdx = findMatchingParen(cleaned, openParenIdx + 1);
    if (closeIdx === -1) continue;
    const body = cleaned.slice(openParenIdx + 1, closeIdx);
    // Advance past the table body so the next iteration doesn't re-match
    // inside it.
    CREATE_TABLE_HEAD_RE.lastIndex = closeIdx + 1;
    any = true;
    const tokens = splitColumnsBody(body);
    const fields: ParsedSqlField[] = [];
    const pkColumns: string[] = [];
    const uniqueColumns: string[] = [];
    const tableFks: { columns: string[]; refEntity: string; refColumns: string[] }[] = [];

    for (const tok of tokens) {
      if (TABLE_CONSTRAINT_KEYWORDS.test(tok.text)) {
        const pk = TABLE_LEVEL_PK_RE.exec(tok.text);
        if (pk) {
          for (const c of splitColumnList(pk[1])) pkColumns.push(c);
          continue;
        }
        const uniq = TABLE_LEVEL_UNIQUE_RE.exec(tok.text);
        if (uniq) {
          for (const c of splitColumnList(uniq[1])) uniqueColumns.push(c);
          continue;
        }
        const fk = TABLE_LEVEL_FK_RE.exec(tok.text);
        if (fk) {
          tableFks.push({
            columns: splitColumnList(fk[1]),
            refEntity: stripIdentifier(fk[2] || fk[3] || fk[4] || fk[5] || ""),
            refColumns: splitColumnList(fk[6]),
          });
          continue;
        }
        // Other table-level constraints (CHECK, EXCLUDE, etc.) — ignore.
        continue;
      }
      const col = parseColumn(tok.text);
      // Column names are unique within a table (DB @@unique([entityId, name])). If
      // the pasted DDL repeats a column, keep the first and skip the duplicate so
      // the ingestion-confirm create loop can't trip the constraint.
      if (col && !fields.some((f) => f.name === col.name)) fields.push(col);
    }

    // Apply table-level primary keys.
    for (const c of pkColumns) {
      const f = fields.find((f) => f.name === c);
      if (f) {
        f.isPrimaryKey = true;
        f.required = true;
      }
    }
    // Apply table-level uniques (annotate description, do not duplicate PK).
    for (const c of uniqueColumns) {
      const f = fields.find((f) => f.name === c);
      if (f && !f.isPrimaryKey) {
        f.description = f.description ? `${f.description}, UNIQUE` : "UNIQUE";
      }
    }
    // Apply table-level foreign keys.
    for (const fk of tableFks) {
      fk.columns.forEach((col, idx) => {
        const f = fields.find((f) => f.name === col);
        if (f) {
          f.isForeignKey = true;
          f.referencesEntity = fk.refEntity;
          f.referencesField = fk.refColumns[idx] || fk.refColumns[0] || "";
        }
      });
    }

    const existing = entitiesByName.get(tableName);
    if (existing) {
      // Same table declared twice — keep the first one and skip.
      continue;
    }
    entitiesByName.set(tableName, {
      name: tableName,
      description: "",
      fields,
    });
    entityOrder.push(tableName);
  }

  if (!any) {
    throw new SqlParseError("No CREATE TABLE statements found in the SQL input");
  }

  const entities = entityOrder.map((n) => entitiesByName.get(n)!).filter(Boolean);

  for (const e of entities) {
    for (const f of e.fields) {
      if (f.isForeignKey && f.referencesEntity) {
        relationships.push({
          fromEntity: e.name,
          fromField: f.name,
          toEntity: f.referencesEntity,
          toField: f.referencesField || "",
        });
      }
    }
  }

  const fieldCount = entities.reduce((acc, e) => acc + e.fields.length, 0);

  return {
    source: "SQL_SCHEMA",
    title: "Imported Database Schema",
    databaseType: "PostgreSQL",
    entityCount: entities.length,
    fieldCount,
    entities,
    relationships,
  };
}
