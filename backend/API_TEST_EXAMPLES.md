# API Test Examples

Minimal hand-runnable examples for the Minotaurus backend. Base URL defaults to `http://localhost:4000`.

All successful responses are wrapped in:
```json
{ "success": true, "data": {}, "message": "..." }
```
All errors are wrapped in:
```json
{ "success": false, "error": { "code": "...", "message": "..." } }
```

## Health
```bash
curl http://localhost:4000/api/health
```

## Auth
```bash
# Register
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"deyvid@minotaurus.dev","password":"minotaurus","firstName":"Deyvid","lastName":"Popov"}'

# Login (save the data.token from the response into $TOKEN)
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"deyvid@minotaurus.dev","password":"minotaurus"}'

# Current user
curl http://localhost:4000/api/auth/me -H "Authorization: Bearer $TOKEN"
```

## Projects
```bash
curl http://localhost:4000/api/projects -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:4000/api/projects \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"My Project","description":"Demo workspace"}'

curl http://localhost:4000/api/projects/$PROJECT_ID -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:4000/api/projects/$PROJECT_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Renamed"}'

curl -X DELETE http://localhost:4000/api/projects/$PROJECT_ID -H "Authorization: Bearer $TOKEN"
```

## Artifacts
```bash
curl http://localhost:4000/api/projects/$PROJECT_ID/artifacts -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:4000/api/projects/$PROJECT_ID/artifacts \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Auth Service","type":"SERVICE","status":"ACTIVE","description":"Handles auth"}'

curl http://localhost:4000/api/artifacts/$ARTIFACT_ID -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:4000/api/artifacts/$ARTIFACT_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"DEPRECATED"}'

curl -X DELETE http://localhost:4000/api/artifacts/$ARTIFACT_ID -H "Authorization: Bearer $TOKEN"
```

## Relations
```bash
curl http://localhost:4000/api/artifacts/$ARTIFACT_ID/relations -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:4000/api/artifacts/$ARTIFACT_ID/relations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$TARGET_ID\",\"relationType\":\"DEPENDS_ON\",\"description\":\"depends on\"}"

curl -X DELETE http://localhost:4000/api/relations/$RELATION_ID -H "Authorization: Bearer $TOKEN"
```

## Graph
```bash
curl http://localhost:4000/api/projects/$PROJECT_ID/graph -H "Authorization: Bearer $TOKEN"
```

## Validation
```bash
curl -X POST http://localhost:4000/api/projects/$PROJECT_ID/validate -H "Authorization: Bearer $TOKEN"

curl http://localhost:4000/api/projects/$PROJECT_ID/validation-issues -H "Authorization: Bearer $TOKEN"

curl -X PATCH http://localhost:4000/api/validation-issues/$ISSUE_ID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"RESOLVED"}'
```

## Exports
```bash
curl -X POST http://localhost:4000/api/projects/$PROJECT_ID/export \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"format":"JSON","sections":["ARTIFACTS","RELATIONS","VALIDATION"]}'

curl http://localhost:4000/api/projects/$PROJECT_ID/exports -H "Authorization: Bearer $TOKEN"

curl http://localhost:4000/api/exports/$EXPORT_ID -H "Authorization: Bearer $TOKEN"
```

## Validation rules implemented
1. Artifact without incoming/outgoing relations → WARNING (RELATIONSHIP).
2. DOCUMENTATION artifact missing `documentationContent` → WARNING (DOCUMENTATION).
3. ACTIVE artifact relating to a DEPRECATED target → ERROR (ARCHITECTURE).
4. SECURITY_POLICY artifact without an outgoing `SECURES` relation → WARNING (SECURITY).

## Demo credentials (after `npm run seed`)
- Email: `deyvid@minotaurus.dev`
- Password: `minotaurus`
