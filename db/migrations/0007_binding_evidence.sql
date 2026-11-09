-- 旧版部署归档没有保存最终核验区块；新部署会写入证据，旧部署回填时保留为空。
ALTER TABLE runtime_contract_binding
  ALTER COLUMN verified_block DROP NOT NULL,
  ALTER COLUMN verified_block_hash DROP NOT NULL;

COMMENT ON COLUMN runtime_contract_binding.verified_block IS '执行绑定核验时读取的链上区块高度；旧版归档回填时为空';
COMMENT ON COLUMN runtime_contract_binding.verified_block_hash IS '核验区块的区块哈希，用于识别链重组；旧版归档回填时为空';

INSERT INTO schema_migrations (version)
VALUES ('0007_binding_evidence')
ON CONFLICT (version) DO NOTHING;
