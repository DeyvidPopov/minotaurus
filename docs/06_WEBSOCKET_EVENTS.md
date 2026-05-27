# 06 WebSocket Events

## Purpose

WebSockets provide realtime project updates. They are used for live collaboration indicators, graph changes, validation updates, and recent activity updates.

## Connection

Frontend connects to backend WebSocket server after login.

Authentication must use JWT.

Example connection:

```text
ws://localhost:4000?token=<jwt-token>
```

## Room Model

Each project has a WebSocket room.

```text
project:{projectId}
```

A user joins the project room when opening a project workspace.

## Client-to-Server Events

### join_project

```json
{
  "type": "join_project",
  "projectId": "uuid"
}
```

### leave_project

```json
{
  "type": "leave_project",
  "projectId": "uuid"
}
```

### user_typing

```json
{
  "type": "user_typing",
  "projectId": "uuid",
  "artifactId": "uuid"
}
```

## Server-to-Client Events

### artifact_created

```json
{
  "type": "artifact_created",
  "projectId": "uuid",
  "artifact": {
    "id": "uuid",
    "title": "Authentication Service",
    "type": "SERVICE"
  }
}
```

### artifact_updated

```json
{
  "type": "artifact_updated",
  "projectId": "uuid",
  "artifactId": "uuid",
  "changes": {
    "title": "Updated title"
  }
}
```

### artifact_deleted

```json
{
  "type": "artifact_deleted",
  "projectId": "uuid",
  "artifactId": "uuid"
}
```

### relation_created

```json
{
  "type": "relation_created",
  "projectId": "uuid",
  "relation": {
    "id": "uuid",
    "sourceArtifactId": "uuid",
    "targetArtifactId": "uuid",
    "relationType": "DEPENDS_ON"
  }
}
```

### relation_deleted

```json
{
  "type": "relation_deleted",
  "projectId": "uuid",
  "relationId": "uuid"
}
```

### documentation_updated

```json
{
  "type": "documentation_updated",
  "projectId": "uuid",
  "artifactId": "uuid",
  "updatedBy": "uuid"
}
```

### validation_completed

```json
{
  "type": "validation_completed",
  "projectId": "uuid",
  "summary": {
    "info": 2,
    "warning": 5,
    "error": 1,
    "critical": 0
  }
}
```

### version_created

```json
{
  "type": "version_created",
  "projectId": "uuid",
  "version": {
    "id": "uuid",
    "entityType": "Artifact",
    "entityId": "uuid",
    "changeType": "UPDATED"
  }
}
```

### export_completed

```json
{
  "type": "export_completed",
  "projectId": "uuid",
  "exportId": "uuid",
  "format": "JSON"
}
```

## Frontend Expectations

The frontend must update relevant UI sections when events arrive:

- artifact lists
- graph view
- validation counters
- recent activity
- version timeline

## Backend Expectations

The backend must emit WebSocket events after successful database mutations.

## WebSocket Acceptance Criteria

- unauthorized WebSocket connections are rejected
- users can only join project rooms where they are members
- graph updates are broadcast after relation changes
- validation completion is broadcast after validation runs
- export completion is broadcast after export generation
