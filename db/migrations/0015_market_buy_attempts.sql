-- 记录市价买入从钱包确认到链上回执的完整尝试状态。
CREATE TABLE IF NOT EXISTS market_buy_attempts (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  deployment_id VARCHAR(64) NOT NULL,
  pair_address VARCHAR(42) NOT NULL,
  owner_address VARCHAR(42) NOT NULL,
  payment_token VARCHAR(42) NOT NULL,
  project_token VARCHAR(42) NOT NULL,
  router_address VARCHAR(42) NOT NULL,
  amount_in NUMERIC(78, 0) NOT NULL CHECK (amount_in > 0),
  expected_out NUMERIC(78, 0) NOT NULL CHECK (expected_out > 0),
  min_out NUMERIC(78, 0) NOT NULL CHECK (min_out > 0),
  status VARCHAR(32) NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN ('awaiting_approval', 'approval_pending', 'approval_confirmed', 'swap_pending', 'succeeded', 'failed', 'cancelled')),
  approval_tx_hash VARCHAR(66),
  swap_tx_hash VARCHAR(66),
  error_code VARCHAR(64),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE market_buy_attempts IS '记录用户市价买入意图、授权交易和实际成交回执';
COMMENT ON COLUMN market_buy_attempts.id IS '市价买入尝试记录主键';
COMMENT ON COLUMN market_buy_attempts.chain_id IS '市价买入所属链的 ChainId';
COMMENT ON COLUMN market_buy_attempts.deployment_id IS '市价买入所对应的合约部署标识';
COMMENT ON COLUMN market_buy_attempts.pair_address IS '市价买入使用的交易对合约地址';
COMMENT ON COLUMN market_buy_attempts.owner_address IS '发起市价买入的钱包地址';
COMMENT ON COLUMN market_buy_attempts.payment_token IS '市价买入所使用的支付代币地址';
COMMENT ON COLUMN market_buy_attempts.project_token IS '市价买入所购买的项目代币地址';
COMMENT ON COLUMN market_buy_attempts.router_address IS '市价买入所使用的路由器地址';
COMMENT ON COLUMN market_buy_attempts.amount_in IS '市价买入输入的支付代币数量，最小单位';
COMMENT ON COLUMN market_buy_attempts.expected_out IS '创建买入尝试时的预估项目代币到账数量，最小单位';
COMMENT ON COLUMN market_buy_attempts.min_out IS '市价买入交易签名时要求的最低到账数量，最小单位';
COMMENT ON COLUMN market_buy_attempts.status IS '市价买入当前阶段：等待授权、授权待确认、授权成功、成交待确认、成交成功、失败或已取消';
COMMENT ON COLUMN market_buy_attempts.approval_tx_hash IS '支付代币授权交易哈希';
COMMENT ON COLUMN market_buy_attempts.swap_tx_hash IS '市价买入路由交易哈希';
COMMENT ON COLUMN market_buy_attempts.error_code IS '失败或取消时记录的钱包错误代码或回执错误代码';
COMMENT ON COLUMN market_buy_attempts.error_message IS '失败或取消的可读原因；链上回滚时注明节点未提供具体原因';
COMMENT ON COLUMN market_buy_attempts.created_at IS '市价买入尝试创建时间';
COMMENT ON COLUMN market_buy_attempts.updated_at IS '市价买入尝试状态最近更新时间';

CREATE INDEX IF NOT EXISTS market_buy_attempts_owner_idx
  ON market_buy_attempts (chain_id, pair_address, owner_address, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS market_buy_attempts_approval_tx_idx
  ON market_buy_attempts (chain_id, approval_tx_hash)
  WHERE approval_tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS market_buy_attempts_swap_tx_idx
  ON market_buy_attempts (chain_id, swap_tx_hash)
  WHERE swap_tx_hash IS NOT NULL;
