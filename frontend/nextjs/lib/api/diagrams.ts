// lib/api/diagrams.ts — typed diagram wrappers
import { apiClient } from "./client";

export type DiagramType =
  | "FLOWCHART"
  | "SEQUENCE"
  | "ERD"
  | "CLASS"
  | "STATE"
  | "GANTT"
  | "ARCHITECTURE";

export const DIAGRAM_TYPES: DiagramType[] = [
  "FLOWCHART",
  "SEQUENCE",
  "ERD",
  "CLASS",
  "STATE",
  "GANTT",
  "ARCHITECTURE",
];

export interface Diagram {
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

export const diagramsApi = {
  list: (
    projectId: string,
    params?: { search?: string; artifactId?: string; type?: DiagramType },
  ) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.artifactId) qs.set("artifactId", params.artifactId);
    if (params?.type) qs.set("type", params.type);
    const tail = qs.toString();
    return apiClient.get<Diagram[]>(
      `/projects/${projectId}/diagrams${tail ? `?${tail}` : ""}`,
    );
  },
  create: (
    projectId: string,
    body: Partial<Pick<Diagram, "title" | "type" | "mermaidSource" | "description" | "artifactId">>,
  ) => apiClient.post<Diagram>(`/projects/${projectId}/diagrams`, body),
  get: (id: string) => apiClient.get<Diagram>(`/diagrams/${id}`),
  update: (
    id: string,
    body: Partial<Pick<Diagram, "title" | "type" | "mermaidSource" | "description" | "artifactId">>,
  ) => apiClient.patch<Diagram>(`/diagrams/${id}`, body),
  remove: (id: string) => apiClient.delete<void>(`/diagrams/${id}`),
};

export const MERMAID_TEMPLATES: Record<DiagramType, string> = {
  FLOWCHART: `flowchart TD
  A[Frontend] --> B[Backend]
  B --> C[(Database)]`,
  SEQUENCE: `sequenceDiagram
  Frontend->>Backend: Login
  Backend->>Database: Validate user
  Database-->>Backend: OK
  Backend-->>Frontend: Token`,
  ERD: `erDiagram
  USER ||--o{ SESSION : owns
  USER {
    uuid id PK
    string email
  }
  SESSION {
    uuid id PK
    uuid user_id FK
  }`,
  CLASS: `classDiagram
  class User {
    +String id
    +String email
    +login()
  }
  class Session {
    +String id
    +Date expiresAt
  }
  User "1" --> "*" Session : owns`,
  STATE: `stateDiagram-v2
  [*] --> Pending
  Pending --> Active : approve
  Pending --> Rejected : deny
  Active --> Closed : finish
  Closed --> [*]`,
  GANTT: `gantt
  title Project plan
  dateFormat  YYYY-MM-DD
  section Backend
  Auth service       :done,    a1, 2026-01-01, 14d
  Order service      :active,  a2, after a1, 21d
  section Frontend
  Wire-frames        :         f1, 2026-01-05, 10d`,
  ARCHITECTURE: `flowchart LR
  Client --> API
  API --> Services
  Services --> Database`,
};
