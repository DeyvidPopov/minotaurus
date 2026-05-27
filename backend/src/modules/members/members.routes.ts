import { Router } from "express";
import { addMember, listMembers, removeMember, updateMember } from "./members.controller.js";

export const projectMembersRouter = Router({ mergeParams: true });

projectMembersRouter.get("/", listMembers);
projectMembersRouter.post("/", addMember);
projectMembersRouter.patch("/:memberId", updateMember);
projectMembersRouter.delete("/:memberId", removeMember);
