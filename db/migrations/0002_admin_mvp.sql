-- 管理端 MVP 会话、登录失败限制与菜单层级初始化。
CREATE TABLE IF NOT EXISTS admin_sessions (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE admin_sessions IS '管理端登录会话；仅保存会话令牌的 SHA-256 摘要';
COMMENT ON COLUMN admin_sessions.id IS '管理端会话主键';
COMMENT ON COLUMN admin_sessions.admin_user_id IS '所属管理员主键';
COMMENT ON COLUMN admin_sessions.token_hash IS '随机会话令牌的 SHA-256 十六进制摘要';
COMMENT ON COLUMN admin_sessions.expires_at IS '会话到期时间';
COMMENT ON COLUMN admin_sessions.created_at IS '会话创建时间';

CREATE INDEX IF NOT EXISTS admin_sessions_user_expiry_idx
  ON admin_sessions (admin_user_id, expires_at);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  attempt_key VARCHAR(64) PRIMARY KEY,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE admin_login_attempts IS '管理端登录失败窗口计数；键为用户名与来源地址的摘要';
COMMENT ON COLUMN admin_login_attempts.attempt_key IS '用户名与来源地址组合的 SHA-256 摘要';
COMMENT ON COLUMN admin_login_attempts.failure_count IS '当前失败窗口中的登录失败次数';
COMMENT ON COLUMN admin_login_attempts.window_started_at IS '当前失败计数窗口起始时间';
COMMENT ON COLUMN admin_login_attempts.locked_until IS '登录失败达到阈值后的临时锁定截止时间';
COMMENT ON COLUMN admin_login_attempts.updated_at IS '登录失败计数最近更新时间';

INSERT INTO schema_migrations (version)
VALUES ('0002_admin_mvp')
ON CONFLICT (version) DO NOTHING;

INSERT INTO menus (code, name, path, icon, sort_order, is_visible, is_active)
VALUES ('system-management', '系统管理', '', 'settings', 10, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

WITH system_parent AS (
  SELECT id FROM menus WHERE code = 'system-management'
)
INSERT INTO menus (code, name, path, icon, parent_id, sort_order, is_visible, is_active)
SELECT child.code, child.name, child.path, child.icon, system_parent.id,
       child.sort_order, TRUE, TRUE
  FROM system_parent
 CROSS JOIN (VALUES
   ('administrators', '管理员', '/administrators', 'admin_panel_settings', 10),
   ('system-menus', '系统菜单', '/menus', 'account_tree', 20),
   ('roles', '角色', '/roles', 'badge', 30),
   ('system-settings', '系统设置', '/settings', 'tune', 40)
 ) AS child(code, name, path, icon, sort_order)
ON CONFLICT (code) DO NOTHING;

UPDATE menus
   SET parent_id = (SELECT id FROM menus WHERE code = 'system-management'),
       sort_order = CASE code
         WHEN 'administrators' THEN 10
         WHEN 'system-menus' THEN 20
         WHEN 'roles' THEN 30
         WHEN 'system-settings' THEN 40
       END,
       updated_at = NOW()
 WHERE code IN ('administrators', 'system-menus', 'roles', 'system-settings')
   AND (parent_id IS DISTINCT FROM
        (SELECT id FROM menus WHERE code = 'system-management'));

UPDATE menus
   SET is_visible = FALSE, updated_at = NOW()
 WHERE code = 'overview' AND is_visible = TRUE;
