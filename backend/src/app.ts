import express from "express";
import cors from "cors";
import { apiRouter } from "./routes.js";
import { errorHandler, notFound } from "./middleware/error.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
        : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));

  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
