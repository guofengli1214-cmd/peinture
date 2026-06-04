import { Router } from "express";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import {
  listGlobal,
  createGlobalProvider,
  adminUpdate,
  adminDelete,
} from "../services/customProviders";
import { providerCreateSchema, providerPatchSchema, sendServiceError } from "./providerSchemas";

/**
 * Admin management of GLOBAL custom providers (all under requireAdmin):
 *   GET/POST   /api/admin/providers        — list / create global providers
 *   PATCH/DEL  /api/admin/providers/:pid    — edit / delete any provider by id
 *
 * Per-user provider assignment was removed (unified to global, admin-only).
 */
export function createAdminProviderRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAdmin } = createAuthMiddleware(ctx);
  router.use(requireAdmin);

  router.get("/providers", async (_req, res) => {
    res.json({ providers: await listGlobal(ctx) });
  });

  router.post("/providers", async (req, res) => {
    const parsed = providerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const provider = await createGlobalProvider(ctx, parsed.data);
    res.status(201).json({ provider });
  });

  router.patch("/providers/:pid", async (req, res) => {
    const parsed = providerPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const provider = await adminUpdate(ctx, req.params.pid, parsed.data);
      res.json({ provider });
    } catch (err) {
      sendServiceError(res, err);
    }
  });

  router.delete("/providers/:pid", async (req, res) => {
    await adminDelete(ctx, req.params.pid);
    res.json({ ok: true });
  });

  return router;
}
