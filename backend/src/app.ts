// Side-effect import: patches Express's router layer so a rejected promise from
// any async handler is forwarded to `next(err)` and reaches `errorHandler`,
// instead of hanging the request. Must be imported before routers handle
// requests. No controllers/routes change as a result.
import "express-async-errors";
import express from "express";
import cors from "cors";
import { apiRouter } from "./routes.js";
import { errorHandler, notFound } from "./middleware/error.js";

export function createApp() {
  const app = express();

  // Trust proxy is OFF by default so `req.ip` is the real socket peer and a
  // client-supplied X-Forwarded-For can't forge the rate-limit key. Set
  // TRUST_PROXY only when actually behind a known proxy/load balancer:
  //   TRUST_PROXY=true            → trust the left-most XFF (single trusted proxy)
  //   TRUST_PROXY=<n>             → trust n proxy hops
  //   TRUST_PROXY=<ip|cidr,...>   → trust specific proxy addresses
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    const asNumber = Number(trustProxy);
    if (trustProxy === "true") app.set("trust proxy", true);
    else if (Number.isInteger(asNumber)) app.set("trust proxy", asNumber);
    else app.set("trust proxy", trustProxy.split(",").map((s) => s.trim()));
  }

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim())
        : true,
      credentials: true,
    }),
  );

  // Baseline HTTP security headers. Kept dependency-free (the API serves JSON,
  // not HTML, so a full helmet/CSP setup isn't needed here — the Next frontend
  // owns the CSP). HSTS is only meaningful over HTTPS and is gated to production
  // so it never pins a plain-http localhost during development.
  const isProd = (process.env.NODE_ENV || "").toLowerCase() === "production";
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (isProd) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains; preload",
      );
    }
    next();
  });

  app.use(express.json({ limit: "2mb" }));

  app.use("/api", apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
