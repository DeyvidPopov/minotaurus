// openapi.engine.ts — deterministic OpenAPI 3.x / Swagger 2.0 JSON parser.
// Pure functions. No I/O, no AI, no YAML. Used by the
// /parse-openapi-json endpoint to build the preview payload that the
// frontend renders before the user confirms an API Spec import.

import { HttpMethod } from "@prisma/client";

export interface ParsedOpenApiEndpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  requiresAuth: boolean;
  requestSchema: string;
  responseSchema: string;
}

export interface OpenApiPreview {
  title: string;
  version: string;
  baseUrl: string;
  description: string;
  endpointCount: number;
  endpoints: ParsedOpenApiEndpoint[];
}

const SUPPORTED_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const OPENAPI_METHOD_KEYS: Record<string, HttpMethod> = {
  get: "GET",
  post: "POST",
  put: "PUT",
  patch: "PATCH",
  delete: "DELETE",
};

export class OpenApiParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenApiParseError";
  }
}

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "JSON parse error";
    throw new OpenApiParseError(`Invalid JSON: ${message}`);
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringifyOrEmpty(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function extractBaseUrl(doc: Record<string, unknown>): string {
  // OpenAPI 3.x: servers[0].url
  const servers = asArray(doc.servers);
  for (const s of servers) {
    const obj = asObject(s);
    const url = asString(obj?.url);
    if (url) return url;
  }
  // Swagger 2.0 best-effort: host + basePath, with scheme if available.
  const host = asString(doc.host);
  const basePath = asString(doc.basePath);
  if (host || basePath) {
    const schemes = asArray(doc.schemes).filter((s): s is string => typeof s === "string");
    const scheme = schemes[0] || "https";
    if (host) return `${scheme}://${host}${basePath || ""}`;
    return basePath || "";
  }
  return "";
}

function hasRootSecurity(doc: Record<string, unknown>): boolean {
  const sec = asArray(doc.security);
  return sec.length > 0;
}

export function parseOpenApi(jsonString: string): OpenApiPreview {
  const trimmed = jsonString.trim();
  if (!trimmed) {
    throw new OpenApiParseError("Empty OpenAPI document");
  }
  const doc = asObject(safeJsonParse(trimmed));
  if (!doc) {
    throw new OpenApiParseError("OpenAPI document must be a JSON object");
  }

  const versionTag = asString(doc.openapi) || asString(doc.swagger);
  if (!versionTag) {
    throw new OpenApiParseError("Missing 'openapi' or 'swagger' version field");
  }

  const paths = asObject(doc.paths);
  if (!paths) {
    throw new OpenApiParseError("Document is missing a 'paths' object");
  }

  const info = asObject(doc.info) ?? {};
  const title = asString(info.title) || "Untitled API";
  const apiVersion = asString(info.version) || "1.0.0";
  const description = asString(info.description);
  const baseUrl = extractBaseUrl(doc);
  const rootSecurity = hasRootSecurity(doc);

  const endpoints: ParsedOpenApiEndpoint[] = [];
  for (const [rawPath, pathItemUnknown] of Object.entries(paths)) {
    const pathItem = asObject(pathItemUnknown);
    if (!pathItem) continue;
    const path = typeof rawPath === "string" ? rawPath : String(rawPath);
    for (const [methodKey, operationUnknown] of Object.entries(pathItem)) {
      const method = OPENAPI_METHOD_KEYS[methodKey.toLowerCase()];
      if (!method || !SUPPORTED_METHODS.includes(method)) continue;
      const operation = asObject(operationUnknown);
      if (!operation) continue;

      const operationSecurity = asArray(operation.security);
      const requiresAuth = operationSecurity.length > 0 || (rootSecurity && !operation.security);

      const summary = asString(operation.summary);
      const opDescription = asString(operation.description);

      endpoints.push({
        method,
        path,
        summary,
        description: opDescription,
        requiresAuth,
        requestSchema: stringifyOrEmpty(operation.requestBody),
        responseSchema: stringifyOrEmpty(operation.responses),
      });
    }
  }

  return {
    title,
    version: apiVersion,
    baseUrl,
    description,
    endpointCount: endpoints.length,
    endpoints,
  };
}
