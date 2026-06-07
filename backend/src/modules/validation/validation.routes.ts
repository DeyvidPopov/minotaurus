import { Router } from "express";
import {
  listIssues,
  runValidation,
  updateIssue,
} from "./validation.controller.js";
import { applyQuickFix, previewQuickFix } from "./quick-fix.controller.js";
import { applyRemediation, previewRemediation } from "./relation-remediation.controller.js";

export const projectValidationRouter = Router({ mergeParams: true });
projectValidationRouter.post("/validate", runValidation);
projectValidationRouter.get("/validation-issues", listIssues);

export const validationIssuesRouter = Router();
// Quick Fix Framework (V1): deterministic SAFE fix — preview + apply for a single issue.
// More specific paths before the bare ":issueId" patch route.
validationIssuesRouter.get("/:issueId/quick-fix/preview", previewQuickFix);
validationIssuesRouter.post("/:issueId/quick-fix/apply", applyQuickFix);
// Relation Remediation (V1): REVIEW-required — deterministic candidates + confirmed apply.
validationIssuesRouter.get("/:issueId/remediation/preview", previewRemediation);
validationIssuesRouter.post("/:issueId/remediation/apply", applyRemediation);
validationIssuesRouter.patch("/:issueId", updateIssue);
