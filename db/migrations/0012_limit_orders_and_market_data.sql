-- 保存用户签名限价单、链上交易事件及执行器的非密钥配置和运行状态。
CREATE TABLE IF NOT EXISTS limit_orders (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  deployment_id VARCHAR(64) NOT NULL,
  contract_address VARCHAR(42) NOT NULL,
  order_hash VARCHAR(66) NOT NULL,
  owner_address VARCHAR(42) NOT NULL,
  is_buy BOOLEAN NOT NULL,
  amount_in NUMERIC(78, 0) NOT NULL CHECK (amount_in > 0),
  min_out NUMERIC(78, 0) NOT NULL CHECK (min_out > 0),
  trigger_price NUMERIC(60, 24) NOT NULL CHECK (trigger_price > 0),
  issued_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  salt NUMERIC(78, 0) NOT NULL,
  signature TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'executed', 'cancelled', 'expired', 'failed')),
  transaction_hash VARCHAR(66),
  block_number BIGINT,
  block_hash VARCHAR(66),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, contract_address, order_hash)
);
COMMENT ON TABLE limit_orders IS '保存经 EIP-712 签名验证的限价单及其链上执行状态';
COMMENT ON COLUMN limit_orders.id IS '限价单记录主键';
COMMENT ON COLUMN limit_orders.chain_id IS '限价单所属链的 ChainId';
COMMENT ON COLUMN limit_orders.deployment_id IS '限价单对应的安装部署记录标识';
COMMENT ON COLUMN limit_orders.contract_address IS '限价单所针对的 TokenLimitOrders 合约地址';
COMMENT ON COLUMN limit_orders.order_hash IS 'EIP-712 订单摘要';
COMMENT ON COLUMN limit_orders.owner_address IS '签署订单的钱包地址';
COMMENT ON COLUMN limit_orders.is_buy IS '是否为买入方向';
COMMENT ON COLUMN limit_orders.amount_in IS '订单输入币数量，最小单位';
COMMENT ON COLUMN limit_orders.min_out IS '订单最低到账数量，最小单位';
COMMENT ON COLUMN limit_orders.trigger_price IS '按项目代币报价币种折算的触发价格';
COMMENT ON COLUMN limit_orders.issued_at IS '用户签名订单时声明的 Unix 秒时间';
COMMENT ON COLUMN limit_orders.expires_at IS '固定 30 分钟有效期的 Unix 秒结束时间';
COMMENT ON COLUMN limit_orders.salt IS '用户签名订单使用的唯一随机数';
COMMENT ON COLUMN limit_orders.signature IS '用户对 EIP-712 订单摘要的签名';
COMMENT ON COLUMN limit_orders.status IS '限价单状态：待执行、已执行、已取消、已过期或执行失败';
COMMENT ON COLUMN limit_orders.transaction_hash IS '执行或取消该订单的链上交易哈希';
COMMENT ON COLUMN limit_orders.block_number IS '最近确认订单状态所在的区块高度';
COMMENT ON COLUMN limit_orders.block_hash IS '最近确认订单状态所在的区块哈希';
COMMENT ON COLUMN limit_orders.last_error IS '最近一次无法执行或核验失败的原因';
COMMENT ON COLUMN limit_orders.attempt_count IS '自动执行器尝试该订单所在批次的次数';
COMMENT ON COLUMN limit_orders.next_attempt_at IS '执行器下次可重试该订单的时间';
COMMENT ON COLUMN limit_orders.created_at IS '订单签名提交到系统的时间';
COMMENT ON COLUMN limit_orders.updated_at IS '订单状态最近更新时间';

CREATE INDEX IF NOT EXISTS limit_orders_pending_idx
  ON limit_orders (chain_id, contract_address, is_buy, trigger_price, next_attempt_at, expires_at, id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS limit_orders_owner_idx
  ON limit_orders (chain_id, contract_address, owner_address, created_at DESC);

CREATE TABLE IF NOT EXISTS dex_trade_events (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  pair_address VARCHAR(42) NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash VARCHAR(66) NOT NULL,
  block_timestamp BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  sender_address VARCHAR(42) NOT NULL,
  amount0_in NUMERIC(78, 0) NOT NULL,
  amount1_in NUMERIC(78, 0) NOT NULL,
  amount0_out NUMERIC(78, 0) NOT NULL,
  amount1_out NUMERIC(78, 0) NOT NULL,
  token_volume NUMERIC(78, 0) NOT NULL,
  payment_volume NUMERIC(78, 0) NOT NULL,
  price NUMERIC(60, 24) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, pair_address, transaction_hash, log_index)
);
COMMENT ON TABLE dex_trade_events IS '按安装绑定交易对索引的 Pancake V2 Swap 事件';
COMMENT ON COLUMN dex_trade_events.id IS '交易事件记录主键';
COMMENT ON COLUMN dex_trade_events.chain_id IS '交易对所在链的 ChainId';
COMMENT ON COLUMN dex_trade_events.pair_address IS '产生交易事件的交易对合约地址';
COMMENT ON COLUMN dex_trade_events.transaction_hash IS '链上交易哈希';
COMMENT ON COLUMN dex_trade_events.block_number IS '事件所在区块高度';
COMMENT ON COLUMN dex_trade_events.block_hash IS '事件所在区块哈希，用于识别链重组';
COMMENT ON COLUMN dex_trade_events.block_timestamp IS '事件所在区块的 Unix 秒时间';
COMMENT ON COLUMN dex_trade_events.log_index IS '交易回执中 Swap 事件的日志索引';
COMMENT ON COLUMN dex_trade_events.sender_address IS '调用交易对 swap 的路由地址';
COMMENT ON COLUMN dex_trade_events.amount0_in IS 'Token0 输入数量，最小单位';
COMMENT ON COLUMN dex_trade_events.amount1_in IS 'Token1 输入数量，最小单位';
COMMENT ON COLUMN dex_trade_events.amount0_out IS 'Token0 输出数量，最小单位';
COMMENT ON COLUMN dex_trade_events.amount1_out IS 'Token1 输出数量，最小单位';
COMMENT ON COLUMN dex_trade_events.token_volume IS '交易涉及的项目代币数量，最小单位';
COMMENT ON COLUMN dex_trade_events.payment_volume IS '交易涉及的报价支付币数量，最小单位';
COMMENT ON COLUMN dex_trade_events.price IS '按支付币/项目代币单位换算的成交价格';
COMMENT ON COLUMN dex_trade_events.created_at IS '索引器写入事件的时间';
CREATE INDEX IF NOT EXISTS dex_trade_events_pair_idx
  ON dex_trade_events (chain_id, pair_address, block_number DESC, log_index DESC);
CREATE INDEX IF NOT EXISTS dex_trade_events_candle_idx
  ON dex_trade_events (chain_id, pair_address, block_timestamp, id);

CREATE TABLE IF NOT EXISTS dex_index_cursors (
  chain_id BIGINT NOT NULL,
  pair_address VARCHAR(42) NOT NULL,
  last_block BIGINT NOT NULL DEFAULT 0,
  last_block_hash VARCHAR(66),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, pair_address)
);
COMMENT ON TABLE dex_index_cursors IS '交易对链上事件索引游标';
COMMENT ON COLUMN dex_index_cursors.chain_id IS '被索引交易对所在链的 ChainId';
COMMENT ON COLUMN dex_index_cursors.pair_address IS '被索引的交易对合约地址';
COMMENT ON COLUMN dex_index_cursors.last_block IS '已索引到的最后区块高度';
COMMENT ON COLUMN dex_index_cursors.last_block_hash IS '最后区块哈希，用于检测链重组';
COMMENT ON COLUMN dex_index_cursors.updated_at IS '索引游标最近更新时间';

CREATE TABLE IF NOT EXISTS limit_order_event_cursors (
  chain_id BIGINT NOT NULL,
  contract_address VARCHAR(42) NOT NULL,
  last_block BIGINT NOT NULL DEFAULT 0,
  last_block_hash VARCHAR(66),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (chain_id, contract_address)
);
COMMENT ON TABLE limit_order_event_cursors IS '限价单合约事件索引游标';
COMMENT ON COLUMN limit_order_event_cursors.chain_id IS '限价单合约所在链的 ChainId';
COMMENT ON COLUMN limit_order_event_cursors.contract_address IS '被索引的限价单合约地址';
COMMENT ON COLUMN limit_order_event_cursors.last_block IS '已索引到的最后区块高度';
COMMENT ON COLUMN limit_order_event_cursors.last_block_hash IS '最后区块哈希，用于检测链重组';
COMMENT ON COLUMN limit_order_event_cursors.updated_at IS '索引游标最近更新时间';

CREATE TABLE IF NOT EXISTS trade_executor_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  slippage_bps INTEGER NOT NULL DEFAULT 100 CHECK (slippage_bps BETWEEN 1 AND 500),
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE trade_executor_settings IS '签名限价单执行参数，不存储执行钱包私钥';
COMMENT ON COLUMN trade_executor_settings.singleton IS '固定为 true 的单行主键';
COMMENT ON COLUMN trade_executor_settings.slippage_bps IS '用户报价允许的滑点基点数，范围 1 至 500';
COMMENT ON COLUMN trade_executor_settings.updated_by IS '最近修改该参数的管理员标识';
COMMENT ON COLUMN trade_executor_settings.updated_at IS '执行参数最近修改时间';
INSERT INTO trade_executor_settings (singleton) VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS trade_executor_heartbeat (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  state VARCHAR(24) NOT NULL DEFAULT 'disabled'
    CHECK (state IN ('disabled', 'ready', 'degraded', 'error')),
  native_balance NUMERIC(78, 0),
  last_attempt_at TIMESTAMPTZ,
  last_transaction_hash VARCHAR(66),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE trade_executor_heartbeat IS '限价单执行器健康状态和公开运行指标';
COMMENT ON COLUMN trade_executor_heartbeat.singleton IS '固定为 true 的单行主键';
COMMENT ON COLUMN trade_executor_heartbeat.state IS '执行器状态：未启用、正常、降级或错误';
COMMENT ON COLUMN trade_executor_heartbeat.native_balance IS '执行钱包的原生币余额，最小单位';
COMMENT ON COLUMN trade_executor_heartbeat.last_attempt_at IS '执行器最近尝试提交交易的时间';
COMMENT ON COLUMN trade_executor_heartbeat.last_transaction_hash IS '最近提交的批量执行交易哈希';
COMMENT ON COLUMN trade_executor_heartbeat.last_error IS '最近一次执行或节点访问错误';
COMMENT ON COLUMN trade_executor_heartbeat.updated_at IS '执行器状态最近更新时间';
INSERT INTO trade_executor_heartbeat (singleton) VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS market_indexer_heartbeat (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  state VARCHAR(24) NOT NULL DEFAULT 'disabled'
    CHECK (state IN ('disabled', 'ready', 'degraded', 'error')),
  last_block BIGINT,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE market_indexer_heartbeat IS '历史行情交易对事件索引状态';
COMMENT ON COLUMN market_indexer_heartbeat.singleton IS '固定为 true 的单行主键';
COMMENT ON COLUMN market_indexer_heartbeat.state IS '索引器状态：未启用、正常、降级或错误';
COMMENT ON COLUMN market_indexer_heartbeat.last_block IS '最近完成索引的区块高度';
COMMENT ON COLUMN market_indexer_heartbeat.last_error IS '最近一次链读取或事件写入错误';
COMMENT ON COLUMN market_indexer_heartbeat.updated_at IS '索引器状态最近更新时间';
INSERT INTO market_indexer_heartbeat (singleton) VALUES (TRUE)
ON CONFLICT (singleton) DO NOTHING;

INSERT INTO schema_migrations (version)
VALUES ('0012_limit_orders_and_market_data')
ON CONFLICT (version) DO NOTHING;
