# Task 5 验收索引：使用指南、替换点地图与文档

- run-id: `generalize-template-20261002`；change: `generalize-template`；branch: `codex/generalize-template`
- plan-review gate: PASS（digest `2bb108e6…`，任务开始前与完成后各复算一次均一致）
- 结论: 实现与 Spec ENG-06 / SCN-TEMPLATE-ENGINEERING-006、ENG-02 / SCN-TEMPLATE-ENGINEERING-002、GATE-06 / SCN-SCENARIO-GATE-008 一致；验证通过，待提交。

## 产物

| 产物 | 说明 |
| --- | --- |
| `docs/template-guide.md` | 4 个二级标题（能力地图、从方案到验收、初始化方式、替换点地图）与 3 个三级标题（协议来源、运行平台、包发布）；能力地图承接上一步能力保全清单；替换点三项各含"涉及文件（相对链接）、清单改动、验收门禁" |
| `scripts/check-architecture.ts` | 新增 `checkTemplateGuide`：结构（存在、根 `AGENTS.md`/`README.md` 链接、章节、相对链接）+ 事实一致性（Scenario ID 登记、`pnpm` 命令、`manifest.` 字段）；`checkArchitecture`/`runArchitectureCli` 改为 async，CLI 入口 `await` |
| `scripts/check-architecture.test.ts` | 全部改为 `await`；新增 `guide-rules` module case 绑定（`SCN-TEMPLATE-ENGINEERING-006`，环境 `test-tools-unit`） |
| `packages/e2e/tests/tooling/helpers.ts` | 新增共享 `writeTemplateGuideFixture(root)`（最小合法指南 + 根 AGENTS/README 链接） |
| `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-006.spec.ts` | 新增 `guide-violations-cli`：删除指南 / 删除 AGENTS 或 README 链接 / 删除规定章节 / 断链 / 未登记 Scenario ID / 不存在 pnpm 命令 / 不存在清单字段逐项报告，恢复后通过 |
| `SCN-TEMPLATE-ENGINEERING-005/002/SCN-SCENARIO-GATE-008.spec.ts`、`scenario-gate-helpers.ts` | 临时根改用 `writeTemplateGuideFixture`；008 覆写 AGENTS 后重新调用以保留链接；断言语义不变 |
| 根 `AGENTS.md`、`packages/{sdk,protocol,e2e}/AGENTS.md`、`README.md`、`docs/engineering/bootstrap.md` | 按 Design"文档改写"：标题/包名/目录同步；工作流 schema 不随模板提交；ProtoGen Consumer 按产品实际依赖登记；Shadow 路由来自协议来源；`shadow-engine-no-generated`；e2e 预热约 25 秒；README 改为模板简介并删除本机路径、支付链接与项目 245 |
| `.gitignore` | 加入 `openspec/schemas/`；`git rm -r --cached openspec/schemas/openspec-workflow`（本地副本保留） |
| 4 份主 Spec `## Purpose` | 由 "TBD - created by archiving…" 改为一句话说明（对"主 Spec 只由归档更新"的有意例外，Recorded as exception） |

## RED（先失败）证据

| 命令 | 退出码 | 关键结果 |
|---|---|---|
| `pnpm exec vitest run --project test-tools-unit scripts/check-architecture.test.ts` | 0 | 15 用例通过（fixture 自带合法指南；此时仓库根尚无指南） |
| `pnpm exec tsx scripts/check-architecture.ts`（仓库根） | 1 | `{"issues":["missing docs/template-guide.md"]}`，仅此一条 |

日志：`artifacts/generalize-template-20261002/reports/task-5-red.log`。RED 体现为：`checkTemplateGuide` 与守卫测试已就位，仓库缺指南时架构检查非零退出。

## GREEN 与实际运行

| 命令 | 退出码 | 关键结果 |
|---|---|---|
| `pnpm exec tsx scripts/check-architecture.ts`（写入指南后） | 0 | `{"issues": []}` |
| `VERIFY_RUN_ID=generalize-template-20261002 pnpm check:fast` | 0 | 全链路通过（lint、build、architecture、unit、fixtures、integration、package 均 0） |
| unit（check:fast 内） | 0 | 43 文件 / 287 用例；覆盖率 100%（Stmts 1921/1921、Branch 1282/1282、Funcs 334/334、Lines 1453/1453） |
| integration（check:fast 内） | 0 | 31 文件 / 79 用例（含新增 `SCN-TEMPLATE-ENGINEERING-006`） |
| `pnpm check:fixtures` / `pnpm check:package` | 0 | `issues: []` |
| `pnpm proto:status` | 0 | `up_to_date` |

完整日志：`artifacts/generalize-template-20261002/reports/task-5-check-fast.log`。

## Verification 补充

| 检查 | 命令 | 结果 |
|---|---|---|
| 工作流 schema 不再提交 | `git ls-files openspec/schemas` | 0 行 |
| 本地副本仍可用 | `openspec status --change generalize-template --json` | `schemaName` 仍为 `openspec-workflow` |
| 替换点地图路径存在 | 指南相对链接检查（`checkTemplateGuide`） | 无断链；`{"issues": []}` |
| 文档旧名/本机路径 | `git grep -nE "infra-payment-sdk|/Users/|projects/245|当前业务：支付" -- AGENTS.md 'packages/*/AGENTS.md' README.md docs/` | 0 命中 |
| 残留名称 | `git grep -niE "payment|PAYMENT_|paysdk"` 共 1210 处 | 全部属允许清单第 1～4、7 类：archive/artifacts、`packages/protocol/src/generated/**`、`proto-gen.yaml`/`proto-gen.lock`、`SCN-PROTOCOL-CONTRACT-003/**` 与 7 个 fixture `manifest.json` 的归档 `sources.spec.path`；文档、脚本、测试、配置命中为 0 |

## 场景门禁问题归属（0 问题）

命令：`VERIFY_RUN_ID=generalize-template-20261002 pnpm exec tsx scripts/check-scenarios.ts --report <unit> --report <integration> --report 4×weapp`，退出码 **0**，问题数 **0**（输出保存于 `artifacts/generalize-template-20261002/reports/scenario-gate.json`）。

任务 3、4 遗留的两个 `SCN-TEMPLATE-ENGINEERING-006` 问题（`guide-rules` 缺 module 绑定、`guide-violations-cli` 缺集成绑定）由本任务的新用例与绑定解决；无回归。

## weapp 重跑记录

四个文件逐文件运行（每文件前退出主进程、`cli auto --auto-port 9420` 预热），报告每文件一份：

| 文件 | 报告 | 结果 |
|---|---|---|
| `FLOW-TEMPLATE-EXAMPLE-001` | `reports/weapp-FLOW-TEMPLATE-EXAMPLE-001.json` | 首次整文件运行 120s 断言前挂起 → 重新预热整文件重跑通过 |
| `SCN-PROTOCOL-CONTRACT-002` | `reports/weapp-SCN-PROTOCOL-CONTRACT-002.json` | 首次整文件运行 120s 断言前挂起 → 重新预热整文件重跑通过 |
| `SCN-TEMPLATE-EXAMPLE-002` | `reports/weapp-SCN-TEMPLATE-EXAMPLE-002.json` | 一次通过 |
| `SCN-TEMPLATE-EXAMPLE-004` | `reports/weapp-SCN-TEMPLATE-EXAMPLE-004.json` | 一次通过 |

说明：`scripts/check-architecture.test.ts` 增加 `guide-rules` 绑定后源码摘要变化，四个 weapp 报告均为改动冻结后的最终运行结果。

## 与计划的差异

1. 指南"从方案到验收"的命令按仓库实际脚本书写（`pnpm check:fast` / `pnpm check:scenarios`），并用 `--report` 说明门禁读取报告的两种方式；未新增脚本。
2. `checkTemplateGuide` 的清单 schema 通过 `projectManifestSchemaUrl` 从仓库位置读取（与 `loadProjectManifest` 同一权威），临时根无需复制 schema，符合既有约定。
3. 三个原本独立的指南结构/事实单测合并为 `SCN-TEMPLATE-ENGINEERING-006/guide-rules` 的 module case，使 `test-tools-unit` 有绑定；断言语义合并而非删减。
4. 主 Spec `## Purpose` 为 OpenSpec delta 无法覆盖的直接编辑，作为有意例外记录在本索引。

## 未解决项（归属后续任务）

- 指南演练 D1～D5（真实照指南操作、猜测记录）→ 任务 6。
- 最终验收（全部 weapp 报告、残留逐条归属、能力地图逐项核对）→ 任务 7。
