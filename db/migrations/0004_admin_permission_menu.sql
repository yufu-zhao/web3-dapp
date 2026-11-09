-- 将导航菜单扩展为角色授权使用的目录、页面和页面操作权限树。
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS menu_type VARCHAR(16) NOT NULL DEFAULT 'menu',
  ADD COLUMN IF NOT EXISTS permission_code VARCHAR(96);

COMMENT ON COLUMN menus.menu_type IS '菜单节点类型：directory 目录、menu 页面菜单、button 页面操作权限';
COMMENT ON COLUMN menus.permission_code IS '角色授权使用的权限编码；目录节点为空';

UPDATE menus
   SET menu_type = CASE
         WHEN code = 'system-management' THEN 'directory'
         ELSE 'menu'
       END,
       permission_code = CASE code
         WHEN 'administrators' THEN 'admins:read'
         WHEN 'system-menus' THEN 'menus:read'
         WHEN 'roles' THEN 'roles:read'
         WHEN 'system-settings' THEN 'settings:read'
         ELSE NULL
       END,
       updated_at = NOW()
 WHERE code IN (
   'overview', 'system-management', 'administrators', 'system-menus',
   'roles', 'system-settings'
 );

UPDATE menus
   SET name = '权限菜单', updated_at = NOW()
 WHERE code = 'system-menus' AND name IS DISTINCT FROM '权限菜单';

INSERT INTO menus
  (code, name, path, icon, parent_id, sort_order, is_visible, is_active,
   menu_type, permission_code)
SELECT action.code, action.name, '', '', parent.id, action.sort_order,
       FALSE, TRUE, 'button', action.permission_code
  FROM (VALUES
    ('administrators-create', '新建管理员', 'admins:create', 10, 'administrators'),
    ('administrators-update', '编辑管理员', 'admins:update', 20, 'administrators'),
    ('administrators-delete', '删除管理员', 'admins:delete', 30, 'administrators'),
    ('system-menus-update', '编辑权限菜单', 'menus:update', 10, 'system-menus'),
    ('roles-create', '新建角色', 'roles:create', 10, 'roles'),
    ('roles-update', '编辑角色', 'roles:update', 20, 'roles'),
    ('roles-delete', '删除角色', 'roles:delete', 30, 'roles'),
    ('system-settings-update', '修改系统设置', 'settings:update', 10, 'system-settings')
  ) AS action(code, name, permission_code, sort_order, parent_code)
  JOIN menus parent ON parent.code = action.parent_code
ON CONFLICT (code) DO NOTHING;

-- 旧版“维护”权限拆分为与页面按钮一一对应的操作权限，保留既有授权能力。
UPDATE roles AS role
   SET permissions = (
     SELECT COALESCE(jsonb_agg(mapped.permission ORDER BY mapped.permission), '[]'::jsonb)
       FROM (
         SELECT DISTINCT expanded.permission
           FROM jsonb_array_elements_text(role.permissions) AS old(permission)
           CROSS JOIN LATERAL unnest(
             CASE old.permission
               WHEN 'admins:write' THEN ARRAY['admins:create', 'admins:update', 'admins:delete']
               WHEN 'menus:write' THEN ARRAY['menus:update']
               WHEN 'roles:write' THEN ARRAY['roles:create', 'roles:update', 'roles:delete']
               WHEN 'settings:write' THEN ARRAY['settings:update']
               ELSE ARRAY[old.permission]
             END
           ) AS expanded(permission)
       ) AS mapped
   )
 WHERE role.permissions ?| ARRAY[
   'admins:write', 'menus:write', 'roles:write', 'settings:write'
 ];

INSERT INTO schema_migrations (version)
VALUES ('0004_admin_permission_menu')
ON CONFLICT (version) DO NOTHING;
