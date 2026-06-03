import { Router } from "express";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import { listSelf, createSelfProvider, updateSelf, deleteSelf } from "../services/customProviders";
import { providerCreateSchema, providerPatchSchema, sendServiceError } from "./providerSchemas";

/**
 * Self-service custom providers for the logged-in user.
 *   GET    /api/providers       — globals + admin-assigned + own (with `editable`)
 *   POST   /api/providers       — create one's own (managed_by='self')
 *   PATCH  /api/providers/:id    — edit, only one's own self-managed
 *   DELETE /api/providers/:id    — delete, only one's own self-managed
 */
export function createProviderRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(ctx);
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    res.json({ providers: await listSelf(ctx, req.user!.id) });
  });

  router.post("/", async (req, res) => {
    const parsed = providerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const provider = await createSelfProvider(ctx, req.user!.id, parsed.data);
      res.status(201).json({ provider });
    } catch (err) {
      sendServiceError(res, err);
    }
  });

  router.patch("/:id", async (req, res) => {
    const parsed = providerPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const provider = await updateSelf(ctx, req.user!.id, req.params.id, parsed.data);
      res.json({ provider });
    } catch (err) {
      sendServiceError(res, err);
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      await deleteSelf(ctx, req.user!.id, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      sendServiceError(res, err);
    }
  });

  return router;
}
