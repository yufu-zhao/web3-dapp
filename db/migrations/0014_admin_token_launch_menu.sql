-- 增加代币发行/开盘状态页及可分配给角色的链上操作权限。
INSERT INTO menus (
  code, name, path, icon, parent_id, sort_order, is_visible, is_active,
  menu_type, permission_code
)
VALUES (
  'token-launch', '代币发行 / 开盘', '/launch', 'rocket_launch', NULL, 30,
  TRUE, TRUE, 'menu', 'launch:read'
)
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM menus
     WHERE code = 'token-launch'
       AND (menu_type <> 'menu' OR path <> '/launch'
            OR permission_code IS DISTINCT FROM 'launch:read')
  ) THEN
    RAISE EXCEPTION '现有代币发行菜单与功能定义冲突，请先核对菜单配置';
  END IF;
END $$;

INSERT INTO menus (
  code, name, path, icon, parent_id, sort_order, is_visible, is_active,
  menu_type, permission_code
)
SELECT action.code, action.name, '', '', parent.id, action.sort_order,
       FALSE, TRUE, 'button', action.permission_code
  FROM menus parent
 CROSS JOIN (VALUES
   ('token-launch-fund', '划转私募募集款', 'launch:fund', 10),
   ('token-launch-seed', '注入初始流动性', 'launch:seed', 20),
   ('token-launch-schedule', '安排代币开盘', 'launch:schedule', 30),
   ('token-launch-oracle', '启动开盘价格监控', 'launch:oracle', 40)
 ) AS action(code, name, permission_code, sort_order)
 WHERE parent.code = 'token-launch'
ON CONFLICT (code) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM menus action
    JOIN (VALUES
      ('token-launch-fund', 'launch:fund'),
      ('token-launch-seed', 'launch:seed'),
      ('token-launch-schedule', 'launch:schedule'),
      ('token-launch-oracle', 'launch:oracle')
    ) AS expected(code, permission_code) ON expected.code = action.code
    WHERE action.menu_type <> 'button'
       OR action.permission_code IS DISTINCT FROM expected.permission_code
       OR action.parent_id IS DISTINCT FROM (SELECT id FROM menus WHERE code = 'token-launch')
  ) THEN
    RAISE EXCEPTION '现有发行/开盘按钮权限与系统定义冲突，请先核对菜单配置';
  END IF;
END $$;

-- 能查看私募状态的角色默认获得发行/开盘状态页入口；链上操作权限仍需单独分配。
UPDATE roles
   SET permissions = (
     SELECT jsonb_agg(permission ORDER BY permission)
       FROM (
         SELECT DISTINCT jsonb_array_elements_text(roles.permissions) AS permission
         UNION ALL SELECT 'launch:read'
       ) AS permissions
   ),
       updated_at = NOW()
 WHERE roles.permissions ? 'presale:read'
   AND NOT (roles.permissions ? 'launch:read');

INSERT INTO schema_migrations (version)
VALUES ('0014_admin_token_launch_menu')
ON CONFLICT (version) DO NOTHING;
