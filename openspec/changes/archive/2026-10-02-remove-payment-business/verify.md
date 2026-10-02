# Verification

## Metadata

- Change: remove-payment-business
- Schema: openspec-workflow
- Verified Git revision: f6e7c6c579c4454985c6df7db4aa6e14989d28df (branch `codex/remove-payment-business`, worktree `.worktrees/remove-payment-business`)
- Verification input manifest digest: dc2d84d681ae96b44e0c3c5fedf4a5bf48f8da0068e10d850db836aabb9f7f86 (326 files)
- Manifest includes: `git ls-files -co --exclude-standard` 的全部文件（代码、测试、配置、Fixture、Spec、proposal/specs/design/tasks/plan-review），按路径排序，逐个计入路径、类型（file/symlink）、可执行位与内容 SHA-256；算法见本次运行的 `manifest.py`（scratchpad，复算命令见 Archive Readiness）
- Plan Review verdict: PASS
- Reviewed digest: 2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6
- Current digest: 2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6
- Plan Review digest match: yes
- Unresolved Plan Review findings: Critical 0 / Important 0（attempt 8 Approved；PR-701..703 为已接受 Minor）
- Untracked inputs included: None
- Excluded lifecycle paths: `openspec/changes/remove-payment-business/verify.md`（本文件）；`artifacts/`（被 `.gitignore` 忽略的运行证据目录，不是实现输入）
- Verified at: 2026-10-02T01:18:21Z（命令执行区间 2026-10-02T01:07:08Z – 01:18:21Z）
- Verification environment: macOS 26.2；Node v22.21.1；pnpm 10.20.0；OpenSpec 1.6.0；微信开发者工具（`/Applications/wechatwebdevtools.app`）+ miniprogram-automator 0.12.1；Go（本机，用于 IDL 来源提取）；IDL 仓库 `/Users/liyongning/Projects/workspace/dev/idl` 固定提交 5539be8f09323709fa65f6568efe22896ec35d24

## Apply Gate

- Fresh Apply state: all_done
- Apply progress: 10/10
- Unchecked tasks: 0
- Final Code Review: PASS（`artifacts/20261001-remove-payment-business/tasks/final-code-review.md`；独立评审席位 A/B/C 因网络超时未返回，重试席位 D 完成；另有 Bridge 在本次 Verify 前的独立复核，见 Review Findings）
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: 7（F-01..F-05、V-M1、V-M2，见 Review Findings and Resolutions）

## Verification Summary

| Dimension | Status | Evidence |
|---|---|---|
| Completeness | PASS | 10/10 任务；12 条有效 Requirement 与 27 个有效 Scenario 全部有运行证据（V-1、V-3） |
| Correctness | PASS | V-1..V-7 全部退出码符合预期；门禁 0 问题；Go 来源逐字节一致 |
| Coherence | PASS | Proposal/Design/Tasks/Plan Review/实现一致；规划 digest 与评审一致；有意移出的能力与 Design 记录一致 |

## Completeness

### Artifact and Task Completion

| Item | Authority | Expected | Observed | Status |
|---|---|---|---|---|
| proposal / design / specs / tasks / plan-review | `openspec status --change remove-payment-business --json` | done | done | PASS |
| verification | 同上 | ready → 本文件 | 本文件写入 `resolvedOutputPath` | PASS |
| Tasks 1–10 | `openspec instructions apply --json` | all_done | all_done，10/10 | PASS |
| Plan Review freshness | `plan-review-digest.py --check-review` | PASS | PASS | PASS |
| `openspec validate --strict` | V-6 | valid | valid | PASS |

### Requirement Coverage

有效 Spec = 主 Spec（`openspec/specs/{scenario-gate,template-example}`）+ 本 Change 的 delta。GATE-04、EX-07 已被 REMOVED；`payment-sdk`、`payment-sdk-contract` 已按 Design"OpenSpec 的两处例外"直接删除。

| Requirement | Spec Source | Implementation Evidence | Verification IDs | Status |
|---|---|---|---|---|
| GATE-01 OpenSpec 驱动前置检查 | openspec/specs/scenario-gate/spec.md:6 | `scripts/check-scenarios.ts`；`tests/tooling/SCN-SCENARIO-GATE-001.spec.ts` | V-2、V-3 | PASS |
| GATE-02 场景 ID 唯一前置检查 | openspec/specs/scenario-gate/spec.md:33 | `scripts/lib/spec-inventory.ts`；`SCN-SCENARIO-GATE-002.spec.ts` | V-2、V-3 | PASS |
| GATE-03 场景来源发现与生命周期合并（MODIFIED） | changes/.../specs/scenario-gate/spec.md:3 | `scripts/lib/spec-inventory.ts`（relatedScenarios 登记校验）；`scripts/flow.schema.json:8`；`SCN-SCENARIO-GATE-003/004/007.spec.ts` | V-2、V-3 | PASS |
| GATE-05 Scenario 验证元数据必填 | openspec/specs/scenario-gate/spec.md:151 | `scripts/verification.schema.json`；`SCN-SCENARIO-GATE-006.spec.ts` | V-2、V-3 | PASS |
| GATE-06 格式 schema 是唯一权威 | openspec/specs/scenario-gate/spec.md:178 | 三份 schema；根 `AGENTS.md` 硬规则 2–4；`SCN-SCENARIO-GATE-008.spec.ts` | V-2、V-3 | PASS |
| GATE-07 覆盖清单由事实源生成且缺绑定被阻断（ADDED） | changes/.../specs/scenario-gate/spec.md:72 | `scripts/check-scenarios.ts`、`scripts/lib/contract-inventory.ts`；`SCN-SCENARIO-GATE-009.spec.ts` | V-2、V-3 | PASS |
| GATE-08 运行证据有效性（ADDED） | changes/.../specs/scenario-gate/spec.md:97 | `scripts/lib/fingerprints.ts`；`SCN-SCENARIO-GATE-010.spec.ts` | V-2、V-3 | PASS |
| GATE-09 可配置的 ID 格式（ADDED） | changes/.../specs/scenario-gate/spec.md:133 | `scenario-gate.config.json`（通用 SCN/FLOW 格式）；`scripts/lib/scenario-gate.evidence.test.ts`（LEGACY 双格式）；`SCN-SCENARIO-GATE-011.spec.ts` | V-2、V-3 | PASS |
| ENG-01 三包边界与产品交付 | changes/.../specs/template-engineering/spec.md:3 | `scripts/check-package.ts`；`SCN-TEMPLATE-ENGINEERING-001.spec.ts` | V-2、V-3 | PASS |
| ENG-02 架构与质量门禁 | changes/.../specs/template-engineering/spec.md:33 | `scripts/check-architecture.ts`、`.dependency-cruiser.cjs`；`SCN-TEMPLATE-ENGINEERING-002.spec.ts` | V-2、V-3 | PASS |
| ENG-03 公共类型中文注释随双格式声明交付 | changes/.../specs/template-engineering/spec.md:65 | `packages/payment-sdk/src/example/contracts.ts`；`SCN-TEMPLATE-ENGINEERING-003.spec.ts` | V-2、V-3 | PASS |
| ENG-04 统一发布入口的预检 | changes/.../specs/template-engineering/spec.md:88 | `scripts/sdk-release.ts`、`scripts/check-release.ts`；`SCN-TEMPLATE-ENGINEERING-004.spec.ts` | V-2、V-3 | PASS |
| PC-01 基于 IDL 的协议义务派生 | changes/.../specs/protocol-contract/spec.md:3 | `scripts/lib/contract-inventory.ts`；`tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts`、`tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts` | V-2、V-3、V-4 | PASS |
| PC-02 手写错误码事实与来源校验 | changes/.../specs/protocol-contract/spec.md:45 | `packages/payment-protocol/src/errors/business-codes.ts`（7 项）；`tests/protocol/SCN-PROTOCOL-CONTRACT-003.spec.ts`；Fixture `SCN-PROTOCOL-CONTRACT-003/` | V-2、V-3、V-5 | PASS |
| EX-01 示例公共入口与装配（MODIFIED） | changes/.../specs/template-example/spec.md:3 | `packages/payment-sdk/src/index.ts`、`example/factory.ts`、`example/contracts.test.ts`；`tests/example/SCN-TEMPLATE-EXAMPLE-001*.spec.ts` | V-2、V-3 | PASS |
| EX-02 创建资源 | openspec/specs/template-example/spec.md:33 | `example/core/client.ts`、`example/adapters/trade-backend.ts`；`SCN-TEMPLATE-EXAMPLE-002/003.spec.ts`（integration + weapp） | V-2、V-3、V-4 | PASS |
| EX-03 有界观察 | openspec/specs/template-example/spec.md:79 | `example/core/client.ts`；`SCN-TEMPLATE-EXAMPLE-004/005/006.spec.ts`（004 含 weapp） | V-2、V-3、V-4 | PASS |
| EX-04 状态映射与引用校验 | openspec/specs/template-example/spec.md:153 | `example/adapters/trade-backend.ts`；`tests/tooling/SCN-TEMPLATE-EXAMPLE-007.spec.ts` | V-2、V-3 | PASS |
| EX-05 示例分层与隔离（MODIFIED） | changes/.../specs/template-example/spec.md:32 | `.dependency-cruiser.cjs:13` `domain-isolation`；`tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts` | V-2、V-3 | PASS |
| EX-06 示例的 Shadow 支持 | openspec/specs/template-example/spec.md:200 | `packages/payment-protocol/testing/shadow/example/routes.ts`；`SCN-TEMPLATE-EXAMPLE-009.spec.ts` | V-2、V-3 | PASS |
| EX-08 示例的必需集成流程 | openspec/specs/template-example/spec.md:248 | `tests/example/FLOW-TEMPLATE-EXAMPLE-001.spec.ts`、`tests/weapp/example/FLOW-TEMPLATE-EXAMPLE-001.spec.ts` | V-2、V-3、V-4 | PASS |

### Scenario Coverage

| Scenario ID | Scenario | Requirement | Test or Runtime Evidence | Verification IDs | Status |
|---|---|---|---|---|---|
| SCN-SCENARIO-GATE-001 | 缺少 OpenSpec 时前置检查失败 | GATE-01 | `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-001.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-002 | 场景 ID 缺失、格式不符或重复 | GATE-02 | `tests/tooling/SCN-SCENARIO-GATE-002.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-003 | active change 的增、改、删生效 | GATE-03 | `tests/tooling/SCN-SCENARIO-GATE-003.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-004 | FLOW 登记丢失能被发现 | GATE-03 | `tests/tooling/SCN-SCENARIO-GATE-004.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-006 | 验证元数据缺失、重复或不合法 | GATE-05 | `tests/tooling/SCN-SCENARIO-GATE-006.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-007 | FLOW 表写在 Requirement 之外 | GATE-03 | `tests/tooling/SCN-SCENARIO-GATE-007.spec.ts`（含 unregistered-related-scenario-cli）；`scripts/lib/spec-inventory.test.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-008 | schema 缺少字段说明或 AGENTS 未引用 | GATE-06 | `tests/tooling/SCN-SCENARIO-GATE-008.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-009 | 新增场景或协议义务未绑定测试 | GATE-07 | `tests/tooling/SCN-SCENARIO-GATE-009.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-010 | 场景运行证据不足 | GATE-08 | `tests/tooling/SCN-SCENARIO-GATE-010.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-011 | 多格式并存与移除格式 | GATE-09 | `tests/tooling/SCN-SCENARIO-GATE-011.spec.ts`；`scripts/lib/scenario-gate.evidence.test.ts` pattern-config | V-2、V-3 | PASS |
| SCN-TEMPLATE-ENGINEERING-001 | 产品包与协议包的产物边界与消费 | ENG-01 | `tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-ENGINEERING-002 | 架构与质量门禁缺失或违规 | ENG-02 | `tests/tooling/SCN-TEMPLATE-ENGINEERING-002.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-ENGINEERING-003 | 公共类型注释随源码与声明交付 | ENG-03 | `tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-ENGINEERING-004 | 发布预检与发布顺序 | ENG-04 | `tests/tooling/SCN-TEMPLATE-ENGINEERING-004.spec.ts` | V-2、V-3 | PASS |
| SCN-PROTOCOL-CONTRACT-001 | 义务清单只针对示例消费的接口 | PC-01 | `tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts`；`scripts/lib/contract-inventory.test.ts` | V-2、V-3 | PASS |
| SCN-PROTOCOL-CONTRACT-002 | 示例接口的协议义务都有运行证据 | PC-01 | `tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`（integration）；`tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`（weapp）；635/635 协议义务 | V-2、V-3、V-4 | PASS |
| SCN-PROTOCOL-CONTRACT-003 | 错误码副本与 IDL 来源一致 | PC-02 | `tests/protocol/SCN-PROTOCOL-CONTRACT-003.spec.ts`；Go 重新提取逐字节一致 | V-2、V-3、V-5 | PASS |
| SCN-TEMPLATE-EXAMPLE-001 | 无平台环境导入与配置校验 | EX-01 | `tests/example/SCN-TEMPLATE-EXAMPLE-001.spec.ts`、`.package.spec.ts`；`src/example/contracts.test.ts`（public-type-contract） | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-002 | 创建成功返回资源引用 | EX-02 | `tests/example/SCN-TEMPLATE-EXAMPLE-002.spec.ts`；`tests/weapp/example/SCN-TEMPLATE-EXAMPLE-002.spec.ts` | V-2、V-3、V-4 | PASS |
| SCN-TEMPLATE-EXAMPLE-003 | 创建失败的归类 | EX-02 | `tests/example/SCN-TEMPLATE-EXAMPLE-003.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-004 | 观察到终态 | EX-03 | `tests/example/SCN-TEMPLATE-EXAMPLE-004.spec.ts`；`tests/weapp/example/SCN-TEMPLATE-EXAMPLE-004.spec.ts`（第 4 次整文件重跑通过，见 V-4） | V-2、V-3、V-4 | PASS |
| SCN-TEMPLATE-EXAMPLE-005 | 窗口结束与单次查询超时 | EX-03 | `tests/example/SCN-TEMPLATE-EXAMPLE-005.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-006 | 宿主取消观察 | EX-03 | `tests/example/SCN-TEMPLATE-EXAMPLE-006.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-007 | 状态映射与引用不一致 | EX-04 | `tests/tooling/SCN-TEMPLATE-EXAMPLE-007.spec.ts`；`example/adapters/trade-backend.test.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-008 | 示例依赖越界被阻断 | EX-05 | `tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-009 | Shadow 创建路由与故障注入 | EX-06 | `tests/example/SCN-TEMPLATE-EXAMPLE-009.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-011 | 创建到观察的连续流程 | EX-08 | FLOW-TEMPLATE-EXAMPLE-001：`tests/example/FLOW-TEMPLATE-EXAMPLE-001.spec.ts`、`tests/weapp/example/FLOW-TEMPLATE-EXAMPLE-001.spec.ts`；flows 2/2 | V-2、V-3、V-4 | PASS |

## Correctness

### Fresh Command Evidence

所有命令在本次 Verify 中执行，`PAYMENT_RUN_ID=verify-20261002`；输出保存在 worktree 的 `artifacts/verify-20261002/`（被 `.gitignore` 忽略，归档后随 worktree 一并转存）。

#### V-1: Plan Review freshness 与 Apply 状态

- Command: `plan-review-digest.py openspec/changes/remove-payment-business --check-review openspec/changes/remove-payment-business/plan-review.md`；`openspec instructions apply --change remove-payment-business --json`
- Working directory: worktree 根
- Executed at: 2026-10-02T01:05Z、2026-10-02T01:18Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: 内联：`freshness":"PASS"`，reviewed = current = 2ef0181c…；`state: all_done`，`{'total': 10, 'complete': 10, 'remaining': 0}`
- Key observations: Apply 期间规划未发生语义变化（Apply 只改动 10 个勾选框）。

#### V-2: `pnpm check:fast`

- Command: `PAYMENT_RUN_ID=verify-20261002 pnpm check:fast`
- Working directory: worktree 根
- Executed at: 2026-10-02T01:07:08Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-20261002/verify/check-fast.txt`
- Key observations: proto:validate valid、proto:status up_to_date；lint、build、typecheck 通过；dependency-cruiser 50 modules / 98 deps / 0 violations；unit 40 文件 278/278，手写代码四项覆盖率 100%（`vitest.config.ts` 覆盖排除项中已无任何支付核心豁免）；check:fixtures 0 issues；integration 28 文件 72/72；check:package 0 issues。

#### V-3: 场景门禁（unit + integration + 全部 weapp 报告）

- Command: `PAYMENT_RUN_ID=verify-20261002 npx tsx scripts/check-scenarios.ts --report …/unit.json --report …/integration.json --report …/weapp-FLOW-TEMPLATE-EXAMPLE-001.json --report …/weapp-SCN-TEMPLATE-EXAMPLE-002.json --report …/weapp-SCN-TEMPLATE-EXAMPLE-004.json --report …/weapp-SCN-PROTOCOL-CONTRACT-002.json`
- Working directory: worktree 根
- Executed at: 2026-10-02T01:18:10Z
- Exit code: 0
- Failure count: 0（issues: []）
- Result: PASS
- Output reference: `artifacts/verify-20261002/verify/scenarios.json`；stderr `scenarios.err` 0 字节
- Key observations: allSpec 27/27/27；behavior 14/14/14、module 17/17/17、engineering 61/61/61；protocol 635/635/635；flows 2/2/2。首次运行（EX-004 weapp 尚未取得有效报告时）exit 1，5 个问题全部指向 `weapp-observe-completed` 未执行断言，重跑后清零。

#### V-4: weapp 逐文件运行（按 `packages/e2e/AGENTS.md` 执行约定）

- Command: 每个文件运行前 `cli quit` + `pkill -f wechatwebdevtools.app`，`cli open --project packages/e2e/host/weapp` 预热，然后 `PAYMENT_REPORT_FILE=artifacts/verify-20261002/reports/weapp-<name>.json npx vitest run --project weapp <file>`；失败时整文件重跑，不使用 `-t`
- Working directory: worktree 根
- Executed at: 2026-10-02T01:10Z – 01:18Z
- Exit code: 最终每个文件 0
- Failure count: 最终 0
- Result: PASS
- Output reference: `artifacts/verify-20261002/verify/weapp.txt`、`weapp-<name>-attempt<n>.log`
- Key observations:

  | 文件 | 结果 | 尝试 | 失败现象 |
  |---|---|---|---|
  | `tests/weapp/example/FLOW-TEMPLATE-EXAMPLE-001.spec.ts` | 1/1 通过 | 1 | — |
  | `tests/weapp/example/SCN-TEMPLATE-EXAMPLE-002.spec.ts` | 1/1 通过 | 1 | — |
  | `tests/weapp/example/SCN-TEMPLATE-EXAMPLE-004.spec.ts` | 1/1 通过 | 4（第 4 次预热延长到 25 秒） | 前 3 次均为 `Error: Wait timed out after 30000 ms`（30.1 秒，断言执行前），即 AGENTS 记载的冷启动超时 |
  | `tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts` | 1/1 通过 | 2 | 第 1 次 `Wait timed out after 30000 ms` |

  失败都发生在断言之前，与被测行为无关；未修改断言、未跳过用例。

#### V-5: 错误码 Go 来源重新提取与逐字节比对

- Command: `sh packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/reproduce.sh /Users/liyongning/Projects/workspace/dev/idl <scratch>`；`cmp <scratch>/SCN-PROTOCOL-CONTRACT-003/idl-errors.json packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/idl-errors.json`
- Working directory: worktree 根
- Executed at: 2026-10-02T01:18:21Z
- Exit code: 0（reproduce）/ 0（cmp）
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-20261002/verify/reproduce.log`
- Key observations: 在 IDL 固定提交 5539be8 的临时 archive 上提取 7 项 Go 错误；Go 测试 `TestDescribeErrorCodeInfraTradePayContracts` PASS；重新生成的 `idl-errors.json` 与仓库副本逐字节一致；运行后 worktree 无改动（`git status` 为空）。`business-codes.ts` 恰为 7 项（网关 3 项 + QueryTrade 4 项）。

#### V-6: OpenSpec 严格校验

- Command: `openspec validate remove-payment-business --strict`
- Working directory: worktree 根
- Executed at: 2026-10-02T01:16Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-20261002/verify/validate.txt`（"Change 'remove-payment-business' is valid"）
- Key observations: delta 结构合法。

#### V-7: 残留与豁免检查

- Command:
  - `git grep -nE "TC-PAYSDK|FLOW-PAYSDK|payment-sdk/spec.md|live-create-trade-contract"`（排除 archive、本 Change、artifacts、generated）
  - `git grep -nE "当前业务：支付|TC-PAYSDK|FLOW-PAYSDK|Live|live:" -- AGENTS.md 'packages/*/AGENTS.md' README.md`
  - `git grep -nE "CreateTradePay|xpay|PayParams|支付" docs/engineering/bootstrap.md`
  - `git grep -n "TC-PAYSDK\|wechat-device-info\|channel-double\|core/observation" vitest.config.ts`
- Working directory: worktree 根
- Executed at: 2026-10-02T01:18Z
- Exit code: 0（仅 1 处命中）/ 1（无命中）/ 1（无命中）/ 1（无命中）
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-20261002/verify/grep.txt`
- Key observations: 仓库范围唯一命中是 `openspec/specs/scenario-gate/spec.md:130`（GATE-04 / SCN-SCENARIO-GATE-005 的 WHEN 行），属于 Design 归属规则第四类，由本 Change delta 在归档时删除；Apply 的归档模拟（`artifacts/20261001-remove-payment-business/tasks/final-review-archive-sim.txt`）已确认归档后 `openspec/specs/` 零命中。文档与 bootstrap 零命中；覆盖率豁免清单已清空。

### Behavioral Results

| Behavior / Claim | Evidence | Result |
|---|---|---|
| 仓库中不再有支付业务代码、测试、Fixture、Spec、Live 与支付文档 | V-7；`packages/payment-sdk/src` 只剩 `example/`、`runtime/`、`index.ts`；`openspec/specs` 只剩 `scenario-gate`、`template-example`（归档后增加 `template-engineering`、`protocol-contract`） | PASS |
| 删除结束时覆盖率在没有任何豁免的情况下回到 100% | V-2、V-7 | PASS |
| 最终三项验收（check:fast、逐文件 weapp、全部报告的场景门禁）退出码 0 | V-2、V-4、V-3 | PASS |
| 示例从公开入口完成创建与有界观察，并通过真实 `wx.request` 访问 Shadow | SCN-TEMPLATE-EXAMPLE-002/004/011；V-3、V-4 | PASS |
| IDL 义务派生只针对示例接口且全部有运行证据 | SCN-PROTOCOL-CONTRACT-001/002；protocol 635/635；V-3、V-4 | PASS |
| 手写错误码副本与 IDL Go 原文一致 | SCN-PROTOCOL-CONTRACT-003；V-5 | PASS |
| 业务模块目录互不导入 | SCN-TEMPLATE-EXAMPLE-008；V-2 | PASS |

## Coherence

| Proposal / Design Decision | Source | Implementation Evidence | Status / Notes |
|---|---|---|---|
| 先迁出通用能力，再按功能由外到内删除 | design.md"执行顺序""功能分组" | 提交序列 41d368d（迁出）→ 931e1b0（IDL 派生）→ f849e72（Live）→ 5c1c785 … 9ffe30d（功能组）→ f6e7c6c（文档）；各任务验收索引 `artifacts/20261001-remove-payment-business/tasks/task-<n>.md` | PASS |
| 迁移只改绑定，不改断言 | tasks.md Global Constraints | 抽查 `TC-PAYSDK-CORE-016→SCN-SCENARIO-GATE-010`、`CORE-017→SCN-TEMPLATE-ENGINEERING-002` 改名 diff：只改 ownerId、covers 与样例 ID | PASS |
| 共享核心临时豁免只减不增，第 9 组清空 | design.md"共享核心的临时覆盖率豁免" | `vitest.config.ts:24-29` 只排除测试、声明与 generated | PASS |
| IDL 义务派生改为 CreateTrade/QueryTrade | design.md"IDL 义务派生改为针对示例接口" | `scripts/lib/contract-inventory.ts`；protocol 635/635 | PASS |
| 错误码缩减为 7 项并保留 Go 来源校验 | design.md"SDK 与协议包的最终删除" | `business-codes.ts:25-37`；V-5 | PASS |
| 第二种样例 ID 格式改用 LEGACY | design.md"多格式测试的第二种样例格式" | `scripts/lib/scenario-gate.evidence.test.ts:13-15,113`；`SCN-SCENARIO-GATE-011.spec.ts:8,12` | PASS |
| `relatedScenarios` 只约束 ID 形状，登记由门禁校验 | tasks.md 任务 9；GATE-03 | `scripts/flow.schema.json:8` | PASS |
| 移除 Live、人工语义评审记录、渠道与平台适配器样例 | proposal.md 第 3 部分 | 无 `live:*` 命令与 `dotenv`；无 CONTRACT-021；替身标准写入根与两个包的 AGENTS.md | PASS |
| 文档：AGENTS 迁移表"保留"列迁入通用规则；README 只删支付与 Live；bootstrap 保留通用工具记录 | design.md"文档（任务 10）" | 任务 10 验收索引第 3 节；V-7 | PASS（根 AGENTS 额外写入替身标准，记录在任务 10 方案差异中，不改变语义） |
| 不改包名、scope、registry、IDL 与 ProtoGen Consumer | proposal.md 非目标 | `proto:status` up_to_date；包名不变 | PASS |
| 能力保全清单逐项有承载与运行证据 | design.md"能力保全清单" | 任务 10 验收索引第 5 节；本次 V-2..V-5 复验 | PASS |

## Review Findings and Resolutions

| Finding ID | Severity | Finding | Resolution | Re-verification IDs | Status |
|---|---|---|---|---|---|
| F-01 | Minor | 门禁仍输出旧名 `summaries.paymentBehavior` | 属于下一个 Change 的命名通用化；不影响判定 | V-3 | accepted |
| F-02 | Minor | 内部标识仍带 payment（`paymentCase`、`payment-evidence`/`payment-flow`、`PAYMENT_RUN_ID`/`PAYMENT_REPORT_FILE`、`paymentBusinessErrors*`、宿主标题等） | 包与命名参数化是本 Change 非目标，留给第 3 步；`PAYMENT_RUN_ID` 面向使用者，建议第 3 步优先改名 | V-2、V-3 | accepted |
| F-03 | Minor | 根 `AGENTS.md` H1 与根 `package.json` 名称、描述仍为 infra-payment-sdk / payment | 同 F-02 | — | accepted |
| F-04 | Minor | `packages/payment-protocol/src/adapters/network/wechat-miniapp.test.ts:6` 注释引用已删除的支付场景 ID | 注释不参与绑定；下一个 Change 顺带清理 | — | accepted |
| F-05 | Minor | `generated-contract.test.ts` 仍使用支付命名的 generated 类型 | IDL 有意保留，测试覆盖 generated codec | V-2 | accepted |
| V-M1 | Minor | ENG-003 Fixture 未列出 `requestContext` 的 3 个子字段（源码已有中文注释） | 检查覆盖面的小缺口，不影响当前正确性；下一个 Change 补齐 | V-2 | accepted |
| V-M2 | Minor | Final Code Review 的 3 个独立席位因网络超时未返回 | 重试席位 D 完成；Bridge 在 Verify 前独立复跑 check:fast、门禁、Go 比对与迁移 diff 抽查，结论一致 | V-2、V-3、V-5 | accepted |

## Unverified Areas and Remaining Risks

- weapp 自动化受开发者工具冷启动影响：本次 EX-004 前 3 次、PROTOCOL-002 第 1 次均为启动超时，按 AGENTS 约定整文件重跑后通过。预热 8 秒时 EX-004 连续失败，延长到 25 秒后通过，提示 AGENTS 中"约数秒"的预热时长可能偏短；可在后续 Change 中调整约定或 driver。
- 平台能力替身只有文字标准（AGENTS），仓库内没有可运行样例；这是用户已确认的取舍（Design GAP-01）。
- `artifacts/` 不入库：Apply 与 Verify 的证据只在 worktree 本地，清理 worktree 前需转存。

## Archive Readiness

- Decision: READY WITH WARNINGS
- Plan Review verdict: PASS
- Plan Review freshness: PASS（reviewed = current = 2ef0181c6a1859838175ae2623fc7a1ee709ec6007ca5e99aebedeb2d0cbdac6）
- Fresh Apply state: all_done
- Completed tasks: 10/10
- Failed required commands: 0
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: 7（F-01..F-05、V-M1、V-M2）
- Verification input manifest matches current inputs: yes（dc2d84d681ae96b44e0c3c5fedf4a5bf48f8da0068e10d850db836aabb9f7f86；归档前用同一算法对 `git ls-files -co --exclude-standard` 去掉本文件后复算比对）
- Requirements without evidence: 0
- Warnings and rationale: 7 条已接受 Minor（影响与理由见上表）；weapp 冷启动重跑记录见 V-4；artifacts 需在清理 worktree 前转存
- Blockers: None
