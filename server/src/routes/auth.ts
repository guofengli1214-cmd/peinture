import { Router } from "express";
import { z } from "zod";
import type { AppContext } from "../context";
import { verifyPassword } from "../auth/passwords";
import { createSession, revokeSession } from "../auth/sessions";
import { setSessionCookie, clearSessionCookie } from "../auth/cookies";
import { toPublicUser } from "../auth/publicUser";
import { createAuthMiddleware } from "../auth/middleware";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();
  const { requireAuth } = createAuthMiddleware(ctx);

  router.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const { username, password } = parsed.data;

    const user = await ctx.repos.users.findByUsername(username);
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const { id, expiresAt } = await createSession(ctx.repos, user.id, ctx.config.session.ttlMs, {
      userAgent: req.headers["user-agent"] ?? null,
      ip: req.ip ?? null,
    });
    setSessionCookie(res, ctx.config, id, expiresAt);
    res.json({ user: toPublicUser(user) });
  });

  router.post("/logout", async (req, res) => {
    const sessionId = req.cookies?.[ctx.config.session.cookieName];
    if (sessionId) await revokeSession(ctx.repos, sessionId);
    clearSessionCookie(res, ctx.config);
    res.json({ ok: true });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
