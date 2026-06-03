import type { Role, UserRecord } from "../repositories/types";

/** A user shape safe to return to clients (never includes the password hash). */
export interface PublicUser {
  id: number;
  username: string;
  role: Role;
  displayName: string | null;
}

export function toPublicUser(u: UserRecord): PublicUser {
  return { id: u.id, username: u.username, role: u.role, displayName: u.displayName };
}
