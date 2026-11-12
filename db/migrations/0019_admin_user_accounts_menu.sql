-- 增加管理后台的用户账户列表菜单及只读权限。
INSERT INTO menus (
  code, name, path, icon, parent_id, sort_order, is_visible, is_active,
  menu_type, permission_code
)
SELECT
  'user-accounts', '用户管理', '/user-accounts', 'people', parent.id, 50,
  TRUE, TRUE, 'menu', 'user_accounts:read'
FROM menus parent
WHERE parent.code = 'system-management'
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM menus
     WHERE code = 'user-accounts'
       AND (menu_type <> 'menu' OR path <> '/user-accounts'
            OR permission_code IS DISTINCT FROM 'user_accounts:read')
  ) THEN
    RAISE EXCEPTION '现有用户管理菜单与功能定义冲突，请先核对菜单配置';
  END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('0019_admin_user_accounts_menu')
ON CONFLICT (version) DO NOTHING;
