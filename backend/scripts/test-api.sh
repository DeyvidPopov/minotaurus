#!/usr/bin/env bash
# scripts/test-api.sh — smoke-tests the Minotaurus backend.
# Requires: curl + node (uses node for JSON parsing/building so jq is not needed).
# Backend must be running on $BASE (default http://localhost:4000).
#
# This is a WIDE happy-path + key-error-path pass over (almost) every module:
# auth/profile/password-reset/email-change, projects, artifacts, relations,
# api-specs, database-models, diagrams, validation + quick-fix, dashboard,
# versions/impact, members, api-intel, exports (JSON/MARKDOWN/PDF + ETag/304),
# ingestion (markdown/openapi/mermaid/sql), AI role+empty-state gates, and
# account-deletion. The deep happy-path AI generations (propose/review/advisor/
# documentation) are deliberately NOT exercised here — they need ANTHROPIC_API_KEY
# and cost tokens, and their deterministic logic is covered by *.test.ts. Likewise
# email DELIVERY is never asserted (the dev provider only logs a masked code), so
# the verified flows are smoke-tested via their wiring + safe-failure paths only.

set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
EMAIL="${TEST_EMAIL:-tester+$(date +%s)@minotaurus.dev}"
# NOTE: the password policy is >=8 chars + at least one letter AND one digit
# (evaluatePasswordStrength), enforced by /auth/register. A digit-less default
# (the old "supersecret") now fails registration with WEAK_PASSWORD — keep a digit.
PASSWORD="${TEST_PASSWORD:-supersecret1}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$1"; }
hr()    { printf -- "----------------------------------------\n"; }

need() { command -v "$1" >/dev/null 2>&1 || { red "missing dependency: $1"; exit 1; }; }
need curl
need node

# jget <json> <dot.path>  — read a value from JSON via node (supports array indices, e.g. data.0.id)
jget() {
  node -e "
    let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
      const o=JSON.parse(s);
      const v='$2'.split('.').reduce((a,k)=>a==null?a:a[k],o);
      process.stdout.write(v==null?'':String(v));
    });
  " <<< "$1"
}

# jbody <jsObjectLiteralViaNode...> — build a JSON request body safely from args.
# Usage: jbody '{openapiJson: process.argv[1]}' "$INNER"
jbody() {
  local expr="$1"; shift
  node -e "process.stdout.write(JSON.stringify($expr))" "$@"
}

assert_success() {
  local label="$1"; local body="$2"
  local ok
  ok=$(jget "$body" "success")
  if [ "$ok" != "true" ]; then
    red "FAIL: $label"
    echo "$body"
    exit 1
  fi
  green "PASS: $label"
}

# assert_error <label> <json> <expected-error-code>
assert_error() {
  local label="$1"; local body="$2"; local code="$3"
  local ok actual
  ok=$(jget "$body" "success")
  actual=$(jget "$body" "error.code")
  if [ "$ok" != "false" ] || [ "$actual" != "$code" ]; then
    red "FAIL: $label (expected error $code, got success=$ok code=$actual)"
    echo "$body"
    exit 1
  fi
  green "PASS: $label"
}

# assert_error_in <label> <json> <code1> [code2 ...] — error whose code is one of N.
assert_error_in() {
  local label="$1"; local body="$2"; shift 2
  local ok actual
  ok=$(jget "$body" "success")
  actual=$(jget "$body" "error.code")
  if [ "$ok" = "false" ]; then
    for c in "$@"; do
      if [ "$actual" = "$c" ]; then green "PASS: $label"; return; fi
    done
  fi
  red "FAIL: $label (expected one of [$*], got success=$ok code=$actual)"
  echo "$body"
  exit 1
}

# assert_fail <label> <json> — any error envelope (success=false), code unchecked.
assert_fail() {
  local label="$1"; local body="$2"
  local ok
  ok=$(jget "$body" "success")
  if [ "$ok" != "false" ]; then
    red "FAIL: $label (expected an error envelope, got success=$ok)"
    echo "$body"
    exit 1
  fi
  green "PASS: $label"
}

# assert_eq <label> <actual> <expected>
assert_eq() {
  local label="$1"; local actual="$2"; local expected="$3"
  if [ "$actual" != "$expected" ]; then
    red "FAIL: $label (expected '$expected', got '$actual')"
    exit 1
  fi
  green "PASS: $label"
}

# ───────────────────────────────────────────────────────────────────────────────

hr; echo "1. Health"
H=$(curl -s "$BASE/api/health")
assert_success "GET /api/health" "$H"

hr; echo "2. Register ($EMAIL)"
R=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Test\",\"lastName\":\"User\"}")
assert_success "POST /api/auth/register" "$R"

# Password policy is enforced at registration: a digit-less password is rejected.
WEAK_EMAIL="weak+$(date +%s)@minotaurus.dev"
WK=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$WEAK_EMAIL\",\"password\":\"weakpass\",\"firstName\":\"W\",\"lastName\":\"K\"}")
assert_error "POST /api/auth/register (no digit → WEAK_PASSWORD)" "$WK" "WEAK_PASSWORD"

hr; echo "2b. Multi-step registration (start / verify / resend wiring)"
# The verification code is intentionally never returned (only logged in dev), so
# this exercises wiring + safe-failure paths, not the full happy path (covered by
# registration.service.test.ts).
RS_EMAIL="wizard+$(date +%s)@minotaurus.dev"
RS=$(curl -s -X POST "$BASE/api/auth/register/start" \
  -H "Content-Type: application/json" \
  -d "{\"firstName\":\"Wiz\",\"lastName\":\"Ard\",\"email\":\"$RS_EMAIL\"}")
assert_success "POST /api/auth/register/start" "$RS"

RS_DUP=$(curl -s -X POST "$BASE/api/auth/register/start" \
  -H "Content-Type: application/json" \
  -d "{\"firstName\":\"Test\",\"lastName\":\"User\",\"email\":\"$EMAIL\"}")
assert_error "POST /api/auth/register/start (existing email blocked)" "$RS_DUP" "EMAIL_TAKEN"

RV=$(curl -s -X POST "$BASE/api/auth/register/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RS_EMAIL\",\"code\":\"000000\"}")
assert_error "POST /api/auth/register/verify (wrong code)" "$RV" "INVALID_CODE"

RR=$(curl -s -X POST "$BASE/api/auth/register/resend" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RS_EMAIL\"}")
assert_error "POST /api/auth/register/resend (cooldown)" "$RR" "RESEND_COOLDOWN"

RVAL=$(curl -s -X POST "$BASE/api/auth/register/start" \
  -H "Content-Type: application/json" -d '{"email":"not-an-email"}')
assert_error "POST /api/auth/register/start (bad body)" "$RVAL" "VALIDATION_ERROR"

hr; echo "3. Login"
L=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
assert_success "POST /api/auth/login" "$L"
TOKEN=$(jget "$L" "data.token")
MY_USER_ID=$(jget "$L" "data.user.id")
AUTH=("-H" "Authorization: Bearer $TOKEN")

hr; echo "4. Auth profile (/auth/me, change-password)"
ME=$(curl -s "$BASE/api/auth/me" "${AUTH[@]}")
assert_success "GET /api/auth/me" "$ME"
assert_eq "GET /api/auth/me returns my email" "$(jget "$ME" "data.user.email")" "$EMAIL"

# Unauthenticated request is rejected by requireAuth.
NOAUTH=$(curl -s "$BASE/api/auth/me")
assert_fail "GET /api/auth/me (no token → rejected)" "$NOAUTH"

ME_EMPTY=$(curl -s -X PATCH "$BASE/api/auth/me" "${AUTH[@]}" -H "Content-Type: application/json" -d '{}')
assert_error "PATCH /api/auth/me (empty body → VALIDATION_ERROR)" "$ME_EMPTY" "VALIDATION_ERROR"

ME_UPD=$(curl -s -X PATCH "$BASE/api/auth/me" "${AUTH[@]}" -H "Content-Type: application/json" -d '{"firstName":"Smoke"}')
assert_success "PATCH /api/auth/me (rename)" "$ME_UPD"

# change-password checks strength BEFORE credentials, so a strong-but-wrong-current
# yields INVALID_CREDENTIALS, while a weak new password short-circuits to WEAK_PASSWORD.
CP_BAD=$(curl -s -X POST "$BASE/api/auth/change-password" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"currentPassword":"definitely-wrong","newPassword":"Strongpass1"}')
assert_error "POST /api/auth/change-password (wrong current → INVALID_CREDENTIALS)" "$CP_BAD" "INVALID_CREDENTIALS"

CP_WEAK=$(curl -s -X POST "$BASE/api/auth/change-password" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"short\"}")
assert_error "POST /api/auth/change-password (weak new → WEAK_PASSWORD)" "$CP_WEAK" "WEAK_PASSWORD"

hr; echo "5. Forgot-password flow (enumeration-neutral wiring)"
PF=$(curl -s -X POST "$BASE/api/auth/password/forgot" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}")
assert_success "POST /api/auth/password/forgot" "$PF"

PF_BAD=$(curl -s -X POST "$BASE/api/auth/password/forgot" \
  -H "Content-Type: application/json" -d '{"email":"not-an-email"}')
assert_error "POST /api/auth/password/forgot (bad email → VALIDATION_ERROR)" "$PF_BAD" "VALIDATION_ERROR"

PF_RESEND=$(curl -s -X POST "$BASE/api/auth/password/resend" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\"}")
assert_error "POST /api/auth/password/resend (cooldown)" "$PF_RESEND" "RESEND_COOLDOWN"

PF_VERIFY=$(curl -s -X POST "$BASE/api/auth/password/verify" \
  -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"code\":\"000000\"}")
assert_error "POST /api/auth/password/verify (wrong code → INVALID_CODE)" "$PF_VERIFY" "INVALID_CODE"

hr; echo "6. Email-change flow (authenticated wiring)"
EC_NOPEND=$(curl -s -X POST "$BASE/api/auth/email/resend" "${AUTH[@]}" -H "Content-Type: application/json")
assert_error "POST /api/auth/email/resend (no pending → NO_PENDING_CHANGE)" "$EC_NOPEND" "NO_PENDING_CHANGE"

EC_SAME=$(curl -s -X POST "$BASE/api/auth/email/request" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"newEmail\":\"$EMAIL\",\"currentPassword\":\"$PASSWORD\"}")
assert_error "POST /api/auth/email/request (same email → SAME_EMAIL)" "$EC_SAME" "SAME_EMAIL"

EC_BADPW=$(curl -s -X POST "$BASE/api/auth/email/request" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"newEmail":"brand-new+ec@minotaurus.dev","currentPassword":"definitely-wrong"}')
assert_error "POST /api/auth/email/request (wrong password → INVALID_CREDENTIALS)" "$EC_BADPW" "INVALID_CREDENTIALS"

hr; echo "7. Create project"
P=$(curl -s -X POST "$BASE/api/projects" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Project","description":"Auto-generated"}')
assert_success "POST /api/projects" "$P"
PROJECT_ID=$(jget "$P" "data.id")

PLIST=$(curl -s "$BASE/api/projects" "${AUTH[@]}")
assert_success "GET /api/projects (list)" "$PLIST"

PGET=$(curl -s "$BASE/api/projects/$PROJECT_ID" "${AUTH[@]}")
assert_success "GET /api/projects/:id" "$PGET"

PPATCH=$(curl -s -X PATCH "$BASE/api/projects/$PROJECT_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"name":"Smoke Test Project (renamed)"}')
assert_success "PATCH /api/projects/:id" "$PPATCH"

PPATCH_BAD=$(curl -s -X PATCH "$BASE/api/projects/$PROJECT_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"name":""}')
assert_error "PATCH /api/projects/:id (empty name → VALIDATION_ERROR)" "$PPATCH_BAD" "VALIDATION_ERROR"

PGET_404=$(curl -s "$BASE/api/projects/does-not-exist" "${AUTH[@]}")
assert_error "GET /api/projects/:id (unknown → NOT_FOUND)" "$PGET_404" "NOT_FOUND"

# defaultProjectId on the profile: set, clear, and reject an inaccessible project.
DP_SET=$(curl -s -X PATCH "$BASE/api/auth/me" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"defaultProjectId\":\"$PROJECT_ID\"}")
assert_success "PATCH /api/auth/me (set defaultProjectId)" "$DP_SET"
DP_CLEAR=$(curl -s -X PATCH "$BASE/api/auth/me" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"defaultProjectId":null}')
assert_success "PATCH /api/auth/me (clear defaultProjectId)" "$DP_CLEAR"
DP_BAD=$(curl -s -X PATCH "$BASE/api/auth/me" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"defaultProjectId":"does-not-exist"}')
assert_error "PATCH /api/auth/me (inaccessible project → INVALID_DEFAULT_PROJECT)" "$DP_BAD" "INVALID_DEFAULT_PROJECT"

hr; echo "8. Artifacts"
A1=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/artifacts" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Auth Service","type":"SERVICE","status":"ACTIVE","description":"Handles auth"}')
assert_success "POST artifacts (Auth Service)" "$A1"
A1_ID=$(jget "$A1" "data.id")

A2=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/artifacts" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"User DB","type":"DATABASE_MODEL","status":"ACTIVE","description":"User store"}')
assert_success "POST artifacts (User DB)" "$A2"
A2_ID=$(jget "$A2" "data.id")

# An undocumented DOCUMENTATION artifact reliably yields a MISSING_DOCUMENTATION
# finding with an AVAILABLE quick fix (exercised in section 13).
A3=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/artifacts" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Quickfix Doc Test","type":"DOCUMENTATION","status":"DRAFT"}')
assert_success "POST artifacts (empty doc for quick-fix)" "$A3"
A3_ID=$(jget "$A3" "data.id")

A_DUP=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/artifacts" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"auth   service","type":"SERVICE"}')
assert_error "POST artifacts (dup normalized title → ARTIFACT_TITLE_TAKEN)" "$A_DUP" "ARTIFACT_TITLE_TAKEN"

ALIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/artifacts" "${AUTH[@]}")
assert_success "GET artifacts (list)" "$ALIST"

AGET=$(curl -s "$BASE/api/artifacts/$A1_ID" "${AUTH[@]}")
assert_success "GET artifacts/:id" "$AGET"

APATCH=$(curl -s -X PATCH "$BASE/api/artifacts/$A1_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"status":"ACTIVE","description":"Handles authn/z"}')
assert_success "PATCH artifacts/:id" "$APATCH"

AGET_404=$(curl -s "$BASE/api/artifacts/does-not-exist" "${AUTH[@]}")
assert_error "GET artifacts/:id (unknown → NOT_FOUND)" "$AGET_404" "NOT_FOUND"

DOC_PUT=$(curl -s -X PUT "$BASE/api/artifacts/$A2_ID/documentation" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"markdownContent":"# User DB\nStores users."}')
assert_success "PUT artifacts/:id/documentation" "$DOC_PUT"
DOC_GET=$(curl -s "$BASE/api/artifacts/$A2_ID/documentation" "${AUTH[@]}")
assert_success "GET artifacts/:id/documentation" "$DOC_GET"

DOC_OVERVIEW=$(curl -s "$BASE/api/projects/$PROJECT_ID/documentation" "${AUTH[@]}")
assert_success "GET projects/:id/documentation (overview)" "$DOC_OVERVIEW"

hr; echo "9. Relations"
REL=$(curl -s -X POST "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A2_ID\",\"relationType\":\"DEPENDS_ON\",\"description\":\"auth depends on user db\"}")
assert_success "POST relations (DEPENDS_ON)" "$REL"
REL_ID=$(jget "$REL" "data.id")

REL_DUP=$(curl -s -X POST "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A2_ID\",\"relationType\":\"DEPENDS_ON\",\"description\":\"dup\"}")
assert_error "POST duplicate relation → 409 RELATION_EXISTS" "$REL_DUP" "RELATION_EXISTS"

REL_TYPE=$(curl -s -X POST "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A2_ID\",\"relationType\":\"USES\",\"description\":\"different type\"}")
assert_success "POST same pair, different relationType (allowed)" "$REL_TYPE"
REL_TYPE_ID=$(jget "$REL_TYPE" "data.id")

REL_REV=$(curl -s -X POST "$BASE/api/artifacts/$A2_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A1_ID\",\"relationType\":\"DEPENDS_ON\",\"description\":\"reversed direction\"}")
assert_success "POST reversed direction (allowed)" "$REL_REV"

REL_SELF=$(curl -s -X POST "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A1_ID\",\"relationType\":\"USES\"}")
assert_error "POST self relation → SELF_RELATION" "$REL_SELF" "SELF_RELATION"

REL_LIST=$(curl -s "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}")
assert_success "GET artifacts/:id/relations" "$REL_LIST"

REL_DEL=$(curl -s -X DELETE "$BASE/api/relations/$REL_TYPE_ID" "${AUTH[@]}")
assert_success "DELETE relations/:id" "$REL_DEL"

hr; echo "10. API specs + endpoints"
SPEC=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/api-specs" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke API","version":"1.0.0","baseUrl":"https://api.example.com","description":"smoke"}')
assert_success "POST api-specs" "$SPEC"
SPEC_ID=$(jget "$SPEC" "data.id")

SPEC_LIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/api-specs" "${AUTH[@]}")
assert_success "GET api-specs (list)" "$SPEC_LIST"
SPEC_GET=$(curl -s "$BASE/api/api-specs/$SPEC_ID" "${AUTH[@]}")
assert_success "GET api-specs/:id" "$SPEC_GET"
SPEC_PATCH=$(curl -s -X PATCH "$BASE/api/api-specs/$SPEC_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"version":"1.1.0"}')
assert_success "PATCH api-specs/:id" "$SPEC_PATCH"

EP=$(curl -s -X POST "$BASE/api/api-specs/$SPEC_ID/endpoints" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"path":"/users/:id","method":"GET","summary":"Fetch user","requiresAuth":true}')
assert_success "POST api-specs/:id/endpoints" "$EP"
EP_ID=$(jget "$EP" "data.id")

EP_DUP=$(curl -s -X POST "$BASE/api/api-specs/$SPEC_ID/endpoints" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"path":"/users/:id","method":"GET","summary":"dup"}')
assert_error "POST duplicate (method,path) → ENDPOINT_EXISTS" "$EP_DUP" "ENDPOINT_EXISTS"

EP_BAD=$(curl -s -X POST "$BASE/api/api-specs/$SPEC_ID/endpoints" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"path":"/x","method":"get"}')
assert_error "POST endpoint (bad method enum → VALIDATION_ERROR)" "$EP_BAD" "VALIDATION_ERROR"

EP_LIST=$(curl -s "$BASE/api/api-specs/$SPEC_ID/endpoints" "${AUTH[@]}")
assert_success "GET api-specs/:id/endpoints" "$EP_LIST"
EP_PATCH=$(curl -s -X PATCH "$BASE/api/api-endpoints/$EP_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"summary":"Fetch a user by id"}')
assert_success "PATCH api-endpoints/:id" "$EP_PATCH"

hr; echo "11. Database models / entities / fields"
DBM=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/database-models" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Core DB","databaseType":"PostgreSQL","description":"smoke"}')
assert_success "POST database-models" "$DBM"
DBM_ID=$(jget "$DBM" "data.id")

DBM_LIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/database-models" "${AUTH[@]}")
assert_success "GET database-models (list)" "$DBM_LIST"
DBM_GET=$(curl -s "$BASE/api/database-models/$DBM_ID" "${AUTH[@]}")
assert_success "GET database-models/:id" "$DBM_GET"
DBM_PATCH=$(curl -s -X PATCH "$BASE/api/database-models/$DBM_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"description":"core db (updated)"}')
assert_success "PATCH database-models/:id" "$DBM_PATCH"

ENT=$(curl -s -X POST "$BASE/api/database-models/$DBM_ID/entities" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"name":"User","description":"a user"}')
assert_success "POST entities" "$ENT"
ENT_ID=$(jget "$ENT" "data.id")

ENT_DUP=$(curl -s -X POST "$BASE/api/database-models/$DBM_ID/entities" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"name":"User"}')
assert_error "POST entity (dup name → ENTITY_NAME_TAKEN)" "$ENT_DUP" "ENTITY_NAME_TAKEN"

FLD=$(curl -s -X POST "$BASE/api/database-entities/$ENT_ID/fields" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"name":"id","type":"uuid","required":true,"isPrimaryKey":true}')
assert_success "POST fields (id PK)" "$FLD"
FLD_ID=$(jget "$FLD" "data.id")

FLD_DUP=$(curl -s -X POST "$BASE/api/database-entities/$ENT_ID/fields" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"name":"id","type":"uuid"}')
assert_error "POST field (dup name → FIELD_NAME_TAKEN)" "$FLD_DUP" "FIELD_NAME_TAKEN"

FLD2=$(curl -s -X POST "$BASE/api/database-entities/$ENT_ID/fields" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"name":"email","type":"text"}')
assert_success "POST fields (email)" "$FLD2"
FLD2_ID=$(jget "$FLD2" "data.id")

FLD_PATCH=$(curl -s -X PATCH "$BASE/api/database-fields/$FLD2_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"required":true}')
assert_success "PATCH database-fields/:id" "$FLD_PATCH"

REORDER=$(curl -s -X PATCH "$BASE/api/database-entities/$ENT_ID/fields/reorder" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"fieldIds\":[\"$FLD2_ID\",\"$FLD_ID\"]}")
assert_success "PATCH entities/:id/fields/reorder" "$REORDER"

REORDER_BAD=$(curl -s -X PATCH "$BASE/api/database-entities/$ENT_ID/fields/reorder" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"fieldIds\":[\"$FLD_ID\"]}")
assert_error "PATCH reorder (incomplete set → INVALID_REORDER)" "$REORDER_BAD" "INVALID_REORDER"

ENT_LIST=$(curl -s "$BASE/api/database-models/$DBM_ID/entities" "${AUTH[@]}")
assert_success "GET database-models/:id/entities" "$ENT_LIST"

hr; echo "12. Diagrams"
DIAG=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/diagrams" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Smoke Flow","type":"FLOWCHART","mermaidSource":"graph TD\n  A[Start]\n  B[End]\n  A --> B","description":"a flow"}')
assert_success "POST diagrams (valid mermaid)" "$DIAG"
DIAG_ID=$(jget "$DIAG" "data.id")

DIAG_BAD=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/diagrams" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"title":"","type":"FLOWCHART"}')
assert_error "POST diagrams (empty title → VALIDATION_ERROR)" "$DIAG_BAD" "VALIDATION_ERROR"

DIAG_LIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/diagrams" "${AUTH[@]}")
assert_success "GET diagrams (list)" "$DIAG_LIST"
DIAG_GET=$(curl -s "$BASE/api/diagrams/$DIAG_ID" "${AUTH[@]}")
assert_success "GET diagrams/:id" "$DIAG_GET"
DIAG_PATCH=$(curl -s -X PATCH "$BASE/api/diagrams/$DIAG_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"title":"Smoke Flow (v2)"}')
assert_success "PATCH diagrams/:id" "$DIAG_PATCH"

hr; echo "13. Graph"
G=$(curl -s "$BASE/api/projects/$PROJECT_ID/graph" "${AUTH[@]}")
assert_success "GET projects/:id/graph" "$G"

hr; echo "14. API Payload Intelligence"
AI_INTEL=$(curl -s "$BASE/api/projects/$PROJECT_ID/api-intel" "${AUTH[@]}")
assert_success "GET projects/:id/api-intel" "$AI_INTEL"

hr; echo "15. Validation + quick fix"
V=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/validate" "${AUTH[@]}")
assert_success "POST projects/:id/validate" "$V"
ISSUE_COUNT=$(jget "$V" "data.issueCount")
green "  issueCount=$ISSUE_COUNT"

VI=$(curl -s "$BASE/api/projects/$PROJECT_ID/validation-issues" "${AUTH[@]}")
assert_success "GET projects/:id/validation-issues" "$VI"

# Waive (IGNORE) the first issue, then reject a bad status enum on it.
ISSUE_ID=$(jget "$VI" "data.0.id")
if [ -n "$ISSUE_ID" ]; then
  PI=$(curl -s -X PATCH "$BASE/api/validation-issues/$ISSUE_ID" "${AUTH[@]}" \
    -H "Content-Type: application/json" -d '{"status":"IGNORED"}')
  assert_success "PATCH validation-issues/:id (waive)" "$PI"
  PI_BAD=$(curl -s -X PATCH "$BASE/api/validation-issues/$ISSUE_ID" "${AUTH[@]}" \
    -H "Content-Type: application/json" -d '{"status":"BOGUS"}')
  assert_error "PATCH validation-issues/:id (bad status → VALIDATION_ERROR)" "$PI_BAD" "VALIDATION_ERROR"
else
  yellow "SKIP: no validation issues to waive (unexpected for this fixture set)"
fi

# Find an issue exposing an AVAILABLE one-click quick fix (e.g. MISSING_DOCUMENTATION),
# then preview + apply it. Re-list first so the just-IGNORED issue isn't the target.
VI2=$(curl -s "$BASE/api/projects/$PROJECT_ID/validation-issues?status=OPEN" "${AUTH[@]}")
QF_ISSUE=$(node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{
      const arr=(JSON.parse(s).data)||[];
      for(const it of arr){
        const acts=(it.meta&&it.meta.actions)||[];
        if(acts.some(a=>a.status==="AVAILABLE"&&a.kind==="GENERATE"&&!a.requiresReview)){
          process.stdout.write(it.id);return;
        }
      }
    }catch(e){}
    process.stdout.write("");
  });
' <<< "$VI2")
if [ -n "$QF_ISSUE" ]; then
  QFP=$(curl -s "$BASE/api/validation-issues/$QF_ISSUE/quick-fix/preview" "${AUTH[@]}")
  assert_success "GET validation-issues/:id/quick-fix/preview" "$QFP"
  QFA=$(curl -s -X POST "$BASE/api/validation-issues/$QF_ISSUE/quick-fix/apply" "${AUTH[@]}")
  assert_success "POST validation-issues/:id/quick-fix/apply" "$QFA"
else
  yellow "SKIP: no AVAILABLE one-click quick fix found in issues"
fi

hr; echo "16. Dashboard summary"
DASH=$(curl -s "$BASE/api/dashboard/summary" "${AUTH[@]}")
assert_success "GET /api/dashboard/summary" "$DASH"

hr; echo "17. Version history + impact"
VH=$(curl -s "$BASE/api/projects/$PROJECT_ID/version-history" "${AUTH[@]}")
assert_success "GET projects/:id/version-history" "$VH"
EVENT_ID=$(jget "$VH" "data.0.id")
if [ -n "$EVENT_ID" ]; then
  VE=$(curl -s "$BASE/api/version-events/$EVENT_ID" "${AUTH[@]}")
  assert_success "GET version-events/:id" "$VE"
fi
VE_404=$(curl -s "$BASE/api/version-events/does-not-exist" "${AUTH[@]}")
assert_error "GET version-events/:id (unknown → NOT_FOUND)" "$VE_404" "NOT_FOUND"

IMP=$(curl -s "$BASE/api/projects/$PROJECT_ID/impact/$A1_ID" "${AUTH[@]}")
assert_success "GET projects/:id/impact/:artifactId" "$IMP"

hr; echo "18. Members + AI role gate"
MEMBER_EMAIL="member+$(date +%s)@minotaurus.dev"
RM=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Mem\",\"lastName\":\"Ber\"}")
assert_success "POST register (second user for member tests)" "$RM"
MEMBER_TOKEN=$(jget "$RM" "data.token")
MEMBER_AUTH=("-H" "Authorization: Bearer $MEMBER_TOKEN")

ADD=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/members" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"email\":\"$MEMBER_EMAIL\",\"role\":\"VIEWER\"}")
assert_success "POST members (add VIEWER)" "$ADD"
MEMBER_ID=$(jget "$ADD" "data.id")

ADD_UNKNOWN=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/members" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"email":"nobody-here@minotaurus.dev","role":"VIEWER"}')
assert_error "POST members (unknown email → USER_NOT_FOUND)" "$ADD_UNKNOWN" "USER_NOT_FOUND"

ADD_DUP=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/members" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"email\":\"$MEMBER_EMAIL\",\"role\":\"VIEWER\"}")
assert_error "POST members (dup → ALREADY_MEMBER)" "$ADD_DUP" "ALREADY_MEMBER"

MEMBERS=$(curl -s "$BASE/api/projects/$PROJECT_ID/members" "${AUTH[@]}")
assert_success "GET members (list)" "$MEMBERS"

# AI mutation endpoints are DEVELOPER+; the freshly-added VIEWER is rejected by
# assertCanMutate before any AI call (deterministic — no API key needed).
AI_GATE=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/ai/bootstrap/propose" "${MEMBER_AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"idea":"a billing dashboard with payments and invoices"}')
assert_error_in "POST ai/bootstrap/propose as VIEWER (role gate)" "$AI_GATE" "INSUFFICIENT_ROLE" "FORBIDDEN"

UPD=$(curl -s -X PATCH "$BASE/api/projects/$PROJECT_ID/members/$MEMBER_ID" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"role":"ARCHITECT"}')
assert_success "PATCH members/:id (promote to ARCHITECT)" "$UPD"

# The sole OWNER (me) cannot be demoted — find my OWNER membership and try.
OWNER_MID=$(node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    try{const arr=(JSON.parse(s).data)||[];const me=arr.find(m=>m.role==="OWNER");process.stdout.write(me?me.id:"");}
    catch(e){process.stdout.write("");}
  });
' <<< "$MEMBERS")
if [ -n "$OWNER_MID" ]; then
  LASTOWNER=$(curl -s -X PATCH "$BASE/api/projects/$PROJECT_ID/members/$OWNER_MID" "${AUTH[@]}" \
    -H "Content-Type: application/json" -d '{"role":"DEVELOPER"}')
  assert_error "PATCH members/:id (demote sole OWNER → LAST_OWNER)" "$LASTOWNER" "LAST_OWNER"
fi

RMV=$(curl -s -X DELETE "$BASE/api/projects/$PROJECT_ID/members/$MEMBER_ID" "${AUTH[@]}")
assert_success "DELETE members/:id" "$RMV"

hr; echo "19. AI read-only / empty-state (no API key required)"
AR_LATEST=$(curl -s "$BASE/api/projects/$PROJECT_ID/ai/review/latest" "${AUTH[@]}")
assert_error "GET ai/review/latest (none yet → AI_REVIEW_NOT_FOUND)" "$AR_LATEST" "AI_REVIEW_NOT_FOUND"
AR_HIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/ai/reviews" "${AUTH[@]}")
assert_success "GET ai/reviews (empty history)" "$AR_HIST"
AD_LATEST=$(curl -s "$BASE/api/projects/$PROJECT_ID/ai/advisor/latest" "${AUTH[@]}")
assert_error "GET ai/advisor/latest (none yet → AI_ADVISOR_NOT_FOUND)" "$AD_LATEST" "AI_ADVISOR_NOT_FOUND"
AD_HIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/ai/advisors" "${AUTH[@]}")
assert_success "GET ai/advisors (empty history)" "$AD_HIST"

hr; echo "20. Exports (JSON / MARKDOWN / PDF + analysis + ETag/304)"
E=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/export" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"format":"JSON","sections":["ARTIFACTS","RELATIONS","VALIDATION"]}')
assert_success "POST export (JSON)" "$E"
EXPORT_ID=$(jget "$E" "data.id")

E_BAD=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/export" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"format":"ZIP"}')
assert_error "POST export (removed ZIP format → VALIDATION_ERROR)" "$E_BAD" "VALIDATION_ERROR"

E_LIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/exports" "${AUTH[@]}")
assert_success "GET projects/:id/exports (list)" "$E_LIST"
ANALYSIS=$(curl -s "$BASE/api/projects/$PROJECT_ID/analysis" "${AUTH[@]}")
assert_success "GET projects/:id/analysis" "$ANALYSIS"
EG=$(curl -s "$BASE/api/exports/$EXPORT_ID" "${AUTH[@]}")
assert_success "GET exports/:id" "$EG"

# Download streams a non-enveloped body — assert on HTTP status + content-type.
DL_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exports/$EXPORT_ID/download" "${AUTH[@]}")
assert_eq "GET exports/:id/download (JSON → 200)" "$DL_CODE" "200"
DL_CT=$(curl -s -o /dev/null -w "%{content_type}" "$BASE/api/exports/$EXPORT_ID/download" "${AUTH[@]}")
case "$DL_CT" in application/json*) green "PASS: download content-type is application/json" ;;
  *) red "FAIL: expected application/json, got '$DL_CT'"; exit 1 ;; esac
# ETag is "{exportId}-{format}"; a matching If-None-Match short-circuits to 304.
NM_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: \"$EXPORT_ID-JSON\"" \
  "$BASE/api/exports/$EXPORT_ID/download" "${AUTH[@]}")
assert_eq "GET exports/:id/download (matching ETag → 304)" "$NM_CODE" "304"

E_MD=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/export" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"format":"MARKDOWN","sections":["ARTIFACTS","RELATIONS"]}')
assert_success "POST export (MARKDOWN)" "$E_MD"
MD_ID=$(jget "$E_MD" "data.id")
MD_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/exports/$MD_ID/download" "${AUTH[@]}")
assert_eq "GET exports/:id/download (MARKDOWN → 200)" "$MD_CODE" "200"

# PDF exercises the deterministic on-demand renderer (pdfmake, no headless browser).
E_PDF=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/export" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"format":"PDF","sections":["ARTIFACTS","DIAGRAMS"]}')
assert_success "POST export (PDF)" "$E_PDF"
PDF_ID=$(jget "$E_PDF" "data.id")
PDF_RES=$(curl -s -o /dev/null -w "%{http_code} %{content_type}" "$BASE/api/exports/$PDF_ID/download" "${AUTH[@]}")
case "$PDF_RES" in "200 application/pdf"*) green "PASS: download PDF → 200 application/pdf" ;;
  *) red "FAIL: expected '200 application/pdf', got '$PDF_RES'"; exit 1 ;; esac

hr; echo "21. SQL ingestion — precise FK (referencesFieldId)"
ING=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/ingestion/draft" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"sourceType":"SQL_SCHEMA","title":"fk smoke"}')
assert_success "POST ingestion/draft (SQL)" "$ING"
ING_ID=$(jget "$ING" "data.id")
# users.id PK; orders.user_id → users(id) (normal); invoices.owner_id → customers(id)
# where customers is declared LATER (forward ref); payments.who → users(ghost_col) (column does NOT exist).
SQL_BODY='{"sql":"CREATE TABLE users ( id uuid PRIMARY KEY, email text );\nCREATE TABLE orders ( id uuid PRIMARY KEY, user_id uuid REFERENCES users(id) );\nCREATE TABLE invoices ( id uuid PRIMARY KEY, owner_id uuid REFERENCES customers(id) );\nCREATE TABLE customers ( id uuid PRIMARY KEY, name text );\nCREATE TABLE payments ( id uuid PRIMARY KEY, who uuid REFERENCES users(ghost_col) );"}'
PARSE=$(curl -s -X POST "$BASE/api/ingestion/$ING_ID/parse-sql-schema" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "$SQL_BODY")
assert_success "POST parse-sql-schema" "$PARSE"
CONF=$(curl -s -X POST "$BASE/api/ingestion/$ING_ID/confirm-sql-schema" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"mode":"CREATE_DATABASE_MODEL","title":"FK Smoke DB","databaseType":"PostgreSQL"}')
assert_success "POST confirm-sql-schema" "$CONF"
SQL_DBM_ID=$(jget "$CONF" "data.databaseModel.id")
ENTS=$(curl -s "$BASE/api/database-models/$SQL_DBM_ID/entities" "${AUTH[@]}")
assert_success "GET database-models/:id/entities (SQL import)" "$ENTS"
node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const ents=JSON.parse(s).data;
    const find=(e,f)=>{const en=ents.find(x=>x.name===e);return en&&en.fields.find(y=>y.name===f);};
    const ord=find("orders","user_id");
    const inv=find("invoices","owner_id");
    const pay=find("payments","who");
    const checks=[
      ["orders.user_id resolves referencesFieldId", !!(ord&&ord.referencesEntityId&&ord.referencesFieldId)],
      ["invoices.owner_id resolves (forward ref)", !!(inv&&inv.referencesEntityId&&inv.referencesFieldId)],
      ["payments.who entity-only (unresolvable column stays NULL)", !!(pay&&pay.referencesEntityId&&!pay.referencesFieldId)],
    ];
    let ok=true; for(const[l,v]of checks){ if(!v){ ok=false; console.error("  FAIL: "+l); } }
    process.exit(ok?0:1);
  });
' <<< "$ENTS"
green "PASS: precise referencesFieldId resolved for normal + forward-ref FKs; NULL for unresolvable column"

hr; echo "22. Ingestion — markdown / openapi / mermaid"
# Markdown: draft → parse → confirm CREATE_NEW.
MD_ING=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/ingestion/draft" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"sourceType":"MARKDOWN","title":"md smoke"}')
assert_success "POST ingestion/draft (MARKDOWN)" "$MD_ING"
MD_ING_ID=$(jget "$MD_ING" "data.id")
MD_PARSE=$(curl -s -X POST "$BASE/api/ingestion/$MD_ING_ID/parse-markdown" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"markdown":"# Imported\nSome documentation body."}')
assert_success "POST parse-markdown" "$MD_PARSE"
MD_CONF=$(curl -s -X POST "$BASE/api/ingestion/$MD_ING_ID/confirm-markdown" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"mode":"CREATE_NEW","artifactTitle":"Imported Markdown Doc","artifactType":"DOCUMENTATION"}')
assert_success "POST confirm-markdown (CREATE_NEW)" "$MD_CONF"

# OpenAPI: build the body via node so the embedded JSON string is escaped correctly.
OAS_INNER='{"openapi":"3.0.0","info":{"title":"Imported API","version":"1.0.0"},"paths":{"/ping":{"get":{"summary":"Ping","responses":{"200":{"description":"OK"}}}}}}'
OAS_ING=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/ingestion/draft" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"sourceType":"OPENAPI_JSON","title":"openapi smoke"}')
assert_success "POST ingestion/draft (OPENAPI_JSON)" "$OAS_ING"
OAS_ING_ID=$(jget "$OAS_ING" "data.id")
OAS_PARSE=$(curl -s -X POST "$BASE/api/ingestion/$OAS_ING_ID/parse-openapi-json" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "$(jbody '{openapiJson: process.argv[1]}' "$OAS_INNER")")
assert_success "POST parse-openapi-json" "$OAS_PARSE"
OAS_CONF=$(curl -s -X POST "$BASE/api/ingestion/$OAS_ING_ID/confirm-openapi-json" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"mode":"CREATE_API_SPEC","baseUrl":"https://api.example.com"}')
assert_success "POST confirm-openapi-json (CREATE_API_SPEC)" "$OAS_CONF"

# Mermaid: draft → parse → confirm CREATE_DIAGRAM.
MM_ING=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/ingestion/draft" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"sourceType":"MERMAID","title":"mermaid smoke"}')
assert_success "POST ingestion/draft (MERMAID)" "$MM_ING"
MM_ING_ID=$(jget "$MM_ING" "data.id")
MM_PARSE=$(curl -s -X POST "$BASE/api/ingestion/$MM_ING_ID/parse-mermaid" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"mermaidSource":"graph TD\n  A[Start]\n  B[End]\n  A --> B"}')
assert_success "POST parse-mermaid" "$MM_PARSE"
MM_CONF=$(curl -s -X POST "$BASE/api/ingestion/$MM_ING_ID/confirm-mermaid" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"mode":"CREATE_DIAGRAM","title":"Imported Mermaid Flow","diagramType":"FLOWCHART"}')
assert_success "POST confirm-mermaid (CREATE_DIAGRAM)" "$MM_CONF"

ING_LIST=$(curl -s "$BASE/api/projects/$PROJECT_ID/ingestion" "${AUTH[@]}")
assert_success "GET projects/:id/ingestion (list)" "$ING_LIST"
ING_GET=$(curl -s "$BASE/api/ingestion/$MD_ING_ID" "${AUTH[@]}")
assert_success "GET ingestion/:id" "$ING_GET"
ING_DEL=$(curl -s -X DELETE "$BASE/api/ingestion/$MD_ING_ID" "${AUTH[@]}")
assert_success "DELETE ingestion/:id (log only, no cascade)" "$ING_DEL"

hr; echo "23. Account deletion (read-only + soft-delete → reactivate cycle)"
DEL_PREVIEW=$(curl -s "$BASE/api/auth/account/deletion-preview" "${AUTH[@]}")
assert_success "GET /auth/account/deletion-preview" "$DEL_PREVIEW"
DEL_STATUS=$(curl -s "$BASE/api/auth/account/deletion-status" "${AUTH[@]}")
assert_success "GET /auth/account/deletion-status" "$DEL_STATUS"
assert_eq "deletion-status pending=false initially" "$(jget "$DEL_STATUS" "data.pending")" "false"

CANCEL_BAD=$(curl -s -X POST "$BASE/api/auth/account/cancel-deletion" \
  -H "Content-Type: application/json" -d '{"token":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}')
assert_error "POST /auth/account/cancel-deletion (fake token → DELETION_NOT_FOUND)" "$CANCEL_BAD" "DELETION_NOT_FOUND"

# Soft-delete cycle on the throwaway test user (the project is solo-owned now that
# the member was removed, so an empty plan validates). Immediately reactivated.
DEL_REQ=$(curl -s -X POST "$BASE/api/auth/account/deletion" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d "{\"password\":\"$PASSWORD\",\"plan\":[]}")
assert_success "POST /auth/account/deletion (soft-delete)" "$DEL_REQ"
DEL_STATUS2=$(curl -s "$BASE/api/auth/account/deletion-status" "${AUTH[@]}")
assert_eq "deletion-status pending=true after request" "$(jget "$DEL_STATUS2" "data.pending")" "true"
REACT=$(curl -s -X POST "$BASE/api/auth/account/reactivate" "${AUTH[@]}" -H "Content-Type: application/json" -d '{}')
assert_success "POST /auth/account/reactivate" "$REACT"
DEL_STATUS3=$(curl -s "$BASE/api/auth/account/deletion-status" "${AUTH[@]}")
assert_eq "deletion-status pending=false after reactivate" "$(jget "$DEL_STATUS3" "data.pending")" "false"

DEL_BADPW=$(curl -s -X POST "$BASE/api/auth/account/deletion" "${AUTH[@]}" \
  -H "Content-Type: application/json" -d '{"password":"definitely-wrong","plan":[]}')
assert_error "POST /auth/account/deletion (wrong password → INVALID_CREDENTIALS)" "$DEL_BADPW" "INVALID_CREDENTIALS"

hr; echo "24. Cleanup — exercise the DELETE routes"
assert_success "DELETE diagrams/:id"        "$(curl -s -X DELETE "$BASE/api/diagrams/$DIAG_ID" "${AUTH[@]}")"
assert_success "DELETE api-endpoints/:id"   "$(curl -s -X DELETE "$BASE/api/api-endpoints/$EP_ID" "${AUTH[@]}")"
assert_success "DELETE api-specs/:id"       "$(curl -s -X DELETE "$BASE/api/api-specs/$SPEC_ID" "${AUTH[@]}")"
assert_success "DELETE database-fields/:id" "$(curl -s -X DELETE "$BASE/api/database-fields/$FLD2_ID" "${AUTH[@]}")"
assert_success "DELETE database-entities/:id" "$(curl -s -X DELETE "$BASE/api/database-entities/$ENT_ID" "${AUTH[@]}")"
assert_success "DELETE database-models/:id" "$(curl -s -X DELETE "$BASE/api/database-models/$DBM_ID" "${AUTH[@]}")"
assert_success "DELETE relations/:id"       "$(curl -s -X DELETE "$BASE/api/relations/$REL_ID" "${AUTH[@]}")"
assert_success "DELETE artifacts/:id"       "$(curl -s -X DELETE "$BASE/api/artifacts/$A3_ID" "${AUTH[@]}")"
DELP=$(curl -s -X DELETE "$BASE/api/projects/$PROJECT_ID" "${AUTH[@]}")
assert_success "DELETE projects/:id (OWNER)" "$DELP"
DELP_404=$(curl -s "$BASE/api/projects/$PROJECT_ID" "${AUTH[@]}")
assert_error "GET deleted project → NOT_FOUND" "$DELP_404" "NOT_FOUND"

hr
green "All API smoke tests passed."
