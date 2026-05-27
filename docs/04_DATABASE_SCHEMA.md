# 04 Database Schema

## Database

Use PostgreSQL with Prisma ORM.

## Entity Overview

Required entities:

- User
- Project
- ProjectMember
- Artifact
- ArtifactRelation
- DocumentationPage
- ApiSpec
- ApiEndpoint
- Diagram
- DatabaseModel
- DatabaseEntity
- VersionHistory
- ValidationIssue
- Tag
- ArtifactTag
- ExportPackage

## User

Represents a platform user.

Fields:

```text
id: UUID
email: string unique
passwordHash: string
firstName: string
lastName: string
role: UserRole
createdAt: datetime
updatedAt: datetime
```

Roles:

```text
ADMIN
ARCHITECT
DEVELOPER
VIEWER
```

## Project

Represents a documentation and architecture workspace.

Fields:

```text
id: UUID
name: string
description: string nullable
ownerId: UUID -> User.id
createdAt: datetime
updatedAt: datetime
```

## ProjectMember

Maps users to projects.

Fields:

```text
id: UUID
projectId: UUID -> Project.id
userId: UUID -> User.id
role: ProjectRole
createdAt: datetime
updatedAt: datetime
```

Roles:

```text
OWNER
ARCHITECT
DEVELOPER
VIEWER
```

## Artifact

The central entity of the platform.

Fields:

```text
id: UUID
projectId: UUID -> Project.id
title: string
type: ArtifactType
description: string nullable
status: ArtifactStatus
createdById: UUID -> User.id
createdAt: datetime
updatedAt: datetime
```

Artifact types:

```text
DOCUMENTATION
API_SPEC
API_ENDPOINT
SERVICE
DATABASE_MODEL
DATABASE_ENTITY
DIAGRAM
REQUIREMENT
SECURITY_POLICY
MODULE
EXTERNAL_SYSTEM
DEPLOYMENT
```

Artifact statuses:

```text
DRAFT
ACTIVE
DEPRECATED
ARCHIVED
```

## ArtifactRelation

Represents a typed edge between two artifacts.

Fields:

```text
id: UUID
projectId: UUID -> Project.id
sourceArtifactId: UUID -> Artifact.id
targetArtifactId: UUID -> Artifact.id
relationType: RelationType
description: string nullable
createdById: UUID -> User.id
createdAt: datetime
updatedAt: datetime
```

Relation types:

```text
DEPENDS_ON
DOCUMENTS
IMPLEMENTS
USES
EXPOSES
BELONGS_TO
SECURES
REPRESENTS
VALIDATES
COMMUNICATES_WITH
STORES_DATA_IN
GENERATED_FROM
```

## DocumentationPage

Stores Markdown documentation for an artifact.

Fields:

```text
id: UUID
artifactId: UUID unique -> Artifact.id
markdownContent: text
renderedHtml: text nullable
version: integer
createdAt: datetime
updatedAt: datetime
```

## ApiSpec

Stores imported or manually created API specifications.

Fields:

```text
id: UUID
artifactId: UUID unique -> Artifact.id
format: ApiSpecFormat
rawContent: text
parsedContent: json nullable
version: string nullable
createdAt: datetime
updatedAt: datetime
```

Formats:

```text
OPENAPI_JSON
OPENAPI_YAML
CUSTOM
```

## ApiEndpoint

Represents a single endpoint from an API spec.

Fields:

```text
id: UUID
apiSpecId: UUID -> ApiSpec.id
artifactId: UUID unique -> Artifact.id
method: HttpMethod
path: string
summary: string nullable
requestSchema: json nullable
responseSchema: json nullable
requiresAuth: boolean
createdAt: datetime
updatedAt: datetime
```

HTTP methods:

```text
GET
POST
PUT
PATCH
DELETE
OPTIONS
HEAD
```

## Diagram

Stores diagram source code.

Fields:

```text
id: UUID
artifactId: UUID unique -> Artifact.id
diagramType: DiagramType
sourceCode: text
renderedPreviewUrl: string nullable
createdAt: datetime
updatedAt: datetime
```

Diagram types:

```text
UML
ERD
FLOW
ARCHITECTURE
SEQUENCE
MERMAID
```

## DatabaseModel

Represents a database design artifact.

Fields:

```text
id: UUID
artifactId: UUID unique -> Artifact.id
databaseType: DatabaseType
description: string nullable
createdAt: datetime
updatedAt: datetime
```

Database types:

```text
POSTGRESQL
MYSQL
SQLITE
MONGODB
OTHER
```

## DatabaseEntity

Represents a table, collection, or similar data entity.

Fields:

```text
id: UUID
databaseModelId: UUID -> DatabaseModel.id
artifactId: UUID unique nullable -> Artifact.id
name: string
entityType: DatabaseEntityType
fieldsJson: json
relationsJson: json nullable
normalizationStatus: string nullable
createdAt: datetime
updatedAt: datetime
```

Entity types:

```text
TABLE
COLLECTION
VIEW
```

## VersionHistory

Tracks important changes.

Fields:

```text
id: UUID
projectId: UUID -> Project.id
entityType: string
entityId: UUID
changeType: ChangeType
oldValue: json nullable
newValue: json nullable
changedById: UUID -> User.id
createdAt: datetime
```

Change types:

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

## ValidationIssue

Stores validation problems and warnings.

Fields:

```text
id: UUID
projectId: UUID -> Project.id
artifactId: UUID nullable -> Artifact.id
severity: ValidationSeverity
category: ValidationCategory
message: string
status: ValidationStatus
createdAt: datetime
updatedAt: datetime
```

Severities:

```text
INFO
WARNING
ERROR
CRITICAL
```

Categories:

```text
API
DATABASE
SECURITY
DOCUMENTATION
ARCHITECTURE
RELATION
VERSIONING
```

Statuses:

```text
OPEN
RESOLVED
IGNORED
```

## Tag

Fields:

```text
id: UUID
projectId: UUID -> Project.id
name: string
color: string nullable
createdAt: datetime
updatedAt: datetime
```

## ArtifactTag

Fields:

```text
id: UUID
artifactId: UUID -> Artifact.id
tagId: UUID -> Tag.id
createdAt: datetime
```

## ExportPackage

Stores metadata about generated SSOT exports.

Fields:

```text
id: UUID
projectId: UUID -> Project.id
format: ExportFormat
content: json
createdById: UUID -> User.id
createdAt: datetime
```

Export formats:

```text
JSON
MARKDOWN
PDF
ZIP
```

## Important Constraints

- Artifact belongs to exactly one project.
- ArtifactRelation source and target must belong to the same project.
- DocumentationPage is linked to exactly one Artifact.
- ApiSpec is linked to exactly one Artifact.
- ApiEndpoint has its own Artifact for graph integration.
- Diagram is linked to exactly one Artifact.
- Deleted artifacts must not leave active relations.
- VersionHistory must be written for major mutations.
