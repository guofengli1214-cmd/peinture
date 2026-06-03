import { randomBytes } from "node:crypto";
import type { Repositories, UserRecord } from "../repositories/types";

/** A cryptographically-random, opaque session identifier (32 bytes hex). */
export function generateSessionId(): string {
  return randomBytes(32).toString("hex");
}

export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

export async function createSession(
  repos: Repositories,
  userId: number,
  ttlMs: number,
  meta: SessionMeta = {},
): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + ttlMs);
  await repos.sessions.create({
    id,
    userId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  });
  return { id, expiresAt };
}

/**
 * Resolve a session id to its active user. Returns null (and deletes the row)
 * for expired sessions, and null for unknown / deactivated users.
 */
export async function resolveSession(
  repos: Repositories,
  sessionId: string,
  now: Date = new Date(),
): Promise<UserRecord | null> {
  const session = await repos.sessions.find(sessionId);
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await repos.sessions.delete(sessionId);
    return null;
  }
  const user = await repos.users.findById(session.userId);
  if (!user || !user.isActive) return null;
  return user;
}

export async function revokeSession(repos: Repositories, sessionId: string): Promise<void> {
  await repos.sessions.delete(sessionId);
}

export async function revokeUserSessions(repos: Repositories, userId: number): Promise<void> {
  await repos.sessions.deleteByUser(userId);
}
