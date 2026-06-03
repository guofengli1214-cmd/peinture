import { PublicUser } from "../types";

/**
 * Auth API client. All calls use `credentials: "include"` so the httpOnly
 * session cookie is sent/received; tokens never live in JS-readable storage.
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Log in with username/password. Resolves to the user, rejects on bad creds. */
export const login = async (
  username: string,
  password: string,
): Promise<PublicUser> => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    let code = "login_failed";
    try {
      const data = await response.json();
      if (data?.error) code = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(code);
  }

  const { user } = await response.json();
  return user as PublicUser;
};

/** End the current session on the server and clear the cookie. */
export const logout = async (): Promise<void> => {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
};

/** Resolve the current session's user, or null if not authenticated. */
export const fetchMe = async (): Promise<PublicUser | null> => {
  const response = await fetch("/api/auth/me", {
    credentials: "include",
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error("session_check_failed");

  const { user } = await response.json();
  return (user as PublicUser) ?? null;
};
