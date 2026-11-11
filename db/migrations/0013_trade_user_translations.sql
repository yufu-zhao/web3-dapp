-- 为用户端交易、行情和限价单增加中文基准词条，保留管理员已有译文。
INSERT INTO user_language_translations (language_id, translation_key, translation_value)
SELECT language.id, entry.key, entry.value
FROM user_languages AS language
CROSS JOIN (VALUES
  ('trading_market_title', '实时行情'),
  ('trading_refresh', '刷新'),
  ('trading_market_live', '链上交易中'),
  ('trading_market_not_open', '代币尚未开放交易。'),
  ('trading_loading', '正在加载'),
  ('trading_market_empty', '当前交易对没有流动性'),
  ('trading_24h_high', '24小时最高'),
  ('trading_24h_low', '24小时最低'),
  ('trading_24h_volume', '24小时成交量'),
  ('trading_candles', '根K线'),
  ('trading_no_candles', '暂无K线数据'),
  ('trading_no_candles_hint', '交易数据索引后会显示历史价格走势。'),
  ('trading_candle_chart', '历史K线图'),
  ('trading_market_error', '行情读取失败。'),
  ('trading_chart_error', 'K线读取失败。'),
  ('trading_recent', '最近成交'),
  ('trading_no_trades', '暂无成交记录。'),
  ('trading_trades_error', '成交记录暂不可用。'),
  ('trading_order_title', '交易下单'),
  ('trading_chain', 'Chain ID {chainId}'),
  ('trading_limit_price', '限价'),
  ('trading_market_price', '按当前市场价格'),
  ('trading_amount', '数量'),
  ('trading_available', '可用余额'),
  ('trading_estimated_receive', '预计到账'),
  ('trading_validity', '订单有效期'),
  ('trading_minutes', '分钟'),
  ('trading_connect_wallet', '连接并切换到安装网络后可进行交易。'),
  ('trading_limit_note', '限价单由你签名授权，执行前不会转出代币；订单固定 30 分钟有效，成交与取消状态以链上结果为准。'),
  ('trading_market_note', '市价单会在钱包确认后直接提交到当前绑定的 Pancake V2 交易对。'),
  ('trading_my_orders', '我的限价单'),
  ('trading_cancel', '取消'),
  ('trading_no_orders', '暂无限价单。'),
  ('trading_orders_error', '限价单记录暂不可用。'),
  ('trading_min_receive', '最低到账：'),
  ('trading_status_pending', '等待成交'),
  ('trading_status_executed', '已成交'),
  ('trading_status_cancelled', '已取消'),
  ('trading_status_expired', '已过期'),
  ('trading_status_failed', '执行异常'),
  ('trading_api_error', '服务暂不可用，请稍后重试。'),
  ('trading_unbound', '系统尚未绑定交易合约。'),
  ('trading_approve', '请在钱包确认授权'),
  ('trading_wait_wallet', '请在钱包确认交易'),
  ('trading_sign_order', '请在钱包签署限价单'),
  ('trading_save_order', '正在登记订单'),
  ('trading_market_confirmed', '交易已确认：{hash}'),
  ('trading_order_submitted', '限价单已登记：{hash}'),
  ('trading_cancel_wait', '请在钱包确认取消'),
  ('trading_cancelled', '取消交易已确认。'),
  ('trading_cancel_error', '取消限价单失败。'),
  ('trading_price_required', '请输入有效限价。'),
  ('trading_wallet_changed', '钱包账户或网络已变化，已停止后续操作。')
) AS entry(key, value)
WHERE language.locale = 'zh-CN'
ON CONFLICT (language_id, translation_key) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('0013_trade_user_translations')
ON CONFLICT (version) DO NOTHING;
