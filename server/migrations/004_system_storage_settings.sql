-- 004_system_storage_settings: one admin-managed storage service for all users

CREATE TABLE IF NOT EXISTS system_storage_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  config_json LONGTEXT NOT NULL,
  secrets_encrypted LONGTEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO system_storage_settings (id, config_json, secrets_encrypted)
VALUES (
  1,
  JSON_OBJECT(
    'storageType', 's3',
    's3Config', JSON_OBJECT(
      'bucket', 'ai-photo-edit-2',
      'region', 'ap-southeast-1',
      'endpoint', 'https://ai-photo-edit-2.s3.ap-southeast-1.qiniucs.com',
      'publicDomain', 'https://aiphotoeditstatic.forevernewbie.com',
      'prefix', 'peinture/'
    ),
    'webdavConfig', JSON_OBJECT(
      'url', '',
      'directory', 'peinture'
    )
  ),
  NULL
);
