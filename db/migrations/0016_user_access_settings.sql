-- 增加用户端注册邀请码与非邀请链接入口设置，默认均为开启。
-- 兼容早期安装中较短的配置键列，避免新配置键超出 VARCHAR(32)。
ALTER TABLE system_configs
  ALTER COLUMN config_key TYPE VARCHAR(128);

COMMENT ON COLUMN system_configs.config_key IS '配置项唯一键，例如 project_id';

INSERT INTO system_configs (config_key, config_value, description)
VALUES
  (
    'require_invitation_for_registration',
    'true',
    '用户注册是否必须使用邀请码'
  ),
  (
    'allow_non_invitation_entry',
    'true',
    '是否允许通过非邀请链接进入用户端'
  )
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('0016_user_access_settings')
ON CONFLICT (version) DO NOTHING;
