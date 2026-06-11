// lib/mock-data.ts — design-token tables (artifact type labels/colors and
// relation edge colors) shared by the graph, legend, and type chips.

import type { Artifact, Relation } from "./types";

export const TYPE_INFO: Record<Artifact["type"], { label: string; color: string }> = {
  SERVICE:          { label: "Service",         color: "#3b82f6" },
  API_SPEC:         { label: "API Spec",        color: "#8b5cf6" },
  API_ENDPOINT:     { label: "Endpoint",        color: "#a78bfa" },
  DATABASE_MODEL:   { label: "Database",        color: "#10b981" },
  DATABASE_ENTITY:  { label: "Entity",          color: "#34d399" },
  DOCUMENTATION:    { label: "Documentation",   color: "#f59e0b" },
  DIAGRAM:          { label: "Diagram",         color: "#ec4899" },
  REQUIREMENT:      { label: "Requirement",     color: "#06b6d4" },
  SECURITY_POLICY:  { label: "Security Policy", color: "#ef4444" },
  ENVIRONMENT:      { label: "Environment",     color: "#64748b" },
  EXTERNAL_SYSTEM:  { label: "External",        color: "#94a3b8" },
};

export const RELATION_TYPES: Relation["type"][] = [
  "DEPENDS_ON","DOCUMENTS","IMPLEMENTS","USES","EXPOSES","BELONGS_TO","SECURES","VALIDATES","GENERATES","DEPLOYED_TO","COMMUNICATES_WITH",
];

export const ARTIFACT_TYPES: Artifact["type"][] = Object.keys(TYPE_INFO) as Artifact["type"][];

export const EDGE_COLOR: Record<Relation["type"], string> = {
  DEPENDS_ON: "#3b82f6", COMMUNICATES_WITH: "#06b6d4", USES: "#10b981",
  EXPOSES: "#8b5cf6", BELONGS_TO: "#a78bfa", DOCUMENTS: "#f59e0b",
  SECURES: "#ef4444", VALIDATES: "#ec4899", DEPLOYED_TO: "#64748b",
  GENERATES: "#22c55e", IMPLEMENTS: "#0ea5e9",
};
