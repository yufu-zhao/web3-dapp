# FRC DApp 角色与权限

本文件描述本次**待部署源码版本**的权限模型。`DEFAULT_ADMIN_ROLE` 是唯一授权根，拥有全部角色限制操作，并负责授予/撤销其它角色。其它角色按职责拆分；普通用户操作仍按各业务合约规则执行。

## 角色规划

| 角色 | 权限范围 | 初始授权建议 |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | 所有角色限制的管理和运营方法；在抽奖领取合约中可登记批次、暂停和回收资产 | 由部署 `FileResetV2` 的实际交易发送者自动获得；受 `AccessControlDefaultAdminRules` 单一超管和延迟转移规则约束 |
| `OPERATOR_ROLE` | FRC 主 Pair/Oracle 初次配置、销毁倍数、生态钱包提议、预售轮次排期、初始流动性注入、质押日利率 | 部署时输入初始运营钱包 |
| `LAUNCH_ROLE` | 安排开盘、结算预售轮次 | 部署时输入初始开盘管理钱包，可与其它角色钱包分开 |
| `BATCH_REGISTRAR_ROLE` | 登记不可覆盖的抽奖 Merkle-sum 批次 | 部署时输入初始批次登记钱包 |
| `PAUSER_ROLE` | 暂停/恢复抽奖领取及限价单 | 部署时输入初始应急暂停钱包 |

角色 ID 由 `FileResetV2` 的公开常量读取。所有角色的管理员均为 `DEFAULT_ADMIN_ROLE`。`DEFAULT_ADMIN_ROLE` 通过每个模块的授权检查直接获得其余角色权限；授权 `OPERATOR_ROLE` 不会授予超管权限。

## 方法权限

- `FileResetV2`：超管可调用所有角色限制管理方法；`OPERATOR_ROLE` 可调用 `configurePair`、首次 `configureOracle`、`setBurnMultiplier`、`proposeEcosystemWallet`；`LAUNCH_ROLE` 可调用 `scheduleLaunch`。Oracle 已配置后的 `configureOracle` 仅超管可调用。
- `FairSaleV2`：超管可调用全部角色限制方法；操作员可调用 `setRoundTimes`、`setRoundEnd`；超管可调用 `configureSaleTerms`、`proposeProceedsWallet`；超管、操作员或启动角色可调用 `finalize`。
- `StrategicLiquidityVaultV2`：超管可调用全部角色限制方法；操作员可调用 `seedInitialLiquidity`；超管可调用 `proposeFundingWallet`、`unlockStrategic`。`inject` 仅当前 `fundingWallet` 可调用。
- `FRCRewardVault`：超管可调用 `bindStaking`；注资 `fund` 公开；`pay` 仅绑定的 Staking 合约可调用。
- `FRCStaking`：超管可调用全部角色限制方法；操作员可调用 `setDailyRate`；超管可调用 `proposeFeeWallet`。
- `FRCPriceOracleV2`：超管可调用 `configureParameters`；`start`、`sample` 为满足链上条件后任何地址可调用。
- `FRCLimitOrders`：超管或 `PAUSER_ROLE` 可调用 `pause`、`unpause`；普通用户可创建/执行订单，订单所有者可取消，任何人可触发过期退款（退款只发给订单所有者）。
- `USDTPrizeClaimVault`：超管可登记批次、暂停/恢复、回收过期批次和未预留余额、提议更换回收钱包；待接受的新钱包可调用 `acceptRecoveryWallet`；`BATCH_REGISTRAR_ROLE` 可登记批次；`PAUSER_ROLE` 可暂停/恢复；任何人可注资；获奖钱包可领取自己的奖励。

## 抽奖资金回收边界

- 每个批次从登记时间起有固定 365 天领取期；期限内只能按有效证明领取。
- 期限结束后，超管可调用 `recoverExpiredBatch(batchId)`，仅回收该批次剩余预留金额。
- 超管可调用 `recoverUnreserved(amount)`，但金额不得超过合约余额减去所有有效批次预留额。
- 两种回收都只能转入当前 `recoveryWallet`，无任意收款地址参数；要求回收钱包实际到账金额与请求金额一致。
- 超管通过 `proposeRecoveryWallet(next)` 发起更换，待接受地址必须由其本人调用 `acceptRecoveryWallet()` 后生效；提议和完成事件均记录新旧地址。提议不能设置为零地址、金库本身、支付 Token 或角色控制合约。
- 到期回收与暂停状态无关；暂停不能改变批次截止时间，也不能转移资产。
- 钱包变更的 `accept*Wallet` 仍要求待接受的新钱包本人发起，防止管理员替目标钱包完成身份确认。

## 部署状态提示

本 `0.0.1` 包尚未部署。部署交易签名钱包会成为唯一初始 `DEFAULT_ADMIN_ROLE`，因此建议使用预定的多签部署；部署页面会明确展示该地址。部署前需分别输入并核对 `OPERATOR_ROLE`、`LAUNCH_ROLE`、`BATCH_REGISTRAR_ROLE` 和 `PAUSER_ROLE` 的钱包；部署后权限以链上角色读取结果为准。
