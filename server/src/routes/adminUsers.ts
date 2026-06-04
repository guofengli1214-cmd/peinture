import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context";
import { createAuthMiddleware } from "../auth/middleware";
import { createUserAccount } from "../services/userAccounts";
import { hashPassword } from "../auth/passwords";
import { revokeUserSessions } from "../auth/sessions";
import type { UserRecord } from "../repositories/types";

function toAdminUserView(u: UserRecord) {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    displayName: u.displayName,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

const createSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
  role: z.enum(["user", "admin"]).optional(),
  displayName: z.string().max(128).nullish(),
});

const patchSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  isActive: z.boolean().optional(),
  displayName: z.string().max(128).nullable().optional(),
  password: z.string().min(1).max(256).optional(),
});

export function createAdminRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAdmin } = createAuthMiddleware(ctx);
  router.use(requireAdmin);

  function parseId(raw: string): number | null {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  router.get("/users", async (_req, res) => {
    const users = await ctx.repos.users.list();
    res.json({ users: users.map(toAdminUserView) });
  });

  router.post("/users", async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    try {
      const user = await createUserAccount(ctx, parsed.data);
      res.status(201).json({ user: toAdminUserView(user) });
    } catch (err) {
      if ((err as Error).message === "DUPLICATE_USERNAME") {
        res.status(409).json({ error: "username_taken" });
        return;
      }
      throw err;
    }
  });

  router.patch("/users/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const target = await ctx.repos.users.findById(id);
    if (!target) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const patch = parsed.data;

    // Guard against self-lockout.
    if (id === req.user!.id && (patch.isActive === false || patch.role === "user")) {
      res.status(400).json({ error: "cannot_demote_or_disable_self" });
      return;
    }

    await ctx.repos.users.update(id, {
      role: patch.role,
      isActive: patch.isActive,
      displayName: patch.displayName,
      passwordHash: patch.password ? await hashPassword(patch.password) : undefined,
    });

    // Revoke sessions when an account is deactivated or its password reset.
    if (patch.isActive === false || patch.password) {
      await revokeUserSessions(ctx.repos, id);
    }

    const updated = await ctx.repos.users.findById(id);
    res.json({ user: updated ? toAdminUserView(updated) : null });
  });

  router.delete("/users/:id", async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    if (id === req.user!.id) {
      res.status(400).json({ error: "cannot_delete_self" });
      return;
    }
    await revokeUserSessions(ctx.repos, id);
    await ctx.repos.users.delete(id);
    res.json({ ok: true });
  });

  return router;
}
