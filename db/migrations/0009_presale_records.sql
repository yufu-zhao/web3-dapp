-- 保存经链上回执核验的私募认购事件，供管理端全量检索。
CREATE TABLE IF NOT EXISTS presale_records (
  id BIGSERIAL PRIMARY KEY,
  chain_id BIGINT NOT NULL,
  sale_address VARCHAR(42) NOT NULL,
  transaction_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  block_hash VARCHAR(66) NOT NULL,
  log_index INTEGER NOT NULL,
  buyer_address VARCHAR(42) NOT NULL,
  round_id SMALLINT NOT NULL CHECK (round_id BETWEEN 0 AND 2),
  participant_index NUMERIC(78, 0) NOT NULL,
  payment_amount NUMERIC(78, 0) NOT NULL,
  payment_decimals SMALLINT NOT NULL CHECK (payment_decimals IN (6, 18)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, transaction_hash, log_index)
);
COMMENT ON TABLE presale_records IS '由链上已确认认购事件核验后保存的私募记录';
COMMENT ON COLUMN presale_records.id IS '私募记录主键';
COMMENT ON COLUMN presale_records.chain_id IS '认购交易所在链的 ChainId';
COMMENT ON COLUMN presale_records.sale_address IS '发出认购事件的私募合约地址';
COMMENT ON COLUMN presale_records.transaction_hash IS '认购交易哈希';
COMMENT ON COLUMN presale_records.block_number IS '认购交易所在区块高度';
COMMENT ON COLUMN presale_records.block_hash IS '认购交易所在区块哈希，用于识别链重组';
COMMENT ON COLUMN presale_records.log_index IS '交易回执中认购事件的日志索引';
COMMENT ON COLUMN presale_records.buyer_address IS '实际认购钱包地址';
COMMENT ON COLUMN presale_records.round_id IS '认购期数，0 至 2 分别代表第一至第三期';
COMMENT ON COLUMN presale_records.participant_index IS '该用户在本期内的链上参与序号';
COMMENT ON COLUMN presale_records.payment_amount IS '链上事件记录的原始支付币最小单位数量';
COMMENT ON COLUMN presale_records.payment_decimals IS '认购支付币精度，用于将原始金额格式化为可读单位';
COMMENT ON COLUMN presale_records.created_at IS '记录写入数据库的时间';

CREATE INDEX IF NOT EXISTS presale_records_page_idx
  ON presale_records (block_number DESC, log_index DESC, id DESC);
CREATE INDEX IF NOT EXISTS presale_records_buyer_idx
  ON presale_records (buyer_address, block_number DESC);

INSERT INTO schema_migrations (version)
VALUES ('0009_presale_records')
ON CONFLICT (version) DO NOTHING;
