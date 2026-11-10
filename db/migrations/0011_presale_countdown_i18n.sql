-- 为已有安装补充私募排期及倒计时的中文基准词条，保留管理员已修改的译文。
INSERT INTO user_language_translations (language_id, translation_key, translation_value)
SELECT id, entry.key, entry.value
FROM user_languages CROSS JOIN (VALUES
  ('presale_scheduled', '即将开始'),
  ('presale_awaiting_finalization', '等待结算'),
  ('presale_starts_at', '本期开始时间'),
  ('presale_starts_in', '距离开始'),
  ('presale_ends_in', '距离结束'),
  ('presale_countdown', '{days}天 {hours}:{minutes}:{seconds}'),
  ('presale_finalization_notice', '本期认购已结束，等待链上结算。')
) AS entry(key, value)
WHERE locale = 'zh-CN'
ON CONFLICT (language_id, translation_key) DO NOTHING;
