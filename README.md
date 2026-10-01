# infra-payment-sdk

通用 TypeScript Headless SDK 工作区模板：三个包（产品包、协议包、private 测试工程）加一个可复制的示例能力，按“按示例扩展新业务”的分层扩展新业务。包名与发布配置沿用当前工作区取值；模板参数化与可选能力模块化留给后续 Change。

| Workspace 目录 | 包名 | 职责 |
| --- | --- | --- |
| packages/payment-sdk | @daqian/payment-sdk | 公共入口与示例能力（`src/example/`）：工厂校验装配，核心编排端口，适配器负责外部协议映射 |
| packages/payment-protocol | @daqian/payment-protocol | ProtoGen 契约与生成入口、通信执行器、网络适配及测试专用 Shadow |
| packages/e2e | @daqian/payment-e2e | private 测试工程，不发布 |

消费方只安装产品包。产品包采用独立版本，协议依赖固定到精确版本，发布统一由 SDK 发布入口处理。

## 规划入口

- [Agent 工作入口](AGENTS.md)
- [有效能力 Spec](openspec/specs/)（`scenario-gate`、`template-example`）
- [示例能力迁移记录](openspec/changes/archive/2026-09-30-template-example/proposal.md)
- [方案评审记录](openspec/changes/archive/2026-09-30-template-example/plan-review.md)

状态检查在本仓库根执行：

```sh
openspec list
openspec validate --strict --json
```

项目级 openspec-workflow schema 随规划迁入；静态状态不代表评审或验收通过。门禁读取 `openspec/specs/**` 并合并未归档 Change 的 Spec delta，归档前须让清单、绑定、报告与来源摘要保持一致。

## 工程与工具

ProtoGen 已作为根 devDependency 安装，当前锁定私有 registry（项目 216）的最新正式版本 **0.1.2**，通过项目内命令使用：

```sh
pnpm install --frozen-lockfile
pnpm proto:version
pnpm proto:validate
pnpm proto:status
```

安装来源、脚手架选项、Profile 的 DOM lib 裁定、pnpm 忽略安装脚本的裁定与测试基础设施依赖版本见 [工具准备记录](docs/engineering/bootstrap.md)。

协议包在 `testing/` 下提供测试专用 Shadow；E2E 包保存来源化 Fixture、Node/WeApp 薄驱动、用例绑定与 reporter。生产 exports 与 files 不包含 Shadow 或 E2E。

平台自动化直接使用现有本地微信开发者工具，通过 miniprogram-automator 连接并执行 SDK 测试函数，以真实 `wx.request` 请求 Shadow；最小宿主只提供执行环境，无需页面交互自动化或自研工具控制器。真实外部验收由消费方项目承担，不在本仓库进行。

## 仓库与外部参考

- 本仓库：git@gitlab.daqian369.com:esm/infra/infra-payment-sdk.git
- 本地：/Users/liyongning/Projects/workspace/infra-payment-sdk
- ESM 前端：git@gitlab.daqian369.com:esm/esm_fe_app.git，本地相对位置 ../esm/fe_app。
- 服务端 IDL：git@gitlab.daqian369.com:esm/narnia/idl.git；本次核对位置 /Users/liyongning/Projects/workspace/dev/idl，具体 commit 以生成来源证据为准。

跨仓库 Markdown 相对链接按上述本地布局提供；其他检出布局或 GitLab 浏览时，请用仓库地址和仓库内路径定位，不把本地引用误当 SDK 内部文件。

## 发布

SDK 与协议依赖发布至 GitLab 项目 **245**：

```text
https://gitlab.daqian369.com/api/v4/projects/245/packages/npm/
```

本地包消费测试与正式发布是两条独立链路：

- `pnpm check:package` 仅在用户需要本地验证包内容、安装、ESM/CommonJS 和类型声明时执行；它可以自行 `pack` 测试 tarball。
- `pnpm sdk-release -- --input <record> --token-env <TOKEN_ENV>` 是正式发布入口；记录只包含源码修订和 SDK/协议版本组合，不接收、读取、复用或比较本地测试 tarball/摘要。
- 正式流程先检查协议版本是否可读；缺失时先构建 `@daqian/payment-protocol` workspace，再执行正常 `pnpm publish` 并确认可读；随后按同样方式构建并发布 `@daqian/payment-sdk`。构建只生成当前源码对应的产品 `dist`，不执行或消费本地 `pack/check:package`。Token 只从指定环境变量读取并写入临时 npm 配置，查询和发布都显式固定到项目 245 的 scoped registry。
- 所有发布及 registry 确认成功后才原子写入 `release-result.json`；任何失败只保留 failed checkpoint。实际上传仍须用户明确触发。

质量检查和发布均由用户显式触发，可在本地或其他受控执行器运行；Pipeline/Runner、合并保护及其配置不属于发布能力的前置或本模板的交付物。

生成来源与手写错误目录的事实来源分别记录：`proto-gen.lock` 保存已配置分支的当前生成来源，协议包 `src/errors/*.ts` 与 E2E 的独立 Go 样例保留已评审取数来源；兼容闭包不变时可仅刷新生成来源。
