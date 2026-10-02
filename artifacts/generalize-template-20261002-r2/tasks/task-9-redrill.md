# Task 9 验收索引：重新演练

- 逐演练记录（提示词、执行者、步骤、改动文件、`check:fast`、每条猜测记录与判定、依据文件）见附录 [task-9-redrill-records.md](task-9-redrill-records.md)（Final Code Review F1 后补齐）。

- run-id: `generalize-template-20261002-r2`；执行者：Bridge 派发全新 Agent（每个演练一个，提示词不含本 Change 规划）
- plan-review: PASS（digest `33f91c45…`，attempt 12）
- 场景门禁：演练副本中不运行（按"指南演练验收"决策）。

## 第一轮（基线 `b5d6682`，副本为 detached git worktree）

| 演练 | 结果 | 猜测记录 |
|---|---|---|
| D1 删除发布模块 | 未到绿：本 Change 未归档，其 delta MODIFIED ENG-04 与删除冲突（演练环境问题） | 10 |
| D2 去掉小程序平台 | `check:fast` 0；未改门禁逻辑 | 14 |
| D3 产品包改名 | `check:fast` 0；未改门禁逻辑 | 11 |
| D4 新增业务模块 | `check:fast` 0；新模块 core 中 `void wx;` 被 `no-restricted-globals` 拒绝，未改配置 | 6 |
| D5 OpenAPI 纸面推演 | 清单完整（评审对照 `git grep`） | 13 |

首轮修订规则的有效性：`check-package.ts` 不属于发布模块、保留生产网络工厂、`(sdk|e2e)` 交替组提醒、任务 8 的守卫自动覆盖——均被演练 Agent 读到并照做，避免了首轮踩过的问题（有效、合理）。

分类（用户确认的三类标准，见 Design"重新演练"）：
- 第 1 类：`SCN-TEMPLATE-EXAMPLE-008` 高负载下超过 5 秒默认超时（D1、D3、D4 各遇到）；D1 的 active Change 冲突归为演练环境问题。
- 第 2 类：运行平台误写删除整个 `drivers/`（`node.ts` 为集成驱动）；协议来源误称 SCN-003 Fixture 只改来源摘要；指南其他章节链接平台文件，删除平台后断链而未提示。
- 第 3 类：其余全部（漏列的测试、配置项、硬编码旧名的测试、新模块布局、覆盖来源、依赖清单的单测、`idlDigest` 等）。

修复（中间提交 `f742844`，`check:fast` 0）：EX-008 单独 60 秒超时（本用例实测 3.7 秒，首轮高负载最坏约 12.4 秒）；运行平台改为只删 `weapp*.ts`、保留 `node.ts`；协议来源区分"换 IDL 刷新摘要"与"换非 IDL 来源整体替换目录"；运行平台新增"指南自身的链接"提醒；"已知限制"写明完整影响范围以 `git grep` 与门禁为准、地图只经过模拟演练。

注：第一轮副本含 `artifacts/` 与 git 历史，演练 Agent 的"依据文件"中均未读取首轮报告（D3 仅在 grep 结果中看到 `artifacts/*/tasks/*.md` 的旧包名）。

## 重做（基线 `f742844`，不带历史的快照）

副本准备（`task-9-copy-prep.log`）：`git archive f742844` → `openspec archive generalize-template -y`（4 份均退出 0）→ 删除归档的本 Change 规划与 `artifacts/generalize-template-20261002*` → `git init` 单次提交 → `pnpm install --frozen-lockfile --offline`。核对：每份 `git log` 1 次提交、无残留目录、`git grep` 无本 Change 相关内容。提示词禁止读取 `openspec/changes/` 与 `artifacts/`，要求每条记录自行标注类别。

| 演练 | `check:fast` | 门禁逻辑 | 猜测记录与分类 |
|---|---|---|---|
| D1 删除发布模块 | 首次即 0（unit 41/246、覆盖率 100%；integration 30/75） | 仅删除指南所列两个发布脚本及其测试 | 9 条；2 条自标"误导（清单不全：发布脚本的单测与 ENG-004 用例、`bootstrap.md`）"——照做不会出错、由 grep 与门禁发现，按标准归第 3 类；其余第 3 类 |
| D2 去掉小程序平台 | 第 3 次 0（前两次为测试期望与覆盖来源，非超时） | 未改 | 11 条；`drivers/` 只删 weapp、生产适配器与产品侧绑定保留均照指南执行（首轮第 2 类修订有效）；依赖真实清单的单测、读取归档 Spec 的单测、`context.ts` 覆盖来源、未列出的配置与文档——均为第 3 类 |
| D3 产品包改名 | 第 3 次 0（前两次为指南自身链接与硬编码旧路径的测试，门禁直接指出） | 未改 | 10 条；均为第 3 类（`(sdk|e2e)` 提醒被验证有效） |
| D4 新增业务模块 | 首次即 0（unit 46/305、覆盖率 100%） | 未改；`eslint.config.js`、`.dependency-cruiser.cjs` 未改 | 4 条，均第 3 类；`wx` 探针被 `no-restricted-globals` 拒绝——任务 8 守卫自动生效 |
| D5 OpenAPI 纸面推演 | — | — | Bridge 核对：首轮唯一第 2 类问题（SCN-003 Fixture 表述）已修正；其余为第 3 类 |

结论：重做未出现新的第 1、2 类问题，按 Design"重新演练"收口。第 3 类记录汇总于上，由指南"已知限制"一句覆盖；OI-01（真实使用方验证）保持开放。

## Final Code Review 后的补充（F1～F3）

- F1：补齐逐演练记录（附录）。
- F2：指南"运行平台 → 产品侧绑定"改为指向实际写死 `runtime: 'wechat-miniapp'` 的测试（`factory.test.ts`、`example-harness.ts`、`SCN-TEMPLATE-EXAMPLE-001` 用例），不再指向 `contracts.test.ts`。
- F3：副本安装命令实为 `pnpm install --frozen-lockfile --offline`（见 `task-9-copy-prep.log` 所用脚本），原文漏写 `--frozen-lockfile`，已更正。
