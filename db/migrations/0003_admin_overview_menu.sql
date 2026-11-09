-- 概览是登录后的默认工作台，应显示在管理端主导航中。
INSERT INTO menus (code, name, path, icon, sort_order, is_visible, is_active)
VALUES ('overview', '概览', '/', 'dashboard', 10, TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

UPDATE menus
   SET name = '概览',
       path = '/',
       icon = 'dashboard',
       parent_id = NULL,
       sort_order = 10,
       is_visible = TRUE,
       is_active = TRUE,
       updated_at = NOW()
 WHERE code = 'overview'
   AND (name IS DISTINCT FROM '概览'
        OR path IS DISTINCT FROM '/'
        OR icon IS DISTINCT FROM 'dashboard'
        OR parent_id IS NOT NULL
        OR sort_order IS DISTINCT FROM 10
        OR is_visible IS DISTINCT FROM TRUE
        OR is_active IS DISTINCT FROM TRUE);
