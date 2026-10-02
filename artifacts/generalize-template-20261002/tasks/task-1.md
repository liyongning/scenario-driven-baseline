# Task 1 验收索引：项目清单驱动门禁

- run-id: `generalize-template-20261002`
- change: `generalize-template`
- branch / worktree: `codex/generalize-template` @ `/Users/liyongning/Projects/workspace/sdk-template/.worktrees/generalize-template`
- base: `ad0ac48` (main)
- plan-review gate: PASS，digest `2bb108e6d6fdbd03f538734e00252b2ad1718172f2bb09dbee8000b9e581fabd`（checkbox-only 勾选后复算仍一致）
- 执行器: `superpowers:executing-plans`（inline）
- 结论: 实现与 Spec（ENG-04 `preflight-rejects-placeholder`、ENG-05、GATE-05/06）一致；本任务验证通过，待提交。

## 产物

- 新增 `project.manifest.schema.json`（draft 2020-12，`additionalProperties:false`，逐属性中文 `description`）、`project.manifest.json`（登记当前事实）。
- 新增 `scripts/lib/project-manifest.ts`（Ajv 校验 + 按角色/类别查询；`issue.cause = error` 规避 ES2022 lib 无 `Error(message,{cause})`）、`scripts/lib/project-manifest.test.ts`（`manifest-rules` 绑定 SCN-TEMPLATE-ENGINEERING-005）。
- 新增 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts`（4 个 CLI case）。
- 新增 fixture `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-004/preflight-rejects-placeholder.json`。
- 修改门禁读取方与测试（见下表）；根 `AGENTS.md` 新增“项目清单”最小一节（链接清单与 schema，一句作用说明）。

## 读取方改动前后对照

| 读取方 | 改动前 | 改动后 |
|---|---|---|
| `scripts/check-architecture.ts` | 包目录、包名、私有、协议包反向依赖、允许目录、必需命令、AGENTS 路径全部写死（`payment-*` 等字面量） | 全部取自 `project.manifest.json`；缺清单/清单非法时返回清单加载错误 |
| `scripts/lib/schema-docs.ts` | 单份 schema 列表 | 拆 `hardRuleSchemas`（3 份，GATE-06 不变）与 `projectSchemas`（`project.manifest.schema.json`），各自可独立缺省 |
| `packages/e2e/src/package-consumer.ts` | 协议包名写死 | 协议包名由调用方传入 |
| `scripts/verification.schema.json` | `requiredIn` 按 kind 用 `allOf` 枚举固定项目 | `requiredIn` 为字符串 pattern，说明指向 `project.manifest.json` 登记的测试项目 |
| `scripts/flow.schema.json` | 同上（`requiredIn` 枚举） | 同上（字符串 pattern + 清单说明） |
| `scripts/lib/spec-inventory.ts` | 项目集合与 kind/class 规则写死 | 新增可选参数 `projects`（来自清单）；问题文本保持前缀 `invalid verification metadata` / `invalid FLOW row`，新增 `requiredIn project <x> is not registered in project.manifest.json`、`kind <k> cannot run in <class> project <x>`、FLOW `requiredIn project <x> is not an integration or platform project` |
| `scripts/check-scenarios.ts` | `Project` 为固定联合类型 | `Project = string`；CLI 传入门禁根清单登记的测试项目；清单加载失败进 `precheck:` 问题 |
| `scripts/lib/contract-inventory.ts` | 义务环境集合与协议目录写死 | fields/routes/shared → integration+platform，error code → integration；协议 `example/routes.ts` 按 protocol 角色目录动态 import |
| `scripts/lib/fingerprints.ts` | 摘要目录写死 | 取自清单 `sourceRoots` / `hostRoots` |
| `scripts/check-package.ts` | 角色→包写死 | `packageByRole` 取自清单；`protocolPackageName` 由调用方传入 |
| `scripts/check-release.ts` | 记录字段 `targetProject`；registry/tag 前缀写死 | 删除 `targetProject`；`checkReleaseRecord(input, facts?, release?)`；registry/tagPrefix 取自清单；`<PROJECT_ID>` 占位值拒绝，消息 `release registry is a template placeholder; set release.registry in project.manifest.json` |
| `scripts/sdk-release.ts` | registry 与临时目录前缀写死（`payment-sdk-release-*`） | `createSdkReleasePlan({record, protocolState, sdkState, release})`；registry 取自 `release.registry`；临时目录前缀 `template-sdk-release-*`；无发布设置时 `releaseMissingMessage` |
| 临时根 helper 与相关 spec | 临时根无清单 | `scenario-gate-helpers.ts` 新增 `writeProjectManifest`，`fixtureRoot` 复制仓库清单 |

## RED（先失败）证据

复现方式：在**同一 worktree** 内把 5 个实现文件临时回退到 base（`git checkout ad0ac48 -- scripts/check-architecture.ts scripts/check-scenarios.ts scripts/lib/spec-inventory.ts scripts/check-release.ts scripts/sdk-release.ts`），保持本任务新增/修改的测试不动；单测另将 `scripts/lib/project-manifest.ts` 临时移走。复现后已逐文件 sha256 校验还原，`git status --short` 与回退前一致。

1. 模块缺失（`scripts/lib/project-manifest.ts` 不在 base）：`pnpm exec vitest run --project test-tools-unit scripts/lib/project-manifest.test.ts` → 退出码 1，`Module not found: './project-manifest.ts'`（`vitest.config.ts → scripts/lib/fingerprints.ts` 依赖链）。
2. 新增/改写集成用例全部失败：`pnpm exec vitest run --project integration SCN-TEMPLATE-ENGINEERING-005.spec.ts SCN-TEMPLATE-ENGINEERING-004.spec.ts` → 退出码 1，`Test Files 2 failed (2) / Tests 8 failed (8)`：
   - `rename-by-manifest-cli`：旧架构检查不读清单，改名副本被拒（`result.output?.issues` 为 `undefined`，`toEqual([])` 失败）。
   - `architecture-violations-cli`：未登记目录/包名不一致/缺命令均未被旧检查报告。
   - `unregistered-project-cli`：旧门禁不报告未登记测试项目。
   - `no-hardcoded-topology`：扫描 base `scripts/**/*.ts` 得到 16 处字面量（`@daqian/payment-sdk`、`payment-sdk`、`payment-protocol`、`sdk-unit`、`weapp`、registry 等）→ `expected [ …(16) ] to deeply equal []`。
   - `SCN-TEMPLATE-ENGINEERING-004` 的 4 个用例（含 `preflight-rejects-placeholder`）：旧预检不认识占位值，预检/发布计划断言失败。

## GREEN 与实际运行

| 命令 | 退出码 | 关键结果 |
|---|---|---|
| `pnpm exec vitest run --project integration SCN-TEMPLATE-ENGINEERING-005.spec.ts SCN-TEMPLATE-ENGINEERING-004.spec.ts` | 0 | `Tests 8 passed (8)` |
| `pnpm exec vitest run --project test-tools-unit scripts/lib/project-manifest.test.ts` | 0 | `Tests 1 passed (1)` |
| `PAYMENT_RUN_ID=generalize-template-20261002 pnpm test:unit` | 0 | 41 文件 / 284 用例；覆盖率 100%（Stmts 1843/1843、Branch 1247/1247、Funcs 319/319、Lines 1398/1398） |
| `PAYMENT_RUN_ID=generalize-template-20261002 pnpm test:integration` | 0 | 29 文件 / 77 用例 |
| `pnpm check:fast` | 0 | proto:validate → proto:status → lint → build → typecheck → check:architecture → test:unit → check:fixtures → test:integration → check:package 全通过 |
| `pnpm check:architecture` | 0 | `{"issues": []}`（depcruise 50 模块 / 98 依赖） |
| `git grep -nE "payment-sdk\|payment-protocol\|payment-e2e\|projects/245\|'sdk-unit'\|'protocol-unit'\|'test-tools-unit'\|'weapp'" -- 'scripts/*.ts' 'scripts/lib/*.ts' ':!*.test.ts'` | 1（零命中） | 见 Verification |
| `PAYMENT_RUN_ID=generalize-template-20261002 pnpm exec tsx scripts/check-scenarios.ts` | 1 | 324 问题，**0 回归**（见下） |
| `scripts/plan-review-digest.py … --check-review` | 0 | `freshness: PASS`，digest `2bb108e6…` |

报告路径：
- `artifacts/generalize-template-20261002/reports/unit.json`（`runId=generalize-template-20261002`）
- `artifacts/generalize-template-20261002/reports/integration.json`
- `artifacts/generalize-template-20261002/reports/scenario-gate.json`（本次门禁输出；复跑与 `/tmp/task1-gate-rerun.json` 一致：324 问题）

## 场景门禁问题归属（0 回归）

| 数量 | 问题 | 归属 |
|---|---|---|
| 318 | `missing binding for weapp` | 任务 2 / 7（weapp 报告尚未产出） |
| 3 | `SCN-PROTOCOL-CONTRACT-004/{neutral-route,idl-route-source,engine-no-generated-cli}` | 任务 2（路由中立化） |
| 2 | `SCN-TEMPLATE-ENGINEERING-006/{guide-rules,guide-violations-cli}` | 任务 5（使用指南与指南检查） |
| 1 | `FLOW-TEMPLATE-EXAMPLE-001/normal`（weapp） | 任务 2 / 7 |

`SCN-TEMPLATE-ENGINEERING-004/005`、`SCN-SCENARIO-GATE-005/006` 无问题。

## 预期失败的反例（均已按预期失败/通过）

- `unregistered-project-cli`：`requiredIn project unregistered-project is not registered in project.manifest.json`。
- `architecture-violations-cli`：`unexpected package unregistered` / `wrong package name sample-sdk` / `missing command missing:command`。
- `preflight-rejects-placeholder`：`release registry is a template placeholder; set release.registry in project.manifest.json`。
- FLOW 行引用非 integration/platform 项目由清单校验拒绝。

## 与计划的差异

1. `scripts/check-architecture.ts` 仍为同步实现；异步化（`checkTemplateGuide`）按 Design 留到任务 5。任务 1 只把数据来源改为清单。
2. 新增内部 helper `errorMessage(error)`（统一 `Error`/非 `Error` 分支），未在任务文本单列，属实现细节，测试覆盖 100%。
3. `scenario-gate-helpers.ts` 的 `enableInventory` 仍写 `packages/payment-protocol/src/generated`；与当前清单 protocol 角色目录一致，任务 3 改名时随目录一起更新（守护扫描仅覆盖 `scripts/**`，不含该测试 helper）。
4. `project-manifest.test.ts` 采用 `evidence()` + `meta.paymentCase` 绑定，与既有单测绑定写法一致。

## weapp 重跑记录

任务 1 未改动任何 weapp 文件（`packages/e2e/tests/weapp/**` 无改动，`git status` 零命中），故本任务不触发 weapp 逐文件重跑；weapp 报告的缺失已在上表归属任务 2 / 7。
