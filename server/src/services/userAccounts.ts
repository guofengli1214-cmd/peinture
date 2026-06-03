import { hashPassword } from "../auth/passwords";
import { seedDefaultSettings } from "./userConfig";
import type { AppContext } from "../context";
import type { Role, UserRecord } from "../repositories/types";

export interface CreateAccountInput {
  username: string;
  password: string;
  role?: Role;
  displayName?: string | null;
}

/**
 * Create a user account and seed its default settings. Throws
 * "DUPLICATE_USERNAME" if the username is taken (surfaced from the repository).
 */
export async function createUserAccount(
  ctx: AppContext,
  input: CreateAccountInput,
): Promise<UserRecord> {
  const passwordHash = await hashPassword(input.password);
  const user = await ctx.repos.users.create({
    username: input.username,
    passwordHash,
    role: input.role ?? "user",
    displayName: input.displayName ?? null,
  });
  await seedDefaultSettings(ctx, user.id);
  return user;
}
