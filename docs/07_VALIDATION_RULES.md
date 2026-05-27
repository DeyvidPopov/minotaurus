# 07 Validation Rules

## Purpose

The validation engine checks consistency between documentation, APIs, architecture, database models, security rules, and relationships.

The validation engine is deterministic. AI may suggest content, but validation must follow clear rules.

## Validation Output

Every validation problem is stored as `ValidationIssue`.

Fields:

```text
severity
category
message
artifactId
status
```

## Severity Levels

### INFO

Non-critical recommendation.

### WARNING

Potential problem that should be reviewed.

### ERROR

Incorrect or incomplete architecture/documentation state.

### CRITICAL

High-risk issue, usually security or broken structural consistency.

## Documentation Rules

### DOC_001: Active artifact should have documentation

If artifact status is ACTIVE and type is SERVICE, API_SPEC, API_ENDPOINT, DATABASE_MODEL, or SECURITY_POLICY, documentation should exist.

Severity: WARNING

### DOC_002: Deprecated artifact should be marked in documentation

If artifact status is DEPRECATED and documentation does not mention deprecation, create warning.

Severity: WARNING

## API Rules

### API_001: Endpoint should belong to an API spec

Every API_ENDPOINT artifact must be connected to an API_SPEC.

Severity: ERROR

### API_002: Endpoint should have documentation

Every API_ENDPOINT should have a DOCUMENTS relation to a DOCUMENTATION artifact or have its own documentation page.

Severity: WARNING

### API_003: Auth endpoint should have security relation

If ApiEndpoint.requiresAuth is true, the endpoint artifact must be linked to a SECURITY_POLICY artifact.

Severity: ERROR

## Database Rules

### DB_001: Service using database should link to database model

If a service stores data, it should have a STORES_DATA_IN relation to a DATABASE_MODEL or DATABASE_ENTITY artifact.

Severity: WARNING

### DB_002: Database entity must have fields

A DatabaseEntity must contain at least one field in fieldsJson.

Severity: ERROR

### DB_003: Database model should have at least one entity

A DatabaseModel should contain at least one DatabaseEntity.

Severity: WARNING

## Architecture Rules

### ARCH_001: Active artifact should not depend on archived artifact

If an ACTIVE artifact has DEPENDS_ON relation to ARCHIVED artifact, create issue.

Severity: ERROR

### ARCH_002: Deprecated artifact still used

If a DEPRECATED artifact is target of a USES or DEPENDS_ON relation from an ACTIVE artifact, create issue.

Severity: WARNING

### ARCH_003: Missing diagram for core services

If project has more than three SERVICE artifacts and no ARCHITECTURE diagram exists, create issue.

Severity: INFO

## Relation Rules

### REL_001: Relation must not point to deleted artifact

If relation references missing artifact, create issue.

Severity: ERROR

### REL_002: Self relation should be blocked

An artifact should not have a relation to itself.

Severity: ERROR

### REL_003: Duplicate relation should be blocked

The same source, target, and relation type should not be duplicated.

Severity: WARNING

## Security Rules

### SEC_001: Sensitive data must not be exposed without policy

If endpoint responseSchema contains sensitive fields and no SECURITY_POLICY relation exists, create issue.

Severity: CRITICAL

Sensitive field keywords:

```text
password
token
secret
privateKey
iban
ssn
personalId
accessToken
refreshToken
```

### SEC_002: Auth route should not expose password hash

If endpoint response schema contains passwordHash, create issue.

Severity: CRITICAL

## Versioning Rules

### VER_001: Mutating action should create version history

If artifact/documentation/relation was changed but no version history exists, create issue.

Severity: WARNING

## Export Rules

### EXP_001: Export should include graph data

SSOT export must include artifacts and relations.

Severity: ERROR

### EXP_002: Export should include validation summary

SSOT export should include validation issue summary.

Severity: WARNING

## Validation Acceptance Criteria

The validation system is complete when:

- validation can be triggered per project
- issues are stored in the database
- repeated validation does not create uncontrolled duplicates
- resolved/ignored issue states are respected where possible
- validation result summary is returned to frontend
- validation_completed WebSocket event is emitted