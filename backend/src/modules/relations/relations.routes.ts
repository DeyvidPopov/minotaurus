import { Router } from "express";
import {
  createRelation,
  deleteRelation,
  listRelations,
} from "./relations.controller.js";

export const artifactRelationsRouter = Router({ mergeParams: true });
artifactRelationsRouter.get("/", listRelations);
artifactRelationsRouter.post("/", createRelation);

export const relationsRouter = Router();
relationsRouter.delete("/:relationId", deleteRelation);
