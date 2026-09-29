# infra-payment-sdk

通用 TypeScript Headless 支付 SDK，首期面向微信小程序虚拟商品支付。Task 1–7 的实现、正式 0.1.0 发布记录及 2026-09-22 Change 归档现已进入主工作区。Task 8 的既有 Shadow 验证和候选包已交付，Live/业务验收仍按独立边界跟踪。

| Workspace 目录 | 包名 | 职责 |
| --- | --- | --- |
| packages/payment-sdk | @daqian/payment-sdk | 支付模型、编排、服务端支付语义映射及渠道适配 |
| packages/payment-protocol | @daqian/payment-protocol | ProtoGen 契约、按 IDL 维护的错误码 TS 副本、通信执行器、网络适配及测试专用 Shadow |
| packages/e2e | @daqian/payment-e2e | private 测试工程，不发布 |

业务方只安装 SDK。产品包采用独立版本，发布统一由 SDK 发布入口处理；SDK 固定协议依赖的精确版本。完整工具链、目录、官方初始化和验收以以下 Change 为准。

## 规划入口

- [Agent 工作入口](AGENTS.md)
- [Proposal](openspec/changes/archive/2026-09-22-headless-payment-sdk/proposal.md)
- [架构、工程选型与验收矩阵](openspec/changes/archive/2026-09-22-headless-payment-sdk/design.md)
- [能力 Spec](openspec/specs/payment-sdk/spec.md)
- [公共契约与恢复/参数映射](openspec/specs/payment-sdk-contract/spec.md)
- [八个实施任务](openspec/changes/archive/2026-09-22-headless-payment-sdk/tasks.md)
- [方案评审记录](openspec/changes/archive/2026-09-22-headless-payment-sdk/plan-review.md)
- [迁移记录](openspec/changes/archive/2026-09-22-headless-payment-sdk/notes/migration-20260907.md)

状态检查在本仓库根执行：

```sh
openspec status --change headless-payment-sdk --json
openspec validate headless-payment-sdk --strict --json
```

项目级 openspec-workflow schema 随规划迁入；静态状态不代表评审或验收通过。三项协作结论及逐次 xpayEnv 方案已写入公共契约，当前没有待业务补充决策的 SDK 设计 TODO；网关兼容及实际环境证据按任务验收。Apply 需要当前输入有效且通过的 Plan Review，重新取得同一规划后满足各任务输入条件再恢复。pnpm 产品构建和测试在 Apply 工作区执行；本主工作区未合入实现，不能据此宣称命令可运行。新增 Live 命令须由 Task 8 实施。

具体业务错误码由 Task 3 按锁定 IDL 的 Go 定义维护在协议包手写目录，不等待 ProtoGen 新增生成能力；来源、17 项清单、独立一致性测试及升级规则见公共契约和 Design。当前仅更新规划，副本尚未在主工作区实现。

ProtoGen 已作为根 devDependency 安装，当前锁定私有 registry 的最新正式版本 **0.1.2**（2026-09-07 核对），通过以下命令使用项目内工具：

```sh
pnpm install --frozen-lockfile
pnpm proto:version
```

工具安装来源及验证见 [工具准备记录](docs/engineering/bootstrap.md)。ProtoGen 从 GitLab 项目 216 安装；SDK 产品包的发布目标为下述项目 245。

## 仓库与外部参考

- 本仓库：git@gitlab.daqian369.com:esm/infra/infra-payment-sdk.git
- 本地：/Users/liyongning/Projects/workspace/infra-payment-sdk
- ESM 前端：git@gitlab.daqian369.com:esm/esm_fe_app.git，本地相对位置 ../esm/fe_app。
- 支付 IDL：git@gitlab.daqian369.com:esm/narnia/idl.git；本次核对位置 /Users/liyongning/Projects/workspace/dev/idl，具体 commit 以公共契约证据为准。
- [ESM 业务 Change](../esm/fe_app/openspec/changes/esm-v1-4-business/proposal.md)

跨仓库 Markdown 相对链接按上述本地布局提供；其他检出布局或 GitLab 浏览时，请用仓库地址和仓库内路径定位，不把本地引用误当 SDK 内部文件。SDK Change 是本仓库唯一维护来源，ESM 仓库只保留迁移指针，业务 Spec 继续在其原仓库维护。

SDK 与协议依赖发布至 GitLab 项目 **245**：

```text
https://gitlab.daqian369.com/api/v4/projects/245/packages/npm/
```

平台自动化直接使用现有本地微信开发者工具，通过 miniprogram-automator 连接并执行 SDK 测试函数，以真实 wx.request 请求 Shadow；最小宿主只提供执行环境，无需页面交互自动化或自研工具控制器。Shadow 和 Live 均在本仓库闭环，Live 不依赖 ESM。业务小程序的构建、UI、权益和上线验收由其独立完成，不作为本 Change 完成条件。

ProtoGen 支付 Consumer 只登记 SDK 依赖的服务端契约，由 Task 1 按 ProtoGen 规范在 IDL 仓库按需配置，并建立本仓库生成配置；业务 Consumer 与业务 IDL 由业务维护。质量检查和发布均由用户显式触发，可在本地或其他受控执行器运行。Pipeline/Runner、合并保护及其配置不属于发布能力的前置或本 Change 交付物。SDK 0.1.0 已按正式发布链路发布至 GitLab npm 项目 245；核对依据见 [GitLab 登记记录](openspec/changes/archive/2026-09-22-headless-payment-sdk/notes/gitlab-registry-ci-20260907.md)。

本地包消费测试与正式发布是两条独立链路：

- `pnpm check:package` 仅在用户需要本地验证包内容、安装、ESM/CommonJS 和类型声明时执行；它可以自行 `pack` 测试 tarball。
- `pnpm sdk-release -- --input <record> --token-env <TOKEN_ENV>` 是正式发布入口；记录只包含源码修订和 SDK/协议版本组合，不接收、读取、复用或比较本地测试 tarball/摘要。
- 正式流程先检查协议版本是否可读；缺失时先构建 `@daqian/payment-protocol` workspace，再执行正常 `pnpm publish` 并确认可读；随后按同样方式构建并发布 `@daqian/payment-sdk`。构建只生成当前源码对应的产品 `dist`，不执行或消费本地 `pack/check:package`。Token 只从指定环境变量读取并写入临时 npm 配置，查询和发布都显式固定到项目 245 的 scoped registry。
- 所有发布及 registry 确认成功后才原子写入 `release-result.json`；任何失败只保留 failed checkpoint。实际上传仍须用户明确触发。

生成来源与错误事实分别记录：proto-gen.lock 保存已配置分支的当前生成来源，错误目录及独立 Go Fixture 保留已评审取数来源；兼容闭包不变时可仅刷新生成来源。具体比较字段、同步证据与门禁见公共契约“生成来源与错误事实来源分别校验”和 Task 3，不能直接把 Fixture 改成最新提交号。

## Shadow 与 Live 验收

- Shadow：现有 integration / weapp 自动化，服务端由 Shadow 模拟，渠道由替身控制；weapp 保留真实 wx.request。Shadow 继续维护在协议包 testing，仅测试可用，不进入产品产物。
- Live：本仓库 packages/e2e/host/weapp 的独立最小控制台，真实创建交易取得 tradeNo，再调用生产 SDK 和真实微信虚拟支付，最后由 SDK 查单确认结果。没有真实服务端搭配渠道替身的第三种模式。

Live 使用根 `.env.live` 非敏感配置及本机微信项目配置；Token 在测试小程序内确认保存到 Storage，可替换/清除，逐请求读取。新命令 `pnpm live:build`、`pnpm live:check`、`pnpm check:live -- --run-dir artifacts/<run-id>/live` 的实施契约见 [Live 设计](openspec/changes/archive/2026-09-22-headless-payment-sdk/design.md#decision-repository-owned-shadow-and-live-acceptance)。构建与检查不发起真实支付，默认 `pnpm check` 不扣款。创建接口/鉴权/DTO 已在 IDL 6726634 明确，8-B 的消费设计重新评审后实施；实际服务地址、部署和测试账号仍需按运行前置落实，不手填交易号或猜测部署结果。

Task 8 要求当前自动化门禁、独立产品消费、Live 三项设备有效环境和六项服务端部署三态证据及评审通过。远端合并保护属于仓库治理，不是本 Change 的完成前置；业务应用验收和实际 npm 发布分别跟踪。

Task 8-B 规划输入已更新：IDL 6726634 的创建交易 HTTP 入口，测试宿主可由 `.env.live` 预填且页面可改 user_id，并提供可编辑默认表单。8-A 已交付于隔离分支 2a0494e；本次 uid 默认值增量须完整 Plan Review/freshness 后再实施，详见 Design 的 Live decision。真实部署和渠道矩阵仍未验收。
