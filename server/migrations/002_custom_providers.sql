-- 002_custom_providers: user-defined / relay API endpoints (OpenAI / Claude / Gemini formats)
--
-- scope='global'  -> shared by all users, owner_user_id NULL, managed_by='admin'
-- scope='user'    -> owned by owner_user_id; managed_by='admin' (admin-assigned, read-only to the user)
--                    or 'self' (user-created, the user may edit/delete it)

CREATE TABLE IF NOT EXISTS custom_providers (
  id CHAR(36) NOT NULL PRIMARY KEY,
  scope ENUM('global','user') NOT NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  managed_by ENUM('admin','self') NOT NULL,
  name VARCHAR(128) NOT NULL,
  api_url VARCHAR(1024) NOT NULL,
  format ENUM('openai','claude','gemini') NOT NULL,
  models_json LONGTEXT NOT NULL,
  secret_encrypted LONGTEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_custom_providers_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_custom_providers_scope (scope),
  INDEX idx_custom_providers_owner (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
