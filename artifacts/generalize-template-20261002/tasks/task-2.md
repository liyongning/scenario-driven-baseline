# Task 2 验收索引：Shadow 路由中立化

- run-id: `generalize-template-20261002`；change: `generalize-template`；branch: `codex/generalize-template`
- plan-review gate: PASS（digest `2bb108e6…`，任务开始前与完成后各复算一次均一致）
- 结论: 实现与 Spec PC-03 / SCN-PROTOCOL-CONTRACT-004 一致；验证通过，待提交。

## 产物

- `packages/payment-protocol/testing/shadow/routes.ts`：`ShadowRoute` 改为 `{ methodName; httpMethod; path }`，删除 `meta` 与 generated 导入。
- 新增 `packages/payment-protocol/testing/shadow/idl-routes.ts`：`routesFromRpcMethods(required, candidates)`；缺方法 / 路径 / HTTP 方法 / codec 时抛错。
- `testing/shadow/example/routes.ts`：导出 `exampleRpcMethods` 与 `discoverExampleRoutes()`（经 `routesFromRpcMethods`）。
- `testing/index.ts`：新增导出 `routesFromRpcMethods` 与类型 `ShadowRoute`。
- `testing/shadow/bootstrap.test.ts`、`example/routes.test.ts`：导出清单与中立断言适配（断言语义不变）。
- 新增 `testing/shadow/idl-routes.test.ts`（`idl-route-source`）、`testing/shadow/routes.test.ts`（`neutral-route`）、`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts`（`engine-no-generated-cli`）。
- `scripts/lib/contract-inventory.ts`：改用 `exampleRpcMethods` 读取 `requestType`/`responseType`/路径，不再依赖 `ShadowRoute.meta`。
- `.dependency-cruiser.cjs`：新增 `shadow-engine-no-generated`；`not-to-dev-dep` 的 `from.pathNot` 增加 `/testing/`（附理由）。
- `package.json`：`check:architecture` 的 depcruise 扫描目标加入 `packages/payment-protocol/testing`。

## 读取方改动前后对照

| 读取方 | 改动前 | 改动后 |
|---|---|---|
| `ShadowRoute` | 含 `meta: RpcMethodMeta`，直接依赖 generated 类型 | 仅方法名/HTTP 方法/路径；`testing/shadow/routes.ts` 无 generated 导入 |
| `discoverExampleRoutes` | 自行从 `consumed` 元数据映射并回填 `meta` | 调用 `routesFromRpcMethods(exampleRpcMethods, candidates)` |
| `contract-inventory` | 经 `discoverExampleRoutes().meta` 取 `requestType`/`responseType` | 直接 import `exampleRpcMethods` 取生成描述 |
| depcruise 规则 | 不扫描 `testing/`，无 generated 隔离规则 | 扫描 `testing/`，`shadow-engine-no-generated` 生效 |
| `not-to-dev-dep` | `from.pathNot` 仅排除测试文件 | 追加 `|/testing/`（testing 只供测试，已被 `production-no-test` 约束） |

## RED（先失败）证据

复现方式：临时移走 `idl-routes.ts`、临时从 `.dependency-cruiser.cjs` 删除 `shadow-engine-no-generated` 规则行，复现后按 sha256 校验还原（`git status` 与回退前一致）。

- `pnpm exec vitest run --project protocol-unit packages/payment-protocol/testing/shadow/idl-routes.test.ts` → 退出码 1，`Cannot find module '../idl-routes.ts' imported from …/example/routes.ts`。
- `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts` → 退出码 1，`AssertionError: expected +0 not to be +0`（临时副本中 depcruise 退出码为 0，未报告规则）。

## GREEN 与实际运行

| 命令 | 退出码 | 关键结果 |
|---|---|---|
| `pnpm exec vitest run --project protocol-unit …/idl-routes.test.ts …/routes.test.ts` | 0 | `Tests 2 passed (2)` |
| `pnpm exec vitest run --project integration …/SCN-PROTOCOL-CONTRACT-004.spec.ts` | 0 | `engine-no-generated-cli` 通过（临时副本报 `shadow-engine-no-generated`，真实仓库 depcruise 退出码 0） |
| `PAYMENT_RUN_ID=… pnpm test:unit` | 0 | 43 文件 / 286 用例；覆盖率 100%（Stmts 1843/1843、Branch 1247/1247、Funcs 320/320、Lines 1398/1398） |
| `PAYMENT_RUN_ID=… pnpm test:integration` | 0 | 30 文件 / 78 用例 |
| `pnpm check:fast` | 0 | 全链路通过（含 `check:architecture`、fixtures、package） |
| `pnpm check:architecture` | 0 | `{"issues": []}`（depcruise 67 模块 / 137 依赖） |
| `git grep -n "generated" …/shadow/{server,faults,requests,routes}.ts` | 1（零命中） | 见 Verification |
| `PAYMENT_RUN_ID=… pnpm exec tsx scripts/check-scenarios.ts --report unit --report integration --report 4×weapp` | 1 | 仅 2 个问题，均属任务 5 |

weapp 逐文件报告（每文件一份，均在退出主进程并重新预热后取得）：
- `artifacts/generalize-template-20261002/reports/weapp-SCN-PROTOCOL-CONTRACT-002.json`（1 passed）
- `artifacts/generalize-template-20261002/reports/weapp-FLOW-TEMPLATE-EXAMPLE-001.json`（1 passed）
- `artifacts/generalize-template-20261002/reports/weapp-SCN-TEMPLATE-EXAMPLE-002.json`（1 passed）
- `artifacts/generalize-template-20261002/reports/weapp-SCN-TEMPLATE-EXAMPLE-004.json`（1 passed，首次环境失败后整文件重跑取得）

门禁输出保存于 `artifacts/generalize-template-20261002/reports/scenario-gate.json`。

## 场景门禁问题归属（0 回归）

| 数量 | 问题 | 归属 |
|---|---|---|
| 1 | `SCN-TEMPLATE-ENGINEERING-006/guide-rules: missing binding` | 任务 5 |
| 1 | `SCN-TEMPLATE-ENGINEERING-006/guide-violations-cli: missing binding` | 任务 5 |

`SCN-PROTOCOL-CONTRACT-001～004`、`SCN-TEMPLATE-EXAMPLE-009` 与其余已有场景均无问题。

## weapp 重跑记录

- 首轮每文件均按“退出主进程 → 预热 → 运行”执行；`SCN-PROTOCOL-CONTRACT-002` 与 `SCN-TEMPLATE-EXAMPLE-004` 分别出现一次环境失败（`Wait timed out after 30000 ms` / `TypeError: …(reading 'split')`，断言数为 0，发生在断言前），退出主进程后整文件重跑通过，报告已替换为通过版本。
- 环境发现：本机残留两个早前 worktree 的 DevTools 主进程（`UE` 不可中断状态）；仅 `cli open` 预热后首次 launch 仍 30s 超时，改用 `cli auto --auto-port 9420 --trust-project` 预热（开启自动化的项目窗口）后稳定通过。该实作细节建议在任务 5/6 的指南“已知限制”里体现；本任务不修改 `packages/e2e/AGENTS.md`。

## 与计划的差异

1. 依 Design，`not-to-dev-dep` 对 `testing/` 的排除已加入并注明理由。
2. `engine-no-generated-cli` 按 Design 在**临时副本**中制造违规（tasks.md Verification 中的“在本仓库临时修改 server.ts”表述以 Design 为准，避免改动被跟踪文件）；同一用例仍断言真实仓库 depcruise 通过（正向对照）。
3. 临时副本改为真实复制协议包 `src`/`testing`（非符号链接）：depcruise 会把符号链接解析成仓库绝对路径，导致按相对前缀匹配的规则失效。
4. `neutral-route` 用例在改造前后都会通过（引擎原本就只用方法名/HTTP 方法/路径）；其价值是“测试文件不导入 generated”的中立契约守护，故不作为 RED 项。
5. `engine-no-generated-cli` 的 `fixtureCase` 设为非空标签（工程类绑定要求），沿用 `SCN-TEMPLATE-EXAMPLE-008` 的“有标签无 fixture 目录”做法。
