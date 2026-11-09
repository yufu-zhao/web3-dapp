-- 私募菜单及链上管理操作由系统维护，并通过角色权限控制入口。
INSERT INTO menus (code, name, path, icon, sort_order, is_visible, is_active, menu_type, permission_code)
VALUES ('presale', '私募', '/presale', 'payments', 20, TRUE, TRUE, 'menu', 'presale:read')
ON CONFLICT (code) DO NOTHING;

-- 遇到已有同名菜单时停止迁移，避免覆盖用户配置或错误归属权限。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM menus
     WHERE code = 'presale'
       AND (menu_type <> 'menu' OR path <> '/presale' OR permission_code IS DISTINCT FROM 'presale:read')
  ) THEN
    RAISE EXCEPTION '现有 presale 菜单与私募功能定义冲突，请先核对菜单配置';
  END IF;
END $$;

INSERT INTO menus (code, name, path, icon, parent_id, sort_order, is_visible, is_active, menu_type, permission_code)
SELECT item.code, item.name, '', '', parent.id, item.sort_order, FALSE, TRUE, 'button', item.permission_code
  FROM menus parent
 CROSS JOIN (VALUES
   ('presale-terms', '设置认购条款', 'presale:terms', 10),
   ('presale-schedule', '设置私募时间', 'presale:schedule', 20),
   ('presale-finalize', '结算当前期', 'presale:finalize', 30)
 ) AS item(code, name, permission_code, sort_order)
 WHERE parent.code = 'presale'
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM menus item
    JOIN (VALUES
      ('presale-terms', 'presale:terms'),
      ('presale-schedule', 'presale:schedule'),
      ('presale-finalize', 'presale:finalize')
    ) AS expected(code, permission_code) ON expected.code = item.code
    WHERE item.menu_type <> 'button'
       OR item.permission_code IS DISTINCT FROM expected.permission_code
       OR item.parent_id IS DISTINCT FROM (SELECT id FROM menus WHERE code = 'presale')
  ) THEN
    RAISE EXCEPTION '现有私募按钮权限与系统定义冲突，请先核对菜单配置';
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES ('0005_admin_presale_menu') ON CONFLICT (version) DO NOTHING;
