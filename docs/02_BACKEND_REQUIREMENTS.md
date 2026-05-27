# 02 Backend Requirements

## Backend Stack

The backend must use:

- Node.js
- Express.js
- TypeScript
- PostgreSQL
- Prisma ORM
- Zod validation
- JWT authentication
- bcrypt password hashing
- REST API
- WebSocket server

## Backend Role

The backend is the central business logic layer. The frontend must not directly access the database. All data access must happen through backend APIs.

## Required Backend Modules

```text
src/
  config/
  middleware/
  modules/
    auth/
    users/
    projects/
    artifacts/
    relations/
    documents/
    api-specs/
    endpoints/
    diagrams/
    database-models/
    validation/
    versions/
    search/
    exports/
  websocket/
  utils/
```

## Core Backend Responsibilities

### Authentication

- Register users
- Login users
- Hash passwords with bcrypt
- Issue JWT access tokens
- Protect private routes
- Return current user profile

### Authorization

Role-based permissions:

- admin
- architect
- developer
- viewer

Project-level membership must be supported through `ProjectMember`.

### Project Management

The backend must allow users to:

- create projects
- list accessible projects
- update projects
- delete projects
- manage project members

### Artifact Management

Artifacts are the central model of the system. The backend must support:

- artifact CRUD
- artifact type management
- artifact status management
- artifact ownership
- artifact tagging
- artifact search

### Relationship Management

The backend must support typed relationships between artifacts.

Examples:

- depends_on
- documents
- implements
- uses
- exposes
- belongs_to
- secures
- represents
- validates

These relationships form the knowledge graph.

### Knowledge Graph Generation

The backend must expose a graph endpoint that returns nodes and edges.

The graph must be generated from:

- artifacts
- artifact relations
- artifact metadata

### Documentation Management

The backend must store Markdown content and metadata.

Required operations:

- create documentation page
- update documentation page
- retrieve documentation page
- store version history on edits

### API Specification Management

The backend must support:

- storing OpenAPI JSON/YAML
- parsing endpoint definitions
- creating endpoint artifacts
- linking API endpoints to services/documentation/security policies

### Diagram Management

The backend must support storing diagram source code.

Supported diagram types:

- UML
- ERD
- flow
- architecture
- sequence

### Database Model Management

The backend must support database models and database entities.

It must store:

- database type
- tables or collections
- fields
- relationships
- normalization status

### Validation Engine

The backend must detect consistency issues.

Examples:

- API endpoint has no documentation
- endpoint requires authentication but has no security policy
- service depends on missing database entity
- deprecated artifact is still used by active artifact
- relation points to deleted artifact

### Versioning

Every important change must create a version history record.

Track:

- created
- updated
- deleted
- linked
- unlinked
- imported
- validated
- exported

### Search

The backend must support global project search across:

- artifact title
- artifact description
- documentation content
- API endpoints
- diagrams
- tags

### Export

The backend must generate an SSOT export package containing:

- project metadata
- artifacts
- relations
- documentation
- API specs
- endpoints
- diagrams
- validation issues
- database models
- version summary

## Backend Quality Requirements

- Use TypeScript strictly
- Use Zod for request validation
- Use centralized error handling
- Use consistent response format
- Use Prisma migrations
- Use modular service/controller/repository structure
- Never put business logic directly in route files
- Never expose password hashes
- Never trust frontend-provided user IDs without authorization checks

## Standard Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Operation successful"
}
```

## Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input"
  }
}
```

## Backend Acceptance Criteria

The backend is complete when:

- all core entities exist in Prisma
- migrations run successfully
- authentication works
- protected routes reject unauthorized users
- projects can be created and queried
- artifacts can be created and connected
- graph endpoint returns valid nodes and edges
- documentation can be saved and versioned
- API specs can be stored and parsed
- validation issues can be generated
- SSOT export can be generated
