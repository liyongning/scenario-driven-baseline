## Context

`main`（`c734554`）已删除全部支付业务，质量体系在示例与 4 份通用能力 Spec（`scenario-gate`、`template-engineering`、`protocol-contract`、`template-example`）上运行，`check:fast`、逐文件 weapp 与场景门禁全绿。本 Change 是模板演进的收尾，把仓库变成使用方可以直接拿去演进的 **SDK 领域模板**。

用户确认的定位与交付标准：
- AI 时代的前端项目模板；当前只交付 SDK 领域模板，其他场景由使用方基于它演进；质量体系是核心。
- 交付一个大而全、可运行的模板，以"最小可运行"为标准；**不做**交互式脚手架、生成器或选项开关。
- 使用方（主要是 Agent）依靠三样东西承接：门禁读取的**项目清单**、**替换点地图**、**使用指南**；初始化以使用方仓库中的第一个 Change 完成，并由同一套门禁验收。

现状中阻碍"直接演进"的写死点（已逐一核对代码）：

| 写死内容 | 位置 |
| --- | --- |
| 包目录名、允许目录、包名、私有标记、协议包禁止依赖 | `scripts/check-architecture.ts:10-15,38-40` |
| 必需命令 | `scripts/check-architecture.ts:11` |
| 测试项目名与 kind 的允许项目 | `scripts/verification.schema.json:29,40,44,48`；`scripts/flow.schema.json:11`；`scripts/check-scenarios.ts:12,55-56,382,386`；`scripts/lib/spec-inventory.ts:15` |
| 协议义务的运行环境 `['integration','weapp']` | `scripts/lib/contract-inventory.ts:197-242` |
| 源码摘要目录 | `scripts/lib/fingerprints.ts:39-51` |
| 包名 | `scripts/check-package.ts:44-56`；`scripts/check-release.ts:19-20,51,77-78,106-113`；`scripts/sdk-release.ts:67` |
| 发布 registry（GitLab 项目 245）与 tag 前缀 `payment-sdk-v` | `scripts/check-release.ts:5,15,86-90`；`scripts/sdk-release.ts:41,212` |
| Shadow 路由类型依赖生成的 `RpcMethodMeta` | `packages/payment-protocol/testing/shadow/routes.ts:1-9`；服务器实际只用 `httpMethod`、`path`（`server.ts:67-68`） |

此外仍带支付身份：包目录与包名、根包名与描述、测试别名 `@payment-test/*`、环境变量 `PAYMENT_RUN_ID`/`PAYMENT_REPORT_FILE`、用例元数据 `paymentCase`、注解 `payment-evidence`/`payment-flow`、摘要键 `paymentBehavior`、导出 `paymentBusinessErrors*`、全局 `__PAYMENT_TEST_RUNNER__`、weapp 宿主标题与 `projectname`、临时目录前缀、README 中的本机路径与支付链接；两份主 Spec 的 Purpose 仍是归档生成的 "TBD" 占位。

```mermaid
flowchart LR
  M[project.manifest.json<br/>+ schema] --> A[check-architecture]
  M --> S[spec-inventory / check-scenarios]
  M --> C[contract-inventory]
  M --> F[fingerprints]
  M --> P[check-package]
  M --> R[check-release / sdk-release]
  G[docs/template-guide.md<br/>能力地图 · 流程 · 初始化 · 替换点地图] --> U((使用方 Agent))
  M --> U
  U -->|第一个 Change：删 / 换 / 增| M
```

图中门禁只依赖清单；使用方改清单与对应文件，不改门禁代码。指南负责解释与操作步骤，清单负责机器可校验的事实。

## Goals / Non-Goals

**Goals:**
- 门禁脚本的非测试文件中不再出现包目录名、包名、测试项目名（与类别同名者除外）与发布 registry 的字面量；这些事实只来自 `project.manifest.json`。
- 仓库中不再有支付身份：除"残留允许清单"外，`git grep -niE "payment|PAYMENT_|paysdk"` 零命中。
- Shadow 引擎不依赖 ProtoGen 生成代码，IDL 只是一种路由来源。
- 使用指南与替换点地图存在、被链接、章节齐全、链接可解析，并由架构检查守护。
- 每个任务结束时 `pnpm check:fast` 通过；最终验收三项（`check:fast`、逐文件 weapp、以全部报告运行的场景门禁）退出码 0、门禁问题数 0。
- 上一步能力保全清单中的每项能力仍有承载文件与运行证据（以指南的能力地图为项目级承载）。

**Non-Goals:**
- 交互式脚手架、生成器、选项开关；OpenAPI 路由来源、Web/Node 平台实现、业务应用骨架。
- 替换 IDL、修改 ProtoGen Consumer 登记；修改已归档 Change。
- 三类包角色"各一个"之外的多包支持（指南说明扩展方式）。
- 修复微信开发者工具自动化的不稳定问题。

## Decisions

### Decision: 执行顺序

| 任务 | 内容 | 依赖 |
| --- | --- | --- |
| 1 | 项目清单与 schema；门禁改为读取清单；发布预检的占位值拒绝（此时清单仍登记现有名称与 245） | — |
| 2 | Shadow 路由中立化与 IDL 路由来源 | 1（新测试的绑定需要清单） |
| 3 | 包目录、包名、根包名、别名与 ProtoGen 输出路径改名；registry 改为占位值，tag 前缀改名 | 1、2 |
| 4 | 内部标识中立化与上一步遗留的代码小项 | 3 |
| 5 | 使用指南与替换点地图、指南检查；AGENTS/README/bootstrap 改写；工作流 schema 不再提交；Spec Purpose 修正 | 1–4 |
| 6 | 最终验收 | 1–5 |

先做清单（任务 1），后续改名只需改清单与文件，门禁本身在改名任务中不再变化，便于用门禁验证改名是否完整。Shadow 中立化（任务 2）在改名前完成，使改名任务只做机械替换。

### Decision: 项目清单的格式与读取方

新增根目录 `project.manifest.json` 与 `project.manifest.schema.json`（JSON Schema draft 2020-12，`additionalProperties: false`，每个属性带非空中文 `description`），并由新模块 `scripts/lib/project-manifest.ts` 统一加载：读取、用 Ajv 校验、返回只读对象；文件缺失或校验失败时抛出带路径的错误，调用方把它作为门禁问题输出，不得回退到默认值。

清单字段（schema 为唯一权威，此处只说明意图）：

| 字段 | 内容 | 约束 |
| --- | --- | --- |
| `packages[]` | `directory`（`packages/` 下的目录名）、`name`（npm 包名）、`role`（`product` / `protocol` / `test`）、`private`、`allowedDirectories` | 三种角色各恰好一个；`test` 角色必须 `private: true` |
| `requiredCommands[]` | 根 `package.json` 必须存在的脚本名 | 至少一项 |
| `testProjects[]` | `name`（Vitest 项目名）、`class`（`unit` / `integration` / `platform`） | 名称唯一；至少一个 `unit` 与一个 `integration` |
| `fingerprints` | `sourceRoots[]`（参与源码摘要的 `.ts/.js` 目录）、`hostRoots[]`（参与摘要的宿主目录，额外包含 `.json/.wxml/.wxss`） | 路径相对仓库根 |
| `release`（可选） | `registry`、`tagPrefix` | 缺省表示删除了"包发布"模块 |

读取方与改动：

| 读取方 | 现状 | 改为 |
| --- | --- | --- |
| `check-architecture.ts` | 写死三包、允许目录、包名、私有、协议包依赖、必需命令、AGENTS 路径 | 全部取自清单；协议包不得依赖 product 与 test 角色的包；AGENTS 路径为根与每个登记包 |
| `verification.schema.json`、`flow.schema.json` | `requiredIn` 枚举具体项目名，kind 规则写在 `allOf` | `requiredIn` 项改为 `{"type":"string","pattern":"^[a-z0-9]+(?:-[a-z0-9]+)*$"}`，说明写明"取值必须是 project.manifest.json 登记的测试项目"；删除按 kind 枚举项目的 `allOf` |
| `spec-inventory.ts` | 依赖 schema 枚举 | schema 校验之后按清单再校验：`requiredIn` 未登记 → `requiredIn project <x> is not registered in project.manifest.json`；kind 与类别不符（behavior ∉ integration/platform，module ∉ unit，engineering ∉ integration）→ `kind <k> cannot run in <class> project <x>`；FLOW 行同样只允许 integration/platform 类 |
| `check-scenarios.ts` | `Project` 字面量联合类型 | 改为 `string`；运行环境集合来自清单 |
| `contract-inventory.ts` | `requiredIn: ['integration','weapp']`；错误码义务 `['integration']` | 字段/路由/共享义务的环境 = 清单中全部 integration 与 platform 类项目；错误码义务 = 全部 integration 类项目 |
| `fingerprints.ts` | 写死摘要目录与 `packages/e2e/host` | 取 `fingerprints.sourceRoots` 与 `hostRoots`；`openspec/`、Fixture 目录与 `proto-gen.lock` 的摘要规则不变 |
| `check-package.ts` | 写死两个包名 | 按角色取 product 与 protocol 的名称与目录 |
| `check-release.ts`、`sdk-release.ts` | 写死包名、245、tag 前缀、registry 主机 | 见"发布目标来自清单" |

不纳入清单、作为普通配置由使用方直接编辑并在替换点地图中列出的文件：`vitest.config.ts` 与各包 Vitest 配置、`vitest.shared.ts`、`tsconfig.*.json`、`eslint.config.js`、`.dependency-cruiser.cjs`、根 `package.json` 脚本。理由：它们本身就是声明式配置，再从清单生成会增加一层间接，且这些工具不能直接读 JSON 清单的部分需要额外胶水代码；门禁的问题在于"代码写死"，而不是"配置存在"。

守护规则（ENG-05 的 `no-hardcoded-topology`）：测试遍历 `scripts/**/*.ts`（排除 `*.test.ts`），断言不含以下字面量：每个登记包的 `packages/<directory>`、每个包名、`release.registry`，以及与类别名不同的测试项目名（当前为 `sdk-unit`、`protocol-unit`、`test-tools-unit`、`weapp`）。与类别同名的项目名（`integration`）是类别概念，不在检查之列。

兼容性：清单是新增文件，旧报告与 Fixture 格式不变；`scenario-gate.config.json` 继续只管 ID 格式。工具测试在临时根目录运行门禁时，`packages/e2e/tests/tooling/scenario-gate-helpers.ts` 与相关测试 helper 写入一份最小清单。

### Decision: 发布目标来自清单

- `ReleaseInput` 去掉 `targetProject: 245` 字面量类型；`registry` 必须等于清单 `release.registry`，`tag` 必须等于 `${release.tagPrefix}${产品包版本}`；包名按角色取自清单。
- 清单 `release.registry` 含 `<PROJECT_ID>` 时，预检返回 `release registry is a template placeholder; set release.registry in project.manifest.json` 并拒绝，计划生成同样拒绝。
- `sdk-release.ts` 写临时 `.npmrc` 时，scope 与主机从包名和 registry URL 解析，不再写死 `@daqian` 与 `gitlab.daqian369.com`。
- 清单缺少 `release` 时，`release:preflight` 与 `sdk-release` 以"发布模块已删除"退出非零（使用方删除发布模块时应同时删除这两个命令，见替换点地图）。
- 任务 1 中清单仍登记 245 与 `payment-sdk-v`，现有发布用例不变；任务 3 改为占位值 `https://gitlab.daqian369.com/api/v4/projects/<PROJECT_ID>/packages/npm/` 与 `template-sdk-v`。此后 ENG-004 的正例在临时根目录中写入登记具体 registry 的清单运行；新增 `preflight-rejects-placeholder` 用仓库真实清单验证拒绝。
- `.npmrc` 中安装 ProtoGen 的 `@daqian:registry`（项目 216）不变。

### Decision: Shadow 路由中立化

- `testing/shadow/routes.ts`：`ShadowRoute` 改为 `{ methodName: string; httpMethod: string; path: string }`，删除 `meta` 与对 generated 的导入。
- 新增 `testing/shadow/idl-routes.ts`：`routesFromRpcMethods(required, candidates)` 把 `RpcMethodMeta` 转为 `ShadowRoute`；缺少所需方法、`path`、`method` 或 `requestCodec` 时抛错（沿用现有 `discoverExampleRoutes` 的错误语义）。
- `testing/shadow/example/routes.ts`：导出 `exampleRpcMethods`（`[CreateTrade.meta, QueryTrade.meta]`）与 `discoverExampleRoutes()`（调用 `routesFromRpcMethods`）。
- `scripts/lib/contract-inventory.ts` 改用 `exampleRpcMethods` 读取 `requestType`/`responseType`/路径，不再依赖 `ShadowRoute.meta`。
- `.dependency-cruiser.cjs` 新增规则 `shadow-engine-no-generated`：`testing/shadow/` 下除 `idl-routes.ts` 与 `example/` 外的非测试文件不得导入协议包 `src/generated/`。
- `testing/index.ts` 增加导出 `routesFromRpcMethods` 与 `ShadowRoute` 类型；`bootstrap.test.ts` 的导出清单断言同步。
- 现有 `example/routes.test.ts` 与 `server.test.ts` 的断言语义不变，只适配类型；新增 PC-04 的 module 用例放在 `testing/shadow/routes.test.ts`（中立路由）与 `testing/shadow/idl-routes.test.ts`（IDL 来源）；engineering 反例放在 `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts`，在临时副本中让 `server.ts` 导入 generated 并运行 dependency-cruiser，断言违规被报告（沿用 `SCN-TEMPLATE-EXAMPLE-008.spec.ts` 的做法）。

### Decision: 中立命名与 ProtoGen 输出路径迁移

| 旧 | 新 |
| --- | --- |
| `packages/payment-sdk`、`packages/payment-protocol` | `packages/sdk`、`packages/protocol`（`packages/e2e` 不变） |
| `@daqian/payment-sdk`、`@daqian/payment-protocol`、`@daqian/payment-e2e` | `@daqian/template-sdk`、`@daqian/template-protocol`、`@daqian/template-e2e` |
| 根包 `infra-payment-sdk`，描述 "Headless payment SDK workspace tooling" | `sdk-template`，描述"SDK 领域项目模板：示例、质量门禁与工程工具链" |
| 测试别名 `@payment-test/protocol` | `@template-test/protocol` |
| `PAYMENT_RUN_ID`、`PAYMENT_REPORT_FILE` | `VERIFY_RUN_ID`、`VERIFY_REPORT_FILE` |
| 用例元数据 `meta.paymentCase` | `meta.scenarioCase` |
| 注解 `payment-evidence`、`payment-flow` | `scenario-evidence`、`scenario-flow` |
| 门禁摘要 `summaries.paymentBehavior` | `summaries.publicBehavior` |
| `paymentBusinessErrors`、`paymentBusinessErrorsIdlCommit`、`PaymentBusinessErrorDescriptor` | `businessErrors`、`businessErrorsIdlCommit`、`BusinessErrorDescriptor` |
| `__PAYMENT_TEST_RUNNER__` | `__TEMPLATE_TEST_RUNNER__` |
| weapp `projectname: payment-sdk-test-host`、标题 "Payment SDK Test Host" | `sdk-template-test-host`、"SDK Template Test Host" |
| 临时目录前缀 `payment-*`（如 `payment-sdk-release-`、`payment-release-cli-`） | `template-*` |
| 测试辅助函数 `paymentSource` 等局部名 | `generatedSource` 等中立名 |

ProtoGen 输出路径迁移（已在仓库副本上验证）：先把 `proto-gen.yaml` 的 `path` 改为 `packages/protocol/src/generated`，此时旧目录 `packages/payment-protocol/src/generated` 必须仍在原位；执行 `pnpm proto:sync`，工具把输出迁到新路径；锁文件只变化 `outputs.*.path` 与 `configDigest`，生成文件逐字节不变，`proto:status` 为 `up_to_date`。若先移动目录再同步，会报 `output_conflict`。因此任务 3 的顺序是：改 `proto-gen.yaml` → `proto:sync` → 再 `git mv` 其余协议包文件到 `packages/protocol`（生成目录已由工具迁移）。`consumerId: infra-payment-sdk`、source id `payment-idl`、output id `payment-ts` 保持不变（用户决定保留 Consumer 身份；改 id 需要重新采纳输出，收益为零）。

`SCN-PROTOCOL-CONTRACT-003` 的生成来源基线：
- `manifest.sources.generatedCurrent.output.path` 与 `configDigest` 更新为迁移后的值；`provenance/current.lock` 替换为迁移后的 `proto-gen.lock` 内容，并刷新 `manifest.provenance.sha256` 中对应摘要。这是配置路径变化，生成内容与兼容字段不变，符合"仅元数据变化时允许刷新来源"的规则。
- `generatedCompatibility`、`provenance/before.lock`、`after.lock`、`sync.json`、`status.json` 是支付时期的真实工具输出，作为历史证据保持原样（其中路径仍为 `packages/payment-protocol/...`）。

其余 Fixture manifest 中指向源文件的路径与摘要随改名刷新（`check:fixtures` 校验）。

**残留允许清单**（任务 6 的残留检查按此归属；清单外命中即为遗漏）：
1. `openspec/changes/archive/**`、`artifacts/**`：历史记录，不修改。
2. `packages/protocol/src/generated/**`：ProtoGen 生成代码，名称来自 IDL。
3. `proto-gen.yaml`、`proto-gen.lock`：Consumer 身份 `infra-payment-sdk`、`payment-idl`、`payment-ts`。
4. `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/**`：借用 IDL 的来源事实（Go 文件名、历史工具输出、`paymentSemanticCommit` 等字段）。
5. 直接引用 IDL 生成名称的代码：从 generated 导入的类型/枚举名（如 `XpayEnv`、`PayParams`、`CreateTradePay*`）及 IDL 路径 `idl/infra/pay/...`，仅限 import 语句与使用这些名称的位置。
6. `.npmrc` 无 payment 字样，不在清单内。

### Decision: 工作流 schema 不随模板提交

- 门禁只依赖 4 条硬规则与 3 份格式 schema（以及新的清单 schema），代码中没有读取 `openspec/schemas/` 的地方（已核对：仅根 `AGENTS.md:13,24` 与 `README.md:27` 提到它）。
- 任务 5 执行 `git rm -r --cached openspec/schemas/openspec-workflow` 并在 `.gitignore` 加入 `openspec/schemas/`；工作区中的本地副本保留，本 Change 后续阶段照常使用。合并到 `main` 时 Git 会删除 `main` 工作区中的该目录，下一次 Change Skill 运行时由其安装器重新安装。
- `AGENTS.md` 硬规则 1 与执行规则 1 改为"工作流由使用方提供（例如 Change Skill 安装的 openspec-workflow），模板只要求 OpenSpec 根与 4 条硬规则"；README 同步。

### Decision: 使用指南与替换点地图

新增 `docs/template-guide.md`，规定章节（标题文字固定，架构检查按标题判定）：

1. `## 能力地图`：沿用上一步能力保全清单的各项能力，每项写明承载文件与验证方式（场景 ID 或命令）。这是能力保全清单的项目级承载。
2. `## 从方案到验收`：OpenSpec 规划 → Plan Review → 实现 → `check:fast` → 逐文件 weapp → 场景门禁 → 归档；每步对应的命令、门禁与证据位置（`artifacts/<run-id>/`），以及 `VERIFY_RUN_ID` 的用法。
3. `## 初始化方式`：复制模板（不带历史）→ 安装工作流（例如 Change Skill）→ 在使用方仓库中新建第一个 Change：改清单与包名、替换 Consumer 与 IDL、按需替换或删除可替换点、以示例为样板新增自己的业务模块；**先加后删**：自己的业务覆盖到示例承担的能力后再删除示例；最后用三项验收证明。
4. `## 替换点地图`，含三个三级标题：
   - `### 协议来源`：当前 IDL + ProtoGen。涉及 `proto-gen.yaml`/`.lock`、`packages/protocol/src/generated`、`testing/shadow/idl-routes.ts` 与 `example/routes.ts`、`scripts/lib/contract-inventory.ts`、错误码目录与 `SCN-PROTOCOL-CONTRACT-003` Fixture、`protocol-contract` Spec；换 IDL 时改 Consumer；换 OpenAPI 时新增路由来源并替换义务派生与错误码来源校验（或明确不启用并修改 Spec）。验收：`SCN-PROTOCOL-CONTRACT-001～004`。
   - `### 运行平台`：当前微信小程序。涉及协议包 `src/adapters/network/wechat-miniapp.ts` 与根导出、`packages/e2e/src/drivers/weapp*.ts`、`packages/e2e/host/weapp/`、`tests/weapp/`、`packages/e2e/vitest.config.weapp.ts`、清单 `testProjects`（platform 类）、`fingerprints.hostRoots`、`requiredCommands` 中的 `test:e2e:weapp`、e2e 包 `allowedDirectories` 中的 `host`、Spec 中 `requiredIn` 含 `weapp` 的 case；换 Web/Node 时新增对应网络适配器与驱动。验收：`check:fast` 与新平台项目的报告。
   - `### 包发布`：可删除模块。涉及 `scripts/sdk-release.ts`、`check-release.ts` 及测试、`SCN-TEMPLATE-ENGINEERING-004` 用例与 Fixture、`template-engineering` ENG-04、清单 `release` 与 `requiredCommands` 中的 `release:preflight`、`sdk-release`、各包 `publishConfig`。验收：`check:fast`。
   每项都写"清单需要修改的项"与"验收所用门禁"。
5. 附加说明（非规定章节）：扩展更多包（扩展清单 schema 与读取方）、已知限制（weapp 不稳定与预热约 25 秒、平台能力替身只有文字标准、首次真实使用前地图未经验证）。

架构检查新增（`scripts/check-architecture.ts` 的 `checkTemplateGuide`）：文件存在；根 `AGENTS.md` 与 `README.md` 中存在指向 `docs/template-guide.md` 的链接；上述 4 个二级标题与 3 个三级标题齐全；指南中的相对链接都能解析（复用现有链接解析逻辑）。缺失项逐条报告。

### Decision: 文档改写

- 根 `AGENTS.md`：标题改为"SDK 模板 Agent 入口"；"必读"增加指南与清单；硬规则 1 与执行规则 1 按"工作流 schema 不随模板提交"改写；执行规则 10 改为"ProtoGen Consumer 按产品实际依赖登记"；外部交互替身标准中 Shadow 一条改为"路由来自协议来源（当前由 IDL 生成描述转换）"；新增"项目清单"一节（作用、schema 路径、最小示例、哪些事实必须改清单）。
- 各包 `AGENTS.md`：目录与包名、`@template-test/protocol` 别名、依赖规则路径同步；协议包补充 Shadow 中立路由与 `shadow-engine-no-generated`；e2e 包"微信开发者工具自动化的注意事项"把预热改为"约 25 秒"。
- `README.md`：改写为模板简介（定位、三包、示例、常用命令、指向指南），删除本机路径、支付链接与项目 245；`docs/engineering/bootstrap.md` 中包名与路径同步。
- 两份主 Spec（`template-engineering`、`protocol-contract`）的 `## Purpose` 由 "TBD - created by archiving…" 改为一句话说明。OpenSpec 的 delta 不能修改 Purpose，因此直接编辑主 Spec，属于有意例外，在验收索引中记录。

### Decision: 上一步遗留小项

- `SCN-TEMPLATE-ENGINEERING-003` 的 `source-and-dual-declarations.json` 中 `ExampleClientOptions` 增加 `requestContext` 子字段 `productId`、`lane`、`appVersion`（检查器已能遍历嵌套属性签名；如不能，扩展检查器以支持嵌套类型字面量）。
- 删除 `wechat-miniapp.test.ts` 第 6 行引用已删除支付场景的注释。

### Decision: 验证方式

- 每个任务：`pnpm check:fast` 退出码 0；以 unit、integration 与本任务受影响的 weapp 文件报告运行场景门禁，问题逐条归属到后续任务或判为回归；任务 3 起使用 `VERIFY_RUN_ID`（任务 3 之前仍为 `PAYMENT_RUN_ID`）。
- 任务 3 改动宿主与包路径后，4 个 weapp 文件逐文件运行（每文件前退出开发者工具主进程并预热约 25 秒）。
- 最终（任务 6）：`check:fast`；逐文件运行全部 weapp；以全部报告运行场景门禁；三者退出码 0、问题数 0。残留检查：`git grep -niE "payment|PAYMENT_|paysdk"`，每处命中归属到"残留允许清单"的某一类，否则为遗漏。逐项核对指南能力地图中每项能力的承载文件与运行证据。

## Risks / Trade-offs

- **改名范围大（约 75 个文件、349 处包名引用）**：先由清单收拢门禁（任务 1），改名后以门禁、类型检查、Fixture 检查与残留检查机械判定是否完整。
- **ProtoGen 迁移依赖访问 IDL 仓库**：`proto:sync` 需要网络与 IDL 仓库读权限；失败时停止任务 3 并报告，不手工改锁文件。
- **schema 不再枚举项目名，格式错误更晚暴露**：由 `spec-inventory` 按清单报告，错误信息包含场景 ID、case 与项目名，GATE-05 的反例覆盖。
- **替换点地图未经真实使用验证**：登记为 OI-01。
- **工作流 schema 不再提交后，新克隆需要先安装工作流**：指南"初始化方式"写明。

## Open Items

| ID | 状态 | 责任方 | 内容 | 关闭依据 | 影响 |
| --- | --- | --- | --- | --- | --- |
| OI-01 | 开放（本 Change 之后） | 用户 | 替换点地图首次真实使用验证（例如一个 Web SDK 试做或下一个真实项目） | 有使用方按地图完成一次替换，并把发现的遗漏补回模板 | 指南"已知限制"注明地图尚未经过真实使用 |
