# 09 Security Model

## Security Goals

The platform stores technical documentation, architecture information, API descriptions, database models, and security policies. Access control and data protection are therefore required.

## Authentication

Use email and password login.

Requirements:

- hash passwords with bcrypt
- never store plaintext passwords
- issue JWT token on login
- require JWT for private routes
- validate JWT on backend

## Authorization

Authorization has two levels:

1. global platform role
2. project membership role

## Global Roles

```text
ADMIN
ARCHITECT
DEVELOPER
VIEWER
```

## Project Roles

```text
OWNER
ARCHITECT
DEVELOPER
VIEWER
```

## Permission Matrix

| Action | Owner | Architect | Developer | Viewer |
|---|---:|---:|---:|---:|
| View project | yes | yes | yes | yes |
| Edit project | yes | yes | no | no |
| Delete project | yes | no | no | no |
| Manage members | yes | no | no | no |
| Create artifacts | yes | yes | yes | no |
| Edit artifacts | yes | yes | yes | no |
| Delete artifacts | yes | yes | no | no |
| Create relations | yes | yes | yes | no |
| Run validation | yes | yes | yes | no |
| Export SSOT | yes | yes | yes | yes |

## Backend Security Rules

- Frontend must never decide authorization alone.
- Backend must check project membership for every project resource.
- Backend must not expose passwordHash.
- Backend must validate all request bodies.
- Backend must reject unknown enum values.
- Backend must prevent cross-project artifact relations.
- Backend must prevent users from accessing projects where they are not members.

## Sensitive Data Classification

Fields may be classified as:

```text
PUBLIC
INTERNAL
PERSONAL
SENSITIVE
SECRET
```

## Sensitive Keywords

The validation engine should flag fields containing:

```text
password
passwordHash
token
accessToken
refreshToken
secret
privateKey
apiKey
iban
ssn
personalId
```

## API Security Expectations

- Private endpoints require JWT.
- Project endpoints require project membership.
- Mutating endpoints require sufficient role.
- Validation must occur before database writes.
- Error messages must not leak internals.

## WebSocket Security Expectations

- WebSocket connection must authenticate JWT.
- User may only join project rooms where they are a member.
- Unauthorized room joins must be rejected.

## Frontend Security Expectations

- Store token safely according to implementation choice.
- Do not show restricted buttons if user lacks permissions.
- Still rely on backend for final authorization.
- Clear auth state on logout.

## Security Acceptance Criteria

The security model is complete when:

- login works
- protected endpoints reject unauthenticated requests
- users cannot access other users' projects
- project roles restrict actions
- password hashes are never returned
- WebSocket rooms are membership-protected
- sensitive field validation rules exist