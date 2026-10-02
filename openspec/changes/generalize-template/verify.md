# Verification

## Metadata

- Change: generalize-template
- Schema: openspec-workflow
- Verified Git revision: 5be6044d5979a22c16602594fb21ce1e2f06754d (branch `codex/generalize-template`, worktree `.worktrees/generalize-template`)
- Verification input manifest digest: af003221e0ee5eabd4f29014a1f4992aab8e5461c91a48e72eca897ea02570ed (355 files)
- Manifest includes: `git ls-files -co --exclude-standard` 全部文件（代码、测试、配置、Fixture、Spec、文档、已提交的验收索引、proposal/specs/design/tasks/plan-review），按路径排序，逐个计入路径、类型、可执行位与内容 SHA-256；算法 `artifacts/verify-gt-20261002/manifest.py`
- Plan Review verdict: PASS
- Reviewed digest: 33f91c45068fd7f1aa83d97ac126f838815b44b7e892b206b1bc58741754cba5
- Current digest: 33f91c45068fd7f1aa83d97ac126f838815b44b7e892b206b1bc58741754cba5
- Plan Review digest match: yes
- Unresolved Plan Review findings: Critical 0 / Important 0（attempt 12 Approved；Minor PR-501..504、PR-701..704、PR-1101 已接受或在 Apply 中处理）
- Untracked inputs included: None
- Excluded lifecycle paths: `openspec/changes/generalize-template/verify.md`（本文件）；被 `.gitignore` 忽略的运行证据（`artifacts/` 下未提交的报告、覆盖率、日志）
- Verified at: 2026-10-02T12:04:28Z – 12:20Z
- Verification environment: macOS 26.2；Node v22.21.1；pnpm 10.20.0；OpenSpec 1.6.0；微信开发者工具 + miniprogram-automator 0.12.1；Go（IDL 来源提取）；IDL 仓库固定提交 5539be8f09323709fa65f6568efe22896ec35d24

## Apply Gate

- Fresh Apply state: all_done
- Apply progress: 10/10
- Unchecked tasks: 0
- Final Code Review: PASS
  - Tasks 1–7：Apply Agent 的 Final Code Review（`artifacts/generalize-template-20261002/ledger.md`），无 admitted_blocker。
  - Tasks 8–10：Bridge 派发独立只读评审（diff `d669e44..f768be2`）。F1（Important，Task 9 证据缺少逐演练记录）为 admitted_blocker：Task 9 取消勾选，补齐附录 `task-9-redrill-records.md` 后复验（`check:fast` 0、门禁 0 问题）并重新勾选（`5be6044`）。F2、F3 为 Minor，已修复。
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: 见 Review Findings（F2、F3 已修复；OI-01 开放项）

## Verification Summary

| Dimension | Status | Evidence |
|---|---|---|
| Completeness | PASS | 10/10 任务；本 Change 的 6 个 Requirement 与全部有效 Scenario 有运行证据（V-2、V-3） |
| Correctness | PASS | V-1..V-6 全部退出码符合预期；门禁 0 问题；Go 来源逐字节一致；改名后生成目录树哈希不变 |
| Coherence | PASS WITH WARNINGS | 规划、实现、证据一致；替换点地图只经过模拟演练（OI-01） |

## Completeness

### Artifact and Task Completion

| Item | Authority | Expected | Observed | Status |
|---|---|---|---|---|
| proposal / design / specs / tasks / plan-review | `openspec status --change generalize-template --json` | done | done | PASS |
| verification | 同上 | ready → 本文件 | 写入 `resolvedOutputPath` | PASS |
| Tasks 1–10 | `openspec instructions apply --json` | all_done | all_done，10/10 | PASS |
| Plan Review freshness | `plan-review-digest.py --check-review` | PASS | PASS | PASS |
| `openspec validate --strict` | V-5 | valid | valid | PASS |

### Requirement Coverage

| Requirement | Spec Source | Implementation Evidence | Verification IDs | Status |
|---|---|---|---|---|
| ENG-04 统一发布入口的预检（MODIFIED） | specs/template-engineering/spec.md:71 | `scripts/check-release.ts`、`scripts/sdk-release.ts`、`project.manifest.json` `release`；`tests/tooling/SCN-TEMPLATE-ENGINEERING-004.spec.ts`（含 `preflight-rejects-placeholder`） | V-2、V-3 | PASS |
| ENG-05 项目清单驱动工程门禁（ADDED） | specs/template-engineering/spec.md:3 | `project.manifest.json`、`project.manifest.schema.json`、`scripts/lib/project-manifest.ts`；门禁脚本读取清单；`SCN-TEMPLATE-ENGINEERING-005.spec.ts` | V-2、V-3、V-6 | PASS |
| ENG-06 使用指南与替换点地图（ADDED） | specs/template-engineering/spec.md:43 | `docs/template-guide.md`；`checkTemplateGuide`（结构与事实一致性）；`SCN-TEMPLATE-ENGINEERING-006.spec.ts`；演练证据 `task-9-redrill.md` 及附录 | V-2、V-3 | PASS |
| GATE-05 Scenario 验证元数据必填（MODIFIED） | specs/scenario-gate/spec.md:3 | `scripts/lib/spec-inventory.ts` 按清单校验 `requiredIn` 与类别；`SCN-SCENARIO-GATE-006.spec.ts` | V-2、V-3 | PASS |
| PC-03 Shadow 路由使用中立描述（ADDED） | specs/protocol-contract/spec.md:3 | `packages/protocol/testing/shadow/{routes,idl-routes}.ts`；`.dependency-cruiser.cjs` `shadow-engine-no-generated`；`SCN-PROTOCOL-CONTRACT-004.spec.ts` | V-2、V-3 | PASS |
| EX-05 示例分层与隔离（MODIFIED） | specs/template-example/spec.md:3 | `.dependency-cruiser.cjs` `domain-core-no-generated`、`core-no-platform-or-node`；`eslint.config.js` 目录模式；`SCN-TEMPLATE-EXAMPLE-008.spec.ts`（`new-domain-guarded`） | V-2、V-3 | PASS |

既有 Requirement（ENG-01..03、GATE-01..09、PC-01..02、EX-01..08）无回归：V-3 的 allSpec 30/30 全部通过。

### Scenario Coverage

| Scenario ID | Scenario | Requirement | Test or Runtime Evidence | Verification IDs | Status |
|---|---|---|---|---|---|
| SCN-TEMPLATE-ENGINEERING-004 | 发布预检与发布顺序 | ENG-04 | `tests/tooling/SCN-TEMPLATE-ENGINEERING-004.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-ENGINEERING-005 | 门禁按项目清单工作 | ENG-05 | `scripts/lib/project-manifest.test.ts`；`tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-ENGINEERING-006 | 使用指南缺失或不完整 | ENG-06 | `scripts/check-architecture.test.ts`（guide-rules）；`tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts` | V-2、V-3 | PASS |
| SCN-SCENARIO-GATE-006 | 验证元数据缺失、重复或不合法 | GATE-05 | `scripts/lib/scenario-gate.evidence.test.ts`（metadata-rules）；`tests/tooling/SCN-SCENARIO-GATE-006.spec.ts` | V-2、V-3 | PASS |
| SCN-PROTOCOL-CONTRACT-004 | Shadow 引擎与协议来源解耦 | PC-03 | `testing/shadow/routes.test.ts`、`idl-routes.test.ts`；`tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts` | V-2、V-3 | PASS |
| SCN-TEMPLATE-EXAMPLE-008 | 示例依赖越界被阻断 | EX-05 | `tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts`（含新模块三探针；本次 3.5 秒） | V-2、V-3 | PASS |
| 其余 24 个既有场景 | — | — | 场景门禁 allSpec 30/30；weapp 4/4（r2 报告，源码摘要与当前一致） | V-3 | PASS |

## Correctness

### Fresh Command Evidence

#### V-1: Plan Review freshness 与 Apply 状态

- Command: `plan-review-digest.py openspec/changes/generalize-template --check-review …/plan-review.md`；`openspec instructions apply --change generalize-template --json`
- Working directory: worktree 根
- Executed at: 2026-10-02T12:19Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: 内联：`freshness":"PASS"`（33f91c45…）；`all_done {'total': 10, 'complete': 10}`
- Key observations: Apply 期间规划只发生勾选变化。

#### V-2: `pnpm check:fast`

- Command: `VERIFY_RUN_ID=verify-gt-20261002 pnpm check:fast`（12:04 首次；F1 修复后 12:18 再次）
- Working directory: worktree 根
- Executed at: 2026-10-02T12:04:28Z、12:18Z
- Exit code: 0 / 0
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-gt-20261002/check-fast.txt`、`check-fast-after-f1.txt`
- Key observations: proto:validate valid、proto:status up_to_date；lint、build、typecheck；depcruise 67 模块 137 依赖 0 违规；unit 43 文件 287/287、四项覆盖率 100%；fixtures 0 issues；integration 31 文件 79/79（含 SCN-TEMPLATE-EXAMPLE-008、ENGINEERING-005/006）；check:package 0 issues。

#### V-3: 场景门禁（unit + integration + 全部 weapp 报告）

- Command: `VERIFY_RUN_ID=generalize-template-20261002-r2 npx tsx scripts/check-scenarios.ts --report …/r2/reports/unit.json --report …/integration.json --report …/weapp-{FLOW-TEMPLATE-EXAMPLE-001,SCN-TEMPLATE-EXAMPLE-002,SCN-TEMPLATE-EXAMPLE-004,SCN-PROTOCOL-CONTRACT-002}.json`
- Working directory: worktree 根
- Executed at: 2026-10-02T12:05Z、12:19Z（F1 修复后）
- Exit code: 0 / 0
- Failure count: 0（issues: []）
- Result: PASS
- Output reference: `artifacts/verify-gt-20261002/scenarios.json`、`scenarios-after-f1.json`
- Key observations: allSpec 30/30/30；protocol 635/635；flows 2/2。r2 报告由 Task 10 在 11:57–12:01 逐文件运行 weapp 生成（4/4 首次通过），门禁按当前源码摘要核对，摘要一致（F1 修复只改文档与证据，不在源码摘要输入内）。

#### V-4: 错误码 Go 来源重新提取与逐字节比对

- Command: `sh packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/reproduce.sh /Users/liyongning/Projects/workspace/dev/idl <scratch>`；`cmp`
- Working directory: worktree 根
- Executed at: 2026-10-02T12:05Z
- Exit code: 0 / 0
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-gt-20261002/reproduce.log`
- Key observations: Go 测试 PASS；`idl-errors.json` 与仓库副本逐字节一致；运行后工作区无改动。

#### V-5: OpenSpec 严格校验

- Command: `openspec validate generalize-template --strict`
- Working directory: worktree 根
- Executed at: 2026-10-02T12:05Z
- Exit code: 0
- Failure count: 0
- Result: PASS
- Output reference: `artifacts/verify-gt-20261002/validate.txt`
- Key observations: 4 份 delta（template-engineering、scenario-gate、protocol-contract、template-example）结构合法。

#### V-6: 改名、硬编码与残留检查

- Command:
  - `git rev-parse ad0ac48:packages/payment-protocol/src/generated HEAD:packages/protocol/src/generated`
  - `git grep -nE "payment-sdk|payment-protocol|payment-e2e|projects/245|'sdk-unit'|'protocol-unit'|'test-tools-unit'|'weapp'" -- 'scripts/*.ts' 'scripts/lib/*.ts' ':!*.test.ts'`
  - `git grep -liE "payment|PAYMENT_|paysdk"`（排除残留允许清单各类）
- Working directory: worktree 根
- Executed at: 2026-10-02T09:3xZ（Apply 复核）、11:57Z（Task 10）
- Exit code: 树哈希相同（`fa5b67e8…`）/ 1（零命中）/ 1（零命中）
- Failure count: 0
- Result: PASS
- Output reference: 本会话命令输出；`task-10.md`
- Key observations: 生成目录迁移后内容逐字节不变；门禁脚本无写死的包名、registry 与项目名（仅发布脚本临时目录前缀 `template-sdk-release-`，按设计不属违规）；允许清单外无支付残留。

### Behavioral Results

| Behavior / Claim | Evidence | Result |
|---|---|---|
| 门禁只依赖项目清单，按清单改名无需改门禁代码 | SCN-TEMPLATE-ENGINEERING-005；演练 D3（未改 `scripts/` 非测试文件即到绿） | PASS |
| 新增业务模块无需改配置即受分层守卫约束 | SCN-TEMPLATE-EXAMPLE-008 `new-domain-guarded`；演练 D4 `wx` 探针被拒 | PASS |
| 发布模块可删除、小程序平台可删除且门禁可通过 | 演练 D1、D2（重做） | PASS |
| Shadow 引擎不依赖生成代码 | SCN-PROTOCOL-CONTRACT-004 | PASS |
| 指南与代码事实一致 | SCN-TEMPLATE-ENGINEERING-006；`check:architecture` | PASS |
| 指南照着能用 | 全新 Agent 在隔离副本上的演练，重做无新的第 1、2 类问题 | PASS（模拟使用方） |
| 仓库无支付身份 | V-6 | PASS |

## Coherence

| Proposal / Design Decision | Source | Implementation Evidence | Status / Notes |
|---|---|---|---|
| 只交付 SDK 领域模板；不做脚手架、生成器、开关 | proposal.md 非目标 | 仓库无生成器；指南以"照指引完成"为准 | PASS |
| 项目清单驱动门禁 | design.md"项目清单的格式与读取方" | V-2、V-6 | PASS |
| 发布目标来自清单，占位值拒绝 | design.md"发布目标来自清单" | ENG-004 `preflight-rejects-placeholder` | PASS |
| Shadow 路由中立化 | design.md"Shadow 路由中立化" | SCN-PROTOCOL-CONTRACT-004 | PASS |
| 中立命名与 ProtoGen 输出迁移 | design.md 同名决策 | V-6 树哈希相同 | PASS |
| 工作流 schema 不随模板提交 | design.md 同名决策 | `git ls-files openspec/schemas` 为空；`.gitignore` 含 `openspec/schemas/` | PASS |
| 使用指南与替换点地图 | design.md 同名决策 | `docs/template-guide.md`；V-2 | PASS |
| 分层守卫覆盖全部业务模块；PR-501 | design.md 同名决策 | `b5d6682`；V-2 | PASS |
| 重新演练（三类标准、隔离副本、有界一轮） | design.md"重新演练" | `task-9-redrill.md`、`task-9-redrill-records.md`、`task-9-copy-prep.log` | PASS |
| 首轮证据不被覆盖 | design.md 执行顺序（r2 run-id） | `artifacts/generalize-template-20261002/` 在 Tasks 8–10 未写入 | PASS |

## Review Findings and Resolutions

| Finding ID | Severity | Finding | Resolution | Re-verification IDs | Status |
|---|---|---|---|---|---|
| F1 | Important | Task 9 证据只有汇总，缺逐演练的提示词、步骤、改动文件、逐条猜测记录与依据文件，独立性无法核对 | Task 9 取消勾选，补齐 `task-9-redrill-records.md`（提示词原文与两轮差异、每个演练的步骤/文件/结果/逐条记录与判定/依据文件），重新勾选 | V-2、V-3 | resolved |
| F2 | Minor | 指南"产品侧绑定"指向 `contracts.test.ts`，实际写死 `'wechat-miniapp'` 的是 `factory.test.ts`、`example-harness.ts`、`SCN-TEMPLATE-EXAMPLE-001` 等 | 改为指向这些文件并给出 `git grep` 命令 | V-2 | resolved |
| F3 | Minor | `task-9-redrill.md` 写的是 `pnpm install --offline`，Design 要求 `--frozen-lockfile` | 实际命令为 `--frozen-lockfile --offline`，更正报告措辞 | — | resolved |
| PR-501..504、PR-701..704、PR-1101 | Minor | Plan Review 接受项 | 在 Apply 中处理（PR-501 为 Task 8；PR-1101 措辞不影响执行） | — | accepted |

## Unverified Areas and Remaining Risks

- OI-01：替换点地图只经过模拟使用方（全新 Agent）演练，尚未在真实使用方验证；指南"已知限制"已说明。
- 第 3 类猜测记录（需要额外理解）按用户确认的标准不修复，汇总见 `task-9-redrill-records.md`。
- 首轮重新演练副本未做隔离（含 git 历史与 `artifacts/`）；核对各 Agent 依据文件，均未读取首轮报告。重做已在不带历史的副本上进行。
- 演练 Agent 的完整原始报告保存在 Bridge 会话中，未单独落盘；附录逐条摘录。
- 微信开发者工具自动化的已知不稳定性；本次 Task 10 的 4 个 weapp 文件均首次通过（预热 25 秒）。

## Archive Readiness

- Decision: READY WITH WARNINGS
- Plan Review verdict: PASS
- Plan Review freshness: PASS（reviewed = current = 33f91c45068fd7f1aa83d97ac126f838815b44b7e892b206b1bc58741754cba5）
- Fresh Apply state: all_done
- Completed tasks: 10/10
- Failed required commands: 0
- Unresolved Critical findings: 0
- Unresolved Important findings: 0
- Accepted Minor findings: PR-501..504、PR-701..704、PR-1101（F2、F3 已修复）
- Verification input manifest matches current inputs: yes（af003221e0ee5eabd4f29014a1f4992aab8e5461c91a48e72eca897ea02570ed；归档前用 `artifacts/verify-gt-20261002/manifest.py` 去掉本文件后复算比对）
- Requirements without evidence: 0
- Warnings and rationale: OI-01 开放（替换点地图未经真实使用方验证，指南已说明）；演练原始报告未单独落盘（附录逐条摘录）
- Blockers: None
