-- 每个数据库代表一个独立系统，只允许保存一套生效合约配置。
CREATE TABLE IF NOT EXISTS runtime_contract_binding (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  chain_id BIGINT NOT NULL CHECK (chain_id > 0),
  deployment_id VARCHAR(64) NOT NULL,
  release_version VARCHAR(64) NOT NULL,
  contracts JSONB NOT NULL,
  pair_address VARCHAR(42) NOT NULL,
  verified_block BIGINT NOT NULL CHECK (verified_block >= 0),
  verified_block_hash VARCHAR(66) NOT NULL,
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE runtime_contract_binding IS '当前系统唯一的已核验链上合约绑定；新系统使用独立数据库';
COMMENT ON COLUMN runtime_contract_binding.singleton IS '固定为 true 的单行主键，确保一个系统只绑定一套合约';
COMMENT ON COLUMN runtime_contract_binding.chain_id IS '绑定合约所在链的 ChainId';
COMMENT ON COLUMN runtime_contract_binding.deployment_id IS '安装器完成部署时生成的部署记录标识';
COMMENT ON COLUMN runtime_contract_binding.release_version IS '安装器核验的合约发布版本';
COMMENT ON COLUMN runtime_contract_binding.contracts IS '本系统合约名称、地址及部署交易摘要的 JSON 映射';
COMMENT ON COLUMN runtime_contract_binding.pair_address IS '部署时核验的主交易对合约地址';
COMMENT ON COLUMN runtime_contract_binding.verified_block IS '执行绑定核验时读取的链上区块高度';
COMMENT ON COLUMN runtime_contract_binding.verified_block_hash IS '核验区块的区块哈希，用于识别链重组';
COMMENT ON COLUMN runtime_contract_binding.bound_at IS '系统完成唯一合约绑定的时间';

INSERT INTO schema_migrations (version) VALUES ('0006_runtime_contract_binding') ON CONFLICT (version) DO NOTHING;
