# 05 API Contracts

## Base URL

```text
/api
```

## Authentication

Use JWT bearer token.

```http
Authorization: Bearer <token>
```

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
    "code": "ERROR_CODE",
    "message": "Human readable error"
  }
}
```

## Auth Endpoints

### Register

```http
POST /api/auth/register
```

Request:

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "firstName": "Deyvid",
  "lastName": "Popov"
}
```

### Login

```http
POST /api/auth/login
```

Request:

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

Response data:

```json
{
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "Deyvid",
    "lastName": "Popov",
    "role": "ADMIN"
  }
}
```

### Current User

```http
GET /api/auth/me
```

## Project Endpoints

```http
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
DELETE /api/projects/:projectId
```

Create project request:

```json
{
  "name": "Demo Architecture Project",
  "description": "Example software architecture workspace"
}
```

## Project Member Endpoints

```http
GET    /api/projects/:projectId/members
POST   /api/projects/:projectId/members
PATCH  /api/projects/:projectId/members/:memberId
DELETE /api/projects/:projectId/members/:memberId
```

Add member request:

```json
{
  "userId": "uuid",
  "role": "DEVELOPER"
}
```

## Artifact Endpoints

```http
GET    /api/projects/:projectId/artifacts
POST   /api/projects/:projectId/artifacts
GET    /api/artifacts/:artifactId
PATCH  /api/artifacts/:artifactId
DELETE /api/artifacts/:artifactId
```

Create artifact request:

```json
{
  "title": "Authentication Service",
  "type": "SERVICE",
  "description": "Handles login, registration, and token generation",
  "status": "ACTIVE"
}
```

Artifact filters:

```http
GET /api/projects/:projectId/artifacts?type=SERVICE&status=ACTIVE&q=auth
```

## Relation Endpoints

```http
GET    /api/projects/:projectId/relations
POST   /api/projects/:projectId/relations
DELETE /api/relations/:relationId
```

Create relation request:

```json
{
  "sourceArtifactId": "uuid",
  "targetArtifactId": "uuid",
  "relationType": "DEPENDS_ON",
  "description": "Authentication service depends on user database"
}
```

## Graph Endpoint

```http
GET /api/projects/:projectId/graph
```

Response data:

```json
{
  "nodes": [
    {
      "id": "artifact-id",
      "label": "Authentication Service",
      "type": "SERVICE",
      "status": "ACTIVE"
    }
  ],
  "edges": [
    {
      "id": "relation-id",
      "source": "artifact-id-1",
      "target": "artifact-id-2",
      "type": "DEPENDS_ON"
    }
  ]
}
```

## Documentation Endpoints

```http
GET   /api/artifacts/:artifactId/documentation
PUT   /api/artifacts/:artifactId/documentation
```

Save documentation request:

```json
{
  "markdownContent": "# Authentication Service\n\nThis service manages user login."
}
```

## API Spec Endpoints

```http
POST /api/projects/:projectId/api-specs
GET  /api/projects/:projectId/api-specs
GET  /api/api-specs/:apiSpecId
POST /api/api-specs/:apiSpecId/parse
```

Create API spec request:

```json
{
  "artifactTitle": "Backend API",
  "format": "OPENAPI_JSON",
  "rawContent": "{...}"
}
```

## Endpoint Endpoints

```http
GET   /api/api-specs/:apiSpecId/endpoints
GET   /api/endpoints/:endpointId
PATCH /api/endpoints/:endpointId
```

## Diagram Endpoints

```http
GET /api/projects/:projectId/diagrams
POST /api/projects/:projectId/diagrams
GET /api/diagrams/:diagramId
PUT /api/diagrams/:diagramId
DELETE /api/diagrams/:diagramId
```

Create diagram request:

```json
{
  "artifactTitle": "System Architecture Diagram",
  "diagramType": "MERMAID",
  "sourceCode": "graph TD; A-->B;"
}
```

## Database Model Endpoints

```http
GET  /api/projects/:projectId/database-models
POST /api/projects/:projectId/database-models
GET  /api/database-models/:databaseModelId
PUT  /api/database-models/:databaseModelId
```

## Validation Endpoints

```http
POST  /api/projects/:projectId/validate
GET   /api/projects/:projectId/validation-issues
PATCH /api/validation-issues/:issueId
```

Update validation issue request:

```json
{
  "status": "RESOLVED"
}
```

## Version History Endpoints

```http
GET /api/projects/:projectId/versions
GET /api/artifacts/:artifactId/versions
```

## Search Endpoint

```http
GET /api/projects/:projectId/search?q=authentication&type=SERVICE
```

Response data:

```json
{
  "results": [
    {
      "type": "ARTIFACT",
      "id": "uuid",
      "title": "Authentication Service",
      "description": "Handles login and token generation"
    }
  ]
}
```

## Export Endpoints

```http
POST /api/projects/:projectId/export
GET  /api/projects/:projectId/exports
GET  /api/exports/:exportId
```

Export request:

```json
{
  "format": "JSON",
  "includeVersions": true,
  "includeValidationIssues": true
}
```

## API Acceptance Criteria

- Every private endpoint must require authentication.
- Project resources must require project membership.
- Requests must be validated with Zod.
- Errors must use the standard error response.
- Successful responses must use the standard success response.
- Mutating endpoints must write version history where relevant.