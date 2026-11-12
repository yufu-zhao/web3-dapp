-- 移除已取消的非邀请链接入口配置。
DELETE FROM system_configs
WHERE config_key = 'allow_non_invitation_entry';

INSERT INTO schema_migrations (version)
VALUES ('0017_invite_setting_cleanup')
ON CONFLICT (version) DO NOTHING;
