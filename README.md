# FileReset

FileReset 使用 pnpm workspace 管理用户端、管理后台、可视化安装器、业务 API、安装器服务和共享包。

## 技术结构

- 用户端、管理后台和安装器：Vue 3、TypeScript、Quasar、Vite。
- 业务 API：NestJS 12、Fastify 5；索引任务作为 API 服务包中的独立命令入口。
- 安装器服务：NestJS、Fastify、PostgreSQL；安装器可连接数据库、初始化核心表并创建首位管理员。
- 共享类型与公共链工具：packages/shared-types 和 packages/public-chain。
- 共用钱包连接组件：packages/wallet-connect；WalletConnect 仅在数据库 system_configs 中配置 project_id 后显示。
- Solidity 合约交接资料位于 contracts，不属于本次 workspace 构建范围。

当前只实现安装器 MVP。用户端、管理后台和业务 API 的业务能力仍待开发。

## 环境

- Node.js 22.22.0 或更新的 Node 22 版本。
- pnpm 11.6.0。
- 复制根目录 `.env.example` 为 `.env`，按需填写数据库连接、前端端口、服务监听地址和 CORS 来源。安装器初始化后会尝试将数据库连接串以仅当前用户可读的权限写入根目录 `.env`。
- 根脚本不会自动加载 `.env`；启动前在当前终端导出配置：`set -a; source .env; set +a`，之后再运行 `pnpm dev` 或单独的 `pnpm dev:*` 命令。

安装依赖：

    pnpm install

## 开发

根目录 pnpm dev 会同时启动用户端、管理后台、安装器、业务 API 和安装器服务。索引任务不随默认开发命令启动。

可单独启动：

- pnpm dev:user
- pnpm dev:admin
- pnpm dev:installer-ui
- pnpm dev:api
- pnpm dev:installer-service
- pnpm dev:indexer

前端默认端口依次为 5675、5676、5677，可通过 `USER_PORT`、`ADMIN_PORT`、`INSTALLER_UI_PORT` 调整；API 和安装器服务默认端口为 3610、3611，可通过 `API_PORT`、`INSTALLER_SERVICE_PORT` 和对应的 `*_HOST` 变量调整监听地址。服务按 `CORS_ORIGINS` 中的逗号分隔来源启用跨域；单独运行服务时仍兼容 `PORT` 和 `HOST`。

索引任务目前只验证独立 NestJS 应用上下文的启动与正常退出，不读取链上事件。

## 构建和运行服务

- pnpm build 会清理根 dist 后构建所有 workspace 包。
- pnpm build:user、pnpm build:admin、pnpm build:installer-ui、pnpm build:api、pnpm build:installer-service 可分别构建目标包。
- pnpm start:api、pnpm start:installer、pnpm start:indexer 运行相应构建入口。运行前先执行 pnpm build。

前端构建输出在 dist/apps/<应用名>/spa，服务输出在 dist/services，公共包输出在 dist/packages。

## 检查

- pnpm typecheck：对所有定义了类型检查命令的 workspace 包执行检查。
- pnpm lint：运行 ESLint 与 Prettier 格式检查。
- pnpm clean：清理根 dist。

## 安装器 MVP

- 安装器由 `/environment`、`/database`、`/deploy`、`/complete/:deploymentId` 四个路由组成；内容较长时在主内容区滚动。数据库初始化成功后直接进入合约部署页。
- 数据库名不存在时，安装服务会检查 CREATEDB 权限并自动创建。目标库已有用户表时，页面先列出表名并二次确认；迁移只补充缺失结构、不删除或覆盖表数据。发现已有管理员时会拒绝再创建首位管理员。
- 首个迁移为 `db/migrations/0001_installer_core.sql`，创建管理员、角色、菜单、系统配置和迁移记录表。新增表或字段时必须写字段 `COMMENT` 和表 `COMMENT`，已发布迁移不回写。
- 初始配置区可保存 WalletConnect `project_id` 和管理员密码策略；密码至少 12 位，复选的字符要求保存到 `system_configs`。选择已有非空数据库时，已存在的同名配置会保留，不被新输入覆盖。创建首位管理员时不要求重复输入密码。
- 系统名称、主代币全称和简称在数据库初始化前确认并写入 `system_configs`；部署期间 ChainId 只记录在该链的临时部署资料中，全部合约与链上配置成功并完成核验后，安装器才将钱包实际 ChainId 写入 `system_configs`，后续必须使用同一链。存在未完成部署时，安装器要求回到该链和原部署钱包继续。业务 API 的只读 `GET /public/config` 将安装身份提供给前端，用户端和管理端不把每个安装实例的名称编译进静态资源；这些身份配置不写入 `.env`。
- 合约页直接读取 `contracts/code` 的部署计划、网络默认地址和编译产物，不提供目录选择器。缺少依赖时，点击编译会按 `package-lock.json` 执行 `npm ci`，然后运行 `npm run build`；找不到部署计划时明确提示合约包不存在。
- DEX 地址按当前 ChainId 读取包内默认值，也允许手动输入；核验会确认 Router 与 Factory 有链上代码，且 `Router.factory()` 与 Factory 一致。支付 Token 使用可手动输入的 QSelect，核验代码、符号和精度。Oracle 最低储备按 Token 单位输入，再按核验到的小数位换算成链上整数。
- MockUSDT 是公开 mint 的测试币，仅 ChainId 56 主网禁用；其他链由部署者自行确认。部署成功后，部署钱包、时间、ChainId、符号、精度、地址与交易哈希保存在 `contracts/deploy/{ChainId}/tokens.json`。
- 部署计划的合约节点、嵌套金库地址读取、模块绑定、交易对核验/创建、Oracle 配置和质押绑定都进入垂直 Stepper。钱包写操作串行执行，每步等待成功回执；失败或中断会保留临时进度与交易哈希，恢复时先检查回执。全部计划步骤和最终核验成功后，写入 `contracts/deploy/{ChainId}/runs/{deploymentId}/deployment.json` 并清除临时进度。
- 同链存在当前部署计划版本的完整记录时，安装器提供“新部署”或直接载入旧记录。载入旧记录只跳到完成摘要，不发起新交易；完成页显示部署地址、哈希、参数和文件输出位置，并可导出部署 JSON。
- 点击“连接钱包”后，共享组件弹出方式选择，列出 EIP-6963 与可发现的注入钱包；选项过多时列表可滚动。只有数据库 `system_configs.project_id` 有值时才显示 WalletConnect。部署页会监听并轮询当前账户与网络；检测到切换后暂存新状态，用户确认才同步，切回原状态会自动关闭提示。待确认期间禁止发起新的部署写入。
- 安装服务默认只监听 `127.0.0.1:3611`。安装初始化后按本文件前述方式加载 `.env` 并重启需要数据库连接的服务。
- `apps` 与 `services` 的生产构建属于发布流程：先执行 `pnpm typecheck`、`pnpm lint` 和 `pnpm build`，再发布根 `dist/` 产物；安装向导不在目标服务器构建这些应用。合约源码包的编译仍由合约部署页在缺少产物时单独触发。
- 生产反向代理需将同源 `/api/*` 转发到业务 API 服务；用户端和管理端的 Quasar 开发服务器已将 `/api` 代理到本机 3610 端口。

## Quasar 文档

Quasar MCP 工具可调用，但当前不识别 workspace 子包中的 Quasar 依赖，文档列表和搜索均没有返回页面。因此本项目以 Quasar 官方文档及已安装包附带的文档为准。Quasar 应用的根目录外构建路径由各应用的 quasar.config.ts 配置。
