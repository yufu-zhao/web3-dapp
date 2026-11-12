-- 为钱包用户账户增加资料字段、来源 IP 记录和后台启停状态。
ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS name VARCHAR(128) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS remark TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS registration_ip INET,
  ADD COLUMN IF NOT EXISTS last_login_ip INET,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN user_accounts.name IS '用户在系统中的显示名称';
COMMENT ON COLUMN user_accounts.remark IS '管理员维护的用户备注';
COMMENT ON COLUMN user_accounts.avatar_url IS '用户头像图片地址';
COMMENT ON COLUMN user_accounts.registration_ip IS '用户首次注册时的客户端 IP 地址';
COMMENT ON COLUMN user_accounts.last_login_ip IS '最近一次用户端账户核验时的客户端 IP 地址';
COMMENT ON COLUMN user_accounts.is_active IS '用户账户是否允许进入用户端';

INSERT INTO schema_migrations (version)
VALUES ('0020_user_account_profile_access')
ON CONFLICT (version) DO NOTHING;
