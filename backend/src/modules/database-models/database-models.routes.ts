import { Router } from "express";
import {
  createEntity,
  createField,
  createModel,
  deleteEntity,
  deleteField,
  deleteModel,
  getModel,
  listEntities,
  listModels,
  patchEntity,
  patchField,
  patchModel,
} from "./database-models.controller.js";

export const projectDatabaseModelsRouter = Router({ mergeParams: true });
projectDatabaseModelsRouter.get("/", listModels);
projectDatabaseModelsRouter.post("/", createModel);

export const databaseModelEntitiesRouter = Router({ mergeParams: true });
databaseModelEntitiesRouter.get("/", listEntities);
databaseModelEntitiesRouter.post("/", createEntity);

export const databaseModelsRouter = Router();
databaseModelsRouter.get("/:databaseModelId", getModel);
databaseModelsRouter.patch("/:databaseModelId", patchModel);
databaseModelsRouter.delete("/:databaseModelId", deleteModel);

export const databaseEntityFieldsRouter = Router({ mergeParams: true });
databaseEntityFieldsRouter.post("/", createField);

export const databaseEntitiesRouter = Router();
databaseEntitiesRouter.patch("/:entityId", patchEntity);
databaseEntitiesRouter.delete("/:entityId", deleteEntity);

export const databaseFieldsRouter = Router();
databaseFieldsRouter.patch("/:fieldId", patchField);
databaseFieldsRouter.delete("/:fieldId", deleteField);
