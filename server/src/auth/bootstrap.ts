import { createUserAccount } from "../services/userAccounts";
import type { AppContext } from "../context";
import type { UserRecord } from "../repositories/types";

/**
 * Create the first admin account from ADMIN_USERNAME / ADMIN_PASSWORD when the
 * users table is empty. No-op once any user exists, or if no password is set.
 */
export async function bootstrapAdmin(ctx: AppContext): Promise<UserRecord | null> {
  const { username, password } = ctx.config.admin;
  if (!password) return null;
  if ((await ctx.repos.users.count()) > 0) return null;

  const user = await createUserAccount(ctx, { username, password, role: "admin" });
  // eslint-disable-next-line no-console
  console.log(`[bootstrap] created initial admin user "${username}"`);
  return user;
}
