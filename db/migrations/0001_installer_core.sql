-- ChainForge 首次安装核心表。新增字段时应同时维护字段注释和表注释。
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(32) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE schema_migrations IS '数据库迁移执行记录';
COMMENT ON COLUMN schema_migrations.version IS '已应用迁移文件版本';
COMMENT ON COLUMN schema_migrations.applied_at IS '迁移成功执行时间';

CREATE TABLE IF NOT EXISTS roles (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE roles IS '管理后台角色';
COMMENT ON COLUMN roles.id IS '角色主键';
COMMENT ON COLUMN roles.code IS '角色唯一编码';
COMMENT ON COLUMN roles.name IS '角色名称';
COMMENT ON COLUMN roles.description IS '角色说明';
COMMENT ON COLUMN roles.permissions IS '角色拥有的权限编码 JSON 数组';
COMMENT ON COLUMN roles.is_active IS '角色是否启用';
COMMENT ON COLUMN roles.created_at IS '记录创建时间';
COMMENT ON COLUMN roles.updated_at IS '记录更新时间';

CREATE TABLE IF NOT EXISTS menus (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(96) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  path VARCHAR(255) NOT NULL DEFAULT '',
  icon VARCHAR(96) NOT NULL DEFAULT '',
  parent_id BIGINT REFERENCES menus(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE menus IS '管理后台菜单';
COMMENT ON COLUMN menus.id IS '菜单主键';
COMMENT ON COLUMN menus.code IS '菜单唯一编码';
COMMENT ON COLUMN menus.name IS '菜单名称';
COMMENT ON COLUMN menus.path IS '前端路由路径';
COMMENT ON COLUMN menus.icon IS '菜单图标名称';
COMMENT ON COLUMN menus.parent_id IS '父菜单主键，顶级菜单为空';
COMMENT ON COLUMN menus.sort_order IS '同级菜单排序值，数值越小越靠前';
COMMENT ON COLUMN menus.is_visible IS '是否在导航中显示';
COMMENT ON COLUMN menus.is_active IS '菜单是否启用';
COMMENT ON COLUMN menus.created_at IS '记录创建时间';
COMMENT ON COLUMN menus.updated_at IS '记录更新时间';

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE admin_users IS '管理后台管理员账号';
COMMENT ON COLUMN admin_users.id IS '管理员主键';
COMMENT ON COLUMN admin_users.username IS '管理员登录名';
COMMENT ON COLUMN admin_users.password_hash IS '管理员密码的加盐哈希值';
COMMENT ON COLUMN admin_users.role_id IS '管理员所属角色主键';
COMMENT ON COLUMN admin_users.is_active IS '管理员账号是否启用';
COMMENT ON COLUMN admin_users.last_login_at IS '最近一次登录时间';
COMMENT ON COLUMN admin_users.created_at IS '记录创建时间';
COMMENT ON COLUMN admin_users.updated_at IS '记录更新时间';

CREATE TABLE IF NOT EXISTS system_configs (
  id BIGSERIAL PRIMARY KEY,
  config_key VARCHAR(128) NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE system_configs IS 'ChainForge 系统配置键值表';
COMMENT ON COLUMN system_configs.id IS '系统配置主键';
COMMENT ON COLUMN system_configs.config_key IS '配置项唯一键，例如 project_id';
COMMENT ON COLUMN system_configs.config_value IS '配置项文本值';
COMMENT ON COLUMN system_configs.description IS '配置项用途说明';
COMMENT ON COLUMN system_configs.updated_at IS '配置项最近更新时间';

INSERT INTO schema_migrations (version)
VALUES ('0001_installer_core')
ON CONFLICT (version) DO NOTHING;
