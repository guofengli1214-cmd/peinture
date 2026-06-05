import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import type { AppContext } from "./context";
import { createAuthRouter } from "./routes/auth";
import { createConfigRouter } from "./routes/config";
import { createAdminRouter } from "./routes/adminUsers";
import { createAdminProviderRouter } from "./routes/adminProviders";
import { createAdminStorageRouter } from "./routes/adminStorage";
import { createStorageRouter } from "./routes/storage";
import { createV1Router } from "./routes/v1";

/**
 * Build the Express app. Route factories from later phases are mounted here.
 * Kept free of `listen()` so tests can drive it directly.
 */
export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "25mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", createAuthRouter(ctx));
  app.use("/api/config", createConfigRouter(ctx));
  app.use("/api/storage", createStorageRouter(ctx));
  app.use("/api/admin", createAdminRouter(ctx));
  app.use("/api/admin", createAdminProviderRouter(ctx));
  app.use("/api/admin", createAdminStorageRouter(ctx));
  app.use("/api/v1", createV1Router(ctx));

  // Unknown API routes -> JSON 404 (must stay last among /api handlers).
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  return app;
}
