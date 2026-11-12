-- 用户钱包账户、邀请码关系与一次性注册签名挑战。
CREATE TABLE IF NOT EXISTS user_accounts (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  invitation_code VARCHAR(16) NOT NULL UNIQUE,
  inviter_id BIGINT REFERENCES user_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (inviter_id IS NULL OR inviter_id <> id)
);
COMMENT ON TABLE user_accounts IS '绑定钱包地址的用户账户及邀请关系';
COMMENT ON COLUMN user_accounts.id IS '用户账户主键';
COMMENT ON COLUMN user_accounts.wallet_address IS '经钱包签名验证的小写 EVM 地址';
COMMENT ON COLUMN user_accounts.invitation_code IS '用户专属邀请码';
COMMENT ON COLUMN user_accounts.inviter_id IS '直接邀请该用户的用户主键';
COMMENT ON COLUMN user_accounts.created_at IS '用户注册时间';
CREATE INDEX IF NOT EXISTS user_accounts_inviter_idx ON user_accounts(inviter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_registration_challenges (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  nonce VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE user_registration_challenges IS '钱包用户注册的一次性签名挑战';
COMMENT ON COLUMN user_registration_challenges.id IS '签名挑战主键';
COMMENT ON COLUMN user_registration_challenges.wallet_address IS '挑战目标钱包地址';
COMMENT ON COLUMN user_registration_challenges.nonce IS '一次性随机签名随机数';
COMMENT ON COLUMN user_registration_challenges.expires_at IS '签名挑战过期时间';
COMMENT ON COLUMN user_registration_challenges.created_at IS '签名挑战创建时间';
CREATE INDEX IF NOT EXISTS user_registration_challenges_expiry_idx ON user_registration_challenges(expires_at);

INSERT INTO schema_migrations(version) VALUES ('0018_user_referrals') ON CONFLICT(version) DO NOTHING;
