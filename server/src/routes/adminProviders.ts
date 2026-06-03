import { Router } from "express";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import {
  listGlobal,
  createGlobalProvider,
  listForUser,
  createForUser,
  adminUpdate,
  adminDelete,
} from "../services/customProviders";
import { providerCreateSchema, providerPatchSchema, sendServiceError } from "./providerSchemas";

/**
 * Admin management of custom providers (all under requireAdmin):
 *   GET/POST   /api/admin/providers                 — global providers
 *   GET/POST   /api/admin/users/:uid/providers      — a user's assigned providers
 *   PATCH/DEL  /api/admin/providers/:pid            — edit/delete ANY provider
 */
export function createAdminProviderRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAdmin } = createAuthMiddleware(ctx);
  router.use(requireAdmin);

  function parseUid(raw: string): number | null {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

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

  router.get("/users/:uid/providers", async (req, res) => {
    const uid = parseUid(req.params.uid);
    if (uid === null || !(await ctx.repos.users.findById(uid))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ providers: await listForUser(ctx, uid) });
  });

  router.post("/users/:uid/providers", async (req, res) => {
    const uid = parseUid(req.params.uid);
    if (uid === null || !(await ctx.repos.users.findById(uid))) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const parsed = providerCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const provider = await createForUser(ctx, uid, parsed.data);
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
