// lib/api/diagrams.ts — typed diagram wrappers + Minotaurus-aware templates
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

// One-line explanation of when each diagram type is useful — shown in the
// new-diagram flow and the type filter.
export const DIAGRAM_TYPE_BLURBS: Record<DiagramType, string> = {
  ARCHITECTURE: "System components and their dependencies. The high-level shape.",
  FLOWCHART: "Top-down boxes and arrows. Best for request flows and decision trees.",
  SEQUENCE: "Time-ordered interactions between actors / services.",
  ERD: "Database entities and the relationships between them.",
  CLASS: "OOP classes with attributes, methods and relations.",
  STATE: "Lifecycle / status transitions for a single entity.",
  GANTT: "Time-based project plan with tasks, sections and dependencies.",
};

// Purpose-driven templates. Each one maps to a diagram type and seeds the
// editor with a Mermaid source that uses real Minotaurus artifacts/services
// so users start from something concrete rather than `flowchart A --> B`.
export interface DiagramPurpose {
  id: string;
  label: string;
  description: string;
  diagramType: DiagramType;
  mermaidSource: string;
}

export const DIAGRAM_PURPOSES: DiagramPurpose[] = [
  {
    id: "architecture-overview",
    label: "Architecture overview",
    description: "Show the major services and databases of the platform and how they connect.",
    diagramType: "ARCHITECTURE",
    mermaidSource: `flowchart LR
  Client["Client browser"] --> Gateway["API Gateway"]
  Gateway --> Auth["Authentication Service"]
  Gateway --> Catalog["Product Catalog API"]
  Gateway --> Order["Order Service"]
  Order --> Payment["Payment Service"]
  Auth --> UserDB[("User Database")]
  Catalog --> ProductDB[("Product Database")]`,
  },
  {
    id: "request-flow",
    label: "Request flow",
    description: "Trace a single HTTP request through the gateway, services, and data stores.",
    diagramType: "FLOWCHART",
    mermaidSource: `flowchart TD
  Browser["Client browser"] --> Gateway["API Gateway"]
  Gateway --> Validate{"Token valid?"}
  Validate -- yes --> Service["Authentication Service"]
  Validate -- no --> Reject["401 Unauthorized"]
  Service --> Lookup["User Database"]
  Lookup --> Respond["Token returned"]`,
  },
  {
    id: "login-sequence",
    label: "Login sequence",
    description: "Show the time-ordered handshake during a sign-in.",
    diagramType: "SEQUENCE",
    mermaidSource: `sequenceDiagram
  participant User as User
  participant Frontend as Frontend
  participant Gateway as API Gateway
  participant Auth as Authentication Service
  participant DB as User Database
  User->>Frontend: Enter credentials
  Frontend->>Gateway: POST /auth/login
  Gateway->>Auth: Forward credentials
  Auth->>DB: Lookup user
  DB-->>Auth: User + password hash
  Auth-->>Gateway: Access token
  Gateway-->>Frontend: 200 OK + token
  Frontend-->>User: Logged in`,
  },
  {
    id: "checkout-sequence",
    label: "Checkout sequence",
    description: "Show how cart submission flows through orders + payments.",
    diagramType: "SEQUENCE",
    mermaidSource: `sequenceDiagram
  participant Customer as Customer
  participant Frontend as Frontend
  participant Order as Order Service
  participant Catalog as Product Catalog API
  participant Payment as Payment Service
  Customer->>Frontend: Submit cart
  Frontend->>Order: Create order
  Order->>Catalog: Validate products + prices
  Catalog-->>Order: OK
  Order->>Payment: Authorize payment
  Payment-->>Order: Auth token
  Order-->>Frontend: Order confirmed
  Frontend-->>Customer: Receipt`,
  },
  {
    id: "database-erd",
    label: "Database ERD",
    description: "Sketch user-management tables and their relationships.",
    diagramType: "ERD",
    mermaidSource: `erDiagram
  USERS {
    uuid id PK
    string email
    string password_hash
    timestamp created_at
  }
  SESSIONS {
    uuid id PK
    uuid user_id FK
    timestamp expires_at
    timestamp revoked_at
  }
  ROLES {
    uuid id PK
    string name
  }
  USERS ||--o{ SESSIONS : owns
  USERS }o--o{ ROLES : has`,
  },
  {
    id: "domain-model",
    label: "Domain model",
    description: "OOP-style class diagram for the core entities you're modelling.",
    diagramType: "CLASS",
    mermaidSource: `classDiagram
  class Project {
    +string id
    +string name
    +Member[] members
  }
  class Artifact {
    +string id
    +string title
    +ArtifactType type
    +Relation[] relations
  }
  class Relation {
    +string id
    +RelationType type
    +Artifact source
    +Artifact target
  }
  Project "1" --> "*" Artifact : owns
  Artifact "1" --> "*" Relation : source
  Artifact "1" --> "*" Relation : target`,
  },
  {
    id: "validation-lifecycle",
    label: "Validation lifecycle",
    description: "State transitions for a validation issue from open to resolved.",
    diagramType: "STATE",
    mermaidSource: `stateDiagram-v2
  [*] --> OPEN
  OPEN --> RESOLVED : Mark resolved
  OPEN --> IGNORED : Dismiss
  RESOLVED --> REOPENED : New evidence
  IGNORED --> REOPENED : Re-evaluate
  REOPENED --> RESOLVED : Fixed again
  REOPENED --> IGNORED : Dismiss again
  RESOLVED --> [*]
  IGNORED --> [*]`,
  },
  {
    id: "impact-analysis",
    label: "Impact analysis flow",
    description: "Show how a change in one artifact ripples through linked resources.",
    diagramType: "FLOWCHART",
    mermaidSource: `flowchart TD
  Changed["Changed artifact"] --> Deps["Direct dependencies"]
  Changed --> Dependents["Dependent artifacts"]
  Changed --> Apis["Linked APIs"]
  Changed --> Models["Linked DB models"]
  Changed --> Diags["Linked diagrams"]
  Deps --> Review["Review for breakage"]
  Dependents --> Review
  Apis --> Review
  Models --> Review
  Diags --> Review`,
  },
  {
    id: "roadmap-gantt",
    label: "Roadmap (Gantt)",
    description: "Plot phases / milestones on a calendar.",
    diagramType: "GANTT",
    mermaidSource: `gantt
  title Minotaurus roadmap
  dateFormat  YYYY-MM-DD
  section Platform
  Phase 6 PostgreSQL       :done,    p6, 2026-05-01, 14d
  Phase 7 Team + roles     :done,    p7, after p6, 7d
  section Ingestion
  Markdown / OpenAPI       :done,    i1, after p7, 14d
  Mermaid / SQL            :active,  i2, after i1, 10d
  section AI
  Architecture review      :         ai, after i2, 21d`,
  },
];

export function purposeForType(type: DiagramType): DiagramPurpose | undefined {
  return DIAGRAM_PURPOSES.find((p) => p.diagramType === type);
}

// Legacy by-type lookup, still used by the template picker on the detail page
// when the user explicitly asks for "give me the canonical X template".
export const MERMAID_TEMPLATES: Record<DiagramType, string> = {
  ARCHITECTURE: DIAGRAM_PURPOSES.find((p) => p.id === "architecture-overview")!.mermaidSource,
  FLOWCHART: DIAGRAM_PURPOSES.find((p) => p.id === "request-flow")!.mermaidSource,
  SEQUENCE: DIAGRAM_PURPOSES.find((p) => p.id === "login-sequence")!.mermaidSource,
  ERD: DIAGRAM_PURPOSES.find((p) => p.id === "database-erd")!.mermaidSource,
  CLASS: DIAGRAM_PURPOSES.find((p) => p.id === "domain-model")!.mermaidSource,
  STATE: DIAGRAM_PURPOSES.find((p) => p.id === "validation-lifecycle")!.mermaidSource,
  GANTT: DIAGRAM_PURPOSES.find((p) => p.id === "roadmap-gantt")!.mermaidSource,
};
