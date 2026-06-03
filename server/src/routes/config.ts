import { Router } from "express";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import { getPublicConfig, applySelfUpdate } from "../services/userConfig";

/** Routes for the current user's own configuration. */
export function createConfigRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(ctx);

  router.get("/", requireAuth, async (req, res) => {
    const config = await getPublicConfig(ctx, req.user!.id);
    res.json({ config });
  });

  router.put("/", requireAuth, async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const config = await applySelfUpdate(ctx, req.user!.id, body);
    res.json({ config });
  });

  return router;
}
