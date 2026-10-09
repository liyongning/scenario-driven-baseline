## Why

模板的第一个真实使用方 xueshan_fe（Web 应用 + OpenAPI + 浏览器）完成了从初始化到两轮业务 Change 归档的完整周期，留下 62 条反馈与全过程会话记录。按"只吸收实施方发现不了、或每个项目都要重复付出高摩擦成本的问题"这一标准筛选后，暴露的核心问题是：**门禁全绿不等于真的检查到了**——源码指纹漏掉构建输入、覆盖率可以整文件缺席、Fixture 与契约不一致却计为通过、执行了但未登记的 checkpoint 无人守护、协议义务派生的对象是示例而不是产品；同时多 Change 并行时门禁互相污染、每次归档都要手工改大量 Fixture 路径、每个 Task 都整套全量运行。

本 Change 只做与产品形态、协议种类、运行平台都无关的**核心加固**，不新增 Web 能力（后者由后续 Change `template-web-absorption` 承担，并以本 Change 为前提）。

## What Changes

**门禁可信度（代码）**
- 统一"手写源码文件清单"：由清单 `fingerprints.sourceRoots`（git 已跟踪与未忽略的新文件）与新增的 `fingerprints.buildInputs` 派生；源码指纹与新增的覆盖率完整性检查共用这一份清单，覆盖率排除项必须登记理由。
- Fixture 来源绑定从"Spec 文件路径 + 整文件哈希"改为"Scenario/FLOW ID + 所在 Requirement 块的规范化哈希"，由门禁按 ID 解析当前生效版本，并校验 Scenario 确实存在。**BREAKING**：Fixture manifest 的 `sources.spec` 结构变更，模板内 Fixture 一次性迁移。
- Fixture 响应与协议来源做同形校验（IDL 首先落地），未认领的响应即失败。
- checkpoint 双向对账：执行了但未在 Spec 登记的 checkpoint 同样报出。
- 协议义务的接口集合改为由产品包显式声明的"消费接口"派生，双向检查声明与实际调用；错误码表与义务 ID 前缀改为从协议产出派生，不再取自示例。
- 中文注释门禁改为按清单发现产品包公共入口导出的全部手写类型，不再只检查示例文件。
- 去除剩余写死：`defineCase` 运行环境、默认报告名、tooling 用例中的包名与临时构建复制清单、inventory 单测、协议来源 lock 路径、依赖规则中的包路径，统一从清单派生。

**运行效率与体验（代码）**
- 场景门禁 `--change` 作用域：可多值，不带值报错，帮助文本写清"不带参数 = 主 Spec + 全部 active Change"。
- 按需测试入口：按 Scenario ID、改动的 Spec/Fixture、integration 的 import 关系推导受影响场景；平台适配与构建配置改动全量；按需报告带标记，场景门禁与 Verify 拒收。
- 统一验收入口 `pnpm verify [--run-id <id>]`，所有门禁共用同一 run id；报"过期"时说明是哪份报告、因何过期。
- 门禁自身的单测改用受控临时根，不依赖仓库实时状态。

**Shadow（代码）**
- 记录全部请求，`verify()` 报出未编排与未注册路由的请求。
- 路由注册时把 `{x}` 转换为 `:x`。
- 有界轮询模式（最多 K 次、超出部分仍校验参数），只允许平台类测试项目使用，Shadow 构造时按运行环境类别拦截。

**协议（代码）**
- `X-Request-Id` 按公司规范内化：头名 `X-Request-Id`，格式 `yyyyMMdd_HHmmss_SSS_abcdef`（北京时间），每次请求新生成，固定使用标准生成器，登记到有效 Spec。**BREAKING**：删除协议包公共选项 `ProtocolClientOptions.runtime.nextRequestId` 与 SDK runtime 端口中的同名能力，宿主不能再覆盖请求 ID。

**工程基线（代码）**
- 工具小版本统一升级；TypeScript 保持 5.9（typescript-eslint 与 openapi-typescript 的 peer 范围阻断 6.x/7.x）。
- ESLint `max-lines`：源文件 300 行、测试文件 600 行（不计空行与注释），豁免需在配置中登记理由；模板自身超限文件本次拆分。
- 引入 Prettier 基线与忽略清单；ESLint 忽略 `.local/**`；`.gitignore` 不再忽略 `openspec/schemas/`。
- 渐进式项目地图：每个包与模块目录有 AGENTS.md（固定骨架），每个 AGENTS.md 配一个首行为 `@AGENTS.md` 的 CLAUDE.md；门禁校验存在性、子模块列表一致与配对。

**AGENTS 约定与文档**
- e2e AGENTS：断言反模式与评审用的断言审查清单；轮询用例写法（集成用例假时钟计次数，平台用例只断言结果）。
- 新增技术架构文档 `docs/architecture.md`：粗略层与按能力的细节层，能力地图每一项都必须有对应章节（门禁校验）。
- 指南：模板示例的删除白名单与时机；归档已知限制；版本对齐规则；使用方约定；复刻验收方法；取消"验收索引存入 `artifacts/<run-id>/tasks/`"的规定，以 Change 内的 verify 记录为准。

**验收**
- 确定性门禁全部通过；按新沉淀的复刻验收方法，由无上下文的 Agent 在隔离副本中复刻支付 SDK 的代表性子集，并验证按白名单删除示例后门禁仍全绿。

## Capabilities

### New Capabilities

（无。本 Change 只加固既有能力；Web 应用、OpenAPI、浏览器平台与本地预览在 `template-web-absorption` 中新增。）

### Modified Capabilities

- `scenario-gate`：Fixture 来源模型、checkpoint 双向对账、`--change` 作用域、按需报告拒收、统一验收入口与过期说明、门禁自测隔离。
- `template-engineering`：手写源码文件清单与 `buildInputs`、覆盖率完整性、注释门禁发现方式、去写死、行数上限、Prettier、渐进式项目地图与 CLAUDE.md 配对、技术架构文档、指南新增章节、复刻验收方法。
- `protocol-contract`：消费接口声明与双向检查、错误码表与义务 ID 前缀派生、Fixture 契约同形校验、Shadow 请求记录/路径转换/有界轮询、`X-Request-Id` 规范。
- `template-example`：示例改为声明自己的消费接口；示例不再承载通用证据，删除示例后门禁保持通过。

## Impact

- **代码**：`scripts/`（check-scenarios、check-fixtures、check-architecture、contract-inventory、fingerprints、spec-sources 等，及新增 verify、按需选择、覆盖率完整性、项目地图检查）、`packages/protocol/`（transport/context、Shadow）、`packages/sdk/src/runtime`、`packages/e2e/src/cases/define-case.ts`、tooling 与协议场景用例、全部 Fixture manifest、`.dependency-cruiser.cjs`、`eslint.config.js`、`vitest.config.ts`、根 `package.json`、清单与清单 schema、`fixture.schema.json`。
- **文档**：根与各包 AGENTS.md、新增模块级 AGENTS.md 与 CLAUDE.md、`docs/template-guide.md`、新增 `docs/architecture.md`、README。
- **使用方**：Fixture manifest 结构与清单字段有破坏性变更；存量项目由实施方以能力地图为参照自行吸收，模板不提供升级工具。
- **不在范围**：Web 应用、OpenAPI 协议包、浏览器平台、本地预览（见 `template-web-absorption`）；UI 还原与一次性验收（单独立项）；`traceparent`；服务端状态管理；执行方修改验收标准（归工作流）。
