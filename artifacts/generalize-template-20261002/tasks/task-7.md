# Task 7 验收索引：最终验收

- run-id: `generalize-template-20261002`；change: `generalize-template`；branch: `codex/generalize-template`
- plan-review gate: PASS（digest `2bb108e6…`）
- 结论: 通过。全部场景（含新增 SCN-TEMPLATE-ENGINEERING-004/005/006、SCN-SCENARIO-GATE-006、SCN-PROTOCOL-CONTRACT-004）与既有场景无回归；残留命中全部归属允许清单。

## 证据

| 检查 | 命令 | 结果 |
|---|---|---|
| 快速门禁 | `VERIFY_RUN_ID=generalize-template-20261002 pnpm check:fast` | 退出码 0；unit 43 文件/287 用例、覆盖率 100%（1921/1921、1282/1282、334/334、1453/1453）；integration 31 文件/79 用例；`check:architecture`/`check:fixtures`/`check:package` 均 `issues: []`（`reports/task-7-check-fast.log`） |
| 平台用例 | 逐文件运行 4 个 weapp 用例 | 4/4 一次通过；`weapp-FLOW-TEMPLATE-EXAMPLE-001.json`、`weapp-SCN-PROTOCOL-CONTRACT-002.json`、`weapp-SCN-TEMPLATE-EXAMPLE-002.json`、`weapp-SCN-TEMPLATE-EXAMPLE-004.json` |
| 场景门禁 | `pnpm exec tsx scripts/check-scenarios.ts --report unit.json --report integration.json --report weapp-*.json`（4 份 weapp 报告逐个列出） | 退出码 0，问题数 0；allSpec 30/30、publicBehavior 8/8、byKind behavior 14/14、module 21/21、engineering 68/68、protocol 635/635、flows 2/2（`reports/task-7-scenario-gate.json`） |
| 残留检查 | `git grep -niE "payment\|PAYMENT_\|paysdk"` | 72 个文件命中，全部属允许清单：archive/artifacts（类别 1）、`packages/protocol/src/generated/**`（2）、`proto-gen.yaml`/`proto-gen.lock`（3）、`SCN-PROTOCOL-CONTRACT-003/**` 与各 Fixture manifest 的 `sources.spec.path` 归档路径（4、7）、本 Change 规划（6）；主 Spec、`docs/`、`AGENTS.md`、`README.md`、`scripts/` 与产品/协议源码零命中 |
| 能力地图逐行 | 解析指南表格：相对链接存在、引用的 Scenario 已登记且 allSpec 全通过、`pnpm` 命令存在 | 19 行全部通过，0 问题 |

## 命令与结果

- `VERIFY_RUN_ID=generalize-template-20261002 pnpm check:fast` → 0
- 4 个 weapp 文件逐文件运行 → 0（每次 `weapp-run.sh` attempt=1）
- 场景门禁（unit + integration + 4 weapp 报告）→ 0 / 0 issues
- `git grep -niE "payment|PAYMENT_|paysdk"` 分类 → 全部在允许清单内

## 未解决项

- OI-01：替换点地图尚未在真实使用方验证；任务 6 的指南演练覆盖 D1～D5，其中 D4/D5 与受影响重做因多 Agent 工具本轮不可用改由主 Agent 执行，证据强度低于设计要求的全新 Agent，建议在真实使用方或工具恢复时补做。
