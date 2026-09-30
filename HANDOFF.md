# HANDOFF：template-example 重新 Apply

更新日期：2026-09-30。交接给接手执行 `/change apply template-example` 的 agent。本文件是交接说明，不属于 OpenSpec 规划产物，完成后可删除。

## 1. 在哪里执行

- **必须在本 worktree 中继续**：`/Users/liyongning/.codex/worktrees/template-example-apply/sdk-template`，分支 `template-example-apply`。上一轮 Apply 的 15 个提交（`06127bc`…`d652199`）只在这个分支上，还没有合回 `sdk-template` 的 `main`。**不要从 `main` 新建 worktree**，否则拿不到这些提交。
- Plan Review 仍然有效：`plan-review.md` 为 PASS，digest `0ccb6e00cb571b89c4a6ebb84b50394f4d82724d295dee9ae95d1110969ae2c8`，与当前规划一致。本次只需修复实现和证据，**不要修改 proposal、specs、design、tasks 的正文**。如果发现必须改规划，停下来，回到 Plan Review。
- 6 个任务已经全部重新标为未完成，`openspec instructions apply` 返回 `state: ready`（0/6）。只改了勾选框，digest 不变。
- 工作区里有一处未提交的改动：`packages/e2e/AGENTS.md` 新增了"微信开发者工具自动化的注意事项"一节（见第 4 节），请保留，并随相关任务一起提交。
- `openspec/changes/template-example/verify.md` 是上一轮的结论（READY WITH WARNINGS），**已作废**：它没有运行场景门禁，还把 DevTools 不稳定误判为"支付遗留失败"。重新 Verify 时整体重写。

## 2. 为什么要重新 Apply

上一轮任务验收声称"`pnpm check:scenarios` 中 scenario-gate 场景已有绑定"、"`pnpm check` 全量通过"，但这两条命令实际没有运行。重新验收时运行场景门禁，发现本 Change 自己的场景有 **45 个问题**。完整列表见 `artifacts/verify-20260930/own-scenario-issues.txt`，产生它的门禁输出是 `artifacts/verify-20260930/check-scenarios-direct.json`。

被测代码本身基本正常：`pnpm check:fast` 全绿（单测 774 个、integration 225 个、覆盖率 100%），示例的 integration 和 weapp 用例都真实通过。问题集中在证据链和门禁本身。

## 3. 需要修复的问题（B 类）

### 3.1 门禁场景 SCN-SCENARIO-GATE-001～008 全部没有绑定（Task 1、Task 2）

- Task 1 的 Files 列出要新建 `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-002.spec.ts`、`-003`、`-005`、`-007`，实际没有建。现在只有 001、004、006、008。
- 已有的 4 个 tooling 用例都没有用 `meta.paymentCase` 或 `defineCase` 绑定场景 ID 与 case key。
- 需要为每个场景 verification 块中的**每个 case** 建立绑定：
  - module case（`test-tools-unit`）：绑定在 `scripts/**` 的就近单测上。
  - engineering case（`integration`）：绑定在 `tests/tooling` 的 CLI 用例上。
- case key 以 `specs/scenario-gate/spec.md` 为准，例如 GATE-001 的 `precheck-rules`、`missing-specs-dir-cli`、`missing-openspec-cli`。检查点必须真实执行。
- 写法参照支付已有的 `packages/e2e/tests/tooling/TC-PAYSDK-CORE-015/016/017.spec.ts`，以及 `scripts/*.test.ts` 中的 meta 绑定。

### 3.2 示例 module 用例的断言数恒为 0（Task 3）

- 原因：`packages/payment-sdk/src/example/**/*.test.ts` 用 vitest 的**全局 `expect`** 断言，却用 `context.expect.getState().assertionCalls` 计数。两者不是同一个计数器，所以报告里 `assertions` 为 0，门禁判定"没有执行断言"。
- 对照：同一份 `unit.json` 中，支付的 18 条 module 记录断言数全部大于 0，示例的 8 条全部为 0。
- 修复：示例测试一律改用 `context.expect`，参照 `packages/payment-sdk/src/core/client.module.test.ts`。
- 同样问题的 integration 用例：`SCN-TEMPLATE-EXAMPLE-007 core-neutrality`、`SCN-TEMPLATE-EXAMPLE-008 dependency-violations`，报告中断言数为 0。

### 3.3 重复绑定与名称不规范（Task 3、Task 4）

- `duplicate binding key sdk-unit/create-mapping`、`sdk-unit/create-error-mapping`：同一个 caseId 被两个测试绑定。合并，或改用不同的 caseId。
- `duplicate binding key integration/normal`：示例 FLOW 的 caseId `normal` 与支付 `FLOW-PAYSDK-001` 的 `normal` 重名。示例改用唯一的 caseId，例如 `example-normal`。
- `report fullName does not carry ownerId/caseId`：`sdk-unit/status-mapping-table`（测试名写成了 "status mapping and reference validation"）和 `integration/normal`。测试名须为 `<ownerId> <caseId>`。

### 3.4 示例 FLOW 证据不成立（Task 4、Task 5）

- `integration/normal: checkpoint stage-order / reference-continuity / single-final-outcome did not execute`
- `FLOW-TEMPLATE-EXAMPLE-001/normal: missing continuous stages in one report`：FLOW 注解里的 stages 须覆盖 FLOW 表"阶段"列用 `→` 切分后的每一段。
- `FLOW-TEMPLATE-EXAMPLE-001/normal: missing FLOW binding for weapp`
- 这几条可能部分由 3.3 的 caseId 重名引起，修完 3.3 后重新确认。

### 3.5 weapp 与 protocol-unit 的绑定（Task 4、Task 5），需先排查

- 门禁报 `SCN-TEMPLATE-EXAMPLE-002/create-success`、`-004/observe-completed`、`-011/normal` **missing binding for weapp**。
- 但这三个 weapp 用例都通过了，报告中的绑定也正确（例如 `environment: weapp`、`caseId: weapp-create-success`、covers `SCN-TEMPLATE-EXAMPLE-002/create-success`）。
- 已确认的事实：
  - 单独用 `--report artifacts/verify-20260930/reports/weapp/example__SCN-TEMPLATE-EXAMPLE-002.json` 运行门禁时，**不会**报 weapp 缺绑定。
  - `loadReporterOutputs` 读全部报告时能读到全部 66 个 weapp 绑定，包括示例的 3 个，且没有加载问题。
  - 但用 unit、integration 和全部 9 份 weapp 报告一起运行时，就会报缺失。
- 因此很可能是**门禁对账逻辑的缺陷**（`scripts/check-scenarios.ts` 的 `evaluateCoverage` 或绑定合并），而门禁代码正是本 Change 编写的。请先写一个能复现的最小单测，定位后修复。不要用改报告的方式绕过。
- `SCN-TEMPLATE-EXAMPLE-009/shadow-create-route: missing binding for protocol-unit`：`packages/payment-protocol/testing/shadow/example/routes.test.ts` 要按 spec 的 case key 绑定。

## 4. 用户已做的决定（必须遵守）

1. **A 类（支付）不跑、不修**。支付场景与支付 IDL 契约义务在门禁中的缺口（以 `TC-PAYSDK-`、`FLOW-PAYSDK-` 开头，或以 `infra.trade.v1.` 开头的问题，约 445 条）来自原项目未完成的 Task 8，后续删除支付时会一并清理。不要为它们补测试、跑基线，也不要改支付测试。Verify 中记为"用户决定排除的支付遗留"。
2. **本次的验收标准**：场景门禁中，排除第 1 条的支付部分后，**问题数为 0**。门禁整体仍会因支付部分以退出码 1 结束；verify.md 如实记录这一点，并注明这是用户的排除决定。
3. **微信开发者工具不稳定是已知问题，这次不修 driver**。按 `packages/e2e/AGENTS.md`"微信开发者工具自动化的注意事项"执行：
   - 每个 weapp 测试文件运行前，先 `cli quit`，再 `pkill -f wechatwebdevtools.app`，然后用 `cli open --project <worktree>/packages/e2e/host/weapp` 预热，再运行。不预热时，首个 case 会因冷启动超过 30 秒而必然失败。
   - 失败表现为：`checkVersion` 报 `TypeError`、120 秒挂起、30 秒启动超时，报告中断言数都是 0。遇到时退出主进程后**整文件重跑**。**不要用 `-t` 单跑 case**：被过滤的 case 会以 skipped 写入报告，造成重复绑定。
   - 可复用的脚本思路见 `artifacts/verify-20260930/weapp-attempts.json` 对应的执行方式：按文件运行，每个文件一份报告，失败时整文件重试，最多 4 次。
4. **只需要跑示例的 weapp 用例**：`packages/e2e/tests/weapp/example/` 下的 3 个文件，另加任务中改到的共享宿主文件相关用例。支付的 weapp 文件属于第 1 条，不需要跑。
5. **不做 Live 真实运行**，这是规划中的非目标。verify 里不要把它写成 warning 或"待外部跟进"。

## 5. 完成后的验证命令

以 `PAYMENT_RUN_ID=<新的 run id>` 运行：

1. `pnpm check:fast`，必须退出码 0。
2. 示例 weapp 3 个文件，按第 4 节第 3 条执行，报告写到 `artifacts/<run-id>/reports/weapp/<文件名>.json`。
3. 场景门禁：`node_modules/.bin/tsx scripts/check-scenarios.ts --report artifacts/<run-id>/reports/unit.json --report artifacts/<run-id>/reports/integration.json --report <每份 weapp 报告>`。
   - 过滤掉支付部分：问题文本中不含 `PAYSDK`，且不以 `infra.trade` 开头。过滤后必须为 0 条。
4. `openspec validate template-example --strict`，以及 `python3 /Users/liyongning/.claude/skills/change/scripts/plan-review-digest.py openspec/changes/template-example --check-review openspec/changes/template-example/plan-review.md`，结果须为 `freshness: PASS`。
5. `pnpm live:build`、`pnpm live:check`，离线执行，不做真实运行。

每个任务的完成声明都必须有本次实际运行的命令和退出码作为证据，不得凭推断勾选。

## 6. 参考证据（本次重新验收时产生，均在 `artifacts/verify-20260930/`，该目录被 git 忽略）

- `reports/unit.json`、`reports/integration.json`：V-001 `pnpm check:fast`（退出码 0）的报告。
- `reports/weapp/*.json`：按文件运行的 weapp 报告。9 个文件中 8 个通过，示例 3 个文件都第一次就通过；支付的 `TC-PAYSDK-PUBLIC-RUNTIME` 4 次都有不同的 case 出现 120 秒挂起。
- `weapp-*-attempt*.log`、`weapp-attempts.json`：每次尝试的日志。
- `discarded-coldstart/`：未预热时的无效尝试，只作记录，不作为证据。
- `check-scenarios-direct.json`、`own-scenario-issues.txt`：场景门禁的输出，以及本 Change 自己的 45 个问题。
