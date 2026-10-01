# 删除支付业务实施计划

**Goal:** 删除全部支付业务与 Live，使仓库成为 SDK 领域的通用模板。能力保全清单中的每一项能力，删除后都仍有项目级承载文件与运行证据；最终验收中的三项检查全部以退出码 0 通过。

**Architecture:** 先迁出通用能力，再按功能由外到内分组删除（见 Design"执行顺序""功能分组"）。每组同时删除 Spec 段落、测试绑定、Fixture 与独立代码，由门禁机械判定是否删干净；共享的支付核心在临时覆盖率豁免下保留到最后一组整体删除。

**Tech Stack:** 沿用仓库现有工具链，不新增依赖；删除 `dotenv`。

**Spec:** [scenario-gate](specs/scenario-gate/spec.md)、[template-engineering](specs/template-engineering/spec.md)、[protocol-contract](specs/protocol-contract/spec.md)、[template-example](specs/template-example/spec.md)、[设计](design.md)。

## Global Constraints

- 每个任务结束时 `pnpm check:fast` 必须通过；豁免清单之外的手写代码四项覆盖率保持 100%。
- 豁免清单以 Design"共享核心的临时覆盖率豁免"为准，只能减少，不能增加；如需增加，停止并返回 Plan Review。
- 不改包名、scope、registry、IDL、ProtoGen Consumer 与生成配置；不修改已归档 Change。
- 迁移只改绑定，不改断言语义；不迁移的 case 以 Design 迁移表为准。
- 删除任务（3～9）按 Design"每组的删除步骤与完成判定"执行：先 `git grep` 列出引用方，再删除，最后机械判定。命中清单写入验收索引。
- 场景门禁的结论必须来自本次实际运行的 `scripts/check-scenarios.ts`，禁止凭推断声称"已有绑定"或"门禁通过"。
- weapp 按 `packages/e2e/AGENTS.md`"微信开发者工具自动化的注意事项"执行：每个文件运行前退出主进程并预热；失败时整文件重跑；不用 `-t` 单跑 case。
- 长期约定必须落在项目级载体上（AGENTS.md、schema、配置、脚本）；Change 文档不能是唯一出处。

## 每个任务的共同完成条件

1. Files 中的产物齐全，行为与所列 Requirement/Scenario 及 Design 决定一致。
2. `pnpm check:fast` 退出码为 0。
3. 本任务的 RED 已先失败，GREEN 后通过；Verification 中的命令与反例符合预期。
4. 实际运行一次场景门禁（任务 1～8 用 unit、integration 报告与本任务新增或修改的 weapp 文件报告；任务 9、10 用 unit、integration 与全部通用 weapp 文件的新报告），并按 Design"每组的删除步骤与完成判定"中的"残留与问题逐条归属"规则，对 `git grep` 的每处支付 ID 命中与门禁的每个问题写明归属与清除任务；无法归属即为回归。
5. 在 `artifacts/<run-id>/tasks/task-<n>.md` 保存验收索引：实际命令与退出码、报告路径、`git grep` 命中清单、当时的豁免清单、方案与实际的差异、预期失败的反例、weapp 重跑记录。
6. 逐项核对 Design"能力保全清单"：每一项仍有承载文件与运行证据；本任务删除的内容不属于清单中的能力，或其承载已按 Design 迁移。
7. 任务评审确认职责边界、断言与 Spec 一致后才勾选。

## Implementation Tasks

**Tracking rule:** One independently implementable and reviewable task maps to one unindented top-level checkbox. RED, GREEN, verification, and review steps are indented plain bullets, not additional tracked checkboxes.

- [ ] 1. 迁出通用工程能力与门禁规则

  **Files**
  - Modify：`scenario-gate.config.json`：`scenarioIdPatterns`、`flowIdPatterns` 改为 Design"ID 格式配置"中的通用格式，支付格式暂时保留。
  - Rename + rebind：`packages/e2e/tests/tooling/TC-PAYSDK-CORE-015.spec.ts` → `SCN-SCENARIO-GATE-009.spec.ts`；`TC-PAYSDK-CORE-016.spec.ts` → `SCN-SCENARIO-GATE-010.spec.ts`；`TC-PAYSDK-CORE-017.spec.ts` → `SCN-TEMPLATE-ENGINEERING-002.spec.ts`；`TC-PAYSDK-RELEASE-PREFLIGHT.spec.ts` → `SCN-TEMPLATE-ENGINEERING-004.spec.ts`（新增绑定 preflight-valid-plan、preflight-rejects-drift、publish-order）。
  - Split + rebind：`packages/e2e/tests/sdk/TC-PAYSDK-CORE-014.spec.ts` 中的 protocol-network-*、sdk-does-not-reexport-network、sdk-only-consumer、package-boundaries 迁到新文件 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts`；`packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-021.spec.ts` 中的 source-and-dual-declarations、missing-comment-rejected 迁到新文件 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts`，检查对象改为示例公共类型。
  - Delete：semantic-review-evidence 用例；由于 CONTRACT-021 迁走两个、删除一个后不剩任何 case，删除整个 `packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-021.spec.ts` 与 `packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-021/` 目录（Design"拆分迁移的场景"）。TC-PAYSDK-CONTRACT-021 在任务 9 之前缺绑定，归属第 9 组。
  - Modify：工具单测中作为样本数据的支付 ID 改为 `SCN-SAMPLE-*`、`FLOW-SAMPLE-*`（只改 Design"能力归属与场景 ID 迁移"点名的样本文件中作为样本数据的 ID，不改真实的 Fixture 路径与仍在使用的 owner ID；`scripts/lib/scenario-config.test.ts` 的默认格式断言除外，留给任务 9）。
  - Modify：`packages/payment-sdk/src/example/contracts.ts`：为每个导出的类型、字段与字面量值补齐中文 JSDoc（Design"能力归属与场景 ID 迁移"中的示例公共类型注释一段）；`SCN-TEMPLATE-ENGINEERING-003` 的 Fixture 列出全部导出的示例类型、字段与取值；按 Design 允许扩展注释检查器以覆盖方法签名与布尔字面量判别值。
  - Create：`packages/payment-sdk/src/example/contracts.test.ts`：示例公共类型的编译期契约测试（`@ts-expect-error` 反例消费方、`ExampleOutcome['end']` 等联合类型的 `never` 穷尽检查、只读字段），绑定 SCN-TEMPLATE-EXAMPLE-001 的 public-type-contract。
  - Modify：`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-005.spec.ts` 更名为 `SCN-SCENARIO-GATE-011.spec.ts`；payment-baseline-cli 去掉支付基线断言后改名为 multi-pattern-cli；`scripts/lib/scenario-gate.evidence.test.ts` 中 pattern-config 的绑定改为 011。按 Design"多格式测试的第二种样例格式"，这三处用例与 `packages/e2e/tests/tooling/scenario-gate-helpers.ts` 的共享配置把支付格式换成 `LEGACY` 样例格式，pattern-config 改用临时目录中构造的双格式配置。
  - Delete：`packages/e2e/tests/fixtures/SCN-SCENARIO-GATE-005/` 整个目录。
  - 迁移涉及的新 Fixture 目录：按新 ID 建立，只含迁走的 case 数据；manifest 的 `ownerId` 与 `sources.spec.path`（指向本 Change 的 delta spec）同步；CORE-014 的原 manifest 保留剩余 case。

  **Requirements / Scenarios**
  - template-engineering：ENG-01～04 / SCN-TEMPLATE-ENGINEERING-001～004
  - template-example：EX-01 / SCN-TEMPLATE-EXAMPLE-001（public-type-contract）
  - scenario-gate：GATE-02（新能力的 ID 符合配置）；GATE-07 / SCN-SCENARIO-GATE-009；GATE-08 / SCN-SCENARIO-GATE-010；GATE-09 / SCN-SCENARIO-GATE-011

  **Design Decisions**
  - Decision: 能力归属与场景 ID 迁移（任务 1）
  - Decision: ID 格式配置
  - Decision: OpenSpec 的两处例外

  **Interfaces**
  - Consumes: 本 Change 的 delta spec（门禁经 active change 合并读取）；现有 tooling 用例。
  - Produces: 通用 ID 格式配置；新场景 ID 下的全部绑定与报告记录。

  **RED**
  - 不改配置先运行场景门禁：新能力场景报告为 ID 格式不符（GATE-02）；改配置后再运行：新场景报告为缺绑定。两次输出都保存。

  **GREEN**
  - 完成改名、拆分与改绑；`pnpm check:fast` 通过。

  **Verification**
  - `pnpm check:fast` 退出码 0；`pnpm check:fixtures` 无问题。
  - 场景门禁：`SCN-TEMPLATE-ENGINEERING-001～004`、`SCN-SCENARIO-GATE-009～011`、SCN-TEMPLATE-EXAMPLE-001 的 public-type-contract 没有问题；其余问题都在 Design"过渡期允许存在的门禁问题"表内。
  - 按共同完成条件 4 对 `git grep -nE "TC-PAYSDK|FLOW-PAYSDK"` 的每处命中写明归属（例如：仍属于尚未删除的支付功能组的用例与 Fixture；由任务 2 处理的 `contract-inventory`、`check-fixtures`、`scenario-gate-helpers`；由任务 9 处理的默认格式与 v8-ignore 注释）。

  **Review / Acceptance**
  - 逐项对照 Design 迁移表：每个保留的 case 都有新绑定，断言没有改变语义；semantic-review-evidence 已删除。

  **Commit**
  - `refactor(template): rehome generic capabilities from payment scenarios`

- [ ] 2. IDL 协议义务派生改为针对示例接口，补齐示例协议矩阵

  **Files**
  - Modify：`scripts/lib/contract-inventory.ts` 及测试（按 Design"IDL 义务派生改为针对示例接口"，含 `requestAuthority`、`responseAuthority` 的引用改指），测试绑定 `SCN-PROTOCOL-CONTRACT-001` 的 derivation-rules。
  - Rename：`packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-024/` → `SCN-PROTOCOL-CONTRACT-003/`；`tests/protocol/TC-PAYSDK-CONTRACT-024.spec.ts` → `SCN-PROTOCOL-CONTRACT-003.spec.ts`，绑定改为新 ID；`payment-projection-mismatch` 改名为 `projection-mismatch`。
  - Modify（读取路径随改名同步）：`packages/payment-protocol/src/errors/business-codes.test.ts`；`packages/e2e/tests/tooling/scenario-gate-helpers.ts`（同时去掉 `TC-PAYSDK-CONTRACT-023/descriptor.json`）。
  - Create：`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts`（inventory-cli）；`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`；`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`；Fixture `SCN-PROTOCOL-CONTRACT-002/`。
  - Delete：`packages/e2e/tests/protocol/TC-PAYSDK-PROTOCOL-MATRIX.spec.ts`、`packages/e2e/tests/weapp/TC-PAYSDK-PROTOCOL-MATRIX.spec.ts`。
  - Modify：`scripts/check-fixtures.ts` 与 `scripts/check-fixtures.test.ts`（删除 `TC-PAYSDK-CONTRACT-023` 特例及其断言）；`packages/payment-protocol/src/client.test.ts`（改用 `SCN-PROTOCOL-CONTRACT-002/` 样例，删除 `xpay_env` presence 用例与读取 `TC-PAYSDK-CONTRACT-023/descriptor.json` 的独立 Go descriptor 用例）。
  - Modify：`packages/e2e/host/weapp/protocol-runner.ts`（`runProtocolCase`、`runProtocolSuite` 改为 `createTrade`/`queryTrade`，`Cancellation` 改从协议包导入）；`packages/e2e/src/drivers/weapp-host.test.ts`、`weapp.test.ts`。

  **Requirements / Scenarios**
  - protocol-contract：PC-01 / SCN-PROTOCOL-CONTRACT-001、002；PC-02 / SCN-PROTOCOL-CONTRACT-003
  - scenario-gate：GATE-07（协议义务作为覆盖分母）

  **Design Decisions**
  - Decision: IDL 义务派生改为针对示例接口（任务 2）

  **Interfaces**
  - Consumes: generated `CreateTrade`、`QueryTrade` 描述；示例 Shadow 路由；公共协议客户端。
  - Produces: 以 `infra.trade.v1.CreateTrade#…`、`infra.trade.v1.QueryTrade#…` 为 ID 的义务清单及其 integration 与 weapp 证据。

  **RED**
  - 先改派生器并运行场景门禁：新义务全部缺绑定，派生器报告的待定字段也列出，保存输出。

  **GREEN**
  - 补齐字段策略，使待定字段为 0；补齐矩阵、Fixture 与协议客户端单测样例；`pnpm check:fast` 通过；按 AGENTS 约定跑 weapp 矩阵文件。

  **Verification**
  - `pnpm check:fast` 退出码 0。
  - 按共同完成条件 4 的归属规则，对 `git grep -n "TC-PAYSDK-CONTRACT-02[34]\|discoverPaymentRoutes"` 的每处命中写明归属（例如后续删除组的支付用例、Fixture、支付 Shadow 路由；迁移后 `SCN-PROTOCOL-CONTRACT-003/` 中 `extract.go`、`refresh-manifests.py`、manifest `extraction.command` 对旧目录名的引用，由任务 9 处理）。
  - 场景门禁：示例派生产生的每条 `infra.trade.v1.CreateTrade#…`、`QueryTrade#…` 义务与 `SCN-PROTOCOL-CONTRACT-001～003` 都没有缺绑定或失败；支付用例对已不再派生的义务的 unknown cover 按过渡期问题表归属到任务 4；派生器待定字段为 0。
  - weapp 矩阵文件取得通过的报告（记录重跑次数）。

  **Review / Acceptance**
  - 字段策略表与示例实际映射一致；矩阵每个 case 的断言与义务 case 的含义一致，而不只是绑定 ID。

  **Commit**
  - `feat(protocol-contract): derive IDL obligations for the example protocol`

- [ ] 3. 删除 Live，并启用共享核心的临时覆盖率豁免

  **Files**
  - Modify：根 `vitest.config.ts`：按 Design 加入临时豁免段；删除 Live 的覆盖范围与排除项。
  - Delete（Design"移除 Live"）：`packages/e2e/src/live/`、`packages/e2e/host/weapp/live/`、`host/weapp/pages/live/`、`host/weapp/app.live.js`、`app.live.json`、`vite.live.config.ts`、`project.live.example.json`；`tests/tooling/TC-PAYSDK-CORE-022.spec.ts`、`TC-PAYSDK-CORE-023.spec.ts`、`tests/example/SCN-TEMPLATE-EXAMPLE-010.spec.ts` 及其 Fixture；`.env.live.example`；`docs/engineering/live-acceptance.md`、`live-create-trade-contract.md`。
  - Modify：根 `package.json`（删除 `live:build`、`live:check`、`check:live`；`pnpm remove -D dotenv`）；`pnpm-lock.yaml`；`.gitignore` 的 Live 条目；`packages/e2e/src/bootstrap.test.ts` 等引用 Live 的测试；`scripts/lib/fingerprints.ts` 中如有 Live 路径同步删除。
  - Modify：`openspec/specs/payment-sdk/spec.md`：删除 SDK-17 段落。

  **Requirements / Scenarios**
  - 删除：SDK-17（TC-PAYSDK-CORE-021/022/023）；template-example EX-07（SCN-TEMPLATE-EXAMPLE-010，经 delta REMOVED）

  **Design Decisions**
  - Decision: 移除 Live（任务 3）
  - Decision: 共享核心的临时覆盖率豁免
  - Decision: 每组的删除步骤与完成判定

  **Interfaces**
  - Consumes: 任务 1、2 之后的仓库。
  - Produces: 不含 Live 的仓库；生效的临时豁免清单。

  **RED**
  - `git grep` 列出 `live`、`Live`、`LIVE-`、`TC-PAYSDK-CORE-02[123]`、`SCN-TEMPLATE-EXAMPLE-010`、`dotenv`、`.env.live` 的全部引用方并保存。

  **GREEN**
  - 按清单删除与修改；`pnpm check:fast` 通过。

  **Verification**
  - 按 Design 完成判定逐项检查并记录。

  **Review / Acceptance**
  - 确认没有遗留的 Live 入口、命令与配置；豁免清单与 Design 完全一致。

  **Commit**
  - `refactor(template): remove live acceptance mode`

- [ ] 4. 删除 `xpayEnv` 环境选择

  **Files**
  - 按 Design"功能分组"第 4 组：删除 SDK-16、CONTRACT-14 段落与 FLOW-008 行；删除该组列出的测试文件；在聚合文件中删除本组 case；删除无读取方的 Fixture 目录。

  **Requirements / Scenarios**
  - 删除：TC-PAYSDK-CORE-020、TC-PAYSDK-CONTRACT-022、TC-PAYSDK-CONTRACT-023、FLOW-PAYSDK-008

  **Design Decisions**
  - Decision: 功能分组；Decision: 每组的删除步骤与完成判定

  **Interfaces**
  - Consumes / Produces: 按 Design 完成判定。

  **RED**
  - `git grep` 列出本组 ID 与 Fixture 目录的全部引用方并保存。

  **GREEN**
  - 删除后 `pnpm check:fast` 通过。

  **Verification**
  - 按 Design 完成判定逐项检查并记录。

  **Review / Acceptance**
  - 确认被删 ID 零残留、豁免清单未增加、能力保全清单无损失。

  **Commit**
  - `refactor(payment): remove xpayEnv selection scenarios`

- [ ] 5. 删除渠道调起与原生生命周期

  **Files**
  - 按 Design"功能分组"第 5 组：删除 SDK-02、03、04、08、12 段落与 FLOW-002、003 行；删除该组测试文件；在聚合文件与豁免文件的单测中删除只绑定本组场景的用例，同时绑定后续组场景的用例按 Design"多组共用的用例"处理（例如 `client.module.test.ts` 的 alternate-method-internal-adapter 改为只覆盖 CORE-010）；删除无读取方的 Fixture 目录。

  **Requirements / Scenarios**
  - 删除：TC-PAYSDK-CORE-002、003、004、005、009、013、024，FLOW-PAYSDK-002、003

  **Design Decisions**
  - Decision: 功能分组；Decision: 每组的删除步骤与完成判定

  **Interfaces**
  - Consumes / Produces: 按 Design 完成判定。

  **RED**
  - `git grep` 列出本组 ID 与 Fixture 目录的全部引用方并保存。

  **GREEN**
  - 删除后 `pnpm check:fast` 通过。

  **Verification**
  - 按 Design 完成判定逐项检查并记录。

  **Review / Acceptance**
  - 同任务 4。

  **Commit**
  - `refactor(payment): remove channel invocation scenarios`

- [ ] 6. 删除鉴权、身份与恢复

  **Files**
  - 按 Design"功能分组"第 6 组：删除 SDK-10、CONTRACT-04、05、09 段落与 FLOW-006 行；删除该组测试文件；在聚合文件中删除本组 case；删除无读取方的 Fixture 目录。

  **Requirements / Scenarios**
  - 删除：TC-PAYSDK-CORE-011，TC-PAYSDK-CONTRACT-005、006、007、013、014、018、025、026，FLOW-PAYSDK-006

  **Design Decisions**
  - Decision: 功能分组；Decision: 每组的删除步骤与完成判定

  **Interfaces**
  - Consumes / Produces: 按 Design 完成判定。

  **RED**
  - `git grep` 列出本组 ID 与 Fixture 目录的全部引用方并保存。

  **GREEN**
  - 删除后 `pnpm check:fast` 通过。

  **Verification**
  - 按 Design 完成判定逐项检查并记录。

  **Review / Acceptance**
  - 同任务 4。

  **Commit**
  - `refactor(payment): remove auth, identity and recovery scenarios`

- [ ] 7. 删除阶段通知

  **Files**
  - 按 Design"功能分组"第 7 组：删除 SDK-15、CONTRACT-12 段落与 FLOW-007 行；删除该组测试文件；在聚合文件中删除本组 case；删除无读取方的 Fixture 目录。

  **Requirements / Scenarios**
  - 删除：TC-PAYSDK-CORE-018、019，TC-PAYSDK-CONTRACT-020，FLOW-PAYSDK-007

  **Design Decisions**
  - Decision: 功能分组；Decision: 每组的删除步骤与完成判定

  **Interfaces**
  - Consumes / Produces: 按 Design 完成判定。

  **RED**
  - `git grep` 列出本组 ID 与 Fixture 目录的全部引用方并保存。

  **GREEN**
  - 删除后 `pnpm check:fast` 通过。

  **Verification**
  - 按 Design 完成判定逐项检查并记录。

  **Review / Acceptance**
  - 同任务 4。

  **Commit**
  - `refactor(payment): remove phase notification scenarios`

- [ ] 8. 删除查询、观察与时间策略

  **Files**
  - 按 Design"功能分组"第 8 组：删除 SDK-05、06、11、CONTRACT-03、08、10、11 段落与 FLOW-004、005 行；删除该组测试文件；在聚合文件中删除本组 case；删除无读取方的 Fixture 目录。

  **Requirements / Scenarios**
  - 删除：TC-PAYSDK-CORE-006、007、012，TC-PAYSDK-CONTRACT-003、004、011、012、015、016、017、019，FLOW-PAYSDK-004、005

  **Design Decisions**
  - Decision: 功能分组；Decision: 每组的删除步骤与完成判定

  **Interfaces**
  - Consumes / Produces: 按 Design 完成判定。

  **RED**
  - `git grep` 列出本组 ID 与 Fixture 目录的全部引用方并保存。

  **GREEN**
  - 删除后 `pnpm check:fast` 通过。

  **Verification**
  - 按 Design 完成判定逐项检查并记录。

  **Review / Acceptance**
  - 同任务 4。

  **Commit**
  - `refactor(payment): remove query and observation scenarios`

- [ ] 9. 删除核心与公共入口，清空豁免清单

  **Files**
  - 按 Design"功能分组"第 9 组与"SDK 与协议包的最终删除（任务 9）"：
    - 删除全部剩余支付场景、FLOW-001、聚合文件、剩余支付用例与 Fixture；
    - 删除豁免清单中的全部文件与 `packages/payment-sdk/src/ports/`、其余支付单测；
    - 新增 `src/runtime/port.ts`，修改 `runtime/default.ts`、`src/index.ts`；
    - 修改 `.dependency-cruiser.cjs` 与 `tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts`，并把 `packages/payment-sdk/AGENTS.md`"按示例扩展新业务"中对旧规则名的引用改为 `domain-isolation`；
    - 删除 `packages/e2e/src/drivers/channel-double.ts`、`protocol-runner.ts` 中的 `runPaymentCase` 与 `app.js` 中的注册；
    - 修改 `testing/shadow/routes.ts`、`server.ts`、`testing/index.ts` 及测试；
    - 缩减 `src/errors/business-codes.ts` 与 `SCN-PROTOCOL-CONTRACT-003/` 的全部文件（含 `extract.go`、`reproduce.sh`、`defensive-fixtures.py`、`refresh-manifests.py`、`refresh-manifests.test.py`、manifest 摘要、`toHaveLength(7)`）；
    - `scenario-gate.config.json`、`scripts/lib/scenario-config.ts`（及 `scenario-config.test.ts` 的默认格式断言）、`spec-inventory.ts` 删除支付格式，`ownerIdPattern` 不再接受 `TC-`；脚本中 v8-ignore 注释改指新场景 ID；
    - 删除 `openspec/specs/payment-sdk/`、`payment-sdk-contract/`，并同步删除四份 AGENTS.md 中指向它们的链接；
    - 根 `vitest.config.ts` 删除整段临时豁免。
  - 同时收紧 FLOW 关联 Scenario：`scripts/flow.schema.json` 中已是字符串数组的 `relatedScenarios` 只增加与具体格式无关的 ID 形状约束（例如 `^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$`，不得写死 `SCN-` 前缀，以免使用方在 GATE-09 配置中登记的其他格式无法被 FLOW 引用）并补充字段说明，`scripts/lib/spec-inventory.ts` 校验每个 ID 已在有效 Spec 中登记；新增 SCN-SCENARIO-GATE-007 的 unregistered-related-scenario-cli 用例，并在 `spec-inventory.test.ts` 的 flow-placement-rules 中增加 related-scenarios-registered 检查。现有测试输入中引用未登记 ID（如 `SCN-TEST-001`）的合法用例（`SCN-SCENARIO-GATE-007.spec.ts` 的 inside-table-accepted、`scripts/lib/scenario-gate.evidence.test.ts` 中相应输入），在输入中补登该场景，使其仍为合法输入；这是适配收紧后的输入，不改变断言语义。

  **Requirements / Scenarios**
  - 删除：其余全部支付场景与 FLOW-PAYSDK-001
  - template-example：EX-01 / SCN-TEMPLATE-EXAMPLE-001；EX-05 / SCN-TEMPLATE-EXAMPLE-008
  - protocol-contract：PC-02 / SCN-PROTOCOL-CONTRACT-003
  - scenario-gate：GATE-03 / SCN-SCENARIO-GATE-007（新增检查）、SCN-SCENARIO-GATE-003、SCN-SCENARIO-GATE-004（内容未变，作回归确认）；GATE-09 / SCN-SCENARIO-GATE-011
  - template-engineering：ENG-01 / SCN-TEMPLATE-ENGINEERING-001（产物边界在删除后仍成立）

  **Design Decisions**
  - Decision: 功能分组；Decision: 每组的删除步骤与完成判定
  - Decision: SDK 与协议包的最终删除（任务 9）
  - Decision: 共享核心的临时覆盖率豁免
  - Decision: ID 格式配置；Decision: OpenSpec 的两处例外

  **Interfaces**
  - Consumes: 任务 3～8 之后的仓库。
  - Produces: 不含支付代码与支付 Spec 的仓库；只含示例导出的 SDK；7 项错误码目录；必须显式传入路由的 Shadow；没有豁免的覆盖率配置。

  **RED**
  - `git grep` 列出 `TC-PAYSDK`、`FLOW-PAYSDK`、`createPaymentClient`、`PaymentOutcome`、`discoverPaymentRoutes`、`from '@daqian/payment-sdk'`（`src/example/` 以外）、`tests/fixtures/TC-PAYSDK`、`openspec/specs/payment-sdk` 的全部引用方并保存；先加上 related-scenarios-registered 用例，确认在旧实现下失败。

  **GREEN**
  - 按清单删除与修改；`pnpm check:fast` 在**没有任何豁免**的情况下通过。

  **Verification**
  - `pnpm check:fast` 退出码 0，覆盖率四项 100%，`vitest.config.ts` 中已无临时豁免段。
  - `domain-isolation` 反例被阻断、恢复后通过；`pnpm check:package` 通过，SDK 产物只含示例导出。
  - 以 `reproduce.sh /Users/liyongning/Projects/workspace/dev/idl <临时目录>` 实际运行，输出的 `idl-errors.json` 与提交版本逐字节一致；错误码一致性校验的全部反例仍被拒绝。
  - 按 AGENTS 约定重跑全部通用 weapp 文件（示例 3 个与协议矩阵 1 个），以 unit、integration 与这些新报告运行场景门禁，问题总数为 0。
  - 在仓库副本上模拟 `openspec archive remove-payment-business -y`，确认可以归档（不在真实仓库执行）。

  **Review / Acceptance**
  - `packages/payment-sdk/src/` 下只剩 `example/`、`runtime/`、`index.ts`；主 Spec 目录只剩 `scenario-gate`、`template-example`；能力保全清单逐项核对通过。

  **Commit**
  - `refactor(payment-sdk): remove payment core and public entry`

- [ ] 10. 文档与最终验收

  **Files**
  - Modify：`AGENTS.md`、`packages/payment-sdk/AGENTS.md`、`packages/payment-protocol/AGENTS.md`、`packages/e2e/AGENTS.md`：先按 Design"文档（任务 10）"的迁移表，把"保留"列的规则去掉支付表述后迁入"模板通用规则"；再删除"当前业务：支付"整节；写入 Design"外部交互替身的设计标准"；更新能力与场景指向；注明 IDL 协议义务派生针对示例的 `CreateTrade`、`QueryTrade`。
  - Modify：`README.md` 删除支付与 Live 内容。
  - Modify：根 `AGENTS.md` 硬规则 4 补充一句：FLOW 行"关联 Scenario"的每一项必须是完整、且已在有效 Spec 中登记的 Scenario ID（对应 GATE-03 的收紧，由任务 9 的 spec-inventory 检查执行）。
  - Modify：`docs/engineering/bootstrap.md`（README 链接的工具准备记录）：按 Design"文档（任务 10）"保留通用工具准备记录，删除支付专属历史。

  **Requirements / Scenarios**
  - template-engineering：ENG-02 / SCN-TEMPLATE-ENGINEERING-002（AGENTS 入口与链接检查）
  - scenario-gate：GATE-06 / SCN-SCENARIO-GATE-008（AGENTS 仍引用三份 schema）

  **Design Decisions**
  - Decision: 文档（任务 10）；Decision: 外部交互替身的设计标准；Decision: 验证方式；Decision: 能力保全清单

  **Interfaces**
  - Consumes: 前 9 个任务的全部产物。
  - Produces: 不含支付与 Live 内容的文档；完整验收证据。

  **RED**
  - `git grep -nE "当前业务：支付|TC-PAYSDK|FLOW-PAYSDK|Live|live:"` 对 `AGENTS.md`、`packages/*/AGENTS.md`、`README.md` 的命中清单，以及 `git grep -nE "CreateTradePay|xpay|PayParams|支付" docs/engineering/bootstrap.md` 的命中清单（修改前应非空）并保存。

  **GREEN**
  - 完成文档修改，上述 grep 零命中；`pnpm check:fast` 通过。

  **Verification**
  - 按 Design"验证方式"执行最终验收：`pnpm check:fast`、逐文件运行全部 weapp 文件、以全部报告运行场景门禁，三者退出码都为 0，门禁问题数为 0。
  - 仓库范围 `git grep -nE "TC-PAYSDK|FLOW-PAYSDK|payment-sdk/spec.md|live-create-trade-contract"` 零命中（`openspec/changes/archive/`、本 Change 目录、`artifacts/` 与 generated 代码除外）；唯一允许的命中是 `openspec/specs/scenario-gate/spec.md` 中 GATE-04 / SCN-SCENARIO-GATE-005 一段，它由本 Change 的 delta 在归档时删除，按 Design 归属规则的第四类登记。
  - 归档后验收（在 Archive 阶段执行并写入验收索引）：对 `openspec/specs/` 再运行同一 grep，必须零命中。
  - 逐条核对 AGENTS 迁移表："保留"列的每条规则都能在对应文件的"模板通用规则"中找到，且不含支付表述。
  - 逐项核对能力保全清单，把每一项的承载文件与运行证据写入验收索引。

  **Review / Acceptance**
  - 汇总 10 个任务的证据；确认 GAP-01～03 的登记与现状一致。

  **Commit**
  - `docs(template): remove payment documentation and complete verification`
