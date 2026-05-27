import { Router } from "express";
import {
  listIssues,
  runValidation,
  updateIssue,
} from "./validation.controller.js";

export const projectValidationRouter = Router({ mergeParams: true });
projectValidationRouter.post("/validate", runValidation);
projectValidationRouter.get("/validation-issues", listIssues);

export const validationIssuesRouter = Router();
validationIssuesRouter.patch("/:issueId", updateIssue);
