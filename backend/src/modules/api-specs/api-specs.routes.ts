import { Router } from "express";
import {
  createEndpoint,
  createSpec,
  deleteEndpoint,
  deleteSpec,
  getSpec,
  listEndpoints,
  listSpecs,
  patchEndpoint,
  patchSpec,
} from "./api-specs.controller.js";

export const projectApiSpecsRouter = Router({ mergeParams: true });
projectApiSpecsRouter.get("/", listSpecs);
projectApiSpecsRouter.post("/", createSpec);

export const apiSpecEndpointsRouter = Router({ mergeParams: true });
apiSpecEndpointsRouter.get("/", listEndpoints);
apiSpecEndpointsRouter.post("/", createEndpoint);

export const apiSpecsRouter = Router();
apiSpecsRouter.get("/:apiSpecId", getSpec);
apiSpecsRouter.patch("/:apiSpecId", patchSpec);
apiSpecsRouter.delete("/:apiSpecId", deleteSpec);

export const apiEndpointsRouter = Router();
apiEndpointsRouter.patch("/:endpointId", patchEndpoint);
apiEndpointsRouter.delete("/:endpointId", deleteEndpoint);
