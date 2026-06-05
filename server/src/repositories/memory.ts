import type {
  CreateSessionInput,
  CreateUserInput,
  CreateCustomProviderInput,
  CustomProviderRecord,
  CustomProviderRepository,
  Repositories,
  SessionRecord,
  SessionRepository,
  SystemStorageSettingsRecord,
  SystemStorageSettingsRepository,
  UpdateCustomProviderInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
  UserSettingsRecord,
  UserSettingsRepository,
} from "./types";

/**
 * In-memory repositories — used by unit tests and as a no-DB fallback for local
 * experimentation. Not used in production (see repositories/mysql.ts).
 */

class MemoryUserRepository implements UserRepository {
  private rows = new Map<number, UserRecord>();
  private seq = 0;

  async findById(id: number): Promise<UserRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    for (const u of this.rows.values()) {
      if (u.username === username) return u;
    }
    return null;
  }

  async list(): Promise<UserRecord[]> {
    return [...this.rows.values()].sort((a, b) => a.id - b.id);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    for (const u of this.rows.values()) {
      if (u.username === input.username) {
        throw new Error("DUPLICATE_USERNAME");
      }
    }
    const now = new Date();
    const record: UserRecord = {
      id: ++this.seq,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role,
      displayName: input.displayName ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: number, patch: UpdateUserInput): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    if (patch.passwordHash !== undefined) row.passwordHash = patch.passwordHash;
    if (patch.role !== undefined) row.role = patch.role;
    if (patch.displayName !== undefined) row.displayName = patch.displayName;
    if (patch.isActive !== undefined) row.isActive = patch.isActive;
    row.updatedAt = new Date();
  }

  async delete(id: number): Promise<void> {
    this.rows.delete(id);
  }

  async count(): Promise<number> {
    return this.rows.size;
  }
}

class MemorySessionRepository implements SessionRepository {
  private rows = new Map<string, SessionRecord>();

  async create(input: CreateSessionInput): Promise<void> {
    this.rows.set(input.id, {
      id: input.id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      createdAt: new Date(),
    });
  }

  async find(id: string): Promise<SessionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async deleteByUser(userId: number): Promise<void> {
    for (const [id, s] of this.rows) {
      if (s.userId === userId) this.rows.delete(id);
    }
  }

  async deleteExpired(now: Date): Promise<void> {
    for (const [id, s] of this.rows) {
      if (s.expiresAt.getTime() <= now.getTime()) this.rows.delete(id);
    }
  }
}

class MemoryUserSettingsRepository implements UserSettingsRepository {
  private rows = new Map<number, UserSettingsRecord>();

  async get(userId: number): Promise<UserSettingsRecord | null> {
    return this.rows.get(userId) ?? null;
  }

  async upsert(userId: number, configJson: string, secretsEncrypted: string | null): Promise<void> {
    this.rows.set(userId, { userId, configJson, secretsEncrypted, updatedAt: new Date() });
  }
}

class MemorySystemStorageSettingsRepository implements SystemStorageSettingsRepository {
  private row: SystemStorageSettingsRecord | null = null;

  async get(): Promise<SystemStorageSettingsRecord | null> {
    return this.row;
  }

  async upsert(configJson: string, secretsEncrypted: string | null): Promise<void> {
    this.row = { id: 1, configJson, secretsEncrypted, updatedAt: new Date() };
  }
}

class MemoryCustomProviderRepository implements CustomProviderRepository {
  private rows = new Map<string, CustomProviderRecord>();

  async findById(id: string): Promise<CustomProviderRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async findGlobalByName(name: string): Promise<CustomProviderRecord | null> {
    for (const p of this.rows.values()) {
      if (p.scope === "global" && p.name === name) return p;
    }
    return null;
  }

  async listGlobal(): Promise<CustomProviderRecord[]> {
    return [...this.rows.values()].filter((p) => p.scope === "global");
  }

  async listByOwner(userId: number): Promise<CustomProviderRecord[]> {
    return [...this.rows.values()].filter((p) => p.scope === "user" && p.ownerUserId === userId);
  }

  async create(input: CreateCustomProviderInput): Promise<CustomProviderRecord> {
    const now = new Date();
    const record: CustomProviderRecord = { ...input, createdAt: now, updatedAt: now };
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, patch: UpdateCustomProviderInput): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.apiUrl !== undefined) row.apiUrl = patch.apiUrl;
    if (patch.format !== undefined) row.format = patch.format;
    if (patch.modelsJson !== undefined) row.modelsJson = patch.modelsJson;
    if (patch.secretEncrypted !== undefined) row.secretEncrypted = patch.secretEncrypted;
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    row.updatedAt = new Date();
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }
}

export function createMemoryRepositories(): Repositories {
  return {
    users: new MemoryUserRepository(),
    sessions: new MemorySessionRepository(),
    settings: new MemoryUserSettingsRepository(),
    systemStorageSettings: new MemorySystemStorageSettingsRepository(),
    customProviders: new MemoryCustomProviderRepository(),
  };
}
