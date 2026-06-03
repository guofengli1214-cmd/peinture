import type { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import type {
  CreateSessionInput,
  CreateUserInput,
  CreateCustomProviderInput,
  CustomProviderRecord,
  CustomProviderRepository,
  Repositories,
  SessionRecord,
  SessionRepository,
  UpdateCustomProviderInput,
  UpdateUserInput,
  UserRecord,
  UserRepository,
  UserSettingsRecord,
  UserSettingsRepository,
} from "./types";

function mapUser(row: RowDataPacket): UserRecord {
  return {
    id: Number(row.id),
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    displayName: row.display_name ?? null,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class MysqlUserRepository implements UserRepository {
  constructor(private pool: Pool) {}

  async findById(id: number): Promise<UserRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM users WHERE id = ?", [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async list(): Promise<UserRecord[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM users ORDER BY id");
    return rows.map(mapUser);
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    try {
      const [result] = await this.pool.query<ResultSetHeader>(
        "INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)",
        [input.username, input.passwordHash, input.role, input.displayName ?? null],
      );
      const created = await this.findById(result.insertId);
      if (!created) throw new Error("Failed to load created user");
      return created;
    } catch (err) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
        throw new Error("DUPLICATE_USERNAME");
      }
      throw err;
    }
  }

  async update(id: number, patch: UpdateUserInput): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.passwordHash !== undefined) {
      sets.push("password_hash = ?");
      values.push(patch.passwordHash);
    }
    if (patch.role !== undefined) {
      sets.push("role = ?");
      values.push(patch.role);
    }
    if (patch.displayName !== undefined) {
      sets.push("display_name = ?");
      values.push(patch.displayName);
    }
    if (patch.isActive !== undefined) {
      sets.push("is_active = ?");
      values.push(patch.isActive ? 1 : 0);
    }
    if (sets.length === 0) return;
    values.push(id);
    await this.pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, values);
  }

  async delete(id: number): Promise<void> {
    await this.pool.query("DELETE FROM users WHERE id = ?", [id]);
  }

  async count(): Promise<number> {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT COUNT(*) AS c FROM users");
    return Number(rows[0].c);
  }
}

class MysqlSessionRepository implements SessionRepository {
  constructor(private pool: Pool) {}

  async create(input: CreateSessionInput): Promise<void> {
    await this.pool.query(
      "INSERT INTO sessions (id, user_id, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)",
      [input.id, input.userId, input.expiresAt, input.userAgent ?? null, input.ip ?? null],
    );
  }

  async find(id: string): Promise<SessionRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT * FROM sessions WHERE id = ?", [
      id,
    ]);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: Number(row.user_id),
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    };
  }

  async delete(id: string): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE id = ?", [id]);
  }

  async deleteByUser(userId: number): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE user_id = ?", [userId]);
  }

  async deleteExpired(now: Date): Promise<void> {
    await this.pool.query("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  }
}

function mapCustomProvider(row: RowDataPacket): CustomProviderRecord {
  return {
    id: row.id,
    scope: row.scope,
    ownerUserId: row.owner_user_id === null ? null : Number(row.owner_user_id),
    managedBy: row.managed_by,
    name: row.name,
    apiUrl: row.api_url,
    format: row.format,
    modelsJson: row.models_json,
    secretEncrypted: row.secret_encrypted ?? null,
    enabled: !!row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class MysqlCustomProviderRepository implements CustomProviderRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<CustomProviderRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM custom_providers WHERE id = ?",
      [id],
    );
    return rows[0] ? mapCustomProvider(rows[0]) : null;
  }

  async listGlobal(): Promise<CustomProviderRecord[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM custom_providers WHERE scope = 'global' ORDER BY created_at",
    );
    return rows.map(mapCustomProvider);
  }

  async listByOwner(userId: number): Promise<CustomProviderRecord[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM custom_providers WHERE scope = 'user' AND owner_user_id = ? ORDER BY created_at",
      [userId],
    );
    return rows.map(mapCustomProvider);
  }

  async create(input: CreateCustomProviderInput): Promise<CustomProviderRecord> {
    await this.pool.query<ResultSetHeader>(
      `INSERT INTO custom_providers
         (id, scope, owner_user_id, managed_by, name, api_url, format, models_json, secret_encrypted, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.scope,
        input.ownerUserId,
        input.managedBy,
        input.name,
        input.apiUrl,
        input.format,
        input.modelsJson,
        input.secretEncrypted,
        input.enabled ? 1 : 0,
      ],
    );
    const created = await this.findById(input.id);
    if (!created) throw new Error("Failed to load created custom provider");
    return created;
  }

  async update(id: string, patch: UpdateCustomProviderInput): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (patch.name !== undefined) { sets.push("name = ?"); values.push(patch.name); }
    if (patch.apiUrl !== undefined) { sets.push("api_url = ?"); values.push(patch.apiUrl); }
    if (patch.format !== undefined) { sets.push("format = ?"); values.push(patch.format); }
    if (patch.modelsJson !== undefined) { sets.push("models_json = ?"); values.push(patch.modelsJson); }
    if (patch.secretEncrypted !== undefined) { sets.push("secret_encrypted = ?"); values.push(patch.secretEncrypted); }
    if (patch.enabled !== undefined) { sets.push("enabled = ?"); values.push(patch.enabled ? 1 : 0); }
    if (sets.length === 0) return;
    values.push(id);
    await this.pool.query(`UPDATE custom_providers SET ${sets.join(", ")} WHERE id = ?`, values);
  }

  async delete(id: string): Promise<void> {
    await this.pool.query("DELETE FROM custom_providers WHERE id = ?", [id]);
  }
}

class MysqlUserSettingsRepository implements UserSettingsRepository {
  constructor(private pool: Pool) {}

  async get(userId: number): Promise<UserSettingsRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      "SELECT * FROM user_settings WHERE user_id = ?",
      [userId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      userId: Number(row.user_id),
      configJson: row.config_json,
      secretsEncrypted: row.secrets_encrypted ?? null,
      updatedAt: row.updated_at,
    };
  }

  async upsert(userId: number, configJson: string, secretsEncrypted: string | null): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_settings (user_id, config_json, secrets_encrypted)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), secrets_encrypted = VALUES(secrets_encrypted)`,
      [userId, configJson, secretsEncrypted],
    );
  }
}

export function createMysqlRepositories(pool: Pool): Repositories {
  return {
    users: new MysqlUserRepository(pool),
    sessions: new MysqlSessionRepository(pool),
    settings: new MysqlUserSettingsRepository(pool),
    customProviders: new MysqlCustomProviderRepository(pool),
  };
}
