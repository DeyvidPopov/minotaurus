import { Router } from "express";
import {
  createDiagram,
  deleteDiagram,
  getDiagram,
  listDiagrams,
  patchDiagram,
} from "./diagrams.controller.js";

export const projectDiagramsRouter = Router({ mergeParams: true });
projectDiagramsRouter.get("/", listDiagrams);
projectDiagramsRouter.post("/", createDiagram);

export const diagramsRouter = Router();
diagramsRouter.get("/:diagramId", getDiagram);
diagramsRouter.patch("/:diagramId", patchDiagram);
diagramsRouter.delete("/:diagramId", deleteDiagram);
