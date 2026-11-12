-- 增加用户管理的编辑/启停操作权限，供角色权限树配置。
INSERT INTO menus (
  code, name, path, icon, parent_id, sort_order, is_visible, is_active,
  menu_type, permission_code
)
SELECT 'user-accounts-update', '编辑与启停用户', '', '', parent.id, 10,
       FALSE, TRUE, 'button', 'user_accounts:update'
  FROM menus parent
 WHERE parent.code = 'user-accounts'
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM menus action
    WHERE action.code = 'user-accounts-update'
      AND (action.menu_type <> 'button'
        OR action.permission_code IS DISTINCT FROM 'user_accounts:update'
        OR action.parent_id IS DISTINCT FROM (SELECT id FROM menus WHERE code = 'user-accounts'))
  ) THEN
    RAISE EXCEPTION '现有用户操作权限与系统定义冲突，请先核对菜单配置';
  END IF;
END $$;

INSERT INTO schema_migrations (version)
VALUES ('0021_admin_user_account_actions')
ON CONFLICT (version) DO NOTHING;
