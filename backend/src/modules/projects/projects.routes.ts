import { Router } from "express";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./projects.controller.js";

export const projectsRouter = Router();

projectsRouter.get("/", listProjects);
projectsRouter.post("/", createProject);
projectsRouter.get("/:projectId", getProject);
projectsRouter.patch("/:projectId", updateProject);
projectsRouter.delete("/:projectId", deleteProject);
