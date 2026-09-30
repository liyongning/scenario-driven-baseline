# 删除支付业务实施计划

**Goal:** 删除全部支付业务，先把被支付场景"挂住"的通用能力迁到通用能力 Spec 与 `SCN-*` 场景之下，使仓库只剩模板骨架与示例，并让完整 `pnpm check` 第一次以退出码 0 通过。

**Architecture:** 执行顺序为先迁出、再删除（见 Design"执行顺序"）。迁出期间支付代码仍在，迁移后的用例先在原被测对象上跑通；删除之后，门禁对剩余的全部场景对账。

**Tech Stack:** 沿用仓库现有工具链，不新增依赖。

**Spec:** [scenario-gate](specs/scenario-gate/spec.md)、[template-engineering](specs/template-engineering/spec.md)、[protocol-contract](specs/protocol-contract/spec.md)、[template-example](specs/template-example/spec.md)、[设计](design.md)。

## Global Constraints

- 每个任务结束时 `pnpm check:fast` 必须通过；手写代码四项覆盖率保持 100%。
- 不改包名、scope、registry、IDL、ProtoGen Consumer 与生成配置；不修改已归档 Change。
- 迁移只改绑定（`ownerId`、`covers`、测试名、文件名、Fixture 目录与 manifest），不改断言语义；被删除的 case 以 Design 迁移表为准。
- 长期约定必须落在项目级载体上（AGENTS.md、schema、配置、脚本）；Change 文档不能是唯一出处。
- 场景门禁的结论必须来自本次实际运行的 `scripts/check-scenarios.ts`，禁止凭推断声称"已有绑定"或"门禁通过"。
- weapp 按 `packages/e2e/AGENTS.md`"微信开发者工具自动化的注意事项"执行：每个文件运行前退出主进程并预热；失败时整文件重跑；不用 `-t` 单跑 case。
- 任何源码改动之后，若 `TC-PAYSDK-CONTRACT-021` 仍存在（第 3 个任务之前），须重录它的 `sourceDigest` 与 manifest sha256，这是常规操作，不改测试逻辑。
- 不新增依赖；若确需新增，先更新 Design 并重新评审。

## 每个任务的共同完成条件

1. Files 中的产物齐全，行为与所列 Requirement/Scenario 及 Design 决定一致。
2. `pnpm check:fast` 退出码为 0。
3. 本任务的 RED 已先失败，GREEN 后通过；Verification 中的命令与反例符合预期。
4. 实际运行一次场景门禁（unit、integration 报告，以及本任务涉及的 weapp 报告），记录结果：
   - 第 1～4 个任务：非支付问题（不含 `TC-PAYSDK`、`FLOW-PAYSDK`、`infra.trade.v1.CreateTradePay`）只能来自尚未完成的后续任务，并在验收索引中逐条说明归属；
   - 第 5、6 个任务：问题总数为 0。
5. 在 `artifacts/<run-id>/tasks/task-<n>.md` 保存验收索引：实际命令与退出码、报告路径、方案与实际的差异、预期失败的反例、weapp 重跑记录。
6. 本任务引入或修改的长期约定已写入 Design 所列的项目级文件。
7. 任务评审确认职责边界、断言与 Spec 一致后才勾选。

## Implementation Tasks

**Tracking rule:** One independently implementable and reviewable task maps to one unindented top-level checkbox. RED, GREEN, verification, and review steps are indented plain bullets, not additional tracked checkboxes.

- [ ] 1. 迁出通用工程能力与门禁规则：改挂 `SCN-TEMPLATE-ENGINEERING-*` 与 `SCN-SCENARIO-GATE-009/010/011`

  **Files**
  - Rename + rebind：`packages/e2e/tests/tooling/TC-PAYSDK-CORE-015.spec.ts` → `SCN-SCENARIO-GATE-009.spec.ts`；`TC-PAYSDK-CORE-016.spec.ts` → `SCN-SCENARIO-GATE-010.spec.ts`；`TC-PAYSDK-CORE-017.spec.ts` → `SCN-TEMPLATE-ENGINEERING-002.spec.ts`；`TC-PAYSDK-RELEASE-PREFLIGHT.spec.ts` → `SCN-TEMPLATE-ENGINEERING-004.spec.ts`（新增绑定：preflight-valid-plan、preflight-rejects-drift、publish-order）；`TC-PAYSDK-CORE-022.spec.ts` 中的 isolated-live-build、live-evidence-validation 迁到 `SCN-TEMPLATE-ENGINEERING-006.spec.ts`（missing-create-contract 留在原文件，第 4 个任务随支付删除）。
  - Rebind：`packages/e2e/tests/sdk/TC-PAYSDK-CORE-014.spec.ts` 中的 protocol-network-*、sdk-does-not-reexport-network、sdk-only-consumer、package-boundaries 迁到新文件 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts`；支付客户端相关的 case 留在原文件，第 4 个任务删除。
  - Rebind：`packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-021.spec.ts` 中的 source-and-dual-declarations、missing-comment-rejected 迁到新文件 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts`，检查对象改为示例公共类型（`packages/payment-sdk/src/example/contracts.ts` 及其 ESM、CJS 声明）；semantic-review-evidence 留在原文件，第 4 个任务删除。
  - Rebind：`packages/e2e/host/weapp/live/live.test.ts` 中的 config-source、token-save-replace-clear、storage-failure、redacted-record 绑定为 `SCN-TEMPLATE-ENGINEERING-005`（create-pay-recovery 留原绑定，第 4 个任务删除）。
  - Modify：`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-005.spec.ts` → 更名 `SCN-SCENARIO-GATE-011.spec.ts`；payment-baseline-cli 去掉支付基线断言，更名为 multi-pattern-cli；绑定改为 SCN-SCENARIO-GATE-011；`scripts/lib/scenario-config.test.ts` 中 pattern-config 的绑定同步改为 011。
  - 迁移涉及的 Fixture 目录按新 ID 改名，manifest 的 `ownerId` 与 `sources.spec.path` 同步更新；支付基线文件 `SCN-SCENARIO-GATE-005/payment-*.json` 随目录更名为 `SCN-SCENARIO-GATE-011/` 后删除。

  **Requirements / Scenarios**
  - template-engineering：ENG-01～06 / SCN-TEMPLATE-ENGINEERING-001～006
  - scenario-gate：GATE-07 / SCN-SCENARIO-GATE-009；GATE-08 / SCN-SCENARIO-GATE-010；GATE-09 / SCN-SCENARIO-GATE-011

  **Design Decisions**
  - Decision: 执行顺序是"先迁出，再删除"
  - Decision: 能力归属与场景 ID 迁移表
  - Decision: OpenSpec 的两处例外

  **Interfaces**
  - Consumes: 本 Change 的 delta spec（门禁经 active change 合并读取）；现有 tooling 与 Live 单测。
  - Produces: 新场景 ID 下的全部绑定与报告记录。

  **RED**
  - 先运行一次场景门禁，确认 `SCN-TEMPLATE-ENGINEERING-001～006`、`SCN-SCENARIO-GATE-009/010/011` 全部报告为缺绑定，并保存输出。

  **GREEN**
  - 完成改名与改绑。`pnpm check:fast` 通过；再次运行场景门禁，上述场景不再缺绑定。

  **Verification**
  - `pnpm check:fast` 退出码 0。
  - 场景门禁：`SCN-TEMPLATE-ENGINEERING-*`、`SCN-SCENARIO-GATE-009/010/011` 没有问题；原 `TC-PAYSDK-CORE-014/015/016/017/021/022`、`TC-PAYSDK-CONTRACT-021` 中被迁走的 case 此时报告为缺绑定，属预期（第 5 个任务删除支付主 Spec 后消失）。

  **Review / Acceptance**
  - 逐项对照 Design 迁移表：每个保留的 case 都有新绑定，断言没有改变语义。

  **Commit**
  - `refactor(template): rehome generic capabilities from payment scenarios`

- [ ] 2. IDL 协议义务派生改为针对示例接口，并补齐示例协议矩阵用例

  **Files**
  - Modify：`scripts/lib/contract-inventory.ts` 及测试：方法集合改为 `discoverExampleRoutes()`；按 Design 字段策略表重写 `requestPolicies`；删除 `xpay_env` 专项校验与对 `descriptor.json` 的读取；错误码清单改读 `SCN-PROTOCOL-CONTRACT-003/idl-errors.json`；共享义务去掉 `xpay-env-absent`；删除两条支付附加义务。测试绑定 `SCN-PROTOCOL-CONTRACT-001` 的 derivation-rules。
  - Rename：`packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-024/` → `SCN-PROTOCOL-CONTRACT-003/`；`packages/e2e/tests/protocol/TC-PAYSDK-CONTRACT-024.spec.ts` → `SCN-PROTOCOL-CONTRACT-003.spec.ts`，绑定改为新 ID；`payment-projection-mismatch` 更名为 `projection-mismatch`。本任务只改名与改绑，缩减清单在第 3 个任务完成。
  - Create：`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts`（inventory-cli）；`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`（integration 协议矩阵，每个 case 以 `covers` 绑定义务 ID）；Fixture `SCN-PROTOCOL-CONTRACT-002/`。
  - Modify：`packages/e2e/host/weapp/protocol-runner.ts` 的 `runProtocolSuite` 改为 `CreateTrade`/`QueryTrade`，但 `runPaymentCase` 暂时保留；`src/drivers/weapp-host.test.ts` 同步。
  - Create：`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`（一次宿主调用跑完整份清单）。
  - Modify：`scripts/check-fixtures.ts` 删除 `TC-PAYSDK-CONTRACT-023` 特例。

  **Requirements / Scenarios**
  - protocol-contract：PC-01 / SCN-PROTOCOL-CONTRACT-001、002；PC-02 / SCN-PROTOCOL-CONTRACT-003
  - scenario-gate：GATE-07（协议义务作为覆盖分母）

  **Design Decisions**
  - Decision: IDL 义务派生改为针对示例接口
  - Decision: 协议包的调整（Fixture 改名部分）

  **Interfaces**
  - Consumes: generated `CreateTrade`、`QueryTrade` 描述；示例 Shadow 路由；公共协议客户端。
  - Produces: 以 `infra.trade.v1.CreateTrade#…`、`infra.trade.v1.QueryTrade#…` 为 ID 的义务清单，以及覆盖它们的 integration 与 weapp 证据。

  **RED**
  - 先改派生器并运行场景门禁：新义务全部报告为缺绑定，派生器报告的待定字段也列出来，保存输出。

  **GREEN**
  - 补齐字段策略，使待定字段为 0；补齐矩阵用例与 Fixture；`pnpm check:fast` 通过；按 AGENTS 约定跑 weapp 矩阵文件。

  **Verification**
  - `pnpm check:fast` 退出码 0。
  - 场景门禁：所有 `infra.trade.v1.CreateTrade#…` 与 `QueryTrade#…` 义务没有问题；`SCN-PROTOCOL-CONTRACT-001～003` 没有问题；派生器待定字段为 0。
  - weapp 矩阵文件取得通过的报告（记录重跑次数）。

  **Review / Acceptance**
  - 核对字段策略表与示例实际映射一致；矩阵用例每个 case 的断言与义务 case 含义一致，而不只是绑定 ID。

  **Commit**
  - `feat(protocol-contract): derive IDL obligations for the example protocol`

- [ ] 3. 删除 SDK 与协议包中的支付代码

  **Files**
  - Delete：`packages/payment-sdk/src/core/`、`adapters/`、`ports/`、`errors/`、`contracts.ts`、`factory.ts` 及其单测。
  - Create：`packages/payment-sdk/src/runtime/port.ts`；Modify：`runtime/default.ts`（改引 `./port` 与协议包的 `Cancellation`，删除 `nextAttemptId`）及其测试。
  - Modify：`packages/payment-sdk/src/index.ts` 只导出示例；`packages/payment-sdk/src/contracts.test.ts`、`factory.test.ts` 等随删除一并移除。
  - Modify：`.dependency-cruiser.cjs`：删除 `example-no-payment`、`payment-no-example`；新增 `domain-isolation`；`core-no-platform-or-node` 路径改为 `src/(runtime|example/(core|ports))/`。
  - Modify：`packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts`：跨业务目录反例改为临时的 `src/sample-domain/`。
  - Modify：`packages/payment-protocol/testing/shadow/routes.ts`、`server.ts`、`testing/index.ts` 及测试：删除支付路由，`routes` 改为必填。
  - Modify：`packages/payment-protocol/src/errors/business-codes.ts` 及测试：缩减为 Design 所列 7 项；`SCN-PROTOCOL-CONTRACT-003/` 中的 `idl-errors.json`、各反例、`extract.go`、`reproduce.sh`、`refresh-manifests.py` 同步缩减。
  - 本任务之后 `TC-PAYSDK-CONTRACT-021` 已不再需要重录（其被测对象删除），相关用例在第 4 个任务删除；本任务若导致其失败，属预期，在验收索引中说明并确保 `check:fast` 仍通过（可在本任务中一并删除该文件）。

  **Requirements / Scenarios**
  - template-example：EX-01、EX-05 / SCN-TEMPLATE-EXAMPLE-001、008
  - protocol-contract：PC-02 / SCN-PROTOCOL-CONTRACT-003
  - template-engineering：ENG-01 / SCN-TEMPLATE-ENGINEERING-001（产物边界在删除后仍成立）

  **Design Decisions**
  - Decision: SDK 包的删除与运行辅助端口迁移
  - Decision: 协议包的调整

  **Interfaces**
  - Consumes: 示例模块与协议包公开入口。
  - Produces: 只含示例的 SDK 根入口；7 项错误码目录；必须显式传入路由的 Shadow。

  **RED**
  - 先删除支付代码并运行 `pnpm typecheck` 与 `pnpm check:architecture`：示例因依赖支付类型而编译失败、依赖规则引用不存在的路径，保存输出。

  **GREEN**
  - 完成运行辅助端口迁移与规则调整；删除随之失去被测对象的支付单测；`pnpm check:fast` 通过。

  **Verification**
  - `pnpm check:fast` 退出码 0。
  - `domain-isolation` 反例阻断、恢复后通过；错误码一致性校验的全部反例仍被拒绝。
  - `pnpm check:package` 通过，SDK 产物只含示例导出。

  **Review / Acceptance**
  - 确认 `packages/payment-sdk/src/` 下除 `example/`、`runtime/`、`index.ts` 外没有其他业务代码；确认没有未被测试导入的手写文件。

  **Commit**
  - `refactor(payment-sdk): remove payment business code`

- [ ] 4. 删除 E2E、宿主与 Live 中的支付部分

  **Files**
  - Delete：`packages/e2e/tests/sdk/`；`tests/flows/`；`tests/protocol/` 与 `tests/weapp/` 下的 `TC-PAYSDK-*`、`FLOW-PAYSDK-*` 文件；`tests/tooling/TC-PAYSDK-CORE-022.spec.ts`、`TC-PAYSDK-CORE-023.spec.ts`；全部 `TC-PAYSDK-*`、`FLOW-PAYSDK-*` Fixture 目录。
  - Modify：`packages/e2e/host/weapp/protocol-runner.ts` 删除 `runPaymentCase`；`app.js` 删除其注册；`src/drivers/weapp-host.test.ts` 同步。
  - Delete：`packages/e2e/src/drivers/channel-double.ts` 及测试；Modify：`src/live/build.ts`、`src/live/check.ts` 中测试设施判定去掉 `channel-double`，测试同步。
  - Delete：`host/weapp/pages/live/index/`、`host/weapp/live/controller.ts`、`page.ts`、`create-trade.ts`、`create-trade-errors.ts`、`trade-form.ts`、`runtime.ts` 及对应测试。
  - Modify：`host/weapp/live/config.ts` 与测试（去掉 `trade-form` 依赖，白名单按 Design 收窄）；`host/weapp/app.live.json`（只注册示例页面）；`src/live/check-evidence.ts`、`src/live/evidence.schema.json`、`src/live/build.ts` 的输入输出清单及测试（只保留 `LIVE-TEMPLATE-EXAMPLE-001`）。
  - Modify：工具单测中作为样本的 `TC-PAYSDK-*`、`FLOW-PAYSDK-*` 改为通用格式样本：`scripts/check-fixtures.test.ts`、`scripts/check-scenarios.test.ts`、`packages/e2e/src/cases/*.test.ts`、`packages/e2e/src/reporters/scenario-reporter.test.ts` 等。
  - Modify：`packages/e2e/vitest.config.*.ts` 的 include 去掉已删除目录。

  **Requirements / Scenarios**
  - template-engineering：ENG-05 / SCN-TEMPLATE-ENGINEERING-005；ENG-06 / SCN-TEMPLATE-ENGINEERING-006
  - template-example：EX-07 / SCN-TEMPLATE-EXAMPLE-010

  **Design Decisions**
  - Decision: E2E、宿主与 Live 的删除范围

  **Interfaces**
  - Consumes: 第 1～3 个任务后的通用用例与示例。
  - Produces: 只含通用与示例内容的 E2E 包、weapp 宿主与 Live 控制台。

  **RED**
  - 先删除支付 Live 页面与模块，运行 `pnpm test:unit`，确认 `config.ts` 因依赖 `trade-form` 失败、证据检查因缺少支付矩阵记录失败，保存输出。

  **GREEN**
  - 完成 Live 收窄、宿主调整与样本 ID 替换；`pnpm check:fast` 通过。

  **Verification**
  - `pnpm check:fast` 退出码 0。
  - `grep -rE "(TC|FLOW)-PAYSDK" packages scripts` 只可能命中第 5 个任务要处理的配置与文档；在验收索引中列出命中位置。
  - 示例的 3 个 weapp 文件与协议矩阵 weapp 文件按 AGENTS 约定取得通过的报告。

  **Review / Acceptance**
  - 确认 Live 构建与证据检查仍能离线执行，且示例页面的 Live 用例绑定在 SCN-TEMPLATE-ENGINEERING-005/006 与 SCN-TEMPLATE-EXAMPLE-010 之下。

  **Commit**
  - `refactor(e2e): remove payment tests, host entry and live console`

- [ ] 5. 门禁与配置收口，删除支付主 Spec

  **Files**
  - Modify：`scenario-gate.config.json` 删除支付格式；`scenario-gate.config.schema.json` 如有支付示例值同步修改。
  - Modify：`scripts/flow.schema.json`（`relatedScenarios` 改为 ID 数组，字段说明同步）、`scripts/lib/spec-inventory.ts` 及测试：校验关联 Scenario 已登记。
  - Create：`packages/e2e/tests/tooling/` 中 SCN-SCENARIO-GATE-007 的 unregistered-related-scenario-cli 用例；`scripts/lib/spec-inventory.test.ts` 中 flow-placement-rules 增加 related-scenarios-registered 检查。
  - Delete：`openspec/specs/payment-sdk/`、`openspec/specs/payment-sdk-contract/`（Design"OpenSpec 的两处例外"）。

  **Requirements / Scenarios**
  - scenario-gate：GATE-03 / SCN-SCENARIO-GATE-007（新增检查）；GATE-03 / SCN-SCENARIO-GATE-003、004（内容未变，随 GATE-03 的 MODIFIED 整体保留，作回归确认）；GATE-09 / SCN-SCENARIO-GATE-011

  **Design Decisions**
  - Decision: 门禁与配置收口
  - Decision: OpenSpec 的两处例外

  **Interfaces**
  - Consumes: 第 1～4 个任务后的仓库。
  - Produces: 只含通用格式的配置；只含 4 个通用能力的主 Spec。

  **RED**
  - 先加上 related-scenarios-registered 用例并运行，确认在旧实现下失败。

  **GREEN**
  - 完成 schema 与校验；删除支付主 Spec；`pnpm check:fast` 通过。

  **Verification**
  - `pnpm check:fast` 退出码 0。
  - 场景门禁问题总数为 0（以 unit、integration 与第 4 个任务取得的 weapp 报告运行，报告须与当前源码摘要一致，不一致时重跑）。
  - 在仓库副本上执行 `openspec archive remove-payment-business -y` 的模拟，确认可以归档（不在真实仓库执行）。

  **Review / Acceptance**
  - 确认主 Spec 目录只剩 `scenario-gate`、`template-example`、`template-engineering`、`protocol-contract`（后两者在归档后出现，Apply 期间以 delta 形式存在）。

  **Commit**
  - `feat(scenario-gate): drop payment formats and enforce registered FLOW scenarios`

- [ ] 6. 文档清理与完整验收

  **Files**
  - Modify：`AGENTS.md`、`packages/payment-sdk/AGENTS.md`、`packages/payment-protocol/AGENTS.md`、`packages/e2e/AGENTS.md`：删除"当前业务：支付"整节，更新通用规则中的能力与场景指向，补充"IDL 协议义务派生针对示例的 `CreateTrade`、`QueryTrade`"。
  - Modify：`README.md` 删除支付内容。
  - Delete：`docs/engineering/live-acceptance.md`、`docs/engineering/live-create-trade-contract.md`。
  - Modify：`.env.live.example` 只保留白名单剩余键。

  **Requirements / Scenarios**
  - template-engineering：ENG-02 / SCN-TEMPLATE-ENGINEERING-002（AGENTS 入口与链接检查）
  - scenario-gate：GATE-06 / SCN-SCENARIO-GATE-008（AGENTS 仍引用三份 schema）

  **Design Decisions**
  - Decision: 文档
  - Decision: 验证方式

  **Interfaces**
  - Consumes: 前 5 个任务的全部产物。
  - Produces: 不含支付内容的文档；完整验收证据。

  **RED**
  - 先删除支付文档并运行 `pnpm check:architecture`，确认 AGENTS 中指向已删除文件的链接被报告，保存输出。

  **GREEN**
  - 修正全部链接与指向；`pnpm check:fast` 通过。

  **Verification**
  - 完整 `pnpm check` 退出码 0：`check:fast`、weapp（按 AGENTS 约定按文件运行）、场景门禁问题数为 0。
  - `grep -rniE "TC-PAYSDK|FLOW-PAYSDK|支付业务" AGENTS.md packages/*/AGENTS.md README.md docs scripts packages --include='*.md' --include='*.ts' --include='*.json'` 不再命中业务内容（EX-07 中守护"不调用支付接口"的表述与 generated 代码除外），命中项在验收索引中逐条说明。

  **Review / Acceptance**
  - 汇总 6 个任务的证据；逐项核对 Design 迁移表与载体清单；确认已知缺口 GAP-01、GAP-02 已在 Design 登记。

  **Commit**
  - `docs(template): remove payment documentation and complete verification`
