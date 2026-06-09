#!/usr/bin/env bash
# scripts/test-api.sh — smoke-tests the Minotaurus backend.
# Requires: curl + node (uses node for JSON parsing so jq is not needed).
# Backend must be running on $BASE (default http://localhost:4000).

set -euo pipefail

BASE="${BASE:-http://localhost:4000}"
EMAIL="${TEST_EMAIL:-tester+$(date +%s)@minotaurus.dev}"
PASSWORD="${TEST_PASSWORD:-supersecret}"

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
hr()    { printf -- "----------------------------------------\n"; }

need() { command -v "$1" >/dev/null 2>&1 || { red "missing dependency: $1"; exit 1; }; }
need curl
need node

# jget <json> <dot.path>  — read a value from JSON via node
jget() {
  node -e "
    let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{
      const o=JSON.parse(s);
      const v='$2'.split('.').reduce((a,k)=>a==null?a:a[k],o);
      process.stdout.write(v==null?'':String(v));
    });
  " <<< "$1"
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
# Asserts the response is an error envelope with the given error.code.
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

hr; echo "1. Health"
H=$(curl -s "$BASE/api/health")
assert_success "GET /api/health" "$H"

hr; echo "2. Register ($EMAIL)"
R=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"firstName\":\"Test\",\"lastName\":\"User\"}")
assert_success "POST /api/auth/register" "$R"
TOKEN=$(jget "$R" "data.token")

hr; echo "2b. Multi-step registration (start / verify / resend wiring)"
# The verification code is intentionally never returned (only logged in dev), so
# this smoke pass exercises wiring + safe-failure paths, not the full happy path
# (that is covered deterministically by registration.service.test.ts).
RS_EMAIL="wizard+$(date +%s)@minotaurus.dev"
RS=$(curl -s -X POST "$BASE/api/auth/register/start" \
  -H "Content-Type: application/json" \
  -d "{\"firstName\":\"Wiz\",\"lastName\":\"Ard\",\"email\":\"$RS_EMAIL\"}")
assert_success "POST /api/auth/register/start" "$RS"

# Already-registered (completed) email is blocked at start so the user isn't sent
# to verify a code that will never arrive.
RS_DUP=$(curl -s -X POST "$BASE/api/auth/register/start" \
  -H "Content-Type: application/json" \
  -d "{\"firstName\":\"Test\",\"lastName\":\"User\",\"email\":\"$EMAIL\"}")
assert_error "POST /api/auth/register/start (existing email blocked)" "$RS_DUP" "EMAIL_TAKEN"

# Wrong code → INVALID_CODE.
RV=$(curl -s -X POST "$BASE/api/auth/register/verify" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RS_EMAIL\",\"code\":\"000000\"}")
assert_error "POST /api/auth/register/verify (wrong code)" "$RV" "INVALID_CODE"

# Immediate resend → blocked by the 30s cooldown.
RR=$(curl -s -X POST "$BASE/api/auth/register/resend" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$RS_EMAIL\"}")
assert_error "POST /api/auth/register/resend (cooldown)" "$RR" "RESEND_COOLDOWN"

# Missing fields → VALIDATION_ERROR.
RVAL=$(curl -s -X POST "$BASE/api/auth/register/start" \
  -H "Content-Type: application/json" -d '{"email":"not-an-email"}')
assert_error "POST /api/auth/register/start (bad body)" "$RVAL" "VALIDATION_ERROR"

hr; echo "3. Login"
L=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
assert_success "POST /api/auth/login" "$L"
TOKEN=$(jget "$L" "data.token")

AUTH=("-H" "Authorization: Bearer $TOKEN")

hr; echo "4. Create project"
P=$(curl -s -X POST "$BASE/api/projects" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Project","description":"Auto-generated"}')
assert_success "POST /api/projects" "$P"
PROJECT_ID=$(jget "$P" "data.id")

hr; echo "5. Create artifacts"
A1=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/artifacts" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"Auth Service","type":"SERVICE","status":"ACTIVE","description":"Handles auth"}')
assert_success "POST /api/projects/:id/artifacts (Auth Service)" "$A1"
A1_ID=$(jget "$A1" "data.id")

A2=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/artifacts" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"title":"User DB","type":"DATABASE_MODEL","status":"ACTIVE","description":"User store"}')
assert_success "POST /api/projects/:id/artifacts (User DB)" "$A2"
A2_ID=$(jget "$A2" "data.id")

hr; echo "6. Create relation"
REL=$(curl -s -X POST "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A2_ID\",\"relationType\":\"DEPENDS_ON\",\"description\":\"auth depends on user db\"}")
assert_success "POST /api/artifacts/:id/relations" "$REL"
REL_ID=$(jget "$REL" "data.id")

# DB-enforced edge uniqueness (source, target, type). The exact same edge is rejected…
REL_DUP=$(curl -s -X POST "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A2_ID\",\"relationType\":\"DEPENDS_ON\",\"description\":\"dup\"}")
assert_error "POST duplicate relation → 409 RELATION_EXISTS" "$REL_DUP" "RELATION_EXISTS"

# …but the same pair with a different relationType is a distinct, allowed edge…
REL_TYPE=$(curl -s -X POST "$BASE/api/artifacts/$A1_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A2_ID\",\"relationType\":\"USES\",\"description\":\"different type\"}")
assert_success "POST same pair, different relationType (allowed)" "$REL_TYPE"

# …and the reversed direction is also a distinct, allowed edge.
REL_REV=$(curl -s -X POST "$BASE/api/artifacts/$A2_ID/relations" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d "{\"targetArtifactId\":\"$A1_ID\",\"relationType\":\"DEPENDS_ON\",\"description\":\"reversed direction\"}")
assert_success "POST reversed direction (allowed)" "$REL_REV"

hr; echo "7. Fetch graph"
G=$(curl -s "$BASE/api/projects/$PROJECT_ID/graph" "${AUTH[@]}")
assert_success "GET /api/projects/:id/graph" "$G"

hr; echo "8. Run validation"
V=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/validate" "${AUTH[@]}")
assert_success "POST /api/projects/:id/validate" "$V"
ISSUE_COUNT=$(jget "$V" "data.issueCount")
green "  issueCount=$ISSUE_COUNT"

hr; echo "9. Fetch validation issues"
VI=$(curl -s "$BASE/api/projects/$PROJECT_ID/validation-issues" "${AUTH[@]}")
assert_success "GET /api/projects/:id/validation-issues" "$VI"

hr; echo "10. Create export"
E=$(curl -s -X POST "$BASE/api/projects/$PROJECT_ID/export" "${AUTH[@]}" \
  -H "Content-Type: application/json" \
  -d '{"format":"JSON","sections":["ARTIFACTS","RELATIONS","VALIDATION"]}')
assert_success "POST /api/projects/:id/export" "$E"
EXPORT_ID=$(jget "$E" "data.id")

hr; echo "11. Fetch export"
EG=$(curl -s "$BASE/api/exports/$EXPORT_ID" "${AUTH[@]}")
assert_success "GET /api/exports/:id" "$EG"

hr; echo "12. SQL ingestion — precise FK (referencesFieldId)"
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
DBM_ID=$(jget "$CONF" "data.databaseModel.id")
ENTS=$(curl -s "$BASE/api/database-models/$DBM_ID/entities" "${AUTH[@]}")
assert_success "GET database-models/:id/entities" "$ENTS"
# Normal + forward-ref FKs resolve referencesFieldId; the unresolvable column stays NULL.
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

hr
green "All API smoke tests passed."
