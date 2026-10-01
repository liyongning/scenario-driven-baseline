## Context

本仓库处于模板演进的中间态：`main` 上一步已归档 `template-example`，`pnpm check:fast` 全绿。这一步的目标是删除支付业务逻辑，使仓库成为 **SDK 领域的通用模板**。支付 SDK 的质量体系必须完整保留，并在剩下的示例与通用 Spec 上跑通和验证，使下一个 SDK 项目或 agent 可以照着复刻，不需要猜。

上一版规划按代码层拆分任务（先删 E2E、再删 SDK、再删 Spec）。两轮独立评审共发现 11 个阻塞问题，全部属于同一类：在层层互相引用的代码中，靠手工列出每个任务要改的文件，每一轮都会发现新的跨任务悬空引用，评审因此不收敛。本版改为**按功能（Requirement 与场景）分组删除**，"该删哪些文件"改由门禁机械判定，不再靠人工列举。

经逐项核对，支付与模板的纠缠点如下：

| 纠缠点 | 现状 |
| --- | --- |
| 通用能力挂在支付之下 | 包消费（TC-PAYSDK-CORE-014 的部分 case）、覆盖对账与证据有效性（CORE-015/016）、架构与质量门禁（CORE-017）、公共类型注释进入声明（CONTRACT-021 的结构检查）、错误码来源校验（CONTRACT-024）的规范写在支付 Spec 里，测试绑定的是 `TC-PAYSDK-*`；发布预检测试没有绑定任何场景 |
| 协议义务派生写死为支付接口 | `scripts/lib/contract-inventory.ts` 的方法集合来自 `discoverPaymentRoutes()`，字段策略按 `CreateTradePay`、`QueryTrade` 手写，读取支付 Fixture |
| 支付测试文件是跨功能的聚合文件 | `tests/sdk/TC-PAYSDK-CORE-REMAINING.spec.ts`、`TC-PAYSDK-CONTRACT-REMAINING.spec.ts`、`tests/weapp/TC-PAYSDK-PUBLIC-RUNTIME.spec.ts`、`tests/weapp/FLOW-PAYSDK-REMAINING.spec.ts` 同时覆盖多个功能组的场景 |
| 支付代码被所有支付场景共用 | 任何支付场景的 `pay` 流程都会经过核心编排、渠道适配器、平台设备信息与支付基建适配器，只属于单一功能组的代码几乎只有 Live |
| 示例间接依赖支付类型 | `packages/payment-sdk/src/runtime/default.ts` 引用支付的 `contracts`（`Cancellation`）与 `ports/runtime`；`packages/e2e/host/weapp/protocol-runner.ts` 从 SDK 根入口导入 `Cancellation` |
| OpenSpec 无法删除整个能力 | 已在仓库副本上模拟验证：删光全部 Requirement 后，归档以"Spec 至少要有一个 Requirement"拒绝，CLI 也没有删除能力的命令 |

约束：每个任务结束时 `pnpm check:fast` 必须通过；不改包名、scope、registry、IDL 与 ProtoGen Consumer；示例长期借用支付 IDL 的 `CreateTrade`、`QueryTrade`。

## Goals / Non-Goals

**Goals:**
- 仓库中不再有支付业务代码、支付测试、支付 Fixture、支付 Spec、Live 与支付文档。
- 能力保全清单中的每一项能力，都有项目级承载文件与仍在运行的证据。
- 删除过程由门禁机械判定是否删干净：删掉的场景 ID 在仓库与门禁输出中零残留；删除结束时覆盖率在没有任何豁免的情况下回到 100%。
- 最终验收：`check:fast`、按 AGENTS 约定逐文件运行的 weapp、以全部报告运行的场景门禁，三者都以退出码 0 通过。

**Non-Goals:**
- 包名、scope、registry、目录结构、参数化、可选能力模块化、模板使用指南，都留给下一个 Change。
- 不替换 IDL；不修复微信开发者工具的已知不稳定问题；不新建接入方验证项目；不修改已归档 Change。

## Decisions

### Decision: 执行顺序：先迁出，再按功能由外到内删除

```mermaid
flowchart LR
  T1["1 迁出通用能力"] --> T2["2 协议义务改为针对示例"]
  T2 --> G1["3 删 Live"] --> G2["4 删 xpayEnv"] --> G3["5 删渠道调起"] --> G4["6 删鉴权身份恢复"] --> G5["7 删阶段通知"] --> G6["8 删查询观察"] --> G7["9 删核心与公共入口"]
  G7 --> T10["10 文档与最终验收"]
```

迁出（任务 1、2）时支付代码仍在，迁移后的用例先在原被测对象上跑通。删除（任务 3～9）由外到内：先删最独立的功能，最后删被所有支付场景共用的核心。每组的删除步骤见"每组的删除步骤与完成判定"。

### Decision: 功能分组

分组按 Requirement 边界划分，因为主 Spec 以 Requirement 段落为单位删除。场景与测试的对应关系已按仓库实际引用核对。

| 任务 | 功能组 | 删除的 Requirement（场景） | 删除的 FLOW | 本组删除的测试、Fixture 与独立代码 |
| --- | --- | --- | --- | --- |
| 3 | Live | SDK-17（CORE-021/022/023）；`template-example` EX-07（SCN-TEMPLATE-EXAMPLE-010，经 delta REMOVED） | — | Live 的全部工具、宿主页面与模块、配置、命令、`dotenv` 依赖、Live 文档；Live 相关用例与 Fixture（见"移除 Live"） |
| 4 | `xpayEnv` 环境选择 | SDK-16（CORE-020）、CONTRACT-14（CONTRACT-022/023） | FLOW-008 | `tests/sdk/TC-PAYSDK-CORE-020.spec.ts`、`TC-PAYSDK-CONTRACT-022.spec.ts`、`tests/protocol/TC-PAYSDK-CONTRACT-023.spec.ts`、`tests/weapp/TC-PAYSDK-CONTRACT-023.spec.ts`、`tests/flows/FLOW-PAYSDK-008.spec.ts`；聚合文件中本组的 case |
| 5 | 渠道调起与原生生命周期 | SDK-02（CORE-002）、SDK-03（CORE-003/004）、SDK-04（CORE-005/024）、SDK-08（CORE-009）、SDK-12（CORE-013） | FLOW-002、FLOW-003 | `tests/sdk/TC-PAYSDK-CORE-024.spec.ts`、`tests/flows/FLOW-PAYSDK-002/003.spec.ts`；聚合文件中本组的 case；豁免文件的单测中只绑定本组场景的用例 |
| 6 | 鉴权、身份与恢复 | SDK-10（CORE-011）、CONTRACT-04（005/006）、CONTRACT-05（007/025/026）、CONTRACT-09（013/014/018；024 已在任务 2 迁出） | FLOW-006 | `tests/sdk/TC-PAYSDK-CONTRACT-025/026.spec.ts`、`tests/flows/FLOW-PAYSDK-006.spec.ts`、`tests/weapp/FLOW-PAYSDK-006.spec.ts`；聚合文件中本组的 case |
| 7 | 阶段通知 | SDK-15（CORE-018/019）、CONTRACT-12（020） | FLOW-007 | `tests/sdk/TC-PAYSDK-CONTRACT-020.spec.ts`、`tests/flows/FLOW-PAYSDK-007.spec.ts`、`tests/weapp/FLOW-PAYSDK-007.spec.ts`；聚合文件中本组的 case |
| 8 | 查询、观察与时间策略 | SDK-05（006）、SDK-06（007）、SDK-11（012）、CONTRACT-03（003/004）、CONTRACT-08（011/012/016）、CONTRACT-10（015/017）、CONTRACT-11（019） | FLOW-004、FLOW-005 | `tests/flows/FLOW-PAYSDK-004/005.spec.ts`；聚合文件中本组的 case |
| 9 | 核心与公共入口 | 其余全部：SDK-01、07、09、13、14 与 CONTRACT-01、02、06、07、13 | FLOW-001 | 聚合文件、全部剩余支付用例与 Fixture；豁免清单中的全部文件（整体删除）；SDK 根入口的支付导出；支付 Shadow 路由；错误码缩减；两个支付 Spec 目录；AGENTS 中指向支付 Spec 的链接 |

说明：
- 聚合文件在每组中只删除本组场景的 case，第 9 组删除文件本身。
- 一个 Fixture 目录只要还有未删除的读取方，就保留到读取方所在组再删（例如 `payment-infra/backend.test.ts` 读取的 `TC-PAYSDK-CONTRACT-003/014/017/023`、`FLOW-PAYSDK-006`，随第 9 组删除）。每组开始前用 `git grep "tests/fixtures/<ID>"` 判定。
- 一条 FLOW 的测试同时覆盖多个场景时，随 FLOW 所属组删除；被它覆盖、但属于后续组的场景，在后续组删除前可能暂时缺少证据。这类问题只出现在尚未删除的支付场景上，符合下面的完成判定。

### Decision: 每组的删除步骤与完成判定

每个删除任务（3～9）按同一步骤执行：

1. **列出引用方**：`git grep` 本组全部场景 ID、FLOW ID、Fixture 目录、被删 API 与文件路径，结果写入验收索引。
2. **删除 Spec**：直接从 `openspec/specs/payment-sdk/spec.md`、`payment-sdk-contract/spec.md` 删除本组 Requirement 段落；本组 FLOW 从 SDK-14 正文的 FLOW 表中删除对应行。第 9 组删除两个目录。
3. **删除测试与 Fixture**：删除只属于本组的测试文件；在聚合文件中删除本组 case；删除已无读取方的 Fixture 目录。
4. **删除独立代码**：删除只被本组使用的代码；豁免清单中的文件在第 9 组之前不动。
5. **运行检查**：`pnpm check:fast`；场景门禁（unit、integration 报告，以及涉及的 weapp 报告）。

**完成判定**（机械判定，写入验收索引）：
- `pnpm check:fast` 退出码 0。
- 本组场景 ID、FLOW ID 在主 Spec 正文与测试绑定（`ownerId`、`covers`、`flowId`、测试名）中零残留，在场景门禁输出中零出现。
- **残留与问题逐条归属**：对 `git grep -nE "TC-PAYSDK|FLOW-PAYSDK"`（排除 `openspec/changes/archive/`、本 Change 目录、`artifacts/` 与 generated 代码）的每一处命中，以及场景门禁报出的每一个问题，都在验收索引中写明归属：属于哪个尚未删除的支付功能组、或 Design"过渡期允许存在的门禁问题"表中的哪一行，由哪个后续任务清除。无法归属的命中或问题一律视为回归，本任务不得完成。
- 豁免清单未增加。
- 能力保全清单中的每一项仍有承载文件与运行证据。

规划不预先枚举每个任务结束时应剩下哪些命中或问题；由上面的归属规则在执行时逐条判定。合法的归属依据只有四类：尚未删除的支付功能组（含其仍被读取的 Fixture）、过渡期问题表中的行、Design 中明确指定由后续任务处理的条目（例如 `scenario-config` 的默认格式、v8-ignore 注释由任务 9 处理）、由本 Change 的 delta 在归档时删除的主 Spec 文本（仅限 `openspec/specs/scenario-gate/spec.md` 中 GATE-04 / SCN-SCENARIO-GATE-005 一段；按"OpenSpec 例外"，任务不得直接修改该文件）。

多组共用的用例：一个用例同时绑定多个功能组的场景时（例如 `client.module.test.ts` 中 `alternate-method-internal-adapter` 同时覆盖 CORE-002 与 CORE-010），删除较早的组时只从该用例的 `covers` 中去掉本组场景，`ownerId` 改为仍保留的那个场景，断言不变；最后一个所属组删除时整体删除该用例。

### Decision: 过渡期允许存在的门禁问题

下表列出由本规划自身造成、跨越多个任务的门禁问题，作为"残留与问题逐条归属"的依据之一；尚未删除的支付功能组产生的问题同样可以归属。

| 允许的问题 | 原因 | 允许期间 | 清除任务 |
| --- | --- | --- | --- |
| `SCN-PROTOCOL-CONTRACT-*` 与 `infra.trade.v1.CreateTrade#…`、`QueryTrade#…` 缺绑定 | delta 从任务 1 起生效，实现在任务 2 | 任务 1 | 2 |
| `SCN-TEMPLATE-EXAMPLE-010` 被用例引用但已不在清单中（EX-07 已被 delta 删除） | 用例在任务 3 删除 | 任务 1～2 | 3 |
| `SCN-SCENARIO-GATE-007` 的 unregistered-related-scenario-cli 缺绑定、related-scenarios-registered 未执行 | delta 从任务 1 起生效，实现在任务 9 | 任务 1～8 | 9 |
| 支付用例仍绑定的、示例派生已不再产生的协议义务（`infra.trade.v1.CreateTradePay#…`、`QueryTrade#request-mapping#xpay_env`），报告为 unknown cover | 任务 2 改派生器后，`tests/protocol/TC-PAYSDK-CONTRACT-023.spec.ts` 与对应 weapp 用例仍绑定这些义务 | 任务 2～3 | 4 |
| 尚未删除的支付场景、支付 FLOW 的任何问题 | 支付在任务 3～9 中逐组删除 | 至其所属组 | 3～9 |
| 通用场景（`SCN-*`、`FLOW-TEMPLATE-*`、示例接口的协议义务）的 weapp 报告缺失或摘要过期 | 每个任务都会修改源码，`buildVerificationFingerprints` 覆盖 `src`、`tests`、`scripts`，早前的 weapp 报告随之过期 | 任务 1～8 | 9（任务 9 与任务 10 都重跑全部通用 weapp 文件） |

任务 1～8 运行场景门禁时只需提供 unit、integration 报告，以及本任务新增或修改的 weapp 文件的报告（任务 2 的协议矩阵）。任务 9、10 必须提供全部通用 weapp 文件的新报告，门禁问题数为 0。

### Decision: 共享核心的临时覆盖率豁免

所有支付场景共用的代码，在第 9 组之前无法删除；删除前 8 组的测试，会让这些文件的覆盖率下降。为避免在即将整体删除的代码上反复精细切除，第 3 个任务开始时，在根 `vitest.config.ts` 的 `coverage.exclude` 中加入一段带注释的临时豁免：

```
// 临时豁免（remove-payment-business）：第 9 个任务整体删除后移除本段
'packages/payment-sdk/src/core/client.ts',
'packages/payment-sdk/src/core/observation.ts',
'packages/payment-sdk/src/contracts.ts',
'packages/payment-sdk/src/factory.ts',
'packages/payment-sdk/src/adapters/payment-infra/backend.ts',
'packages/payment-sdk/src/adapters/channels/wechat-miniapp-virtual.ts',
'packages/payment-sdk/src/adapters/platform/wechat-device-info.ts',
'packages/payment-sdk/src/errors/payment-error.ts',
'packages/e2e/src/drivers/channel-double.ts',
```

规则：
- 清单只能减少，不能增加；如需增加，停止并返回 Plan Review。
- 每个任务的验收索引记录当时的清单。
- 场景门禁、类型检查、lint 全程不受豁免影响；清单之外的代码覆盖率始终为 100%。
- 第 9 个任务删除这些文件并移除整段豁免，验证覆盖率在没有豁免的情况下回到 100%，以此证明代码侧已闭环。

### Decision: 能力归属与场景 ID 迁移（任务 1）

测试逻辑不变的迁移只改绑定（`ownerId`、`covers`、测试名、文件名、Fixture 目录与 manifest），不改断言。

| 原场景 | 保留并迁移的 case | 不迁移的 case（原因） | 新场景 |
| --- | --- | --- | --- |
| TC-PAYSDK-CORE-014 | protocol-network-esm/commonjs/types-consumer、sdk-does-not-reexport-network、sdk-only-consumer、package-boundaries | SDK 支付客户端的消费与运行 case（由示例的 SCN-TEMPLATE-EXAMPLE-001 package-consumer 承担 SDK 消费验证） | SCN-TEMPLATE-ENGINEERING-001 |
| TC-PAYSDK-CORE-017 | 全部 9 个 | — | SCN-TEMPLATE-ENGINEERING-002 |
| TC-PAYSDK-CONTRACT-021 | source-and-dual-declarations、missing-comment-rejected（检查对象改为示例公共类型） | semantic-review-evidence（人工语义评审记录，用户决定删除，消除"改任何源码都要重录摘要"的耦合；迁走两个、删除一个后原文件已无用例，任务 1 删除整个测试文件与 Fixture 目录） | SCN-TEMPLATE-ENGINEERING-003 |
| 发布预检（未绑定） | 三个现有测试绑定为 preflight-valid-plan、preflight-rejects-drift、publish-order | — | SCN-TEMPLATE-ENGINEERING-004 |
| TC-PAYSDK-CORE-015 | 全部 3 个 | — | SCN-SCENARIO-GATE-009 |
| TC-PAYSDK-CORE-016 | 全部 10 个 | — | SCN-SCENARIO-GATE-010 |
| SCN-SCENARIO-GATE-005 | pattern-config、removed-pattern-cli；payment-baseline-cli 去掉支付基线断言后改名为 multi-pattern-cli | 支付基线等价 | SCN-SCENARIO-GATE-011 |
| TC-PAYSDK-CONTRACT-024 | 全部，其中 payment-projection-mismatch 改名为 projection-mismatch | — | SCN-PROTOCOL-CONTRACT-003（任务 2） |

示例公共类型的中文注释：ENG-03 改为检查示例后，`packages/payment-sdk/src/example/contracts.ts` 中每个导出的类型、字段与字面量值（例如 `ExampleState`、`ExampleError.category`、`ExampleOutcome.end` 的每个取值，`requestContext`、`ExampleRunOptions`、`ExampleCreateResult`、`ExampleClient` 的每个成员）都须带中文 JSDoc；任务 1 先补齐注释，`SCN-TEMPLATE-ENGINEERING-003` 的 Fixture 列出全部导出的示例类型、字段与取值，不得只列已有注释的子集。现有检查器只收集属性签名与字符串字面量；迁移时允许扩展检查器，使其同时覆盖方法签名（如 `ExampleClient.create`、`observe`）与布尔字面量判别值（如 `ok: true/false`）。这是对检查对象的必要适配，不属于"迁移只改绑定"所禁止的断言语义变更；反例（missing-comment-rejected）的拒绝语义不变。

工具单测中作为样本数据的支付 ID（`define-case.test.ts`、`define-case-execution.test.ts`、`fixture-loader.test.ts`、`scenario-reporter.test.ts`、`check-fixtures.test.ts`、`check-scenarios.test.ts`、`spec-inventory.test.ts`、`tests/tooling/helpers.ts` 等，以 `git grep` 为准）在任务 1 统一改为 `SCN-SAMPLE-*`、`FLOW-SAMPLE-*`，断言语义不变；它们符合任务 1 设置的通用 ID 格式。`scripts/lib/scenario-config.test.ts` 对 `TC-PAYSDK` 默认格式的断言随任务 9 修改默认格式时一并修改。

拆分迁移的场景（CORE-014、CONTRACT-021）：新 Fixture 目录只包含迁走的 case 数据，`source-and-dual-declarations.json` 与 `missing-comment-rejected` 中写死的支付类型改为示例类型；CORE-014 的原 manifest 保留剩余 case，随所属组删除。CONTRACT-021 只有这三个 case，迁走两个、删除一个后不剩任何 case；空测试文件会让 Vitest 报"没有测试"，空 `cases` 的 manifest 违反 Fixture schema 的 `minProperties: 1`，因此任务 1 删除 `packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-021.spec.ts` 与整个 `packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-021/` 目录。此后到任务 9 删除 CONTRACT-13 之前，支付场景 TC-PAYSDK-CONTRACT-021 缺少测试绑定，按归属规则归到尚未删除的第 9 组。

`SCN-SCENARIO-GATE-005/` 目录只含 manifest 与支付基线文件，任务 1 整体删除，不改名。

多格式测试的第二种样例格式：SCN-SCENARIO-GATE-011 要验证"两种不同格式并存、移除其一后报错"，现有测试拿支付格式（`TC-PAYSDK-*`、`FLOW-PAYSDK-*`）当第二种格式，并断言真实配置登记了多种格式。任务 9 删除支付格式后真实配置只剩通用格式，而改成 `SCN-SAMPLE-*` 又会被通用格式匹配、不再构成"第二种格式"。因此任务 1 统一改为与支付无关、且不被通用格式匹配的第二种样例格式：Scenario `^LEGACY-[A-Z0-9]+-[0-9]{3}$`（样例 ID `LEGACY-SAMPLE-001`），FLOW `^LEGACY-FLOW-[A-Z0-9]+-[0-9]{3}$`（样例 ID `LEGACY-FLOW-SAMPLE-001`）。涉及的输入：
- `scripts/lib/scenario-gate.evidence.test.ts` 的 pattern-config：不再读取仓库真实配置的格式数量，改为在临时目录写入一份同时登记通用格式与 `LEGACY` 格式的 `scenario-gate.config.json`，用 `loadScenarioConfig(<临时目录>)` 读取；single-config 断言两种格式都来自这一份配置，multi-pattern 断言 `LEGACY-SAMPLE-001` 与 `SCN-SCENARIO-GATE-001` 都能匹配，removed-pattern-reported 的配置改为只登记 `LEGACY` 格式。
- `packages/e2e/tests/tooling/scenario-gate-helpers.ts` 共享配置中的支付格式改为 `LEGACY` 格式。
- `SCN-SCENARIO-GATE-011.spec.ts` 的 multi-pattern-cli 用 `LEGACY-SAMPLE-001` 与 `SCN-TEST-001`，multi-pattern 改为断言 `LEGACY-` 开头的 ID 恰好一个；removed-pattern-cli 的内联配置改为只登记 `LEGACY` 格式。
这些都是对输入的适配，检查点语义（同一份配置、多格式各自进入清单、移除格式后按 GATE-02 报错）不变，不属于"迁移只改绑定"所禁止的断言语义变更；改完后这些测试不再依赖支付格式，任务 9 删除支付格式时无需再改。新 Fixture 的 manifest 中，`sources.spec.path` 在 Apply 期间指向本 Change 的 delta spec，归档时在同一提交中改指归档目录（沿用上一个 Change 的做法）。

### Decision: ID 格式配置

任务 1 把 `scenario-gate.config.json` 中按能力逐个列出的 `^SCN-SCENARIO-GATE-…`、`^SCN-TEMPLATE-EXAMPLE-…` 替换为一条通用格式 `^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$`，`flowIdPatterns` 同理改为 `^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$`。这样新能力的场景从一开始就符合 GATE-02；支付格式暂时保留。第 9 个任务删除支付格式，`ownerIdPattern` 不再接受 `TC-` 前缀；`scripts/lib/scenario-config.ts`、`spec-inventory.ts` 中的 `TC-PAYSDK` 默认格式，以及脚本中提到 `TC-PAYSDK-CORE-015/016` 的 v8-ignore 注释，同步改为通用格式或新场景 ID。

### Decision: IDL 义务派生改为针对示例接口（任务 2）

`scripts/lib/contract-inventory.ts`：

- 方法集合改为 `discoverExampleRoutes()`，即 `CreateTrade` 与 `QueryTrade`。
- 删除 `xpay_env` 专项校验与对 `descriptor.json` 的读取；错误码清单改读 `SCN-PROTOCOL-CONTRACT-003/idl-errors.json`。
- `requestAuthority`、`responseAuthority` 中引用的支付 Design 与 Spec 行号，改为引用 `protocol-contract` PC-01 与本 Design。
- 共享义务 `header-base-req` 去掉支付专属的 `xpay-env-absent` case；删除两条支付附加义务。`idl.error-contract#business-error#$` 保留。
- `requestPolicies` 按示例映射重写：

| 方法 | 字段 | case |
| --- | --- | --- |
| CreateTrade | biz_type、biz_trade_no、user_id、pay_amount、original_amount | mapped-value |
| CreateTrade | goods_type、discount_amount | fixed-value |
| CreateTrade | items、items.biz_order_no、items.sku_id、items.sku_name、items.quantity、items.unit_price、items.pay_amount | mapped-value |
| CreateTrade | items.discount_amount | fixed-value |
| CreateTrade | items.sku_snapshot、items.sku_snapshot.wechat_virtual_product_id、items.sku_snapshot.biz_snapshot | omitted |
| CreateTrade / QueryTrade | base_req、base_req.request_id | generated-value |
| CreateTrade / QueryTrade | base_req.product_id | configured-value、omitted |
| QueryTrade | trade_no | mapped-value |
| QueryTrade | biz_type、biz_trade_no、sync_channel | omitted |

  响应字段的义务仍由现有规则自动派生。派生器报告的待定字段必须为 0；如出现上表未覆盖的字段，实现时先补齐本表再补策略。

同一任务中：
- 新建示例协议矩阵：integration 用 `tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`；weapp 用 `tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`，一次宿主调用跑完整份清单。Fixture 为 `SCN-PROTOCOL-CONTRACT-002/`，含两个接口的请求与响应样例。
- 删除被它取代的 `tests/protocol/TC-PAYSDK-PROTOCOL-MATRIX.spec.ts` 与 `tests/weapp/TC-PAYSDK-PROTOCOL-MATRIX.spec.ts`。派生不再产生 `CreateTradePay` 义务后，旧矩阵的 `covers` 为空，会在加载时抛错。
- `scripts/check-fixtures.ts` 删除 `TC-PAYSDK-CONTRACT-023` 特例，`scripts/check-fixtures.test.ts` 删除对应断言，保持 100% 覆盖。
- `packages/payment-protocol/src/client.test.ts` 改用 `SCN-PROTOCOL-CONTRACT-002/` 的样例。协议客户端本身没有支付分支，只与 `xpay_env` 有关的两条用例（presence 用例，以及读取 `TC-PAYSDK-CONTRACT-023/descriptor.json` 的独立 Go descriptor 用例）都删除，其余断言语义不变；`client.test.ts` 从此不再读取 CONTRACT-023 的 Fixture。
- `packages/payment-protocol/src/errors/business-codes.test.ts`、`tests/tooling/scenario-gate-helpers.ts` 随 `TC-PAYSDK-CONTRACT-024/` 改名为 `SCN-PROTOCOL-CONTRACT-003/` 同步修改读取路径。
- `packages/e2e/host/weapp/protocol-runner.ts` 的 `runProtocolCase`、`runProtocolSuite` 改为 `createTrade`/`queryTrade`；`Cancellation` 改从 `@daqian/payment-protocol` 导入；`runPaymentCase` 保留到第 9 组。`src/drivers/weapp-host.test.ts`、`weapp.test.ts` 同步。

### Decision: 移除 Live（任务 3）

Live 整体移出模板，理由见 Proposal。删除范围：
- `packages/e2e/src/live/`；`packages/e2e/host/weapp/live/`；`host/weapp/pages/live/`（含示例 Live 页面）；`host/weapp/app.live.js`、`app.live.json`、`vite.live.config.ts`、`project.live.example.json`。
- `packages/e2e/tests/tooling/TC-PAYSDK-CORE-022.spec.ts`、`TC-PAYSDK-CORE-023.spec.ts`、`tests/example/SCN-TEMPLATE-EXAMPLE-010.spec.ts` 及其 Fixture。
- 根 `package.json` 的 `live:build`、`live:check`、`check:live` 与 `dotenv` 依赖（用 `pnpm remove -D dotenv` 更新 lockfile）；`.env.live.example`；`.gitignore` 中的 Live 条目；`docs/engineering/live-acceptance.md`、`live-create-trade-contract.md`。
- 根 `vitest.config.ts` 覆盖范围中的 `packages/e2e/host/weapp/live/**/*.ts` 与 `vite.live.config.ts` 排除项；`scripts/lib/fingerprints.ts` 如有 Live 路径同步删除。
- `packages/e2e/src/bootstrap.test.ts` 等引用 Live 的测试同步调整。

### Decision: SDK 与协议包的最终删除（任务 9）

- SDK：删除豁免清单中的 SDK 文件，以及 `src/ports/`、其余支付单测（`core/*.test.ts`、`adapters/**/*.test.ts`、`contracts.test.ts`、`factory.test.ts`、`errors/*.test.ts`）。新增 `src/runtime/port.ts` 定义 `RuntimePort`，`Cancellation` 改引协议包；`runtime/default.ts` 删除只被支付使用的 `nextAttemptId`。`src/index.ts` 只导出示例的类型、`createExampleClient`、`ExampleConfigurationError`。
- 依赖规则（`packages/payment-sdk/AGENTS.md`"按示例扩展新业务"一节中对旧规则名的引用同步改为 `domain-isolation`）：删除 `example-no-payment`、`payment-no-example`；新增 `domain-isolation`（`packages/payment-sdk/src/<domain>/` 下的业务目录互不导入，`runtime/` 与 `index.ts` 除外）；`core-no-platform-or-node` 路径改为 `src/(runtime|example/(core|ports))/`。`tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts` 的跨目录反例改为临时新建的 `src/sample-domain/`。
- E2E：删除 `channel-double.ts`、`protocol-runner.ts` 中的 `runPaymentCase` 与 `app.js` 中的注册、全部剩余支付用例与 Fixture（工具单测的样本 ID 已在任务 1 改掉）。
- 协议包：删除 `discoverPaymentRoutes` 与 `ShadowRoute['methodName']` 中的支付字面量；`createShadowServer` 的 `routes` 改为必填；`testing/index.ts` 只导出示例路由与通用 Shadow 工具。
- 错误码：删除仅属于 `CreateTradePay` 的 10 项，保留网关的 `ErrGatewayProxyInvalidParameter`、`ErrGatewayProxyUnauthorized`、`ErrGatewayProxyNotFound`，以及 `QueryTrade` 的 `ErrInfraTradeQueryTradeUnauthorized`、`ErrInfraTradeQueryTradeInvalidParameter`、`ErrInfraTradeQueryTradeNotFound`、`ErrInfraTradeQueryTradeUnavailable`。
- Go 来源校验：
  - `SCN-PROTOCOL-CONTRACT-003/` 中的 `extract.go` 只提取上述 7 项并只写 `idl-errors.json`。
  - `reproduce.sh` 的 `go test` 只保留错误描述相关的测试，去掉支付专属的 `PayParams`、`XpayEnv` 测试。
  - 删除只生成支付 Fixture 的 `defensive-fixtures.py`；`refresh-manifests.py` 与 `refresh-manifests.test.py` 按新清单调整。
  - `SCN-PROTOCOL-CONTRACT-003.spec.ts` 中 `toHaveLength(17)` 改为 7。
  - manifest 中 `extraction` 的程序与输入摘要按实际运行结果更新。
  - **验证方式**：在本机以 `reproduce.sh /Users/liyongning/Projects/workspace/dev/idl <临时目录>` 基于 IDL 提交 `5539be8f09323709fa65f6568efe22896ec35d24` 实际运行，将输出的 `idl-errors.json` 与提交的版本逐字节比对，比对结果写入验收索引。
- 删除 `openspec/specs/payment-sdk/`、`payment-sdk-contract/` 两个目录；同一任务中删除四份 AGENTS.md 中指向这两份 Spec 的链接，避免 `check:architecture` 的链接检查失败。
- 删除豁免清单整段配置。

### Decision: OpenSpec 的两处例外

1. **整份删除两个支付能力**：不写 delta，由任务 3～9 直接删除主 Spec 段落，第 9 组删除目录。已模拟验证：删除两个目录后，本 Change 可以正常归档。
2. **GATE-04 以删除加新增代替修改**：原场景标题"多格式并存且支付对账结果不变"若保留会误导使用方，故删除 GATE-04 与 SCN-SCENARIO-GATE-005（编号不再复用），多格式配置迁入 GATE-09 与 SCN-SCENARIO-GATE-011。GATE-03、EX-01、EX-05 的修改只改正文与检查点说明，场景标题原文不变。

### Decision: 外部交互替身的设计标准

在 `packages/payment-protocol/AGENTS.md` 与 `packages/e2e/AGENTS.md` 的"模板通用规则"中写明：

- 凡 SDK 需要与外部交互的地方，测试都在仓库内用替身闭环。服务端接口由 Shadow 网关承载：路由从 generated metadata 发现，按 Fixture 编排响应与故障。平台或第三方能力（例如小程序收银台、系统能力）由平台能力替身承载：在产品包中定义端口，适配器调用真实平台 API，替身放在 `packages/e2e/src/drivers/`，经用例注入。
- 不提供"真实服务端 + 替身"或"替身服务端 + 真实平台能力"的混合模式。真实外部验收由真实消费方项目承担，不在 SDK 仓库内进行。
- weapp 用例仍通过真实 `wx.request` 访问 Shadow，证明平台网络适配的真实性。

### Decision: 能力保全清单

每一项都必须在删除完成后仍有承载文件与运行证据。Plan Review、每个任务的验收与 Verify 都逐项核对。

| 能力 | 删除后的承载文件 | 删除后的运行证据 |
| --- | --- | --- |
| pnpm workspace、Vite 双格式与声明、TS 分层配置、ESLint | 根 `package.json`、各包 `vite.config.ts`、`tsconfig.*.json`、`eslint.config.js` | `pnpm check:fast`（build、typecheck、lint） |
| 三包边界与产品交付 | `template-engineering` ENG-01；`scripts/check-package.ts` | SCN-TEMPLATE-ENGINEERING-001；SCN-TEMPLATE-EXAMPLE-001 package-consumer |
| 分层、端口、依赖方向、`wx` lint、业务目录隔离 | `.dependency-cruiser.cjs`、`eslint.config.js`、`packages/payment-sdk/AGENTS.md` | SCN-TEMPLATE-EXAMPLE-008；SCN-TEMPLATE-ENGINEERING-002 |
| 架构与质量门禁（含 AGENTS 链接、未测文件、规则削减评审记录） | ENG-02；`scripts/check-architecture.ts` | SCN-TEMPLATE-ENGINEERING-002 |
| 公共类型中文注释进入双格式声明 | ENG-03 | SCN-TEMPLATE-ENGINEERING-003 |
| 编译期公共类型契约测试（`@ts-expect-error` 反例消费方、联合类型 `never` 穷尽检查、只读字段） | `packages/payment-sdk/src/example/contracts.test.ts`（任务 1 新增，经 `pnpm typecheck` 编译、sdk-unit 运行）；EX-01 | SCN-TEMPLATE-EXAMPLE-001 的 public-type-contract case |
| ProtoGen 生成与来源状态 | `proto-gen.yaml`、`proto-gen.lock`、`proto:*` 命令 | `pnpm check:fast`（proto:validate、proto:status） |
| IDL 协议义务派生与覆盖 | `protocol-contract` PC-01；`scripts/lib/contract-inventory.ts` | SCN-PROTOCOL-CONTRACT-001/002（integration 与 weapp） |
| 手写错误码事实与 Go 来源校验 | PC-02；`src/errors/business-codes.ts`；`SCN-PROTOCOL-CONTRACT-003/` | SCN-PROTOCOL-CONTRACT-003；`reproduce.sh` 实际运行比对 |
| 协议执行器（公共上下文、Token、预算、取消） | `packages/payment-protocol/src/client.ts`、`transport/` | `client.test.ts`（protocol-unit，100% 覆盖）；SCN-PROTOCOL-CONTRACT-002 |
| 四条 OpenSpec 硬规则与三份格式 schema | 根 AGENTS.md；三份 schema；GATE-01～06 | SCN-SCENARIO-GATE-001～008 |
| 覆盖对账与证据有效性（三类验证、FLOW 连续性、skip、过期等） | GATE-07、GATE-08；`scripts/check-scenarios.ts` | SCN-SCENARIO-GATE-009、010 |
| 可配置 ID 格式 | GATE-09；`scenario-gate.config.json` | SCN-SCENARIO-GATE-011 |
| Scenario/case/FLOW 绑定、Fixture 与 manifest、报告器 | `define-case.ts`、`fixture-loader.ts`、`scenario-reporter.ts`、`scripts/check-fixtures.ts` | 工具单测（test-tools-unit）；示例全部场景与 FLOW-TEMPLATE-EXAMPLE-001 |
| 手写代码 100% 覆盖 | 根 `vitest.config.ts`（豁免段已删除） | `pnpm test:unit` |
| Shadow 网关与外部交互替身标准 | `testing/shadow/`；协议包与 e2e 的 AGENTS.md | SCN-TEMPLATE-EXAMPLE-009；示例 integration 与 weapp 用例 |
| 微信开发者工具自动化与执行约定 | `packages/e2e/src/drivers/weapp.ts`；`packages/e2e/AGENTS.md` | 示例与协议矩阵的 weapp 报告 |
| 统一发布入口与版本策略 | ENG-04；`scripts/sdk-release.ts`、`check-release.ts` | SCN-TEMPLATE-ENGINEERING-004 |
| OpenSpec 工作流与长期约定载体 | `openspec/schemas/openspec-workflow/`；四份 AGENTS.md | 本 Change 自身的生命周期 |

有意移出、不计为丢失的能力：Live 模式、人工语义评审记录、端侧渠道与平台适配器的代码样例（改由外部交互替身的设计标准承载）。

### Decision: 文档（任务 10）

四份 AGENTS.md 的"当前业务：支付"一节里混有大量通用规则。删除该节之前，先把下表中"保留"的规则去掉支付表述，迁入同一文件的"模板通用规则"；"删除"的规则只属于支付或 Live。迁移后，再删除整节、写入外部交互替身的设计标准、更新能力与场景指向，并注明"IDL 协议义务派生针对示例的 `CreateTrade`、`QueryTrade`"。

| 文件 | 保留并改写为通用规则（原条目编号） | 删除（只属于支付或 Live） |
| --- | --- | --- |
| 根 `AGENTS.md` | 2 按 openspec-workflow 推进，Plan Review 与 Apply 按流程执行，文件齐全或 validate 通过不等于获准实施；5 修改行为或接口先维护 Spec/Design/Tasks，已评审输入发生语义变更后重新评审，工程实现依据 Design 与 AGENTS，不重选架构或自研通用基建；6 汇报给出已确认方案与实际变更、执行命令及结果、未解决项，任务状态、工程验收、发布分别判定；7 中的"手写公共类型、字段、状态值及关键映射维护中文注释，声明保留公共 JSDoc"；12 中的"Apply 反馈先核对用户已确认结论、原始契约与复现证据；交接中的'无需确认'不构成用户授权；改变职责边界、公共 API、主流程或技术路线的重大冲突须先向用户确认，独立评审不替代范围授权"；13 中的"协议包根入口导出平台网络工厂，SDK 根入口不转导出"；14 behavior/module/engineering 分类与"内部及工程证据不能抵扣行为证据"；3、4 中的通用部分："密钥、Token、会话凭据不写入规划、日志或代码"，"发布由用户显式触发的统一入口完成，可在本地或受控执行器运行，不依赖 Pipeline/Runner"，"ProtoGen Consumer 在 IDL 仓库按 SDK 实际依赖登记"，"小程序自动化复用本机开发者工具与 miniprogram-automator，不开发 UI 自动化框架，不以 CI 环境缺失阻断本地运行" | 1；3、4 中的支付语义（支付包名、ESM 关系、IDL 提交号、PayParams、错误码条数等）；8、9、10、11 的支付语义；7、12、13 中的支付专属部分；15（Shadow/Live 双模式，改由外部交互替身标准承载） |
| `packages/payment-sdk/AGENTS.md` | 1 `src/index.ts` 是唯一公共导出，工厂校验配置并装配，内部测试工厂不进入公共导出；2 中的"核心只编排内部端口，适配器是外部协议映射的唯一位置"；3 HTTP 执行与公共请求上下文由协议包负责，SDK 不另写 HTTP 层，核心不依赖平台全局；4 中的"宿主只提供已定义的配置与 provider，SDK 不做登录、Token 刷新与 UI"；5 模块单测就近，module case 用 Vitest meta 绑定，不新增 SDK 公共测试导出、不反向依赖 E2E；6 中的"修改本包执行对应门禁；契约缺口先更新 Spec 再评审，不在实现中猜测" | 2、4、6 中的支付语义；7、8、9 |
| `packages/payment-protocol/AGENTS.md` | 1 `src/generated/` 只由 ProtoGen 管理，不手写；2 ProtoGen 为项目根精确版本 devDependency，经项目命令执行，不用全局工具；3 客户端按实例绑定配置并消费 generated metadata 与 codec，公共请求上下文、通信错误、网络适配各有位置；4 协议包不引用 SDK 或 E2E，不解释业务结果，诊断不输出原文；5 testing 只供测试，测试依赖不进入生产导入图与产物，Shadow 路由由 generated metadata 发现；6 手写逻辑单测就近，协议集成与 Fixture 在 E2E，不把业务用例写入 Shadow 引擎；7 中的通用部分："生成契约保留 optional 字段的 presence，codec 区分省略与显式值；不手写数字常量、DTO 或 codec，不在网络层选择环境；Shadow 路由按业务登记；测试匹配保留原始字段存在性，场景期望由 E2E 提供"；8 手写错误码目录以 IDL Go 原文为唯一来源并经独立样例校验；9 generated 来源与手写错误事实来源分别验收 | 7 中的 `xpay_env` 语义与支付 Shadow 登记（CreateTradePay/QueryTrade）；8 中的"17 项"与支付方法名 |
| `packages/e2e/AGENTS.md` | 1 测试期望来自有效 Spec、IDL 与 Design，不能从实现、现有返回值或 Fixture 反推；2 各目录职责（按删除后的实际目录改写）；3 测试文件所有者为场景或 FLOW，Fixture 只保存数据，步骤与断言在用例中；4 稳定 caseId 与检查点绑定，FLOW 必须同一次运行贯通，不得拼接；5 集成测试消费构建后的公开入口，只替换外部服务与平台能力，不 mock 核心、协议客户端与 codec；6 每例独立状态、响应序列固定、断言额外与缺失请求，禁止兜底成功、只断言没有抛错或只贴场景 ID；7 weapp 用例使用生产网络适配，不自写 HttpPort 绕过；8 报告器携带同次运行与摘要，单测证据不能抵扣行为证据；10 中的"新增 IDL 字段不能只刷新来源摘要而跳过覆盖"；11 中的"固定 Go 来源与 generated 来源分开核验" | 9（阶段通知）、10 与 11 中的支付语义、12、13（Live） |

能力保全清单中的"四份 AGENTS.md"一行，以本表"保留"一列为准逐项核对。

- README 删除支付与 Live 内容。
- `docs/engineering/bootstrap.md`（README 以"工具准备记录"链接）：保留通用的工具准备事实（ProtoGen 的安装来源、精确版本与项目内调用方式；脚手架命令及其选项；Profile 需要的 DOM lib 裁定；pnpm 忽略 esbuild 脚本的裁定；测试基础设施依赖的版本），删除支付专属历史（支付 Consumer、`CreateTradePay`、`xpay_env`、PayParams、17 项错误码、按支付 Task 编号的进度与"未完成"说明、项目 245 的支付发布权限核对）。改完后 `git grep -nE "CreateTradePay|xpay|PayParams|支付"` 对该文件零命中，README 链接保持有效。

### Decision: 验证方式

- 每个任务：`pnpm check:fast` 退出码 0；按本任务的完成判定运行场景门禁。
- 最终验收（任务 10）：依次执行 `pnpm check:fast`；按 `packages/e2e/AGENTS.md` 的约定逐文件运行全部 weapp 文件，每个文件一份报告；以 unit、integration 与全部 weapp 报告运行 `scripts/check-scenarios.ts`。三者都以退出码 0 结束，门禁问题数为 0。不使用一次性跑完全部 weapp 的 `pnpm check`，因为它与逐文件约定冲突。

## Risks / Trade-offs

- **豁免期间共享核心的覆盖不受约束**：缓解措施是清单范围固定、只减不增、第 9 组必须清空，并以"无豁免 100%"作为代码侧闭环的证据。
- **后续组的支付场景可能暂时缺少证据**：删除 FLOW 或聚合 case 时，属于后续组的支付场景可能暂时缺少绑定或报告。这只影响即将删除的支付场景，完成判定已把它们划在允许范围内。
- **`CreateTrade` 字段策略可能不全**：以派生器"待定字段为 0"作为完成条件。
- **weapp 矩阵受 DevTools 不稳定影响**：沿用"一次宿主调用跑完整份清单"，按 AGENTS 约定重跑并记录。
- **绕过 OpenSpec 删除主 Spec**：属于有意例外，已在 Proposal 与本 Design 中记录原因与模拟验证结果。

## Open Items

| ID | 状态 | 责任方 | 内容 | 关闭依据 | 影响 |
| --- | --- | --- | --- | --- | --- |
| GAP-01 | 已关闭 | 用户 | 端侧渠道与平台适配器的代码样例 | 用户决定改为 AGENTS 中的外部交互替身设计标准 | 无 |
| GAP-02 | 留给下一个 Change | 用户 | 模板使用指南、包与项目参数化、可选能力模块化 | 下一个 Change 完成 | README 暂时只描述现状 |
| GAP-03 | 不在本仓库 | 用户 | 真实外部验收由接入方项目承担 | 需要时另建项目 | 本模板不含 Live |
