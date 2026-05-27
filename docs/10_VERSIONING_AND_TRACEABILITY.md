# 10 Versioning and Traceability

## Purpose

Versioning and traceability show how the software architecture evolves over time. This is important for the thesis because the platform is not only a documentation editor, but a system for tracking engineering decisions and artifact relationships.

## What Must Be Tracked

Track changes for:

- projects
- artifacts
- artifact relations
- documentation pages
- API specifications
- API endpoints
- diagrams
- database models
- validation runs
- exports

## VersionHistory Entity

Each version record must store:

```text
projectId
entityType
entityId
changeType
oldValue
newValue
changedById
createdAt
```

## Change Types

```text
CREATED
UPDATED
DELETED
LINKED
UNLINKED
IMPORTED
VALIDATED
EXPORTED
```

## Traceability Model

Traceability is created through `ArtifactRelation`.

Examples:

```text
Requirement -> IMPLEMENTS -> Service
Service -> EXPOSES -> API Endpoint
API Endpoint -> STORES_DATA_IN -> Database Entity
API Endpoint -> SECURES -> Security Policy
Diagram -> REPRESENTS -> Service
Documentation -> DOCUMENTS -> API Endpoint
```

## Traceability Use Cases

### Impact Analysis

When an artifact changes, the system can identify related artifacts.

Example:

If `Authentication Service` changes, affected artifacts may include:

- login endpoint
- user database table
- authentication documentation
- security policy
- architecture diagram

### Documentation Consistency

If an API endpoint exists without documentation, the validation engine creates an issue.

### Architecture Drift Detection

If an artifact is deprecated but still used by active components, the validation engine creates an issue.

## Versioning Requirements

- Create version record on artifact creation.
- Create version record on artifact update.
- Create version record on artifact deletion.
- Create version record when relation is created.
- Create version record when relation is deleted.
- Create version record when documentation is updated.
- Create version record when API spec is imported.
- Create version record when validation runs.
- Create version record when export is generated.

## Frontend Version View

The frontend must show:

- timeline of project changes
- filter by entity type
- filter by change type
- changed by user
- timestamp
- old/new values where useful

## Backend Versioning Rules

- Versioning should be handled in service layer, not controller layer.
- Version records should be created only after successful database mutation.
- Sensitive values must not be stored directly in version history.
- Large values may be summarized if necessary.

## Acceptance Criteria

Versioning is complete when:

- major changes produce version records
- users can view project history
- users can view artifact-specific history
- relation changes are visible
- validation and export events are visible