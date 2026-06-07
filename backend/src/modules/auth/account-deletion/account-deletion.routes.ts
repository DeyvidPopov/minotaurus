// Account-deletion routes, mounted at /auth/account. Most require auth; the
// one-click undo (cancel-deletion) is token-authenticated so it works from the
// email link while the user is signed out.
import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.js";
import {
  cancelDeletion,
  deletionPreview,
  deletionStatus,
  downloadExportBundle,
  reactivate,
  requestDeletion,
} from "./account-deletion.controller.js";

export const accountDeletionRouter = Router();

accountDeletionRouter.get("/deletion-preview", requireAuth, deletionPreview);
accountDeletionRouter.get("/deletion-status", requireAuth, deletionStatus);
accountDeletionRouter.post("/deletion", requireAuth, requestDeletion);
accountDeletionRouter.post("/export-bundle", requireAuth, downloadExportBundle);
accountDeletionRouter.post("/reactivate", requireAuth, reactivate);

// Token-authenticated (no bearer) — backs the one-click undo link in the email.
accountDeletionRouter.post("/cancel-deletion", cancelDeletion);
