# ChainForge 通用合约源码包 0.1.0

本目录是唯一维护的 ChainForge 合约版本。部署顺序、构造参数和部署后核验以 `config/deployment-plan.json` 为准；源码以 `sources/` 为准。

## 当前范围

- 当前提供 BNB Smart Chain Mainnet（chainId 56）和 BNB Smart Chain Testnet（chainId 97）配置候选。
- 系统名称、代币名和简称在数据库初始化时确认并锁定；用户首次确认部署时，部署页把钱包实际 ChainId 写入 `system_configs`，之后的部署必须匹配该链。对应 `networks/{chainId}.json` 只预填表单默认值。部署者钱包成为 ProjectToken 的初始超管，不使用 `expectedDeployer` 白名单或私钥环境变量。
- `operatorWallet` 映射到新版 `operator`。`launch`、`batchRegistrar`、`pauser` 和 `recoveryWallet` 是不同配置项，必须分别填写。
- `sources/test/MockUSDT.sol` 是公开 mint 的测试支付币。只有 97 配置中的已有支付币地址没有代码，且部署者明确选择时，才可单独部署 MockUSDT 并在本次部署记录中使用新地址。主网禁止此回退。
- 测试夹具、接口合约和 MockUSDT 不属于主部署计划；部署应用不得只扫描 Solidity 文件就决定部署哪些合约。

56 和 97 的网络文件仅保存表单预填候选值；部署前仍需项目方确认支付币、钱包角色、外部合约地址，并在目标链实时核验运行时代码。56 的支付币默认值是 Binance-Peg BSC-USD；请勿仅凭 `USDT` 符号将其理解为 Tether 原生发行的 USD₮。

## 编译

在本目录使用锁文件安装依赖，再执行 `npm run build`。构建使用 package-lock 中锁定的 Hardhat、Solidity 0.8.28 和 OpenZeppelin 5.4.0；构建输出写入本机的 `artifacts/` 与 `cache/`，不作为源码包内容交付。

部署应用在用户确认网络和参数后，从本目录源码编译并读取构建 ABI/bytecode；每笔部署或配置交易由连接的钱包逐笔确认。部署中断时必须保留交易哈希和状态，先核验回执再恢复，不得盲目重复部署。

## 配置和部署结果

- `config/networks/56.json`、`config/networks/97.json`：按链隔离的表单默认值，包括外部依赖、钱包和 Oracle 参数；不包含网络元数据、启用状态或阻断项。
- `config/deployment-plan.json`：合约依赖图、构造参数来源（含安装时确认的 ERC-20 名称和简称）、Pair 检查/创建步骤、模块绑定和部署后核验规则。
- `external-abi/`：供部署预检查询外部 Token、Factory、Router 和 Pair 的 ABI。
- 部署地址、交易哈希、回执、运行时代码指纹和 DApp 交接结果由部署应用按每次部署单独生成到本包之外；本源码包不存放某次部署的静态地址记录。

部署合约不等于业务上线。私募时间、支付币注资、初始流动性、Oracle 采样、奖励充值和开盘属于后续业务操作，必须由授权钱包按业务流程另行确认。

`CHECKSUMS.sha256` 校验本源码包中的源码、配置、依赖锁文件、文档和外部 ABI，不含自身或本机编译输出。校验和只能证明文件与清单一致，不能替代来源核验或安全审计。
