import { AdminUser, UserRole, ServerPublicConfig, ProviderId } from "../types";

/**
 * Admin API client for /api/admin/*. All calls send the session cookie and
 * require the caller to be an admin (enforced server-side). User secrets are
 * never returned — config responses carry only hasTokens flags.
 */

const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseError(response: Response, fallback: string): Promise<never> {
  let code = fallback;
  try {
    const data = await response.json();
    if (data?.error) code = data.error;
  } catch {
    /* non-JSON body */
  }
  throw new Error(code);
}

export interface CreateUserInput {
  username: string;
  password: string;
  role?: UserRole;
  displayName?: string | null;
}

export interface UpdateUserInput {
  role?: UserRole;
  isActive?: boolean;
  displayName?: string | null;
  password?: string;
}

/** Admin config patch: any config field, plus tokens/custom-provider tokens. */
export interface AdminConfigPatch {
  tokens?: Partial<Record<ProviderId, string | string[]>>;
  openaiConfig?: { apiUrl: string; modelId: string };
  googleConfig?: { apiUrl: string; modelId: string };
  serviceMode?: string;
  [key: string]: unknown;
}

export const listUsers = async (): Promise<AdminUser[]> => {
  const response = await fetch("/api/admin/users", { credentials: "include" });
  if (!response.ok) await parseError(response, "list_users_failed");
  const { users } = await response.json();
  return users as AdminUser[];
};

export const createUser = async (input: CreateUserInput): Promise<AdminUser> => {
  const response = await fetch("/api/admin/users", {
    method: "POST",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  if (!response.ok) await parseError(response, "create_user_failed");
  const { user } = await response.json();
  return user as AdminUser;
};

export const updateUser = async (
  id: number,
  patch: UpdateUserInput,
): Promise<AdminUser> => {
  const response = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  if (!response.ok) await parseError(response, "update_user_failed");
  const { user } = await response.json();
  return user as AdminUser;
};

export const deleteUser = async (id: number): Promise<void> => {
  const response = await fetch(`/api/admin/users/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) await parseError(response, "delete_user_failed");
};

export const getUserConfig = async (id: number): Promise<ServerPublicConfig> => {
  const response = await fetch(`/api/admin/users/${id}/config`, {
    credentials: "include",
  });
  if (!response.ok) await parseError(response, "get_config_failed");
  const { config } = await response.json();
  return config as ServerPublicConfig;
};

export const updateUserConfig = async (
  id: number,
  patch: AdminConfigPatch,
): Promise<ServerPublicConfig> => {
  const response = await fetch(`/api/admin/users/${id}/config`, {
    method: "PUT",
    credentials: "include",
    headers: JSON_HEADERS,
    body: JSON.stringify(patch),
  });
  if (!response.ok) await parseError(response, "update_config_failed");
  const { config } = await response.json();
  return config as ServerPublicConfig;
};
