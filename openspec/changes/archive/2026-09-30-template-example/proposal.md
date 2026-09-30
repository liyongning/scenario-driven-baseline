## Why

本仓库从 infra-payment-sdk `1e23ae4` 复制而来（不含历史），目标是逐步沉淀为去除业务逻辑、只保留技术架构的通用项目模板。删减按"先新增、再删除"推进：先新增一个中立示例，覆盖模板要保留的全部能力范畴，再删除支付业务。这样删减后，各项门禁仍有真实的检查对象，不会在对象为空时通过。每一步结束后 `pnpm check:fast` 必须通过。

本 Change 在做模板的过程中，既新增示例，也会落地一批通用能力（门禁脚本、格式 schema、硬规则及其文字说明）；这是在丰富模板，不只是删减原项目。原则是：**长期生效的约定必须有项目级载体**（AGENTS.md、schema、配置文件、脚本），Change 文档只负责把它们落地并记录原因；使用方不需要回看已归档的 Change 或某个能力的 Spec，就能知道在本项目里该怎么做。原项目 AGENTS.md 中写死到某个归档 Change 路径的"必读"链接违反这一原则，本 Change 一并修正。

示例有两个用途：一是在模板里把技术架构的全流程完整走一遍；二是给后续使用方做样板。示例的行为证据由 Shadow 提供：在契约确定的前提下，Shadow 网关让前端内部就能把整套服务闭环起来，不依赖真实服务端的部署和登录态。

模板保留的能力范畴：

- A 工程骨架：pnpm workspace、Vite 库模式双格式及声明、TS 分层配置、ESLint、私有 registry、统一门禁入口。
- B 架构分层：三包单向依赖，包内工厂/核心/端口/适配器/运行辅助分层，依赖方向机器门禁，AGENTS 规则。
- C 协议契约：ProtoGen 生成，生成来源与手写事实分别校验。
- D 测试体系：Scenario ID、单 case、FLOW、Fixture、behavior/module/engineering 三类验证边界、场景覆盖门禁、覆盖率、驱动与替身、运行证据。
- E 验收双模式：Shadow 与 Live。
- F 交付发布：包消费验证、统一发布入口、版本策略。
- G 规划约束：整套架构由 OpenSpec 驱动。

现有场景门禁不支持新增示例：`scripts/check-scenarios.ts` 把 Spec 来源写死为已归档支付 Change 的两个文件，`scripts/lib/spec-inventory.ts` 把 ID 格式写死为 `TC-PAYSDK-*` / `FLOW-PAYSDK-*`。示例 Spec 的场景因此进不了门禁，需要先把门禁通用化。这一实现也与原 Design 的要求（按"已沉淀 Spec + active change"构建场景全集）不一致。

## What Changes

### 1. 场景门禁通用化（首个任务，示例的前置）

- 场景清单来源改为 `openspec/specs/**/spec.md` 加 active change 下的 `specs/**/spec.md`，按 OpenSpec 生命周期合并增、改、删；不再写死归档路径。
- Scenario/FLOW 的 ID 格式改为项目配置项，允许同时登记多个格式。默认格式沿用 Change Skill 与本仓库 schema 模板已规定的 `SCN-<CAPABILITY>-<NUMBER>`，FLOW 使用对应的 `FLOW-<CAPABILITY>-<NUMBER>`；过渡期内支付的 `TC-PAYSDK-*`、`FLOW-PAYSDK-*` 与之并存。Spec 清单与 Fixture 检查使用同一份配置；场景报告器只收集执行事实，测试绑定中的 ID 由门禁对账时与清单比对。
- 支付的 8 条 FLOW 登记在已归档 Change 的 delta spec 中，写在 Requirement 之外的独立章节里。OpenSpec 归档时以 Requirement 为单位合并，这一节因此没有进入 `openspec/specs/payment-sdk/spec.md`（已用模拟归档复现）。本 Change 通过 MODIFIED SDK-14 把这张表原样放进 SDK-14 正文：SDK-14 的原文和场景逐字不变，只做数据搬移。已模拟归档本 Change 确认：8 条 FLOW 会保留在主 Spec 中，24 个场景内容不变。
- 门禁在对账前增加四条前置检查，任一不满足直接失败：
  1. 整套架构由 OpenSpec 驱动：仓库存在 OpenSpec Spec 目录，且 `openspec` CLI 可调用。
  2. Spec 中每个 Scenario 都有唯一的场景 ID：全部 Scenario 带 ID 且无重复。
  3. Spec 中每个 Scenario 都带验证元数据：恰好一个 `json verification` 块，并通过 `scripts/verification.schema.json` 校验。这是项目在 OpenSpec 之上的扩展，Change Skill 模板不会生成，目前只由即将删除的支付 Spec（SDK-14）和面向支付的 AGENTS 条款约束，所以提升为模板级规则。
  4. FLOW 表写在某个 Requirement 的正文里：表头第一列为 `FLOW ID` 的表格若在 Requirement 之外，归档时会被丢弃。FLOW 的整套登记方式同样是项目扩展，Change Skill 中没有这个概念。
- 第 2、3、4 条规则各有一份格式 schema，作为该格式的唯一权威定义，每个字段都用 `description` 写中文说明：场景 ID 配置 `scenario-gate.config.schema.json`（新增）、验证元数据 `scripts/verification.schema.json`（补字段说明，`blockedBy` 从支付专用的 `SDK-P-` 格式放宽为通用的依赖引用）、FLOW 行 `scripts/flow.schema.json`（新增，门禁把 FLOW 表每一行解析成对象后校验）。字段含义此前只写在已归档的支付 Design 中，且已与现状不一致，今后不再作为依据。
- FLOW 表"关联 Scenario"一列暂定为说明性内容，门禁不校验；支付表使用的是简写，强制完整 ID 会破坏支付基线。登记为已知缺口，删除支付后收紧。
- 根 AGENTS.md 增加上述四条硬规则的说明：每条给出一句规则、对应 schema 路径和一个最小示例，不重复列字段表。Spec 中的 `scenario-gate` 只定义门禁按这些 schema 校验与阻断的行为，不另写格式定义。工作流 schema、CLI 安装方式和 ID 前缀属于使用方选择，模板不强制。
- 验收要求：改造后支付子集的清单、case 义务，以及对固定对账输入的输出与改造前一致；四条前置检查各有违规反例。

- AGENTS.md 结构调整：根目录和三个包的 AGENTS.md 都拆成两部分——"模板通用规则"（本 Change 新增或改写，长期有效）和"当前业务：支付"（原有支付条款与写死到归档 Change 的必读链接原样移入，删除支付时整节移除）。根"必读"改为通用入口：有效 Spec 在 `openspec/specs/`，进行中的 Change 用 `openspec list` 查看。
- 根 AGENTS.md 增加"场景门禁与归档"说明：门禁读取哪些 Spec、ID 格式在哪里配置、归档时必须做的事（FLOW 表写在 Requirement 里；Fixture manifest 的 Spec 路径改指向归档目录）。
- 三个包的 AGENTS.md 各增加"按示例扩展新业务"：以示例为参照写明本包的分层、隔离规则、依赖方向与 lint 规则的含义，以及测试、Fixture、Shadow 路由的放置位置。`payment-protocol/AGENTS.md` 中"Shadow 路由只限 CreateTradePay/QueryTrade"的条款改为允许按业务登记路由，否则与示例冲突。

### 2. 中立示例："资源创建与状态观察"

- 语义：宿主发起创建，得到资源引用；SDK 在有界窗口内轮询查询状态，一次返回结论：已完成、已关闭、窗口结束仍未终态、失败或被取消。示例 Spec 只描述这类通用行为，不引入支付、渠道、PAID 等支付概念。
- 协议：复用支付 IDL 中已生成的 `CreateTrade`（`POST /api/base/trade/create`）和 `QueryTrade`。两者均在现有 Consumer 投影范围内，不修改 IDL、Consumer 或生成配置。示例适配器负责把交易字段和状态映射为示例的中立模型；以后更换 IDL 时只改这层映射。
- 隔离：示例代码在 SDK、协议 testing、E2E 中都有独立的目录和命名空间，不复用支付的 core、backend 适配器、测试用例或 Fixture，保证后续删除支付时不牵连示例。

### 3. 示例对各能力范畴的覆盖

| 能力 | 示例提供的最小覆盖 |
| --- | --- |
| A 工程骨架 | 示例公共入口进入双格式构建、声明产物，并通过 typecheck/lint |
| B 架构分层 | 按工厂 → 核心 → 端口 → 适配器分层；依赖方向门禁覆盖示例目录，至少一个违规反例 |
| C 协议契约 | 经 generated metadata/codec 和实例执行器发送请求；复用手写错误码目录处理至少一个业务错误 |
| D 测试体系 | `SCN-TEMPLATE-EXAMPLE-*` 场景（含 behavior、module、engineering 三类 case）、登记在 Requirement 正文中的 FLOW、版本化 Fixture，并纳入场景门禁与 100% 覆盖率 |
| E Shadow | Shadow 新增 `CreateTrade` 路由，编排状态推进，至少一个故障注入；Node integration 与 weapp（真实 `wx.request`）各有运行证据 |
| E Live | Live 控制台新增示例页面（创建后查询观察，不发起支付），作为样板交付；构建和证据门禁可离线验证。本 Change 不做真实运行 |
| F 交付发布 | 独立的包消费用例打包并以 ESM、CJS、类型声明三种方式消费示例导出；`check:package` 与支付门禁保持不变，示例产物照常经过它的现有检查；发布入口仅做预检，不实际上传 |
| G 规划约束 | 本 Change 本身按 OpenSpec 工作流推进，示例场景由通用化后的门禁对账 |

### 非目标

- 不删除、不改动支付业务代码、Spec 或测试，这些留到后续步骤。
- 不修改 IDL、ProtoGen Consumer 或生成来源；不更改包名、scope 或 registry；不实际发布。
- 不改变支付 Spec 已登记的 TC/FLOW 身份与验证要求。
- 不在本 Change 中进行 Live 真实运行，也不验证真实服务端是否接受示例请求；示例的行为证据全部来自 Shadow。

## Capabilities

### New Capabilities

- `scenario-gate`：通用场景门禁的行为，包括 Spec 来源发现、可配置的 ID 格式、四条前置检查、按三份格式 schema 校验、schema 字段说明的完整性检查，以及 Scenario/case/FLOW 与运行报告的对账规则。
- `template-example`：中立示例"资源创建与状态观察"的公共行为、协议映射边界及验收要求。

### Modified Capabilities

- `payment-sdk`：MODIFIED SDK-14，只把 8 条 FLOW 的登记表（连同原有的流程说明与 case 细表）放进 Requirement 正文；原文、场景和 verification 块逐字不变，支付的清单与义务不变。SDK-13/14/17 中与支付无关的工程要求，将来如何迁入通用能力，放到删除支付的步骤处理，本 Change 不迁移。

## Impact

- Spec：通过 `payment-sdk` 的 delta 把 FLOW 表并入 SDK-14，不直接编辑主 Spec。
- AGENTS：根目录与三个包的 AGENTS.md 结构调整及新增通用条款（见 What Changes 第 1 部分）。
- 格式 schema：新增 `scenario-gate.config.schema.json`、`scripts/flow.schema.json`，补全 `scripts/verification.schema.json` 的字段说明。
- 代码：`scripts/check-scenarios.ts`、`scripts/lib/spec-inventory.ts`、`scripts/check-fixtures.ts`、场景报告器及其测试；SDK 与协议包新增示例模块和公共导出；`payment-protocol/testing/shadow` 新增路由；E2E 新增示例用例、Fixture、weapp 执行入口与 Live 页面；`.dependency-cruiser.cjs` 与 `check-architecture` 纳入示例目录；根 AGENTS.md 新增四条硬规则。
- 运行要求：每个任务完成后 `pnpm check:fast` 通过；阶段节点运行 `pnpm check`（需要本机微信开发者工具）。
- 外部依赖：沿用当前支付 IDL 分支 `feat/esm-v1.4` 与 ProtoGen 0.1.2；示例与支付共用同一份生成代码。
- 流程：按 openspec-workflow 推进，Specs/Design/Tasks 完成后须通过 Plan Review 才能 Apply。
