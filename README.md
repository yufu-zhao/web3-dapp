# 链构（ChainForge）

链构（ChainForge）使用 pnpm workspace 管理用户端、管理后台、可视化安装器、业务 API、安装器服务和共享包。安装实例可在初始化时自定义系统名称、代币名和简称。

品牌图标与 favicon 源文件位于 `logo/`；三个前端各自的 `public/` 目录包含运行时静态资源副本。合约源码包使用通用项目代币标识，具体名称和简称在安装时配置。

## 技术结构

- 用户端、管理后台和安装器：Vue 3、TypeScript、Quasar、Vite。
- 业务 API：NestJS 12、Fastify 5；索引任务作为 API 服务包中的独立命令入口。
- 安装器服务：NestJS、Fastify、PostgreSQL；安装器可连接数据库、初始化核心表并创建首位管理员。
- 共享类型与公共链工具：packages/shared-types 和 packages/public-chain。
- 共用钱包连接组件：packages/wallet-connect；三个前端使用同一套 Reown AppKit 配置与钱包 UI。
- Solidity 合约交接资料位于 contracts，不属于本次 workspace 构建范围。

当前只实现安装器 MVP。用户端、管理后台和业务 API 的业务能力仍待开发。

## 环境

- Node.js 22.22.0 或更新的 Node 22 版本。
- pnpm 11.6.0。
- 复制根目录 `.env.example` 为 `.env`，填写 Reown Dashboard 的 `WALLETCONNECT_PROJECT_ID`，并按需配置数据库连接、前端端口、服务监听地址、CORS 来源和可选的私募只读 RPC。Project ID 是公开标识，会提供给浏览器端 AppKit 使用；安装器初始化后会尝试将数据库连接串以仅当前用户可读的权限写入根目录 `.env`。
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
- 数据库页使用“初始化并继续”统一检查连接与初始化。目标库不存在时检查 CREATEDB 权限并自动创建，空库按序迁移、保存初始配置并创建管理员。非空库禁止初始化；只有核心表、首版迁移记录、管理员与安装身份均可识别为链构安装时，才提供带提示的确认跳过入口。跳过只绑定原数据库并读取原配置，不执行迁移、不创建管理员、不覆盖配置。
- 数据库完成初始化后显示配置摘要，可更换目标数据库或确认跳过进入部署。更换时原库保留，取消或离开更换页面恢复原目标；数据库维护与手动迁移移至摘要内折叠区。安装器不提供清空当前库重装。
- 首个迁移为 `db/migrations/0001_installer_core.sql`，创建管理员、角色、菜单、系统配置和迁移记录表。管理端迁移 `0002_admin_mvp.sql` 创建会话与登录失败计数表并整理多级菜单；`0003_admin_overview_menu.sql` 将“概览”恢复为登录后的默认入口。首次安装按序应用迁移，已有安装可在本机安装器数据库页应用待执行迁移。新增表或字段时必须写字段 `COMMENT` 和表 `COMMENT`，已发布迁移不回写。
- 初始配置区只保存管理员密码策略；密码至少 12 位，复选的字符要求保存到 `system_configs`。Reown Project ID 统一从根目录 `.env` 读取，安装器环境检查会阻止缺少该配置时继续。确认跳过已有安装时，使用该库原有配置，本页新输入不写入。创建首位管理员时不要求重复输入密码。
- 系统名称、主代币全称和简称在数据库初始化前确认并写入 `system_configs`；部署期间 ChainId 只记录在该链的临时部署资料中，全部合约与链上配置成功并完成核验后，安装器才将钱包实际 ChainId 写入 `system_configs`，后续必须使用同一链。存在未完成部署时，安装器要求回到该链和原部署钱包继续。业务 API 的只读 `GET /public/config` 将安装身份提供给前端，用户端和管理端不把每个安装实例的名称编译进静态资源；这些身份配置不写入 `.env`。
- 轮播和公告配置存入 `system_configs.content_management`，媒体文件由业务 API 保存在 `CONTENT_ASSET_DIR`；用户端通过只读公开 API 加载。系统设置的 RPC 节点配置存入 `system_configs.rpc_nodes`，测速结果缓存到 `system_configs.rpc_node_metrics`；数据库无 RPC 配置时从 API 随包的 `rpcs.json` 按绑定 ChainId 读取默认节点，旧的 `CHAIN_RPC_URL` 可在数据库配置前覆盖默认值。后台可逐个或异步依次测试节点；API 优先使用手动选定节点，失败时按已缓存的耗时顺序尝试备用节点。私募记录只接收用户提交的交易哈希，API 使用当前生效 RPC 核验成功回执和 `Committed` 事件后才入库；已有历史认购不会自动回填。管理端菜单与认购记录表由 `0008_content_management.sql`、`0009_presale_records.sql` 创建，升级已有安装时请在安装器数据库页应用待执行迁移。
- 用户端语言由 `user_languages` 和 `user_language_translations` 管理，迁移 `0010_user_languages.sql` 会将内置简体中文词条导入数据库；后台可增删语言、维护翻译、启用语言并选择默认语言。新增语言会复制默认语言词条并默认停用，用户端仅在存在两种及以上启用语言时显示切换入口，偏好保存在浏览器本地。大模型配置启用后，管理员可筛选默认译文仍未变化的词条，每批最多 20 条生成预览、修改并确认保存；模型调用由 API 执行并校验占位符，不会自动覆盖数据库。升级已有安装时请在安装器数据库页应用待执行迁移。
- 管理端启动时通过 `GET /public/initialization` 检查数据库、安装身份和管理端迁移。未初始化、安装配置不完整或管理端迁移待应用时分别提示对应处理步骤；业务 API 或数据库不可用时显示错误和重试入口；初始化检查使用 `/init`，登录后的根路由 `/` 显示“概览”工作台。
- 管理后台 MVP 提供登录、权限校验和多级主导航，菜单包含概览、管理员、系统菜单、角色、系统设置。管理员、菜单和角色页面使用可配置的分页表格封装，支持插槽、快捷/高级搜索、刷新、分页及行级操作；系统设置页面提供安装身份、管理员密码策略、主题配色和 RPC 节点配置。
- 合约页直接读取 `contracts/code` 的部署计划、网络默认地址和编译产物，不提供目录选择器。缺少依赖时，点击编译会按 `package-lock.json` 执行 `npm ci`，然后运行 `npm run build`；找不到部署计划时明确提示合约包不存在。
- DEX 地址按当前 ChainId 读取包内默认值，也允许手动输入；核验会确认 Router 与 Factory 有链上代码，且 `Router.factory()` 与 Factory 一致。支付 Token 使用可手动输入的 QSelect，核验代码、符号和精度。Oracle 最低储备按 Token 单位输入，再按核验到的小数位换算成链上整数。
- MockUSDT 是公开 mint 的测试币，仅 ChainId 56 主网禁用；其他链由部署者自行确认。部署成功后，部署钱包、时间、ChainId、符号、精度、地址与交易哈希保存在 `contracts/deploy/{ChainId}/tokens.json`。
- 部署计划的合约节点、嵌套金库地址读取、模块绑定、交易对核验/创建、Oracle 配置和质押绑定都进入垂直 Stepper。钱包写操作串行执行，每步等待成功回执；失败或中断会保留临时进度与交易哈希，恢复时先检查回执。全部计划步骤和最终核验成功后，写入 `contracts/deploy/{ChainId}/runs/{deploymentId}/deployment.json`，并在同一数据库事务中写入 `runtime_contract_binding` 供前后台运行时读取；旧安装标识键同步从 `system_configs` 清除，随后清除临时进度。
- 同链存在当前部署计划版本的完整记录时，安装器提供“新部署”或直接载入旧记录。载入旧记录只跳到完成摘要，不发起新交易；完成页显示部署地址、哈希、参数和文件输出位置，并可导出部署 JSON。
- 三个前端共用 Reown AppKit 钱包连接组件。AppKit 提供钱包选择、WalletConnect、账户状态、断开和刷新后的连接恢复；Project ID 由服务端从根目录 `.env` 读取并通过公开配置接口提供，不写入数据库。部署页继续监听钱包账户与网络变化；检测到切换后暂存新状态，用户确认才同步，切回原状态会自动关闭提示。待确认期间禁止发起新的部署写入。
- 安装服务默认只监听 `127.0.0.1:3611`。修改 `.env` 后重启业务 API 与安装服务；三个前端通过配置接口读取 Project ID，无需重新构建静态资源。
- `apps` 与 `services` 的生产构建属于发布流程：先执行 `pnpm typecheck`、`pnpm lint` 和 `pnpm build`，再发布根 `dist/` 产物；安装向导不在目标服务器构建这些应用。合约源码包的编译仍由合约部署页在缺少产物时单独触发。
- 生产反向代理需将同源 `/api/*` 转发到业务 API 服务；用户端和管理端的 Quasar 开发服务器默认将 `/api` 代理到本机 3610 端口，也可通过 `API_PORT` 修改。

## Quasar 文档

Quasar MCP 工具可调用，但当前不识别 workspace 子包中的 Quasar 依赖，文档列表和搜索均没有返回页面。因此本项目以 Quasar 官方文档及已安装包附带的文档为准。Quasar 应用的根目录外构建路径由各应用的 quasar.config.ts 配置。

业务 API 按安装绑定的 ChainId 使用系统设置中选定的 RPC，并校验链 ID 和绑定合约代码。数据库尚未保存 RPC 配置时，API 从 `services/api/src/rpcs.json` 读取该链的默认 HTTP(S) 节点；设置 `CHAIN_RPC_URL` 可在首次数据库配置前临时覆盖默认节点。管理后台可测试节点连接和链 ID，保存后立即生效，无需重启 API。公开节点可能限流，生产环境建议使用可信专用 RPC。

用户端测试币入口由 API 环境变量 `ENABLE_MOCKUSDT=true` 启用，默认关闭；BSC 主网（ChainId 56）始终隐藏。入口向当前绑定私募合约的支付币调用 `mint(address,uint256)`，仅适用于部署者确认使用公开铸造 MockUSDT 的测试或自建链。修改 `.env` 后需重新导出环境变量并重启业务 API。

管理后台系统设置的“大模型服务”使用 Vercel AI SDK，原生连接 OpenAI、Anthropic Messages、Google Generative AI，并通过 OpenAI Chat Completions 兼容协议提供 DeepSeek、通义千问、Moonshot、智谱、硅基流动、OpenRouter、Groq、Together AI、NVIDIA NIM、Ollama 等预设及自定义端点。服务商模型 ID 与协议支持由对应供应商决定；可在后台输入 API 密钥后按服务商的模型列表接口加载模型 ID，列表请求由 API 代理处理且不保存密钥，手动输入仍然可用。API 密钥以 AES-256-GCM 加密后保存在 `system_configs.ai_model_configuration`，写入前需在 `.env` 设置 `AI_CONFIG_ENCRYPTION_KEY`（用 `openssl rand -base64 32` 生成且解码后必须为 32 字节）；修改 `.env` 后重启 API，所有 API 实例需使用同一密钥，迁移时应备份该密钥。设置页可测试模型连通性，测试请求会向所选模型发送一条简短提示并可能产生供应商计费。
