# DApp 对接与部署流程

## 网络和依赖

目标网络为 BNB Smart Chain Testnet（chainId 97）。部署页面从 `config/networks/97.json` 预填依赖合约、钱包和 Oracle 参数；用户当前提交的表单值才会用于构造参数。支付币精度和外部合约代码部署前必须通过目标链 RPC 复核。

## 角色配置

按 `PERMISSIONS.md` 配置。超管是唯一的角色授权根，建议使用多签；超管具备所有受限操作权限。运营、开盘、抽奖批次登记和暂停职责可分别授予 `OPERATOR_ROLE`、`LAUNCH_ROLE`、`BATCH_REGISTRAR_ROLE`、`PAUSER_ROLE`。部署后从 FileResetV2 读取角色常量，不自行猜测哈希。

## 预售和开盘

新轮次用 `FairSaleV2.setRoundTimes(id,startTime,endTime)` 排期；调整尚未结束的本轮截止时间用 `setRoundEnd(id,timestamp)`。轮次 ID 为 0/1/2，时间使用 Unix 秒。认购用 `commit` 或 `commitWithTerms`，轮次结束后由超管、操作员或开盘角色调用 `finalize(id)`。售满并完成结算后，任何地址可调用 `fundInitialLiquidity()`；超管或操作员调用 `seedInitialLiquidity(minimumLP)`。配置 Pair 和 Oracle 后，满足合约检查才可由超管或开盘角色安排未来开盘时间。

## Oracle、奖励、质押、锁仓和限价单

- Oracle 由超管配置参数；开盘后任何地址可在条件满足时调用 `start()` 和 `sample()`。
- 奖励金库使用 `FRCRewardVault.fund(amount)` 注资，并由超管一次性绑定 Staking。
- 质押使用 `FRCStaking.stake(amount)`；用户自行领取奖励或申请退出。
- 手动锁仓使用 `FRCTimeLock.lock(amount,duration)`，到期后由持有人领取。
- 限价单由 `FRCLimitOrders` 托管；任何人可执行有效订单或触发过期退款，退款只能到订单所有者。超管或暂停角色可以暂停/恢复限价单。

## 抽奖领取金库

部署 `USDTPrizeClaimVault` 时传入支付代币、FileResetV2 角色控制器和初始回收钱包。批次登记由 `BATCH_REGISTRAR_ROLE` 授权，用户可在登记后 365 天内提交 Merkle-sum 证明领取。超管可回收超期批次余额或未预留余额，资金只能转入当前回收钱包。超管可提议更换回收钱包，待接受地址需由其本人调用 `acceptRecoveryWallet()` 后生效。

所有部署地址、角色钱包和签名回执均须以新版本实际交易确认结果为准；本包不包含已部署状态证明。
