-- 用户端首页内容配置复用 system_configs，不另建内容配置表。
INSERT INTO menus
  (code, name, path, icon, parent_id, sort_order, is_visible, is_active, menu_type, permission_code)
VALUES
  ('content-management', '内容管理', '', 'dashboard_customize', NULL, 30, TRUE, TRUE, 'directory', NULL)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      path = EXCLUDED.path,
      icon = EXCLUDED.icon,
      parent_id = NULL,
      sort_order = EXCLUDED.sort_order,
      is_visible = TRUE,
      is_active = TRUE,
      menu_type = 'directory',
      permission_code = NULL,
      updated_at = NOW();

INSERT INTO menus
  (code, name, path, icon, parent_id, sort_order, is_visible, is_active, menu_type, permission_code)
SELECT item.code, item.name, item.path, item.icon, parent.id, item.sort_order,
       TRUE, TRUE, 'menu', item.permission_code
  FROM (VALUES
    ('carousel-management', '轮播管理', '/carousel', 'view_carousel', 10, 'content:read'),
    ('announcement-management', '公告管理', '/announcements', 'campaign', 20, 'content:read'),
    ('presale-records', '私募记录', '/presale-records', 'receipt_long', 30, 'presale:records:read')
  ) AS item(code, name, path, icon, sort_order, permission_code)
  JOIN menus parent ON parent.code = 'content-management'
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      path = EXCLUDED.path,
      icon = EXCLUDED.icon,
      parent_id = EXCLUDED.parent_id,
      sort_order = EXCLUDED.sort_order,
      is_visible = TRUE,
      is_active = TRUE,
      menu_type = 'menu',
      permission_code = EXCLUDED.permission_code,
      updated_at = NOW();

INSERT INTO menus
  (code, name, path, icon, parent_id, sort_order, is_visible, is_active, menu_type, permission_code)
SELECT item.code, item.name, '', '', parent.id, item.sort_order,
       FALSE, TRUE, 'button', item.permission_code
  FROM (VALUES
    ('carousel-management-update', '编辑轮播', 'content:update', 10, 'carousel-management'),
    ('announcement-management-update', '编辑公告', 'content:update', 10, 'announcement-management')
  ) AS item(code, name, permission_code, sort_order, parent_code)
  JOIN menus parent ON parent.code = item.parent_code
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      parent_id = EXCLUDED.parent_id,
      sort_order = EXCLUDED.sort_order,
      is_visible = FALSE,
      is_active = TRUE,
      menu_type = 'button',
      permission_code = EXCLUDED.permission_code,
      updated_at = NOW();

INSERT INTO schema_migrations (version)
VALUES ('0008_content_management')
ON CONFLICT (version) DO NOTHING;
