import bcrypt from "bcryptjs";
import {
  db,
  persist,
  resetDbForTests,
  type ArtifactRow,
  type RelationRow,
  type ProjectRow,
  type UserRow,
} from "../src/db/json-db.js";
import { newId } from "../src/utils/ids.js";

const DEMO_EMAIL = "deyvid@minotaurus.dev";
const DEMO_PASSWORD = "minotaurus";

async function main() {
  resetDbForTests();
  const state = db();
  const now = new Date().toISOString();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user: UserRow = {
    id: newId(),
    email: DEMO_EMAIL,
    passwordHash,
    firstName: "Deyvid",
    lastName: "Popov",
    role: "ADMIN",
    createdAt: now,
  };
  state.users.push(user);

  const project: ProjectRow = {
    id: newId(),
    name: "Demo Architecture Project",
    description: "Example software architecture workspace",
    ownerId: user.id,
    createdAt: now,
    updatedAt: now,
  };
  state.projects.push(project);

  const auth: ArtifactRow = {
    id: newId(),
    projectId: project.id,
    title: "Authentication Service",
    type: "SERVICE",
    status: "ACTIVE",
    description: "Handles login, registration, and token generation.",
    tags: ["auth", "core"],
    gx: 120,
    gy: 120,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };

  const userDb: ArtifactRow = {
    id: newId(),
    projectId: project.id,
    title: "User Database",
    type: "DATABASE_MODEL",
    status: "ACTIVE",
    description: "Stores user credentials and profiles.",
    tags: ["postgres", "users"],
    gx: 420,
    gy: 220,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };

  const authApi: ArtifactRow = {
    id: newId(),
    projectId: project.id,
    title: "Auth API",
    type: "API_ENDPOINT",
    status: "ACTIVE",
    description: "REST endpoints for login/register.",
    tags: ["rest"],
    gx: 120,
    gy: 320,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };

  const policy: ArtifactRow = {
    id: newId(),
    projectId: project.id,
    title: "JWT Security Policy",
    type: "SECURITY_POLICY",
    status: "ACTIVE",
    description: "Token lifetime, rotation, and signing rules.",
    tags: ["security"],
    gx: 420,
    gy: 420,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };

  state.artifacts.push(auth, userDb, authApi, policy);

  const rel = (
    source: ArtifactRow,
    target: ArtifactRow,
    type: RelationRow["relationType"],
    description: string,
  ): RelationRow => ({
    id: newId(),
    sourceArtifactId: source.id,
    targetArtifactId: target.id,
    relationType: type,
    description,
    createdBy: user.id,
    createdAt: now,
  });

  state.relations.push(
    rel(auth, userDb, "DEPENDS_ON", "Auth service reads/writes user records"),
    rel(authApi, auth, "EXPOSES", "Auth API surfaces the Authentication Service"),
    rel(policy, auth, "SECURES", "JWT policy governs the Auth Service"),
  );

  persist();

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        demoUser: { email: DEMO_EMAIL, password: DEMO_PASSWORD, id: user.id },
        projectId: project.id,
        artifacts: [auth.id, userDb.id, authApi.id, policy.id],
        relations: state.relations.map((r) => r.id),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
