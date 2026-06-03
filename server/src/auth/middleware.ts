import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { AppContext } from "../context";
import { resolveSession } from "./sessions";
import { toPublicUser, type PublicUser } from "./publicUser";
import { clearSessionCookie } from "./cookies";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

async function authenticate(ctx: AppContext, req: Request, res: Response): Promise<PublicUser | null> {
  const sessionId = req.cookies?.[ctx.config.session.cookieName];
  if (!sessionId) return null;
  const user = await resolveSession(ctx.repos, sessionId);
  if (!user) {
    // Stale/invalid cookie — clear it so the browser stops sending it.
    clearSessionCookie(res, ctx.config);
    return null;
  }
  return toPublicUser(user);
}

export function createAuthMiddleware(ctx: AppContext): {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
} {
  const requireAuth: RequestHandler = async (req, res, next) => {
    const user = await authenticate(ctx, req, res);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    req.user = user;
    next();
  };

  const requireAdmin: RequestHandler = async (req, res, next) => {
    const user = await authenticate(ctx, req, res);
    if (!user) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    if (user.role !== "admin") {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    req.user = user;
    next();
  };

  return { requireAuth, requireAdmin };
}

export type { NextFunction };
