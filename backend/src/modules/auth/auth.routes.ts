import { Router } from "express";
import { changePassword, login, me, register, updateMe } from "./auth.controller.js";
import { requireAuth } from "../../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/me", requireAuth, updateMe);
authRouter.post("/change-password", requireAuth, changePassword);
