import { Router } from "express";
import {
  createArtifact,
  deleteArtifact,
  getArtifact,
  listArtifacts,
  updateArtifact,
} from "./artifacts.controller.js";
import {
  getDocumentation,
  getProjectDocumentationOverview,
  putDocumentation,
} from "./documentation.controller.js";

export const projectArtifactsRouter = Router({ mergeParams: true });
projectArtifactsRouter.get("/", listArtifacts);
projectArtifactsRouter.post("/", createArtifact);

export const projectDocumentationRouter = Router({ mergeParams: true });
projectDocumentationRouter.get("/", getProjectDocumentationOverview);

export const artifactsRouter = Router();
artifactsRouter.get("/:artifactId", getArtifact);
artifactsRouter.patch("/:artifactId", updateArtifact);
artifactsRouter.delete("/:artifactId", deleteArtifact);
artifactsRouter.get("/:artifactId/documentation", getDocumentation);
artifactsRouter.put("/:artifactId/documentation", putDocumentation);
