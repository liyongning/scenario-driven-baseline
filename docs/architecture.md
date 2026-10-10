# 模板技术架构

本文件回答"解决什么问题、为什么这样设计"；[模板使用指南](template-guide.md)回答"怎么用、怎么换"。两者分工固定：指南的操作步骤发生变化时改指南，能力本身新增、替换或删除时同时改本文件（根 AGENTS 执行规则 13）。

## 粗略层

### 模板要解决的问题

手写一个 headless SDK，重复出现的不是业务逻辑，而是一圈工程问题：三包边界与产物形态、协议来源与生成物、平台适配、外部服务的测试替身、证据如何与需求对账、以及"门禁全绿"是否真的检查到了该检查的东西。模板把这些问题的解固化成可运行的清单、门禁与文档，让使用方（主要是 Agent）能照着改，而不是从头决定一套工程方案。

- 形态问题：产品包、协议包与 private 测试工程各自该放什么，产物如何以双格式发布，平台实现如何不污染领域代码。
- 证据问题：每条需求都要有运行证据；行为证据与内部证据分开计；报告带来源摘要，来源变了旧报告立即失效。
- 信任问题：清单之外不写死拓扑，例外集中在清单一处登记，场景门禁问题必须能归属到某个交付项。

### 整体架构

```mermaid
flowchart LR
  M[project.manifest.json + schema] --> G[门禁脚本]
  G --> A[check-architecture]
  G --> S[check-scenarios]
  G --> F[check-fixtures / fixtures:refresh]
  G --> C[check-coverage / check-package / check-release]
  P[产品包 sdk] --> A
  T[协议包 protocol] --> A
  E[测试包 e2e] --> A
  E --> R[unit / integration / weapp 报告]
  R --> S
  D[指南 + 架构文档] --> U((使用方 Agent))
  M --> U
  U -->|Change：删 / 换 / 增| M
```

三包职责：产品包导出公共入口与领域分层，协议包承载契约、生成入口、通信执行器与测试专用 Shadow，测试包承载用例、驱动、报告器与平台宿主。门禁只从清单读取包、命令、测试项目与发布设置；使用方按指南改清单与对应文件，不改门禁代码。

### 质量体系主线

Spec 定义需求与 Scenario，Scenario 自带 `json verification` 元数据（checkpoint 与 case）→ 用例按 case 绑定 Spec、Fixture 与运行环境 → Fixture 与 Shadow 提供受控输入与替身 → 各测试项目产出带来源摘要的报告 → 场景门禁用报告对账 Spec、绑定与证据，问题数为 0 才算通过 → 归档前确认清单、绑定、报告与来源摘要一致。

防"门禁全绿但没检查到"的三条主线：覆盖率按手写源码清单派生（`check:coverage`）、报告按来源摘要绑定（`check:fixtures` 与场景门禁的过期判定）、checkpoint 双向对账（声明与执行都必须一致）。

### 关键原则

1. **外部交互替身闭环**：服务端接口由 Shadow 网关承载，平台能力由产品包端口加测试替身承载；不提供"真实服务端 + 替身平台"这类混合模式，真实外部验收由消费方项目承担。
2. **清单驱动**：包、目录、必需命令、测试项目、摘要目录与发布设置只来自 `project.manifest.json`，写死拓扑由门禁检查拒绝。
3. **证据分类**：behavior 覆盖公共入口可见行为，module 验证内部正确性，engineering 验证包、门禁与工程证据；内部与工程证据不能抵扣行为证据。
4. **问题必须归属**：门禁问题要么归属到尚未交付的任务，要么是回归；不能归属就停下来。
5. **长期约定落在项目级载体**：AGENTS.md、schema、清单、脚本、指南与架构文档；Change 文档不能是唯一出处。
6. **优先采用现成方案**：先查官方文档与社区方案，查不到再做实验，最后才考虑自研；自研通用能力必须在 Design 写明已查方案与不采用的理由。

### 测试分层对照表

| 项目类别          | 在哪运行                       | 证明什么                           | 计入哪类证据           | 覆盖率                     |
| ----------------- | ------------------------------ | ---------------------------------- | ---------------------- | -------------------------- |
| unit              | 本机 Node，按包与测试工程拆分  | 公共入口行为与模块内部正确性       | behavior / module      | 计入，手写代码要求 100%    |
| integration       | 本机 Node，Shadow 与驱动替身   | 协议义务、Fixture 契约与跨模块流程 | behavior / engineering | 计入                       |
| platform（weapp） | 本机微信开发者工具，逐文件运行 | 真实平台网络适配与宿主运行         | behavior               | 宿主专用文件按清单登记排除 |

## 细节层

以下每节对应指南「能力地图」表格的一行，固定写四部分：解决的问题、实现机制与关键文件、关键设计决策与被否决的方案、演进记录。演进记录只写 Change 名称纯文本或指向已归档 Change 的相对链接；正在交付的 Change 不链接，避免归档搬迁后断链。

### pnpm workspace、Vite 双格式与声明、TS 分层配置、ESLint

#### 解决的问题

单仓库多包协作、库产物以 ESM 与 CJS 两种格式加类型声明交付、编译按层拆分、静态检查有统一基线。

#### 实现机制与关键文件

[pnpm-workspace.yaml](../pnpm-workspace.yaml) 登记包目录，根 [package.json](../package.json) 汇总命令，各包 `vite.config.ts` 用库模式产出双格式与声明，[tsconfig.base.json](../tsconfig.base.json) 与 [tsconfig.test.json](../tsconfig.test.json) 分层编译，[eslint.config.js](../eslint.config.js) 装配规则块；必需命令由清单 `manifest.requiredCommands` 决定，架构检查逐一核对。

#### 关键设计决策与被否决的方案

用 Vite 库模式一次构建 ESM/CJS 与 `.d.ts`，否决了 tsc 直出双格式（声明与产物的路径映射要另写一套）；ESLint 用扁平配置按目录 globals 分区，`wx` 只在宿主目录可见；规则块的路径按清单角色生成，不在配置里写死包名。

#### 演进记录

`2026-09-22-headless-payment-sdk`（首次搭建工作区与产物形态）、`2026-10-02-generalize-template`（清单驱动）、`template-core-hardening`（格式与规模基线）。

### 三包边界与产品交付

#### 解决的问题

谁可以依赖谁、什么能发布、测试工程如何不进入使用方产物。

#### 实现机制与关键文件

[project.manifest.json](../project.manifest.json) 登记三个包的目录、包名、角色、private 与允许的一级子目录；[scripts/check-package.ts](../scripts/check-package.ts) 校验打包产物与依赖边界；协议包不得依赖产品包与测试包；产品包与协议包各自 exports 与 publishConfig 决定发布面。

#### 关键设计决策与被否决的方案

测试包固定 private，只做行为与工程证据；复用现有根 entry 与 dist 清单，不新增平台子路径或测试出口（`HttpPort` 由协议包根入口具名导出，SDK 工厂与测试消费同一生产实现）；否决了为测试方便额外开放内部入口。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`2026-10-02-remove-payment-business`（能力保全清单）、`template-core-hardening`（边界改由清单核对）。

### 分层、端口、依赖方向、wx lint、业务目录隔离

#### 解决的问题

领域代码不能依赖平台与生成代码，业务模块之间不能互相导入，平台全局只能在宿主目录出现。

#### 实现机制与关键文件

[.dependency-cruiser.cjs](../.dependency-cruiser.cjs) 的三条规则（`domain-core-no-generated`、`core-no-platform-or-node`、`domain-isolation`）按清单角色生成巡航范围（[scripts/lib/dependency-rules.cjs](../scripts/lib/dependency-rules.cjs)）；[eslint.config.js](../eslint.config.js) 的 `no-restricted-globals: wx`；规则与写法写在 [packages/sdk/AGENTS.md](../packages/sdk/AGENTS.md)。

#### 关键设计决策与被否决的方案

守卫按目录名（`core/`、`ports/`）自动覆盖 `src/` 下的业务模块，否决了逐模块白名单（每新增模块都要改配置）；规则是否真的会拦截由合成模块反例逐条证明（`SCN-TEMPLATE-ENGINEERING-007`），不靠"配置看起来对"。

#### 演进记录

`2026-09-30-template-example`（分层与 lint 规则）、[2026-10-02-generalize-template](../openspec/changes/archive/2026-10-02-generalize-template/)（守卫覆盖全部业务模块）、`template-core-hardening`（反例迁出示例）。

### 架构与质量门禁、使用指南守护、门禁自测隔离

#### 解决的问题

门禁脚本不能写死拓扑；指南与架构文档必须与仓库事实一致；门禁自测不能依赖仓库实时状态或被别处用例污染。

#### 实现机制与关键文件

[scripts/check-architecture.ts](../scripts/check-architecture.ts) 校验目录、清单、规则链接、指南、示例标记、项目地图与技术架构文档；[scripts/lib/markdown-docs.ts](../scripts/lib/markdown-docs.ts) 提供共用的 Markdown 事实提取；用例侧用 [controlled-root.ts](../packages/e2e/tests/tooling/controlled-root.ts) 建受控临时根。

#### 关键设计决策与被否决的方案

门禁自测在受控临时根中构造合成输入并做恢复断言，否决了"改仓库实时状态再还原"（互相干扰、失败后残留）；指南只做机械可核对事实（Scenario ID、pnpm 命令、清单字段、链接、章节、白名单），描述是否准确交给评审与复刻验收。

#### 演进记录

`2026-09-30-template-example`（指南检查）、`2026-10-02-generalize-template`（清单驱动）、`template-core-hardening`（自测隔离、架构文档检查）。

### 公共类型中文注释进入双格式声明

#### 解决的问题

手写公共类型与状态值必须有中文解释，并且这份解释要随双格式声明交付；检查对象不能写死成文件清单。

#### 实现机制与关键文件

[public-doc.ts](../packages/e2e/tests/tooling/public-doc.ts) 从产品包根入口的 exports 出发，用 TypeScript 编译器 API 发现需要中文注释的手写类型（跳过 `generated/`），再在源码与构建后的声明文件两侧核对；证据由 `SCN-TEMPLATE-ENGINEERING-003` 承担。

#### 关键设计决策与被否决的方案

按入口发现检查对象，否决了在清单里手工列类型名（新增类型就会漏）；只检查入口可达与手写声明，生成代码与外部包类型不参与。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`template-core-hardening`（改为按入口发现）。

### 编译期公共类型契约测试（@ts-expect-error 反例、联合类型 never 穷尽、只读字段）

#### 解决的问题

公共类型契约要在编译期被证明：非法用法应报错，联合类型新增分支应让穷尽分支失败，只读字段不能被写。

#### 实现机制与关键文件

`tsconfig.test.json` 把 `*.test.ts` 纳入 typecheck，`pnpm typecheck` 因此会真实编译反面断言；写法模板给在 `packages/sdk/src/example/contracts.test.ts`（随示例删除），规则写在 [packages/sdk/AGENTS.md](../packages/sdk/AGENTS.md)。

#### 关键设计决策与被否决的方案

用 `@ts-expect-error` 与 `never` 穷尽作反面断言，否决了只在运行时断言字段存在（写错类型也能通过）；typecheck 覆盖测试文件是关键前提，不另外维护一套类型测试配置。

#### 演进记录

`2026-09-30-template-example`、`template-core-hardening`（示例删除后写法仍保留在包级 AGENTS）。

### ProtoGen 生成与来源状态

#### 解决的问题

协议源码由 IDL 生成，生成结果、来源版本与生成工具版本必须可追溯、可复现。

#### 实现机制与关键文件

[proto-gen.yaml](../proto-gen.yaml) 与 [proto-gen.lock](../proto-gen.lock) 固定来源与版本，`pnpm proto:validate` 与 `pnpm proto:status` 校验生成物与来源状态，生成代码落在协议包 `src/generated/`（受依赖规则隔离）。

#### 关键设计决策与被否决的方案

ProtoGen Consumer 按产品实际依赖在 IDL 仓库登记，项目内使用根 devDependency 由 `pnpm proto:*` 调用；否决了把生成物手工拷进仓库（来源不可追溯，diff 无法评审）。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`2026-10-02-generalize-template`（输出路径与包名中立化）。

### IDL 协议义务派生与消费接口双向对账

#### 解决的问题

"IDL 里定义了接口"不等于"SDK 真的按协议调用并处理了响应"；义务清单必须有确定的来源，并且要与调用点对账。

#### 实现机制与关键文件

产品包 [consumed-operations.ts](../packages/sdk/src/consumed-operations.ts) 声明消费了哪些接口与请求字段，[scripts/lib/contract-inventory.ts](../scripts/lib/contract-inventory.ts) 据此从 IDL 派生义务，场景门禁以 `method#request#field` 形式要求运行证据；`SCN-PROTOCOL-CONTRACT-001/002/005` 覆盖派生、证据与双向对账。

#### 关键设计决策与被否决的方案

义务来源改为产品包代码声明，否决了在清单里直接列接口名（脱离代码就没有编译期约束，也无法与调用点对账）；也否决了"IDL 全量出义务"（会把消费方不使用的接口变成硬性义务）。

#### 演进记录

`2026-09-22-headless-payment-sdk`（IDL 义务派生）、`2026-10-02-remove-payment-business`、`template-core-hardening`（改为消费接口派生）。

### 手写错误码事实与 Go 来源校验

#### 解决的问题

业务错误码既要对调用方稳定，又要与协议来源一致，不能只靠手工维护的清单。

#### 实现机制与关键文件

手写错误码目录在 [packages/protocol/src/errors](../packages/protocol/src/errors)，来源一致性由 `SCN-PROTOCOL-CONTRACT-003` 用例核验（错误码副本与 IDL 来源比对）；错误码义务由协议包 `businessErrors` 声明，不由示例接口代表。

#### 关键设计决策与被否决的方案

错误码事实以手写目录为唯一出口、来源校验单独成用例；否决了散落于各分支的数字字面量，也否决了为错误码建通用生成器（本期收益不足）。

#### 演进记录

`2026-09-22-headless-payment-sdk`（PC-02）、`template-core-hardening`（错误码义务不再以示例接口代表）。

### 协议执行器（公共上下文、Token、预算、取消）

#### 解决的问题

所有协议调用共享同一套上下文（身份、Token、预算、取消与超时语义），平台实现只负责发请求。

#### 实现机制与关键文件

[packages/protocol/src/client.ts](../packages/protocol/src/client.ts) 与 [packages/protocol/src/transport](../packages/protocol/src/transport) 定义执行器与上下文，网络工厂实现 `HttpPort` 端口（小程序实现在 [packages/protocol/src/adapters/network/wechat-miniapp.ts](../packages/protocol/src/adapters/network/wechat-miniapp.ts)）。

#### 关键设计决策与被否决的方案

平台网络能力以端口注入，产品包不直接依赖 `wx`；否决了在每个业务模块各自发请求（取消与预算语义会分叉）。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`template-core-hardening`（请求 ID 与响应校验接入执行器）。

### 四条 OpenSpec 硬规则与三份格式 schema

#### 解决的问题

规划与证据的格式约定必须有唯一权威，并且能被机械校验。

#### 实现机制与关键文件

[AGENTS.md](../AGENTS.md) 的 OpenSpec 硬规则；Scenario/FLOW/case 的格式权威是 [scenario-gate.config.schema.json](../scenario-gate.config.schema.json)、[scripts/verification.schema.json](../scripts/verification.schema.json) 与 [scripts/flow.schema.json](../scripts/flow.schema.json)；用例见 `SCN-SCENARIO-GATE-001` 至 `-011`。

#### 关键设计决策与被否决的方案

schema 是权威、AGENTS 指路、Spec 定义门禁行为，三者分工固定；否决了把格式约定只写在文档里（改一处不会失败）。

#### 演进记录

`2026-09-30-template-example`、`template-core-hardening`（作用域与来源摘要）。

### 覆盖对账与证据有效性（三类验证、FLOW 连续性、skip、过期、checkpoint 对账）

#### 解决的问题

有报告不等于证据有效：用例要绑定到 Scenario 与 case，checkpoint 要双向对账，跳过的用例不算覆盖，来源变化后旧报告必须失效。

#### 实现机制与关键文件

[scripts/check-scenarios.ts](../scripts/check-scenarios.ts) 与 [scripts/lib/scenario-coverage.ts](../scripts/lib/scenario-coverage.ts) 做覆盖对账，[scripts/lib/scenario-staleness.ts](../scripts/lib/scenario-staleness.ts) 判过期；证据注解由用例侧 `context.annotate(..., 'scenario-evidence')` 产生；用例见 `SCN-SCENARIO-GATE-009/010/016`。

#### 关键设计决策与被否决的方案

checkpoint 双向对账（声明了但没执行、执行了但没声明都是问题），否决了只统计"用例通过数"；否决了逐用例记录运行时覆盖再反查源码（成本高、平台用例还要 sourcemap 回溯）。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`2026-09-30-template-example`、`template-core-hardening`（checkpoint 对账）。

### 可配置 ID 格式

#### 解决的问题

Scenario 与 FLOW 的 ID 格式由使用方决定，不能写死在门禁里。

#### 实现机制与关键文件

[scenario-gate.config.json](../scenario-gate.config.json) 提供 `scenarioIdPatterns`、`flowIdPatterns` 与 `ownerIdPattern`，[scripts/lib/scenario-config.ts](../scripts/lib/scenario-config.ts) 统一加载并做正则匹配；用例见 `SCN-SCENARIO-GATE-011`。

#### 关键设计决策与被否决的方案

格式来自项目配置而非硬编码常量，否决了"多格式并存"之外的兼容分支——移除一种格式时旧 ID 直接报错，不做静默容忍。

#### 演进记录

`2026-09-30-template-example`、`2026-10-02-generalize-template`。

### Scenario/case/FLOW 绑定、Fixture 来源绑定与报告器

#### 解决的问题

用例与 Spec 的绑定要可机械核对；Fixture 必须能证明它服务于哪条 Requirement，来源变了要能发现；报告要有统一格式供门禁读取。

#### 实现机制与关键文件

[define-case.ts](../packages/e2e/src/cases/define-case.ts)、[fixture-loader.ts](../packages/e2e/src/cases/fixture-loader.ts)、[scenario-reporter.ts](../packages/e2e/src/reporters/scenario-reporter.ts)、[scripts/check-fixtures.ts](../scripts/check-fixtures.ts) 与 [fixtures-refresh.ts](../scripts/fixtures-refresh.ts)；Fixture 按 owner ID 与 Requirement 块摘要绑定来源。

#### 关键设计决策与被否决的方案

来源绑定改为 ID 加 Requirement 块摘要，否决了归档时自动重写路径（粒度问题不变），也否决了删掉来源绑定；Fixture 响应与协议同形校验放在协议包的 Shadow 侧，否决了"只在 `check:fixtures` 校验 JSON"，那会漏掉内联在测试代码中的响应（不声明即不校验）。

#### 演进记录

`2026-09-30-template-example`、`template-core-hardening`（来源模型改为 ID + 摘要、响应同形）。

### 手写代码 100% 覆盖与覆盖率完整性

#### 解决的问题

"100% 覆盖率"可能因为 include 漏配或新增 exclude 而让整个文件静默缺席；排除项也必须有理由、可复核。

#### 实现机制与关键文件

[vitest.config.ts](../vitest.config.ts) 的 `coverage.include` 由 [source-inventory.ts](../scripts/lib/source-inventory.ts) 派生的手写源码清单生成，[check-coverage.ts](../scripts/check-coverage.ts) 比对报告与清单，排除项只来自 `manifest.quality.coverageExclusions`；`pnpm check:coverage` 在 `test:unit` 之后运行；用例见 `SCN-TEMPLATE-ENGINEERING-009`。

#### 关键设计决策与被否决的方案

统计范围由清单派生（git 已跟踪 + 未忽略的新文件，排除 `generated/`、AGENTS/CLAUDE 与测试文件），否决了继续用 glob 维护 `include`——那正是文件静默缺席的原因；排除项只登记"只能在平台宿主进程执行"的文件并各带理由，不允许其他豁免。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`template-core-hardening`（清单派生与 `check:coverage`）。

### Shadow 网关与外部交互替身标准（请求记录、路径转换、有界轮询、响应同形）

#### 解决的问题

测试需要可控的服务端与平台能力，但不能引入真实外部依赖，也不能让"替身 + 真实"混着跑。

#### 实现机制与关键文件

[packages/protocol/testing/shadow](../packages/protocol/testing/shadow) 提供路由、故障注入、请求记录与响应同形校验（`server.ts`、`routes.ts`、`faults.ts`、`requests.ts`、`response-shape.ts`）；路由来源是 `declared-routes.ts` 与 `idl-routes.ts`，不依赖示例；平台能力由产品包定义端口、[packages/e2e/src/drivers](../packages/e2e/src/drivers) 中的替身经用例注入。

#### 关键设计决策与被否决的方案

只提供"替身服务端 + 替身平台能力"一种闭环，否决了"真实服务端 + 替身"或"替身 + 真实平台"的混合模式；轮询必须有界且只在平台环境可用（`SCN-PROTOCOL-CONTRACT-013`）；响应不同形要在构造时被拒绝并要求显式认领（`SCN-PROTOCOL-CONTRACT-006/007`）。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`2026-10-02-generalize-template`（Shadow 路由中立化）、`template-core-hardening`（请求记录、路径转换、轮询与同形校验）。

### 微信开发者工具自动化与执行约定

#### 解决的问题

platform 类证据必须来自真实小程序运行时，而开发者工具不稳定，重复 `launch` 可能挂起。

#### 实现机制与关键文件

[packages/e2e/host/weapp](../packages/e2e/host/weapp) 承载宿主与运行器，[packages/e2e/vitest.config.weapp.ts](../packages/e2e/vitest.config.weapp.ts) 与 `test:e2e:weapp`、`weapp:prepare` 负责启动；约定写在 [packages/e2e/AGENTS.md](../packages/e2e/AGENTS.md)（逐文件运行、每个文件前退出主进程并预热、失败整文件重跑、不用 `-t`）。

#### 关键设计决策与被否决的方案

复用本机开发者工具与 miniprogram-automator，不自研 UI 自动化框架或工具控制器；平台用例经真实 `wx.request` 访问 Shadow，证明平台网络适配的真实性；开发者工具的不稳定本期不修，只用执行约定规避。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`2026-10-02-generalize-template`。

### 统一发布入口与版本策略

#### 解决的问题

发布要走同一个入口，registry 与 tag 前缀不能写死，占位值不能被误发。

#### 实现机制与关键文件

[scripts/sdk-release.ts](../scripts/sdk-release.ts) 与 [scripts/check-release.ts](../scripts/check-release.ts) 按 `manifest.release` 读取 registry 与 tag 前缀，预检拒绝占位值；发布顺序与 tag 规则见 `template-engineering` ENG-04，用例见 `SCN-TEMPLATE-ENGINEERING-004`。

#### 关键设计决策与被否决的方案

发布目标来自清单、由用户显式触发统一入口，不依赖 Pipeline/Runner；否决了在脚本里写死 registry 或项目 ID（复制模板后会误发）。

#### 演进记录

`2026-09-22-headless-payment-sdk`、`2026-10-02-generalize-template`（发布目标来自清单）。

### OpenSpec 工作流与长期约定载体

#### 解决的问题

规划、评审与归档要有统一工作流；长期约定必须落在项目级载体上，不能只存在于某次 Change 的文档里。

#### 实现机制与关键文件

[AGENTS.md](../AGENTS.md) 的 OpenSpec 硬规则与执行规则、三级 AGENTS.md 与 CLAUDE.md、[本指南](template-guide.md) 与[架构文档](architecture.md)；工作流 schema 不随模板提交，由使用方安装（例如 Change Skill 的 `openspec-workflow`），[docs/engineering/bootstrap.md](engineering/bootstrap.md) 记录工具准备。

#### 关键设计决策与被否决的方案

模板只要求 OpenSpec 根与四条硬规则，把格式权威交给 schema 文件与项目配置；否决了把工作流 schema 提交进模板（会把使用方锁在某个版本的 CLI 上）。

#### 演进记录

`2026-09-30-template-example`、`2026-10-02-generalize-template`（工作流 schema 不再提交）、`template-core-hardening`（AGENTS 约定与架构文档）。

### 项目清单驱动工程门禁

#### 解决的问题

包目录、包名、允许目录、必需命令、测试项目与摘要目录一旦写死在门禁脚本里，使用方每改一次拓扑就要改门禁代码。

#### 实现机制与关键文件

[project.manifest.json](../project.manifest.json) 与 [project.manifest.schema.json](../project.manifest.schema.json) 是唯一权威，[scripts/lib/project-manifest.ts](../scripts/lib/project-manifest.ts) 统一加载并用 Ajv 校验，[scripts/run-by-manifest.ts](../scripts/run-by-manifest.ts) 按清单跑测试项目；用例见 `SCN-TEMPLATE-ENGINEERING-005`。

#### 关键设计决策与被否决的方案

清单缺失或校验失败即报错退出，不回退默认值；例外集中在清单登记（覆盖率排除、行数豁免），否决了在 ESLint 与 Vitest 配置里各自维护例外（分散且无法统一校验"每条例外都有理由"）。

#### 演进记录

[2026-10-02-generalize-template](../openspec/changes/archive/2026-10-02-generalize-template/)（引入清单）、`template-core-hardening`（扩展字段、去除写死拓扑）。

### 格式与规模基线（Prettier、行数上限）

#### 解决的问题

格式统一不能靠人工；源文件与测试文件需要不同的行数上限，超限要拆而不是加豁免。

#### 实现机制与关键文件

[.prettierrc.json](../.prettierrc.json) 与 [.prettierignore](../.prettierignore) 提供 `pnpm format` 与 `pnpm format:check`；行数上限由 [eslint.config.js](../eslint.config.js) 的 `max-lines` 执行（源文件 300、测试文件 600，空行与注释不计），豁免只来自 `manifest.quality.maxLinesExemptions`；用例见 `SCN-TEMPLATE-ENGINEERING-010`。

#### 关键设计决策与被否决的方案

引入 Prettier 而不是继续手工对齐；上限与豁免都由清单与规则块统一执行，否决了"超限就在配置文件里登记豁免"（豁免会失控）。

#### 演进记录

`template-core-hardening`。

### 渐进式项目地图与 CLAUDE.md 配对

#### 解决的问题

规则文件太大时 Agent 读不完也读不准；包级规则不该重复写在根文件里，模块级上下文需要就近加载。

#### 实现机制与关键文件

根 [AGENTS.md](../AGENTS.md)「项目地图」、包级 `packages/*/AGENTS.md`「子模块」与模块级 AGENTS.md 组成三级结构，每个 AGENTS.md 旁有首个非空行为 `@AGENTS.md` 的 CLAUDE.md；[scripts/check-project-map.ts](../scripts/check-project-map.ts) 机械核对结构与列表一致（对照清单 `manifest.packages[].moduleRoots`），用例见 `SCN-TEMPLATE-ENGINEERING-011`。

#### 关键设计决策与被否决的方案

CLAUDE.md 用 `@AGENTS.md` 导入行而非软链接（Windows 检出会退化、编辑工具拒绝写入）；模块集合由清单与真实目录派生，`generated/` 与 `tests/fixtures/` 不算模块；各节内容是否准确交给评审，机器只检查结构。

#### 演进记录

`template-core-hardening`。

### 技术架构文档

#### 解决的问题

指南回答"怎么用、怎么换"，但"为什么这样设计、被否决了哪些方案"没有载体，接手维护或写技术方案时只能翻归档 Change。

#### 实现机制与关键文件

[docs/architecture.md](architecture.md) 分粗略层（要解决的问题、整体架构、质量体系主线、关键原则、测试分层对照表）与细节层（能力地图每项一节，固定四部分）；[scripts/lib/architecture-doc.ts](../scripts/lib/architecture-doc.ts) 检查文档存在、被根 AGENTS.md 与 README.md 链接、能力地图每项有同名标题、相对链接可解析；用例见 `SCN-TEMPLATE-ENGINEERING-012`。

#### 关键设计决策与被否决的方案

演进记录只写 Change 名称纯文本或链接已归档目录，正在交付的 Change 不链接（归档搬迁或演练删除目录后链接会断）；文档内容准确性交给评审与复刻验收（无上下文 Agent 只读本文档回答质量体系问题），不做内容机械检查。

#### 演进记录

`template-core-hardening`。

### 场景门禁的 Change 作用域

#### 解决的问题

多个 active Change 同时改同一 Requirement 会让合并产生歧义；交付期间门禁需要只按当前 Change 的作用域运行。

#### 实现机制与关键文件

`pnpm check:scenarios --change <name>` 与 `SCENARIO_GATE_CHANGES=<name>` 限定合并范围（[scripts/lib/verify-arguments.ts](../scripts/lib/verify-arguments.ts)、[scripts/lib/spec-sources.ts](../scripts/lib/spec-sources.ts)）；用例见 `SCN-SCENARIO-GATE-017/018/019`。

#### 关键设计决策与被否决的方案

作用域只影响 Spec 合并与归档搬运，格式前置检查与清单模式不受影响（`SCN-SCENARIO-GATE-019`）；副本用例按作用域归档对应 Change 并清除变量，否决了让门禁"猜"该合并哪些 Change。

#### 演进记录

`template-core-hardening`。

### 按需测试与统一验收入口

#### 解决的问题

每个任务都跑全量太重，但按需运行不能替代全量证据；验收步骤多且要按同一 run id 串起来，失败后还要能续跑。

#### 实现机制与关键文件

[scripts/test-affected.ts](../scripts/test-affected.ts) 按改动的 Spec、Fixture、代码与门禁模块选择受影响场景，命中清单或构建输入时退化为全量；[scripts/verify.ts](../scripts/verify.ts) 依序执行验收步骤并写同一 run id 的报告；用例见 `SCN-SCENARIO-GATE-020/021/023/024/025`。

#### 关键设计决策与被否决的方案

按需报告带 `partial` 标记、场景门禁直接拒收（`SCN-SCENARIO-GATE-022`），否决了让按需结果充当验收证据；全量触发条件覆盖清单、构建输入与工具配置，宁可退化为全量也不漏跑。

#### 演进记录

`template-core-hardening`。

### X-Request-Id 按公司规范

#### 解决的问题

每个请求要带公司规范的链路追踪 ID，且宿主不能覆盖它；生成逻辑必须在三端一致。

#### 实现机制与关键文件

[packages/protocol/src/transport/request-id.ts](../packages/protocol/src/transport/request-id.ts) 生成 26 位 ID（按北京时间、末尾 6 位小写字母），头名为 `X-Request-Id` 且与 `BaseReq.requestId` 同值；时钟与随机源可注入但不作为公开参数；用例见 `SCN-PROTOCOL-CONTRACT-008/009/010`。

#### 关键设计决策与被否决的方案

小程序、浏览器与 Node 共用同一份同步实现，末尾 6 位用 `Math.random`（公司规范只规定格式，请求 ID 只用于链路追踪，不要求密码学安全），不设平台点位、不按平台分支、不改 async、不用 `wx.getRandomValues`，也不引入 `nanoid` 等运行时依赖；否决了"缺少 `crypto` 就抛错"的分支。

#### 演进记录

`template-core-hardening`（公共 API 破坏性变更：请求 ID 由执行器内化，宿主不再提供）。

### 模板示例解耦与删除白名单

#### 解决的问题

示例业务要能被使用方整块删除，而示例当前还承载着通用证据；不先迁出就删除，门禁会一起垮掉。

#### 实现机制与关键文件

通用证据已迁出到产品包 `consumedOperations` 声明、协议包 `businessErrors`、按入口发现的注释门禁、测试输入自带 FLOW 与新增的工程 Scenario；示例片段用 [scripts/lib/example-markers.ts](../scripts/lib/example-markers.ts) 的成对标记包裹，删除白名单与时机写在[指南](template-guide.md)「移除模板示例」；删除后的全绿证据由 `SCN-TEMPLATE-ENGINEERING-008` 在隔离副本中承担。

#### 关键设计决策与被否决的方案

先迁出再删除；删除直接提交，不写 REMOVED delta、不走归档，只在初始化阶段适用于白名单内容（项目后期退役自己的能力仍走正常 Change）；副本用 `git ls-files -co --exclude-standard` 复制并在副本内安装依赖，否决了链接原仓库 `node_modules`（workspace 链接会解析回原仓库，测到的不是删除后的代码）。

#### 演进记录

`2026-10-02-remove-payment-business`、`template-core-hardening`。

### 复刻验收方法

#### 解决的问题

模板改动的效果不能用"门禁全绿"自证：指南是否够用、替换点是否完整，要由没有上下文的执行者按指南真的做一遍才能发现。

#### 实现机制与关键文件

方法沉淀在[指南](template-guide.md)「复刻验收」：在待验收提交上导出隔离副本（改动未提交时用 `git ls-files -co --exclude-standard` 复制）、`git init` 后只做一次初始提交、按锁文件安装；模拟交付状态后交给全新无上下文的 Agent，提示词只含副本路径、先读根 AGENTS.md 与指南、操作目标与规则，禁止读取 `openspec/changes/` 与 `artifacts/`；输入选代表性子集，通过标准是确定性门禁全通过加历史问题不复现；猜测记录按"指南已覆盖但未读到 / 指南缺失需修订 / 合理的自主判断"三类判定，证据写入 Change 的 verify 记录。

#### 关键设计决策与被否决的方案

每个演练派发全新无上下文 Agent，否决了由带上下文的主 Agent 执行（会不自觉绕过指南缺口）；验收命令遵循作用域约定，副本中仍有 active Change 时用 `pnpm verify --change <该 Change>`。

#### 演进记录

`2026-10-02-generalize-template`（首次演练与重新演练）、`template-core-hardening`（沉淀为指南章节并在本 Change 验收）。
