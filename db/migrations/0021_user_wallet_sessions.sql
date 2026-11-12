-- 为钱包签名登录增加一次性挑战和可撤销会话。
CREATE TABLE IF NOT EXISTS user_login_challenges (
  wallet_address VARCHAR(42) PRIMARY KEY,
  nonce VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE user_login_challenges IS '钱包登录使用的一次性签名挑战';
COMMENT ON COLUMN user_login_challenges.wallet_address IS '登录挑战对应的钱包地址';
COMMENT ON COLUMN user_login_challenges.nonce IS '签名验证的一次性随机数';
COMMENT ON COLUMN user_login_challenges.expires_at IS '登录挑战过期时间';
COMMENT ON COLUMN user_login_challenges.created_at IS '登录挑战创建时间';

CREATE TABLE IF NOT EXISTS user_wallet_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE user_wallet_sessions IS '钱包签名登录后签发的服务端会话';
COMMENT ON COLUMN user_wallet_sessions.token_hash IS '随机会话令牌的 SHA-256 摘要';
COMMENT ON COLUMN user_wallet_sessions.user_id IS '会话所属用户账户';
COMMENT ON COLUMN user_wallet_sessions.expires_at IS '会话失效时间';
COMMENT ON COLUMN user_wallet_sessions.created_at IS '会话创建时间';

INSERT INTO schema_migrations(version) VALUES ('0021_user_wallet_sessions') ON CONFLICT(version) DO NOTHING;
