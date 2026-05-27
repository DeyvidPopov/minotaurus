import { Router } from "express";
import { getGraph } from "./graph.controller.js";

export const graphRouter = Router({ mergeParams: true });
graphRouter.get("/", getGraph);
