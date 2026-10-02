# Task 3 验收索引：包与项目改名，ProtoGen 输出路径迁移

- run-id: `generalize-template-20261002`；change: `generalize-template`；branch: `codex/generalize-template`
- plan-review gate: PASS（digest `2bb108e6…`，任务开始前与完成后各复算一次均一致）
- 结论: 实现与 Spec ENG-01 / SCN-TEMPLATE-ENGINEERING-001、ENG-04 / SCN-TEMPLATE-ENGINEERING-004、ENG-05 / SCN-TEMPLATE-ENGINEERING-005、PC-02 / SCN-PROTOCOL-CONTRACT-003 一致；验证通过，待提交。

## 产物

- `project.manifest.json`：目录 `sdk`/`protocol`/`e2e`，包名 `@daqian/template-*`，`fingerprints` 三处路径，`release.registry` 占位值 `…/projects/<PROJECT_ID>/…`，`tagPrefix: template-sdk-v`。
- `proto-gen.yaml`：`sources[0].outputs[0].path` → `packages/protocol/src/generated`。
- `proto-gen.lock`：仅 `outputs.payment-ts.path` 与 `configDigest` 变化（Consumer 身份 `infra-payment-sdk`/`payment-idl`/`payment-ts` 不变）。
- 目录移动：`packages/payment-sdk` → `packages/sdk`；`packages/payment-protocol` 其余文件 → `packages/protocol`（生成目录由 ProtoGen 迁移）。
- 三个包 `package.json`（包名、依赖名、`publishConfig.registry` 占位）；根 `package.json`（`name: sdk-template`、中文描述）；`pnpm-lock.yaml`（`pnpm install` 刷新 workspace 名称与 link 路径）。
- 路径/包名/别名适配：`tsconfig.base.json`、`tsconfig.test.json`、`vitest.config.ts`、`vitest.shared.ts`、各包 Vitest 配置、`eslint.config.js`、`.dependency-cruiser.cjs`（含 `(sdk|protocol|e2e)` 交替组与 `^@template-test/` 规则）、`packages/e2e/host/weapp/{project.config.json,vite.config.ts,example-runner.ts,protocol-runner.ts}`。
- 全部源码、测试、fixture manifest 中的 `packages/payment-*`、`@daqian/payment-*`、`@payment-test/protocol` 与裸 `payment-sdk`/`payment-protocol` 目录名（改名表内的适配）。
- `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/manifest.json`：`generatedCurrent.output.path`、`configDigest`、`provenance.sha256.current.lock`、`maintenance.currentBaselineSha256`；`provenance/current.lock` 替换为迁移后的 `proto-gen.lock`。
- 共暂存 145 个文件变更（44 处 100% 重命名 + 部分重命名 + 新增/删除/修改）。

## 改名对照（依 Design 改名表）

| 旧 | 新 |
| --- | --- |
| `packages/payment-sdk`、`packages/payment-protocol` | `packages/sdk`、`packages/protocol` |
| `@daqian/payment-sdk`、`@daqian/payment-protocol`、`@daqian/payment-e2e` | `@daqian/template-sdk`、`@daqian/template-protocol`、`@daqian/template-e2e` |
| 根包 `infra-payment-sdk` / "Headless payment SDK workspace tooling" | `sdk-template` / "SDK 领域项目模板：示例、质量门禁与工程工具链" |
| 测试别名 `@payment-test/protocol` | `@template-test/protocol` |
| `projects/245` registry、`tagPrefix: payment-sdk-v` | `projects/<PROJECT_ID>` 占位、`tagPrefix: template-sdk-v` |
| weapp `projectname: payment-sdk-test-host` | `sdk-template-test-host` |
| ProtoGen 输出 `packages/payment-protocol/src/generated` | `packages/protocol/src/generated`（先改 yaml → `proto:sync` → 再移动其余文件） |

## RED（先失败）证据

按 tasks.md RED，先只改 `project.manifest.json` 为新目录与包名，在旧目录仍在原位时运行 `pnpm check:architecture`：退出码 1，`ENOENT … packages/protocol/package.json`（新增的两个旧目录 `payment-sdk`/`payment-protocol` 与包名不一致，同时清单登记的 `sdk`/`protocol` 不存在）。

机械对照（当前仓库与基线）：

| 命令 | 退出码 | 说明 |
|---|---|---|
| `git cat-file -e main:packages/protocol/package.json` | 1 | 基线不存在新路径 |
| `git cat-file -e main:packages/payment-protocol/package.json` | 0 | 基线存在旧路径 |

## GREEN 与实际运行

| 命令 | 退出码 | 关键结果 |
|---|---|---|
| `pnpm proto:validate` | 0 | `status: valid`，`apiVersion: proto-gen/v2` |
| `pnpm proto:sync` | 0 | `status: up_to_date`，`payment-ts … currentPath: packages/protocol/src/generated` |
| `pnpm proto:status` | 0 | `status: up_to_date`，输出 `currentPath`/`previousPath` 均为 `packages/protocol/src/generated` |
| `pnpm install` | 0 | `Already up to date`，lock 仅 workspace 名称与 link 路径变化 |
| `PAYMENT_RUN_ID=… pnpm check:fast` | 0 | 全链路通过（lint、build、typecheck、architecture、unit、fixtures、integration、package 均 0） |
| `PAYMENT_RUN_ID=… pnpm test:unit`（check:fast 内） | 0 | 43 文件 / 286 用例；覆盖率 100%（Stmts 1843/1843、Branch 1247/1247、Funcs 320/320、Lines 1398/1398） |
| `PAYMENT_RUN_ID=… pnpm test:integration`（check:fast 内） | 0 | 30 文件 / 78 用例 |
| `pnpm check:architecture` | 0 | `{"issues": []}`（depcruise 67 模块 / 137 依赖） |
| `pnpm check:package` | 0 | `@daqian/template-protocol`、`@daqian/template-sdk` pack 均 0，`issues: []` |
| `git diff --cached main -- proto-gen.lock` | 0 | 仅 `path` 与 `configDigest` 两行变化 |
| `git rev-parse main:packages/payment-protocol/src/generated` vs `git write-tree --prefix=packages/protocol/src/generated/` | 0 | 两者同为 `fa5b67e845bb1c9449dc0200240ee33dac86ca72`（生成目录逐字节不变） |

完整 `check:fast` 日志：`artifacts/generalize-template-20261002/reports/task-3-check-fast.log`。
`proto:sync` 输出：`artifacts/generalize-template-20261002/reports/task-3-proto-sync.txt`。

### 锁文件 diff（仅两行）

```diff
-                path: packages/payment-protocol/src/generated
+                path: packages/protocol/src/generated
-                configDigest: sha256:0cfb0044040d0d15a3faae863a04a96bdaf1c09bb4492a2b51339f9431996622
+                configDigest: sha256:1d14a161ce75c566aabb58ebe1539ba566eb09651a4a17a0ea04db6f3dc7a348
```

### `SCN-PROTOCOL-CONTRACT-003` 生成来源基线

- 更新：`generatedCurrent.output.path`、`configDigest`（`sha256:1d14a161…`）、`provenance.sha256.current.lock`（`c8e2578b…`，与迁移后 `proto-gen.lock` 一致）、`maintenance.currentBaselineSha256`（同一摘要，保持一致）。
- 保持原样：`generatedCompatibility`（旧 path/configDigest/treeDigest）、`provenance/{before,after}.lock`、`status.json`、`sync.json`、`consumerId: infra-payment-sdk`（支付时期真实工具输出，历史证据）。
- `provenance/current.lock` 与仓库根 `proto-gen.lock` 逐字节相同（`diff` 为空，sha256 均为 `c8e2578b…`）。

## 残留名称检查（Verification）

`git grep -nE "payment-sdk|payment-protocol|payment-e2e|@payment-test|projects/245" -- . ':!AGENTS.md' ':!packages/*/AGENTS.md' ':!README.md' ':!docs'` 共 304 处命中，全部属于残留允许清单：

| 类别 | 命中位置 | 数量 |
|---|---|---|
| 1 历史记录 | `openspec/changes/archive/**`、`artifacts/**` | 约 270 |
| 6 本 Change 规划文本 | `openspec/changes/generalize-template/**` | 31 |
| 3 ProtoGen Consumer 身份 | `proto-gen.yaml`、`proto-gen.lock` | 2 |
| 4 借用的 IDL 来源事实 | `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/**` | 12 |

源码、脚本、配置、测试目录内命中为 0。文档（根与各包 `AGENTS.md`、`README.md`、`docs/**`）命中按 Design 归属任务 5。

## 场景门禁问题归属（0 回归）

命令：`PAYMENT_RUN_ID=generalize-template-20261002 pnpm exec tsx scripts/check-scenarios.ts --report <unit> --report <integration> --report 4×weapp`，退出码 1，输出保存于 `artifacts/generalize-template-20261002/reports/scenario-gate.json`。

| 数量 | 问题 | 归属 |
|---|---|---|
| 1 | `SCN-TEMPLATE-ENGINEERING-006/guide-rules: missing binding for test-tools-unit` | 任务 5 |
| 1 | `SCN-TEMPLATE-ENGINEERING-006/guide-violations-cli: missing binding for integration` | 任务 5 |

`SCN-TEMPLATE-ENGINEERING-001/004/005`、`SCN-PROTOCOL-CONTRACT-001～004` 与其余已有场景均无问题。

## weapp 重跑记录

四个文件逐文件运行，均通过；报告（每文件一份）：

- `reports/weapp-FLOW-TEMPLATE-EXAMPLE-001.json`（1 passed，首次因命令里文件路径写错得到 `No test files found`，非用例失败；改正确路径后一次通过）
- `reports/weapp-SCN-PROTOCOL-CONTRACT-002.json`（1 passed；先两次 `Wait timed out after 30000 ms`，其中一次为预热自身未绑定端口，彻底清理残留主进程后整文件重跑通过）
- `reports/weapp-SCN-TEMPLATE-EXAMPLE-002.json`（1 passed；一次 `Wait timed out after 30000 ms` 后整文件重跑通过）
- `reports/weapp-SCN-TEMPLATE-EXAMPLE-004.json`（1 passed，一次通过）

环境发现：本机残留两个早前 worktree 的 DevTools 主进程，处于 `UE`（不可中断）状态，`cli quit`、`pkill -f wechatwebdevtools`、`kill -9` 均无法清除。可靠预热方式为：先 `cli quit` 并回收所有可回收的 `MacOS/wechatdevtools`，等端口 9420 释放后 `cli auto --project <repo>/packages/e2e/host/weapp --auto-port 9420 --trust-project`，轮询到 9420 `LISTEN` 后再静置约 25 秒；仅 `cli open` 预热后首次 launch 仍会 30 秒超时。该细节建议在任务 5/6 的指南“已知限制”中体现；按任务边界不改 `packages/e2e/AGENTS.md`。

## 与计划的差异

1. 根 `package.json` 的 `name`（`infra-payment-sdk`）不在 Verification 的 token 列表中，按 Design 改名表单独改为 `sdk-template`。
2. `packages/e2e/host/weapp/project.config.json` 的 `projectname` 按 Design 属 weapp 一行；Task 3 Files 明确包含该文件，且不改会留下 Task 3 残留命中，故在本任务改名。宿主标题（`app.json`、`pages/index/index.json`）与 `__PAYMENT_TEST_RUNNER__` 仍留待任务 4。
3. `maintenance.currentBaselineSha256` 未被测试读取；为与 `provenance.sha256.current.lock` 保持一致（同指一个文件）一并刷新。
4. `scripts/check-architecture.test.ts` 的 `importFixture` 符号链接名由 `payment-protocol` 改为 `template-protocol`，与改名后的真实包名一致。
5. weapp 预热方式由 `cli open` 改为 `cli auto --auto-port 9420`（见重跑记录），未改动被测代码与断言。

## 未解决项（归属后续任务）

- `PAYMENT_RUN_ID`/`PAYMENT_REPORT_FILE`、`paymentCase`、`payment-evidence`/`payment-flow`、`paymentBehavior`、`paymentBusinessErrors*`、`__PAYMENT_TEST_RUNNER__`、weapp 宿主标题、schema `$id` 等 → 任务 4。
- 文档（根与各包 `AGENTS.md`、`README.md`、`docs/**`）中的旧名与支付链接 → 任务 5。
- 两个 `UE` 状态的 DevTools 残留主进程未清理（不影响端口与运行）。
