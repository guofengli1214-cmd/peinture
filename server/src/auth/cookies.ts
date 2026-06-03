import type { Response } from "express";
import type { AppConfig } from "../config";

const cookieBaseOptions = (config: AppConfig) => ({
  httpOnly: true,
  secure: config.session.cookieSecure,
  sameSite: config.session.cookieSameSite,
  path: "/",
});

export function setSessionCookie(
  res: Response,
  config: AppConfig,
  sessionId: string,
  expiresAt: Date,
): void {
  res.cookie(config.session.cookieName, sessionId, {
    ...cookieBaseOptions(config),
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response, config: AppConfig): void {
  res.clearCookie(config.session.cookieName, cookieBaseOptions(config));
}
