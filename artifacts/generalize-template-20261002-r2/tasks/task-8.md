# Task 8 验收索引：分层守卫覆盖全部业务模块，补齐运行平台的产品侧绑定

- run-id: `generalize-template-20261002-r2`；执行者：Bridge（复核会话）；plan-review: PASS（digest `71b69495…`，attempt 8）

## RED

- 改 `SCN-TEMPLATE-EXAMPLE-008.spec.ts`：在临时业务模块 `src/sample-domain/core/` 中写入三个探针（导入 generated、使用 `wx`、导入 `node:fs`），断言规则名改为 `domain-core-no-generated`，绑定新增 checkpoint `new-domain-guarded`。
- 先只把规则改名（路径仍只匹配 `example/`）后运行：`SCN-TEMPLATE-EXAMPLE-008.spec.ts:50` 失败（`expected +0 not to be +0`）——新模块 core 导入 generated 未被阻断，证明守卫对新模块静默失效（`task-8-red.log`）。

## GREEN

- `.dependency-cruiser.cjs`：`core-no-platform-or-node` 路径 `^packages/sdk/src/(runtime|[^/]+/(core|ports))/`；`example-core-no-generated` → `domain-core-no-generated`，路径 `^packages/sdk/src/[^/]+/(core|ports)/`；第 10 行注释更新。
- `eslint.config.js`：`wx` 限制 files 改为 `packages/sdk/src/*/core/**/*.ts`、`packages/sdk/src/*/ports/**/*.ts`；注释更新（PR-702）。
- `docs/template-guide.md`：删除"手动扩展守卫"步骤，改为自动覆盖说明；运行平台新增"涉及文件（产品侧绑定）"（PR-501）。
- `packages/sdk/AGENTS.md`：规则说明与 `runtime/` 不建 core/ports 的约定。
- 未修改任何 `scripts/` 非测试文件。

## 验证

| 命令 | 结果 |
|---|---|
| `VERIFY_RUN_ID=generalize-template-20261002-r2 pnpm check:fast` | 0；unit 43/287、覆盖率 100%；depcruise 67 模块 0 违规；integration 31/79，含 SCN-TEMPLATE-EXAMPLE-008、SCN-TEMPLATE-ENGINEERING-006 通过（`task-8-check-fast.log`） |
| `git grep -n "example-core-no-generated\|扩展到新目录\|扩展守卫"`（排除 archive、artifacts、本 Change 规划） | 零命中 |
| 场景门禁（unit + integration） | 319 个问题全部是本 run-id 缺 weapp 报告，归属任务 10（重新逐文件运行 weapp）；SCN-TEMPLATE-EXAMPLE-008、SCN-TEMPLATE-ENGINEERING-006 无问题（`task-8-scenario-gate.json`） |
