# Task 4 验收索引：内部标识中立化与遗留代码小项

- run-id: `generalize-template-20261002`；change: `generalize-template`；branch: `codex/generalize-template`
- plan-review gate: PASS（digest `2bb108e6…`，任务开始前与完成后各复算一次均一致）
- 结论: 实现与 Spec GATE-07 / SCN-SCENARIO-GATE-009、GATE-08 / SCN-SCENARIO-GATE-010、ENG-03 / SCN-TEMPLATE-ENGINEERING-003、PC-02 / SCN-PROTOCOL-CONTRACT-003 一致；验证通过，待提交。

## 产物

| 旧 | 新 | 位置 |
| --- | --- | --- |
| `PAYMENT_RUN_ID`、`PAYMENT_REPORT_FILE` | `VERIFY_RUN_ID`、`VERIFY_REPORT_FILE` | 根 `package.json` scripts、`vitest.config.ts`、`scripts/check-scenarios.ts` 及测试 |
| `meta.paymentCase` | `meta.scenarioCase` | `define-case.ts`、`scenario-reporter.ts`、`packages/e2e/src/vitest.d.ts`、全部用例与报告测试 |
| 注解 `payment-evidence`、`payment-flow` | `scenario-evidence`、`scenario-flow` | 同上 |
| `summaries.paymentBehavior` | `summaries.publicBehavior` | `scripts/check-scenarios.ts` 与测试 |
| `paymentBusinessErrors`、`paymentBusinessErrorsIdlCommit`、`PaymentBusinessErrorDescriptor`、`getPaymentBusinessError` | `businessErrors`、`businessErrorsIdlCommit`、`BusinessErrorDescriptor`、`getBusinessError` | `packages/protocol/src/errors/business-codes.ts`、`src/index.ts` 及用例 |
| `__PAYMENT_TEST_RUNNER__` | `__TEMPLATE_TEST_RUNNER__` | `packages/e2e/host/weapp/app.js`、`src/drivers/weapp-host.test.ts` |
| weapp 标题 "Payment SDK Test Host" / "Payment SDK protocol test host" | "SDK Template Test Host" / "SDK template protocol test host" | `host/weapp/app.json`、`pages/index/index.json`、`pages/index/index.wxml` |
| 临时目录前缀 `payment-*`（release/architecture/fixture/scenario/pack/spec/reports/precheck/contract/type/fingerprint/coverage/collect 等）与局部名 `paymentSource` | `template-*`、`generatedSource` | 脚本与测试 |
| schema `$id` `…/payment-fixture.schema.json` | `…/fixture.schema.json` | `packages/e2e/tests/fixtures/fixture.schema.json:3` |

- `packages/protocol/src/adapters/network/wechat-miniapp.test.ts`：删除引用已删除支付场景的第 6 行注释；URL 测试数据 `/payment?unchanged=1` → `/resource?unchanged=1`。
- `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-003/source-and-dual-declarations.json`：`ExampleClientOptions.fields` 追加平铺名 `productId`、`lane`、`appVersion`；同 fixture `manifest.json` 刷新 `source-and-dual-declarations.json` 摘要为 `sha256:2f00db16…`。
- 共 48 个文件修改。

说明：`scripts/verification.schema.json:3` 的 `$id` 已在任务 1 改为 `…/verification.schema.json`（任务 1 的 Files 含该文件），本任务复核无遗留。

## RED（先失败）证据

先把三处期望改为新名称（`scenario-reporter.test.ts` 的 `scenarioCase`/`scenario-evidence`/`scenario-flow`；`check-scenarios.test.ts` 的 `publicBehavior`、`missing scenarioCase binding`、`VERIFY_RUN_ID`；`define-case.test.ts` 的标题中立化），再运行：

| 命令 | 退出码 | 关键结果 |
|---|---|---|
| `pnpm exec vitest run --project sdk-unit --project protocol-unit --project test-tools-unit …/scenario-reporter.test.ts scripts/check-scenarios.test.ts` | 1 | `Test Files 2 failed (2)`、`Tests 7 failed | 16 passed (23)`；报告器读不到 `scenarioCase`、门禁仍报 `paymentCase` |

日志：`artifacts/generalize-template-20261002/reports/task-4-red.log`。

## GREEN 与实际运行

| 命令 | 退出码 | 关键结果 |
|---|---|---|
| `pnpm typecheck` | 0 | 四个 tsconfig 全部通过 |
| `VERIFY_RUN_ID=… pnpm check:fast` | 0 | 全链路通过（lint、build、architecture、unit、fixtures、integration、package 均 0） |
| `pnpm exec vitest run --project sdk-unit --project protocol-unit --project test-tools-unit`（check:fast 内） | 0 | 43 文件 / 286 用例；覆盖率 100%（Stmts 1843/1843、Branch 1247/1247、Funcs 320/320、Lines 1398/1398） |
| `VERIFY_RUN_ID=… pnpm test:integration`（check:fast 内） | 0 | 30 文件 / 78 用例 |
| `pnpm check:architecture` | 0 | `{"issues": []}` |
| `pnpm check:package` | 0 | `issues: []` |
| `pnpm proto:status` | 0 | `up_to_date`（本任务未触碰 ProtoGen 配置） |

完整 `check:fast` 日志：`artifacts/generalize-template-20261002/reports/task-4-check-fast.log`。

## 残留名称检查（Verification）

`git grep -niE "payment|PAYMENT_|paysdk" -- . ':!artifacts' ':!openspec' ':!packages/protocol/src/generated' ':!packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003' ':!proto-gen.lock' ':!proto-gen.yaml'` 共 18 处命中，全部属于残留允许清单：

| 类别 | 命中位置 | 数量 |
|---|---|---|
| 8 文档（任务 5 改写） | `AGENTS.md`、`packages/sdk/AGENTS.md`、`packages/protocol/AGENTS.md`、`README.md`、`docs/engineering/bootstrap.md` | 11 |
| 7 归档路径（不可改） | 7 个 fixture `manifest.json` 的 `sources.spec.path`（`…/archive/2026-10-02-remove-payment-business/…`） | 7 |

源码、脚本、配置、测试、fixture 数据内命中为 0。`openspec/specs`（主 Spec 的 `## Purpose` 占位）与文档命中按 Design 归属任务 5。

## 场景门禁问题归属（0 回归）

命令：`VERIFY_RUN_ID=generalize-template-20261002 pnpm exec tsx scripts/check-scenarios.ts --report <unit> --report <integration> --report 4×weapp`，退出码 1，输出保存于 `artifacts/generalize-template-20261002/reports/scenario-gate.json`。

| 数量 | 问题 | 归属 |
|---|---|---|
| 1 | `SCN-TEMPLATE-ENGINEERING-006/guide-rules: missing binding for test-tools-unit` | 任务 5 |
| 1 | `SCN-TEMPLATE-ENGINEERING-006/guide-violations-cli: missing binding for integration` | 任务 5 |

`summaries` 现为 `allSpec`/`byKind`/`flows`/`protocol`/`publicBehavior`（旧键 `paymentBehavior` 不再存在）。`SCN-SCENARIO-GATE-009/010`、`SCN-TEMPLATE-ENGINEERING-003`、`SCN-PROTOCOL-CONTRACT-001～004` 与其余已有场景均无问题。

## weapp 重跑记录

四个文件逐文件运行，报告（每文件一份，均在退出主进程并重新预热后取得）：

| 文件 | 报告 | 结果 |
|---|---|---|
| `FLOW-TEMPLATE-EXAMPLE-001` | `reports/weapp-FLOW-TEMPLATE-EXAMPLE-001.json` | 1 passed / 4 assertions；首次预热后 launch 挂起 120s（断言前失败），整文件重跑通过 |
| `SCN-PROTOCOL-CONTRACT-002` | `reports/weapp-SCN-PROTOCOL-CONTRACT-002.json` | 1 passed / 376 assertions；一次 120s 挂起后重新预热重跑通过 |
| `SCN-TEMPLATE-EXAMPLE-002` | `reports/weapp-SCN-TEMPLATE-EXAMPLE-002.json` | 1 passed / 4 assertions；一次通过 |
| `SCN-TEMPLATE-EXAMPLE-004` | `reports/weapp-SCN-TEMPLATE-EXAMPLE-004.json` | 1 passed / 4 assertions；一次通过 |

宿主全局 `__TEMPLATE_TEST_RUNNER__` 与三处标题改名后，`weapp-host.test.ts` 与全部 weapp 用例通过。

## 与计划的差异

1. `scripts/verification.schema.json` 的 `$id` 在任务 1 已完成，本任务只复核；`fixture.schema.json` 的 `$id` 在本任务改名。
2. 裸 `payment-fixture-` 之外的 7 个 `payment-*` 前缀（release-check、package-cli、type-cli、fingerprint、coverage、collect、template-engineering-consumer）不在 Design 列举里，但属同一类临时目录/局部名前缀，一并中立化为 `template-*`。
3. `wechat-miniapp.test.ts` 的 URL 测试数据含 `payment`，一并改为 `/resource`，使残留检查在测试数据上也归零。
4. `check-scenarios.ts` 的局部变量 `paymentCases`（按 `paymentCase` 前缀）随改名变为 `scenarioCases`，语义不变。

## 未解决项（归属后续任务）

- 文档（根与各包 `AGENTS.md`、`README.md`、`docs/**`）中的旧名、支付链接与本机路径 → 任务 5。
- 四份主 Spec 的 `## Purpose` 占位 → 任务 5。
- 两个 `UE` 状态的 DevTools 残留主进程未清理（不影响端口与运行）。
