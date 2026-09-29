# 工程初始化记录

## 2026-09-19：Task 8 正式发布与本地包测试解耦

本地 `pnpm pack`/`pnpm check:package` 仅服务于用户显式发起的包内容、安装、ESM/CommonJS 和声明消费测试；测试 tarball 与摘要不会进入正式发布记录，也不与 registry 产物比较。正式 `release:preflight` 只核对固定项目 245、当前 workspace 包名/版本、SDK 的 `workspace:*` 协议依赖、SDK tag 和源码提交。用户通过 `pnpm sdk-release -- --input <record> --token-env <TOKEN_ENV>` 显式启动正式发布；入口可在本地或其他受控执行器运行，先校验当前 HEAD、tag 与包含未跟踪文件在内的 clean checkout，再从指定环境变量读取 Token。

正式流程只使用产品 workspace 的构建与正常 `pnpm publish`：先检查协议版本，缺失时构建并发布 `@daqian/payment-protocol`，确认可读后再检查、构建和发布 `@daqian/payment-sdk`。构建仅准备当前源码对应的产品 `dist`，不执行或消费本地 `pack/check:package`；已可读取的同版本直接复用，不覆盖，也不与本地 tarball 建立文件身份关系。Token 只进入权限为 0600 的临时 npm 配置，查询与发布命令另以高优先级 scoped 参数固定项目 245，避免仓库工具 `.npmrc` 的项目 216 配置覆盖正式目标。来源预检开始即失效旧成功 result，任一失败只保留 failed checkpoint；所有发布动作、registry 确认及最终完整性检查结束后，才把临时结果原子提升为 `release-result.json`，因此晚期失败不会留下正式成功结果。Pipeline/Runner 与合并保护属于仓库治理，不是该发布能力的前置或交付物。

## 2026-09-09：Task 6 测试基础设施

Task 6 按既定版本表安装并锁定 Express 5.2.1、Ajv 8.20.0、remark-gfm 4.0.1、unified 11.0.5、remark-parse 11.0.0、miniprogram-automator 0.12.1 和 Vitest 5.0.0。协议包 `testing` 下的 Shadow 仅从 generated metadata 发现 CreateTradePay 与 QueryTrade；E2E 包保存来源化 Fixture、Node/WeApp 薄驱动、Vitest case 绑定与 reporter；根脚本提供 Fixture、Scenario 和实际 tarball 检查。生产 exports 与 files 不包含 Shadow 或 E2E。

最小微信宿主用 Vite library mode 生成 CommonJS 内容，并以 `protocol-runner.js` 文件名供开发者工具装载；`.generated` 为 gitignored 构建输出。正式 WeApp driver 只调用 miniprogram-automator 的 `launch`、`evaluate` 和 `disconnect`，没有 readiness 探测、重试、版本检查绕过或工具进程控制。stable 2.01.2510290 / 基础库 3.10.3 在完整退出工具后运行 CONTRACT-023 四例全部通过，随后只关闭本测试项目再运行也四例全部通过；两轮都经过 `createProtocolClient` + `createWechatMiniappHttp` → `wx.request` → Shadow。完整退出可作为本次恢复手段，旧失败在这两轮没有复现，但证据不能锁定唯一根因或保证以后不复发；诊断索引见 `artifacts/20260909-task6/evidence/weapp-readiness-diagnostic.md`，最终对照见同目录 `owner-full-exit-conclusion.md`。

非平台长期入口为 `pnpm check:fixtures`、`pnpm test:integration`、`pnpm check:package` 和 `pnpm check:scenarios`。CI 的 cross-package-tests 先构建产品包，再执行 Fixture、Node/tooling integration 与实际 tarball 检查。完整 Scenario/FLOW 与 WeApp 环境证据由后续任务补齐；当前 inventory 非零不可当作绿色，也不在 Task 6 CI 中跳过后宣称完成。

## 2026-09-07：项目内 ProtoGen 工具准备

本次依据用户指示在 SDK 仓库安装最新 ProtoGen；仅建立根工具依赖，三个 workspace、支付 Consumer 配置、generated、SDK 实现和测试尚未建立，不计为 Task 1 完成。

### 来源与版本

| 项目 | 核对结果 |
| --- | --- |
| npm 来源 | https://gitlab.daqian369.com/api/v4/projects/216/packages/npm/ |
| 包 | @daqian/proto-gen |
| dist-tags.latest / 最高正式发布版本 | 0.1.2 |
| 版本列表核对 | 0.1.0、0.1.1、0.1.2 及其预发布；无 0.1.3，显式查询 0.1.3 返回 E404 |
| CLI 报告 | 0.1.2，commit 9f706d4811a8ffaffeabcfa6fbaedff8670f1c89 |
| Node / pnpm | 22.21.1 / 10.20.0 |
| bundled buf | 1.58.0 |

根 .npmrc 指定 ProtoGen 所在项目 216；无写入凭据。此配置用于当前工具依赖安装，未来产品包 publishConfig 仍指向项目 245；两者职责见 Design。

### 初始化与限定修改

1. 通过 npm view 查询上述 registry 的 latest、完整版本列表、engines 和 tarball。
2. 执行 `pnpm init --init-package-manager --init-type module` 生成根 package.json。
3. 根包设为 private，工具准备版本 0.0.0；移除模板 main、默认失败 test 脚本和未选定 license，增加 `proto:version`。根版本不是 SDK 产品版本。
4. 执行 `pnpm add --save-dev --save-exact @daqian/proto-gen@0.1.2`，由 pnpm 产生精确依赖与 pnpm-lock.yaml。
5. .gitignore 忽略 node_modules、.pnpm-store 和 .DS_Store；未创建产品包、修改全局工具或执行生成。

### 验证结果

- `pnpm proto:version`：退出 0，版本 0.1.2。
- `pnpm exec which proto-gen`：退出 0，指向 `./node_modules/.bin/proto-gen`。
- `pnpm install --frozen-lockfile`：退出 0，lockfile up to date。
- 在 `/Users/liyongning/Projects/workspace/dev/idl` 执行本 SDK 的 `node_modules/.bin/proto-gen config validate --json`：退出 0，apiVersion proto-gen/v2、kind Producer、status valid；仅校验现有 Producer 配置，未新增 SDK Consumer，也不等同于完整 Producer 交付检查。

后续安装复现使用锁文件；升级时先查发布源最新正式版，再更新精确依赖和本记录。所有项目命令使用本地依赖，不因系统全局 ProtoGen 的版本不同而改变行为。

## 2026-09-09：Task 1 初始化输入（实施中）

运行标识 `20260909-task1-implementation`，不同于此前中断的 apply-preflight。
初始化前通过 npm view 核对：Node 22.21.1、pnpm 10.20.0、create-vite 9.2.0、Vite 8.2.2、Vitest/coverage-v8 5.0.0、unplugin-dts 1.1.0、TypeScript 5.9.3、ESLint 10.10.0、typescript-eslint 8.70.0、dependency-cruiser 18.2.0、tsx 4.23.13、@types/node 22.20.1。TypeScript 采用 5.9.3 满足 typescript-eslint >=4.8.4 <6.1.0，未使用不兼容的最新 TypeScript 7。Node 22.21.1 满足以上 engines 交集；此为元数据检查，运行结果另记。

官方入口：[create-vite](https://vite.dev/guide/)、[库模式](https://vite.dev/guide/build#library-mode)、[声明插件](https://github.com/qmhc/unplugin-dts)、[Vitest projects](https://vitest.dev/guide/projects)、[ESLint TS 配置](https://typescript-eslint.io/getting-started/)、[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)。

计划使用锁版 `pnpm create vite@9.2.0 packages/payment-sdk --template vanilla-ts --no-interactive` 及 payment-protocol 同命令，E2E 使用 `pnpm init --init-package-manager --init-type module`。库构建 target=es2020、formats=['es','cjs']；声明由 unplugin-dts/vite 输出，tsc 独立校验。

### 实际脚手架和转换记录

- 两次锁版 create-vite 9.2.0 vanilla-ts 命令均退出 0，非交互；原始日志在 `artifacts/20260909-task1-implementation/logs/scaffold-{sdk,protocol}.log`。模板 `index.html`、`public/vite.svg`、`src/main.ts/counter.ts/style.css/typescript.svg` 与模板 tsconfig/.gitignore 被移除或由共享工程配置替代。保留根规划文件，不重跑根 pnpm init。
- `packages/e2e` 执行 pnpm init，随后改为 `@daqian/payment-e2e`、private，移除默认 main/license/test；没有浏览器宿主模板或成功占位脚本。
- `pnpm create @eslint/config@2.0.0`：JavaScript、检查语法及问题、ESM、无框架、TypeScript、Node、JavaScript 配置；拒绝自动浮动安装，沿用精确依赖。生成的 flat config 将 Node globals 限制在测试/工具，产品纯类型配置无 DOM/Node；runtime 只声明跨宿主计时器。增装 globals 17.12.0（Node >=18）。
- `pnpm exec depcruise --init`：monorepo=yes、ESM=yes、packages、允许根依赖、tsconfig.base.json、JSDoc=yes、getBuiltinModule=yes、编译前 TS 依赖=yes。保留官方规则并补 SDK → 协议/生产测试/核心 Node 规则。关闭初始化孤儿提示（内部类型端口先于工厂交付），循环提示仅分析非 type-only 依赖；契约中的 HttpResponse/CommunicationResult 类型引用没有运行时循环。
- 薄架构检查使用 unified 11.0.5、remark-parse 11.0.0、unist-util-visit 5.1.0 解析规则链接，dependency-cruiser 唯一解析导入图。未增加第四包或自研解析器。
- 声明插件通过官方 `outDirs: ['dist', {dir:'dist', moduleFormat:'cjs'}]` 和 `bundleTypes` 输出 `index.d.ts/index.d.cts`。补精确 peer @microsoft/api-extractor 7.59.1（Node >=20.9.0）。最初直接以 `.d.mts` 作多文件主入口会使 extractor 无法解析无扩展名引用，改为默认 `.d.ts` 主输出捆绑后由插件产生 CJS 副输出；没有自行复制/改写声明。双格式 JS 为 index.js/index.cjs，两份声明保留中文公共注释。
- 产品包分别从 0.1.0 起独立维护，SDK dependencies 使用 workspace:*。两包 publishConfig 指项目 245；根 @daqian registry 仍指工具项目 216，无凭据写入。平台与 registry 权限登记引用 Design 的既有记录；本轮记录时未发布，也未证明真实上传权限。
- 生成状态、静态、单测、构建及后续场景/真实平台/发布门禁均由统一根命令提供，可由用户在本地、CI 或其他受控执行器显式触发；仓库不以 Pipeline/Runner 作为能力前置。

### 生成前置缺口（Task 1 未完成）

SDK Consumer 由本地 ProtoGen init consumer 生成模板，再填入 Design 的固定值。IDL 仓库只新增 `infra-payment-sdk` Consumer、选择 trade.proto，由工具解析依赖；本地提交 `8af7fc5` 基于 `4e5cb22659fd4f4c36d06ae81256dc1c43e691d9`，没有 push。

`pnpm proto:validate` 在 Git 工作区通过。`pnpm proto:sync/status` 仍因远端分支无本 Consumer 而返回 `consumer_contract_missing`；CLI 支持配置的 git URL 与 --branch，没有获准本地源替代路径。本次不生成假 lock、metadata、codec 或协议枚举。因此 generated 子入口、ProtocolClient 的 RpcMethodMeta 签名和 optional/枚举检查仍未交付；只有不依赖 generated 的通信类型先行落盘，两个客户端工厂尚未实现。

IDL 的 `ci/producer_check.sh` 对新增已暂存登记运行，使用其固定官方 commit c45d210f64678de0bfd142a94d35f06762075b34；config valid、deps unchanged，但相对 origin/main 的 base IDL 加载失败，缺少 `buf/validate/validate.proto`，退出 1。本地 Consumer 登记提交不等于 Producer 门禁通过；不修改旧基线或依赖配置规避问题。

### 本轮验证范围

独立手写范围的 lint、完整 typecheck、architecture、10 项 unit 和 build 通过；V8 四项 100%，include 覆盖未被测试导入的手写文件，精确排除 generated/测试/声明。干净副本 frozen install 与以上命令通过；ProtoGen 要求 Git 工作区，首次无 .git 的副本校验失败后先 git init，再验证配置；远端登记缺口仍单列失败。

受控真实 CLI 负例覆盖 lint、类型错误、未覆盖函数/分支、未被导入手写文件、协议反向导入、生产导入测试、缺 AGENTS、断链和违规目录，均非零阻断。完整命令、退出码、报告、初始失败与修正记录以 `artifacts/20260909-task1-implementation/tasks/task-1.md` 为索引。没有把这些结果称为 Task 1 完成或真实支付通过。

## 2026-09-09：Consumer 远端登记后的 Task 1 续接

IDL Consumer 已在 feat/esm-v1.4 的 `5539be8f09323709fa65f6568efe22896ec35d24` 可见（包含已评审 4e5cb226 的支付语义及后续无关 wx 路径调整）。`pnpm proto:sync` 成功，`pnpm proto:status` 为 up_to_date；锁和 18 个生成 TS 文件均由项目 ProtoGen 0.1.2 产生。此前“远端无 Consumer”的描述仅为历史记录。

- Profile 为 generated-idl2-compatible/v1、generatorVersion=6；treeDigest 为 sha256:651772b53c3e38ea2a5e4cd234b793977ba462843af08eb692ca1c002ceafc65。投影闭包与 Producer dry-run 相同。CreateTradePayRequest.xpayEnv 是 `XpayEnv | undefined` 的 optional 字段；具名 XPAY_ENV_SANDBOX/XPAY_ENV_PROD、真实 JSON codec 和 PayParams.params 的 `$case` oneof 均存在。就近 generated-contract.test.ts 验证省略、显式 undefined、sandbox/prod 编码和回读，不覆盖 Task 3 的完整 wire/错误样例义务。
- ProtocolClient 接口直接引用 generated/std.RpcMethodMeta。协议 root 导出通信类型，`generated/*` 子入口提供 std、base、common/v1/enums、infra/pay/v1/pay 和 infra/trade/v1/trade 的类型/metadata/codecs；Vite 官方多入口库配置直接消费这些生成模块，unplugin-dts 为各入口捆绑 ESM/CJS 声明。没有手写 generated barrel，也没有实现两个客户端工厂。
- 官方固定 Profile 使用 `env=browser`（proto-gen/plugins/tsclient/profile_digest.go 与 internal/tsproto/request.go），其 conformance 脚本以 `--lib ES2022,DOM` 检查输出。生成 bytes helper 使用 globalThis.atob/btoa，最初在无 DOM 的协议 tsconfig 出现 TS7017；因此只为协议包构建配置增加 ES2020+DOM，保持工程 target=ES2020 和根/SDK 的无默认 DOM/Node 配置。类型配置不提供运行时 polyfill；首期 CreateTradePay/QueryTrade 请求和响应没有需调用这些 bytes helper 的支付字段，其他生成方法/消息不等于 SDK 支持的能力。
- 当前生成输出提供 BaseResp/ErrorInfo 和 CanonicalErrorCode；没有 ErrInfraTradeCreateTradePayUnauthorized/WxIdentityNotFound/SessionExpiredInvalidParameter/Unavailable 等方法细分错误定义。这些常量与原因映射仅存在于 IDL 的 error_code.go/error_contract.go。当前 Profile 从 protobuf descriptor 生成消息/codec/方法 wrapper，不消费 Go 错误表。未手写错误码镜像；Task 3 精确错误映射仍需确定受支持的生成输入交付，不能用公共 CanonicalErrorCode 冒充细分业务码齐备。
- 以已评审基线 `PROTO_GEN_BASE_REF=4e5cb22659fd4f4c36d06ae81256dc1c43e691d9` 运行固定官方 Producer gate 通过；默认 origin/main 缺 protovalidate 的历史问题单独保留，不修改基线或工具。

本轮证据位于 artifacts/20260909-task1-generated-continuation，完整结果与未完成项见 Task 1 报告。产品发布权限、真实平台、tarball 和完整场景仍由相应任务验收，不把本轮生成或类型检查称为支付能力交付。

## 2026-09-09：Task 1 评审修复第 1 轮

### 跨 workspace 入口门禁

新增 dependency-cruiser 的 `cross-workspace-no-direct-files`：跨产品 workspace 的本地路径依赖被拒绝，包含指向公开 index/generated 的相对重导出、type-only、动态 import 和 dist 路径。合法 npm 名称继续由现有根 TS paths（只映射两包公开 root）或 workspace/package exports 解析；原有公开入口规则同步允许构建后的 dist/index 与 dist/generated。规则使用工具的 dependencyTypes/解析路径，不另写 import 解析器。真实 CLI 回归覆盖 5 个非法来源和合法 root/generated 子入口；主命令的原始绕过样例现退出 1，合法样例退出 0。

### 项目 245 身份、读取与发布权限核对（只读）

当前浏览器会话为 liyongning；[项目成员页](https://gitlab.daqian369.com/esm/infra/infra-payment-sdk/-/project_members) 标注 It's you、Inherited from ESM、Maintainer。项目为 Private、ID 245；[Package registry](https://gitlab.daqian369.com/esm/infra/infra-payment-sdk/-/packages) 可读取，仍为 0 Packages；[保护配置](https://gitlab.daqian369.com/esm/infra/infra-payment-sdk/-/settings/packages_and_registries) 为 No packages are protected。[GitLab 官方权限表](https://docs.gitlab.com/user/packages/package_registry/#package-registry-visibility-permissions) 对私有项目读取要求 Reporter，发布要求 Developer：当前角色满足两者，尚未执行上传来验证服务端写入。

[CI/CD 设置](https://gitlab.daqian369.com/esm/infra/infra-payment-sdk/-/settings/ci_cd) 的历史只读核对显示 job-token allowlist 包含项目自身 esm/infra/infra-payment-sdk，认证事件 0，项目和继承组变量均 0；这只说明平台配置事实，不构成当前发布入口或前置条件。本轮没有启动作业、生成凭据或上传包；实际发布由用户显式调用统一发布入口并提供对应 Token。

本地 npm 状态与浏览器权限分开判定：根 @daqian registry 仍指工具项目 216，两个产品 publishConfig 正确指项目 245；当前用户配置无 245 路径鉴权条目，也无可用 CI 身份环境变量。`npm whoami --registry=https://gitlab.daqian369.com/api/v4/projects/245/packages/npm/ --json` 返回 ENEEDAUTH（退出 1）。匿名 GET 项目 npm 包列表返回 404 Project Not Found；匿名 GET 协议包 metadata 返回 404 Not found，不能据此宣称包已可下载。浏览器直接访问 API 被客户端阻止，但已登录的 registry 页面读取正常。仅检查既有配置键/作用域，不记录或复用其他项目凭据值。

剩余边界：当时 shell 的项目 245 npm 认证尚未就绪，项目 245 尚无产品包，不能做已发布版本的真实依赖下载。只读调查确认的角色权限不能替代带身份的 npm 安装/发布实跑。未配置新的凭据、改权限/保护规则或上传包。脱敏原始结果见 artifacts/20260909-task1-fix-round1/f2-*。

### pnpm 10 忽略 esbuild 脚本的裁定

锁定 pnpm 10.20.0 默认不运行未批准的依赖安装脚本（[官方 10.x 配置](https://pnpm.io/10.x/settings#ignoredepscripts)、[approve-builds](https://pnpm.io/10.x/cli/approve-builds)）。当前唯一被提示的依赖是 esbuild 0.28.2；其 postinstall 为 node install.js，原生执行文件通过同版本平台 optionalDependency 安装。保持默认未批准状态和原始警告，不批准所有脚本，也不隐藏提示或改变 lock。

已在无既有 node_modules 的副本中验证 frozen install、tsx 驱动的架构命令、完整测试和构建；额外直接调用锁定 esbuild.transformSync 编译 TypeScript 并执行结果，确认得到 42。该证据说明本轮 darwin/arm64 环境可使用已安装的平台二进制，postinstall 并非当前流程必要条件。其他平台或升级版本需要重新核对；若 optionalDependency 未安装，不能据本次结果假定可用。Task 1 接受这个已解释且经验证的安装提示，未新增依赖脚本授权。
