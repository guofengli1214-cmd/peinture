/**
 * Persistence interfaces. Business logic and routes depend only on these, so
 * they can be unit-tested with the in-memory implementations (repositories/memory.ts)
 * while production uses the MySQL implementations (repositories/mysql.ts).
 */

export type Role = "user" | "admin";

export interface UserRecord {
  id: number;
  username: string;
  passwordHash: string;
  role: Role;
  displayName: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role: Role;
  displayName?: string | null;
}

export interface UpdateUserInput {
  passwordHash?: string;
  role?: Role;
  displayName?: string | null;
  isActive?: boolean;
}

export interface UserRepository {
  findById(id: number): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  list(): Promise<UserRecord[]>;
  create(input: CreateUserInput): Promise<UserRecord>;
  update(id: number, patch: UpdateUserInput): Promise<void>;
  delete(id: number): Promise<void>;
  count(): Promise<number>;
}

export interface SessionRecord {
  id: string;
  userId: number;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateSessionInput {
  id: string;
  userId: number;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

export interface SessionRepository {
  create(input: CreateSessionInput): Promise<void>;
  find(id: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
  deleteByUser(userId: number): Promise<void>;
  deleteExpired(now: Date): Promise<void>;
}

export interface UserSettingsRecord {
  userId: number;
  configJson: string;
  secretsEncrypted: string | null;
  updatedAt: Date;
}

export interface UserSettingsRepository {
  get(userId: number): Promise<UserSettingsRecord | null>;
  upsert(userId: number, configJson: string, secretsEncrypted: string | null): Promise<void>;
}

export type ProviderFormat = "openai" | "claude" | "gemini" | "gradio";
export type ProviderScope = "global" | "user";
export type ProviderManagedBy = "admin" | "self";

export interface CustomProviderRecord {
  id: string;
  scope: ProviderScope;
  ownerUserId: number | null;
  managedBy: ProviderManagedBy;
  name: string;
  apiUrl: string;
  format: ProviderFormat;
  /** JSON string: [{ modelId, name, capabilities: ("image"|"edit"|"text")[] }] */
  modelsJson: string;
  secretEncrypted: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomProviderInput {
  id: string;
  scope: ProviderScope;
  ownerUserId: number | null;
  managedBy: ProviderManagedBy;
  name: string;
  apiUrl: string;
  format: ProviderFormat;
  modelsJson: string;
  secretEncrypted: string | null;
  enabled: boolean;
}

export interface UpdateCustomProviderInput {
  name?: string;
  apiUrl?: string;
  format?: ProviderFormat;
  modelsJson?: string;
  /** undefined = leave unchanged; null = clear; string = replace. */
  secretEncrypted?: string | null;
  enabled?: boolean;
}

export interface CustomProviderRepository {
  findById(id: string): Promise<CustomProviderRecord | null>;
  listGlobal(): Promise<CustomProviderRecord[]>;
  listByOwner(userId: number): Promise<CustomProviderRecord[]>;
  create(input: CreateCustomProviderInput): Promise<CustomProviderRecord>;
  update(id: string, patch: UpdateCustomProviderInput): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface Repositories {
  users: UserRepository;
  sessions: SessionRepository;
  settings: UserSettingsRepository;
  customProviders: CustomProviderRepository;
}
