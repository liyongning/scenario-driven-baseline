# Verification

> 草稿：Apply 执行方（Codex）维护的「逐任务记录」。完整的 Verification 判定（Metadata / Apply Gate / Summary / Completeness / Correctness / Coherence / Archive Readiness）由验收方在 Verify 阶段填写与判定，本文件当前的其余章节不构成验收结论。
>
> 运行约定（ENG-06）：本 Change active 期间，单独运行 `check:fast` 用 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast`；任务 8 交付 `verify` 后用 `pnpm verify --change template-core-hardening`。
> weapp 用例按 `packages/e2e/AGENTS.md` 逐个文件运行：每个文件前 `cli quit`（残留时 `pkill -f wechatwebdevtools.app`）并 `cli open --project packages/e2e/host/weapp` 预热约 30 秒；失败整文件重跑，不用 `-t`。

## 逐任务记录

### Task 1 依赖小版本升级与忽略项修正

**Commit message**：`chore(template): bump tooling patch versions and fix ignore rules`

**RED（预期失败的反例）**
- 在 `.local/lint-violation.ts` 放入 `const unusedVariable = 1;`，`pnpm lint` 命中 `@typescript-eslint/no-unused-vars`，退出码 1（改造前 `.local/**` 不在 ESLint ignores）。
- `git check-ignore -v openspec/schemas/x` 命中 `.gitignore:7:openspec/schemas/`，退出码 0。

**GREEN**
- 上述违规文件存在时 `pnpm lint` 退出码 0（`.local/**` 已加入 ignores）；验证后删除该临时文件。
- `git check-ignore -v openspec/schemas/x` 不再由 `.gitignore` 命中（只有本地 `.git/info/exclude` 命中，见"方案与实际的差异"）。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 0（日志 `/tmp/t1-checkfast4.log`）。
- weapp 逐文件全绿（升级后依赖）：见下。

**命令与退出码**
| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `pnpm lint`（RED，含 .local 违规文件） | 1 | `/tmp`（现场输出：`.local/lint-violation.ts 1:7 error`） |
| `pnpm lint`（GREEN，同一违规文件存在） | 0 | 现场输出为空 |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast`（首次，未同步协议锁） | 2 | `proto:status` 报 `sync_required`（reason `tool_changed`） |
| `pnpm proto:sync`（同步协议锁到 0.1.3） | 0 | 生成物无 diff；`proto-gen.lock` 仅 `tool.version` 0.1.2→0.1.3，`projectionVersion` 保持 4 |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast`（最终） | 0 | `/tmp/t1-checkfast4.log` |
| `pnpm exec openspec --version` | 0 | `1.6.0`，与 `package.json` 精确版本一致 |
| `pnpm outdated` | 1（outdated 语义） | 仅剩三类例外：`typescript` 5.9.3→7.0.2、`@types/node` 22.20.5→26.6.4、`@fission-ai/openspec` 1.6.0→1.14.1 |
| weapp：`SCN-PROTOCOL-CONTRACT-002.spec.ts` | 1 次后重跑 0 | 报告 `artifacts/t1-weapp/reports/weapp.json`；首次失败为 `checkVersion` 读到空版本（`TypeError: Cannot read properties of undefined (reading 'split')`，断言前失败） |
| weapp：`FLOW-TEMPLATE-EXAMPLE-001.spec.ts` | 1 次后重跑 0 | 报告 `artifacts/t1-weapp/reports/FLOW-TEMPLATE-EXAMPLE-001.json`；首次失败同 `checkVersion` 现象（日志被重跑覆盖，未留存现场） |
| weapp：`SCN-TEMPLATE-EXAMPLE-002.spec.ts` | 0 | 报告 `artifacts/t1-weapp/reports/SCN-TEMPLATE-EXAMPLE-002.json` |
| weapp：`SCN-TEMPLATE-EXAMPLE-004.spec.ts` | 0 | 报告 `artifacts/t1-weapp/reports/SCN-TEMPLATE-EXAMPLE-004.json` |

**weapp 重跑记录**
- `SCN-PROTOCOL-CONTRACT-002`、`FLOW-TEMPLATE-EXAMPLE-001` 两个文件在"退出主进程 + 预热"后整文件重跑取得通过证据，失败现象均为断言前 `checkVersion` 空版本（与 `packages/e2e/AGENTS.md` 记录的已知限制一致）。
- `SCN-TEMPLATE-EXAMPLE-002`、`SCN-TEMPLATE-EXAMPLE-004` 首次即通过，未重跑。
- 未使用 `-t`。

**版本对照（升级前 → 升级后）**
- 新增精确版本：`@fission-ai/openspec` 1.6.0（供需要真实 OpenSpec CLI 的用例与副本归档使用）。
- `@daqian/proto-gen` 0.1.2 → 0.1.3；`@microsoft/api-extractor` 7.59.1 → 7.59.4；`@types/node` 22.20.1 → 22.20.5；`@vitest/coverage-v8` 5.0.0 → 5.0.3；`dependency-cruiser` 18.2.0 → 18.5.0；`eslint` 10.10.0 → 10.12.0；`globals` 17.12.0 → 17.13.0；`tsx` 4.23.13 → 4.23.15；`typescript-eslint` 8.70.0 → 8.71.1；`unplugin-dts` 1.1.0 → 1.1.2；`vite` 8.2.2 → 8.3.4；`vitest` 5.0.0 → 5.0.3；`yaml` 2.9.0 → 2.9.1。
- 按 Design 不升级：`typescript` 5.9.3（保持 5.9.x）、`@types/node` 22.x。
- 其余依赖当前即最新：`@eslint/js` 10.0.1、`ajv` 8.20.0、`express` 5.2.1、`miniprogram-automator` 0.12.1、`remark-gfm` 4.0.1、`remark-parse` 11.0.0、`unified` 11.0.5、`unist-util-visit` 5.1.0、`@types/express` 5.0.6。

**因升级而做的代码/数据适配**
- `proto-gen.lock`：`tool.version` 0.1.2 → 0.1.3（`projectionVersion` 4 不变）。生成目录 `packages/protocol/src/generated/` 与生成器输出无任何变化（`git status` 未出现生成文件；`pnpm proto:sync` 的 `changedOutputs` 未改动文件内容，`fileDiff/rootDiff` 为空）。
- `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/`（SCN-PROTOCOL-CONTRACT-003 的 Fixture，既是"固定 Go 事实"也是"当前 generated 兼容基线"的核对输入）：
  - `manifest.json` 的 `sources.generatedCurrent.tool.version` 0.1.2 → 0.1.3（该字段按用例语义必须与实时 `proto-gen.lock` 一致）。
  - `provenance/current.lock` 的 `tool.version` 0.1.2 → 0.1.3（该文件与实时 `proto-gen.lock` 逐字相同，是 `projection-mismatch` 正例与 111 项污染的输入），并同步 `manifest.provenance.sha256["current.lock"]` 与 `maintenance.currentBaselineSha256`。
  - 冻结历史事实未改：`sources.generatedCompatibility.tool.version`、`provenance/before.lock`、`provenance/after.lock`、`provenance/sync.json`、`provenance/status.json`、`provenance.toolVersion` 仍为 0.1.2。
  - 用例断言代码（`SCN-PROTOCOL-CONTRACT-003.spec.ts`）零改动；断言语义不变，只刷新了"当前锁镜像"数据。

**方案与实际的差异**
- `.gitignore` 删除 `openspec/schemas/` 后，`git check-ignore openspec/schemas/x` 仍命中，但来源改为本地 `.git/info/exclude:9`（本 worktree 为运行 OpenSpec 工作流需要在项目级安装 `openspec-workflow` schema，按 Design 的 README 维护者说明在本地排除而不改 `.gitignore`）。因此任务文本的 GREEN 判据按 Spec 语义（`.gitignore` 不再忽略 `openspec/schemas/`）成立；已在 README 新增"维护者说明"一节写明这一做法。
- Task 1 的 Files 未列 SCN-PROTOCOL-CONTRACT-003 Fixture；因设计强制升级 `@daqian/proto-gen`，而该 Fixture 的"当前基线"按用例语义必须等于实时锁文件，故做上述最小数据适配（Task 1 Review/Acceptance 明确要求记录"任何因升级而做的代码适配"）。
- 新装 `@fission-ai/openspec` 的 build script 被 pnpm 默认忽略（`Ignored build scripts: @fission-ai/openspec`）；实测 `pnpm exec openspec --version` 正常输出 1.6.0，不影响使用。

**已接受的 Minor**
- 计划登记 M1（`pnpm outdated` 例外清单再加上 `@fission-ai/openspec`）：已落实，outdated 输出恰为三项例外。

**按需选择结果**：N/A（任务 9 才交付 `test:affected`）。

**外部环境观察（不影响本任务）**
- 协议 IDL 远端分支 `feat/esm-v1.4` 已从锁文件记录的 `80707134` 前进到 `5a786721`；`proto:status` 不比较该提交（实测工具 0.1.2 下同一分支头仍为 `up_to_date`），故与本任务无关，且按 Global Constraints 未修改 IDL / Consumer 登记。

### Task 2 Prettier 基线与全量格式化

**Commit message**：`style(template): adopt prettier baseline and format the repository`

**RED（预期失败的反例）**
- 新增 `.prettierrc.json`、`.prettierignore`、`format`/`format:check` 脚本并接入 `check:fast` 后，在未格式化的仓库上运行 `pnpm format:check`：退出码 1，列出 150 个未格式化文件（`.dependency-cruiser.cjs`、`AGENTS.md`、`docs/template-guide.md`、`eslint.config.js`、`packages/**`、`scripts/**`、`vitest.shared.ts` 等）。

**GREEN**
- `pnpm format`（`prettier --write .`）后 `pnpm format:check` 退出码 0（"All matched files use Prettier code style!"）。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 0（日志 `/tmp/t2-checkfast.log`），其中已包含 `format:check`、`lint`、`build`、`typecheck`、`check:architecture`、`test:unit`（100% 覆盖率阈值）、`check:fixtures`、`test:integration`、`check:package`。
- Fixture 与生成物摘要未变：`.prettierignore` 排除 `packages/e2e/tests/fixtures/**`、`proto-gen.lock`、`**/generated/**`、`openspec/`，`pnpm check:fixtures` 通过（包含在 check:fast 中）；`git status` 中无 fixtures/generated 文件被格式化。

**命令与退出码**
| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `pnpm format:check`（RED） | 1 | `/tmp/t2-format-red.log`，150 个 `[warn]` |
| `pnpm format` | 0 | `/tmp/t2-format.log` |
| `pnpm format:check`（GREEN） | 0 | `/tmp/t2-format-green.log`、`/tmp/t2-format2.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | `/tmp/t2-checkfast.log` |

**方案与实际的差异**
- `.prettierignore` 按 Design/ENG-08 的清单逐条落地（`openspec/`、`.local/`、`.claude/`、`artifacts/`、`dist/`、`coverage/`、`**/generated/**`、`pnpm-lock.yaml`、`packages/e2e/tests/fixtures/**`、`proto-gen.lock`）；未额外增加条目。实测 `.generated/` 运行产物不常驻（weapp 运行结束即清理），无需单列。
- Prettier 3.9.9 在本仓库 3 个文件（`packages/sdk/src/example/adapters/trade-backend.test.ts`、`packages/sdk/src/example/core/client.test.ts`、`scripts/lib/contract-inventory.test.ts`）上对同一输入非幂等：`prettier --write .` 第一遍后 `format:check` 仍报这 3 个文件，第二遍写入后才到不动点。已确认 stdin 与 file 两种模式结论一致（`stdin(B)==B`），即属 Prettier 自身对成员链折行的非幂等，不是环境差异。第二遍后整棵树稳定：再次 `pnpm format` 不产生任何改动（`git status` 前后哈希一致），`format:check` 通过。
- 括号、尾逗号等改动属于 `arrowParens: always`/`trailingComma: all` 的格式输出，无语义影响；`vitest.shared.ts` 从压缩写法展开为多行。

**语义不变性核验（机械证据）**
- 对 149 个本次改动的受跟踪文件（排除 `package.json`、`project.manifest.json`、`pnpm-lock.yaml` 三个含语义改动的文件）逐个比较 `git show HEAD:<path> | prettier --stdin-filepath <path>` 与工作区内容：146 个一次通过；上述 3 个文件在"两遍 Prettier"后与工作区内容完全一致（`TWO-PASS-MATCH`）。
- 结论：本次提交除 4 个新增/修改的配置文件外，全部改动等于 Prettier 对 HEAD 内容的输出，无手写语义修改。

**已接受的 Minor**：N/A（Task 2 无登记 Minor）。

**weapp 重跑记录**：N/A（本任务 Files/GREEN/Verification 不涉及 weapp；格式化为语义中性，weapp 证据在任务 8、11、12、13、17 运行）。

**按需选择结果**：N/A（任务 9 才交付 `test:affected`）。

### Task 3 清单扩展、手写源码清单、指纹与覆盖率完整性

**Commit message**：`feat(template): derive fingerprints and coverage scope from one source inventory`

**RED（预期失败的反例，已实际执行）**
- 用 `git stash push` 只回退受跟踪文件、保留本任务新增文件（`scripts/lib/source-inventory.ts`、`scripts/check-coverage.ts`、`scripts/lib/coverage-scope.ts` 及新单测），再运行 `pnpm exec vitest run --project test-tools-unit scripts/lib/source-inventory.test.ts scripts/check-coverage.test.ts`：退出码 1（日志 `/tmp/t3-red.log`）。旧 schema 报 `data/fingerprints must have required property 'hostRoots'`、`data/testProjects/0 must NOT have additional properties`、`quality` 未知；旧 `project-manifest.ts` 也没有 `coverageExclusions` 等导出。
- 等价的口径：`.ts` 文件不在覆盖率 `include` 中时 `check:coverage` 不存在 → `pnpm check:coverage` 在 Task 2 状态为 `Command "check:coverage" not found`；旧 `buildVerificationFingerprints` 无 `buildInputs`/`protocolInputs`/`protocolDigest`/`files`，`readSourceInventory` 不存在。
- RED 演示后已 `git stash pop` 还原（`/tmp/stashpop.log`）。

**GREEN**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 0（日志 `/tmp/checkfast.log`）：`test:unit` 45 文件 / 292 用例全绿且四项覆盖率 100%，`check:coverage` 无问题（`{"issues": []}`），`check:architecture`、`check:fixtures`、`test:integration`（32 文件 / 83 用例）、`check:package` 均退出码 0。
- 真实场景门禁 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:scenarios`：退出码 1，409 个问题（`/tmp/gate.json`）。本任务负责的 ENG-05 / ENG-07 无未归属问题；剩余问题全部归属后续任务：
  - ENG-05 的 `environments-by-manifest`、`scripts-by-manifest`（`test-tools-unit/manifest-rules`、`integration/rename-by-manifest-cli`）→ Task 4；
  - SCN-TEMPLATE-ENGINEERING-003/007、SCN-PROTOCOL-CONTRACT-001/002/005/006/007/009/010/011/012/013、SCN-TEMPLATE-EXAMPLE-012 → Task 10；SCN-SCENARIO-GATE-012~020 → Task 6/7/8；GATE-021~026 → Task 9；ENG-010/011/012 → Task 14/15/16；ENG-006 的标记用例 → Task 10；
  - 全部含 `weapp` 的绑定（`SCN-TEMPLATE-EXAMPLE-002/004/011`、FLOW、协议矩阵 weapp 义务等）→ Task 17/18 的 weapp 运行。

**命令与退出码**
| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| RED：`vitest run --project test-tools-unit <两个新单测>`（旧实现） | 1 | `/tmp/t3-red.log` |
| `vitest run --project test-tools-unit`（GREEN） | 0 | 158 用例；`/tmp/unit.log` |
| `vitest run --project integration`（GREEN，含新增 009 与 005 的 `digest-inputs-cli`） | 0 | 32 文件 / 83 用例；`/tmp/integration.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | `/tmp/checkfast.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:scenarios` | 1（409 问题，均归属后续任务） | `/tmp/gate.json` |

**方案与实际的差异**
- `testProjects[].config` 选择"在 Task 3 直接填好"（五项分别为 `packages/sdk/vitest.config.ts`、`packages/protocol/vitest.config.ts`、`packages/e2e/vitest.config.unit.ts`、`packages/e2e/vitest.config.integration.ts`、`packages/e2e/vitest.config.weapp.ts`），并设为 schema 必填，避免 Task 3 结束时门禁依赖可选字段。
- `packages[].consumedOperations` 在 Task 3 只落地 schema（product 角色专用，schema 用 `if/then/else` 拒绝非 product 填写；`validateManifest` 亦有同义语义校验），取值按 Task 10 的规划在 Task 10 登记模块路径后填写。
- `docs/template-guide.md` 第 93 行的替换点地图引用 `manifest.fingerprints.hostRoots`，`check:architecture` 的"清单字段必须存在于 schema"检查因此报 `unknown manifest field manifest.fingerprints.hostRoots`。Task 3 的 Files 未列该文件，但为让 `check:fast` 在同一任务内转绿，做了最小修订（改为 `manifest.fingerprints.sourceRoots`），完整修订仍属 Task 16。这是本任务对规划文件清单的偏离，仅涉及一处字段名。
- 受控临时根 helper 落在 `packages/e2e/tests/tooling/controlled-root.ts`；为满足 Task 3 起源码清单要求 git 工作区，`scenario-gate-helpers.ts` 的 `fixtureRoot()` 与 `scripts/lib/*.test.ts`、`scripts/check-coverage.test.ts` 已改用该 helper（Task 5 再把其余门禁自测统一收敛）。同时统一了 `idlDigest` → `protocolDigest` 的字段改名（Design 明确要求）。
- 覆盖率排除理由按硬性措辞登记："只在微信开发者工具宿主中执行，行为证据由 weapp 用例承担"；未使用"无法由 unit 加载"的表述——事实是 `weapp-host.test.ts` 会导入 runner，排除依据是执行宿主而非可加载性。
- 未自研通用能力：源码枚举用 `git ls-files -co --exclude-standard`（含未 `git add` 的新文件、尊重 `.gitignore`）；`buildInputs`/`protocolInputs` 直接复用 git pathspec 通配；覆盖率 include/exclude 由同一清单函数派生并同时供 `vitest.config.ts` 与 `check:coverage` 使用。

**覆盖率统计范围变化前后的文件差集（Review/Acceptance）**
- 旧有效范围（六个 glob 减去 `**/*.test.ts`、`**/*.d.ts`、生成代码）：49 个文件。
- 新有效范围（清单 `code` 类减去登记排除）：50 个文件。
- 差集：仅新增 `packages/e2e/src/vitest.d.ts`（`.d.ts` 不再被单独排除，按 code 类统计，无运行代码故天然 100%）；无移除文件。`packages/e2e/host/weapp/` 下 `setup.ts`、`vite.config.ts`、`protocol-runner.ts`、`example-runner.ts` 按登记排除，`host` 下 `app.js`、`pages/index/index.js` 继续计入并通过 100%。
- `packages/e2e/tests/` 下的 helper（`controlled-root.ts`、`helpers.ts`、`openspec-stub.ts`、`scenario-gate-helpers.ts`）被分类为 test，不进入覆盖率；`scripts/lib/source-inventory.test.ts`、`scripts/check-coverage.test.ts` 等 `*.test.ts` 同为 test。

**已接受的 Minor**
- Task 3（config 取值）：见上，Task 3 直接填好并设为必填。
- Task 3（排除理由措辞）：见上，使用硬性措辞，未写成"无法由 unit 加载"。

**weapp 重跑记录**：N/A（本任务不新增或改动 weapp 用例；`check:fast` 不含 weapp，weapp 证据在 Task 17/18 运行）。

**按需选择结果**：N/A（任务 9 才交付 `test:affected`）。

### Task 4 去除写死拓扑与通用规则反例

**Commit message**：`refactor(template): remove hard-coded topology from gates, configs and tooling tests`

**RED（预期失败的反例，已实际执行）**
- 写死扫描：把 HEAD 版本的 `.dependency-cruiser.cjs`、`eslint.config.js`、`vitest.config.ts`、`scripts/**`（非测试）与根 `package.json` 的 scripts 值物化到 `/tmp/t4-red`，用本任务新增的扫描口径（`/tmp/t4-red-scan.mjs`）比对清单登记的包目录/包名/项目名：命中 16 条（`.dependency-cruiser.cjs`、`eslint.config.js`、`vitest.config.ts` 各有 `packages/sdk`、`packages/protocol`；根 scripts 值含 `packages/sdk`、`@daqian/template-sdk`、`@daqian/template-protocol`、`sdk-unit`、`protocol-unit`、`test-tools-unit`、`weapp`）。HEAD 配置内的写死示例：`git show HEAD:.dependency-cruiser.cjs | grep -n 'packages/sdk'` → 第 30/39/46/65 行等。
- 规则随清单：HEAD 的 `.dependency-cruiser.cjs` 把 `^packages/sdk/src/` 等路径写死在配置里，副本改名后规则不再指向新目录 → SCN-TEMPLATE-ENGINEERING-007 的 `synthetic-renamed-manifest` 无证据可依。
- checkpoint 对账：HEAD 的 `SCN-TEMPLATE-EXAMPLE-008` 声明 4 个 checkpoint（`example-core-isolated`、`no-cross-domain-import`、`new-domain-guarded`、`restored-passes`），而 delta spec EX-008 只登记 `example-core-isolated`、`restored-passes` → 场景门禁按"binding references unknown checkpoint"报出；HEAD 的 `SCN-TEMPLATE-ENGINEERING-001` 的 `package-boundaries` 只有 `production-package-clean`、`source-and-graph-current`，缺 delta spec 新增的 `build-copy-by-manifest`。
- 共享配置的连带失败（实测）：依赖规则抽成 `scripts/lib/dependency-rules.cjs` 后，旧 `SCN-PROTOCOL-CONTRACT-004` 的临时副本未复制该共享模块与 `project.manifest.json`，`depcruise` 输出 `ERROR: Cannot find module './scripts/lib/dependency-rules.cjs'`（随后为 `ENOENT .../project.manifest.json`）而非 `shadow-engine-no-generated`，该用例退出码 1。

**GREEN**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 0（日志 `/tmp/checkfast.log`）：`format:check`、`lint`、`build`、`typecheck`、`check:architecture`、`test:unit`、`check:coverage`、`check:fixtures`、`test:integration`、`check:package` 全部通过。
- 写死扫描零命中：`SCN-TEMPLATE-ENGINEERING-005 no-hardcoded-topology` 用例在真实仓库上 `scanHardcodedTopology(repositoryRoot, manifest)` 返回 `[]`，并在受控临时根的正例探针上逐项命中目录名、包名、项目名，且根 scripts 键名不参与扫描（值里与 `requiredCommands` 同名的命令参数剥离后不判写死）。
- 改名副本逐条拦截：`SCN-TEMPLATE-ENGINEERING-007` 5 个集成用例全部通过，逐条"违规被拦截 + 恢复后整个依赖图通过"，并且全部证据来自"已删除模板示例"的受控副本。

**命令与退出码**
| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 写死扫描（HEAD 内容 + 新口径） | 命中 16 条（RED） | `/tmp/t4-red-scan.mjs`、`/tmp/t4-red/**` |
| `vitest run --project test-tools-unit packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts`（误用 unit 项目） | 1（`No test files found`） | 该文件属 integration 项目，改按 integration 运行 |
| `vitest run --project integration SCN-TEMPLATE-ENGINEERING-005.spec.ts` | 0 | 5 用例含 `no-hardcoded-topology` |
| `vitest run --project integration SCN-TEMPLATE-ENGINEERING-001.spec.ts` | 0 | 6 用例，`package-boundaries` 断言 14 次、含 `build-copy-by-manifest` |
| `vitest run --project integration SCN-TEMPLATE-EXAMPLE-008.spec.ts` | 0 | 1 用例，7 断言、2 checkpoint |
| `vitest run --project integration SCN-TEMPLATE-ENGINEERING-007.spec.ts` | 0 | 5 用例 |
| `vitest run --project integration SCN-PROTOCOL-CONTRACT-004.spec.ts`（修复副本缺失前） | 1 | `Cannot find module './scripts/lib/dependency-rules.cjs'` |
| `vitest run --project integration SCN-PROTOCOL-CONTRACT-004.spec.ts`（修复后） | 0 | 1 用例 |
| `pnpm typecheck`（首次） | 2 | ENG-005 `FixtureManifest` 与清单只读数组不兼容（2 处 TS2379） |
| `pnpm typecheck`（修正类型后） | 0 | 无输出 |
| `pnpm test:unit`（首次） | 1 | 分支覆盖率 99.92%，`scripts/check-architecture.ts:244` 的 `?? 1` 未覆盖 |
| `pnpm test:unit`（补"依赖工具不可执行"用例后） | 0 | 47 文件 / 307 用例；语句/分支/函数/行 100% |
| `pnpm test:integration`（修复 004 副本后） | 0 | 33 文件 / 88 用例 |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | `/tmp/checkfast.log` |

**报告路径**
- 单测覆盖率：`artifacts/local/coverage/`（`test:unit` 由 `run-by-manifest` 以 `--coverage` 运行）。
- 场景报告：`artifacts/local/reports/*.json`（`VERIFY_RUN_ID` 未设置时落到 `local`；本任务未跑 weapp）。

**方案与实际的差异**
- 依赖与 lint 规则的唯一来源落在 `scripts/lib/dependency-rules.cjs`（CJS，供 `.dependency-cruiser.cjs`、`eslint.config.js` 与门禁自测共同 `require`）；`.dependency-cruiser.cjs` 与 `eslint.config.js` 都从 `process.cwd()` 读清单，副本因此指向副本自身。配置里原本带包路径字面量的注释已改为"产品包 AGENTS.md"等无字面量表述，以满足写死扫描。
- `check-architecture.ts` 新增 `cruiseArguments(root, manifest)` 与内部 `runCruise`；`check:architecture` 改为只调用该脚本（`tsx scripts/check-architecture.ts` 不再带 `--dependency-exit-code`）。
- `run-by-manifest.ts` 按清单组装命令：`build`（protocol 先于 product）、`typecheck`（两个 `tsconfig.build.json` + 根 `tsconfig.test.json`、`tsconfig.tools.json`）、`test:unit`（全部 unit 项目一次运行并开覆盖率）、`test:integration`、`test:e2e:<name>`；根 `package.json` 的 5 个脚本值改为 `tsx scripts/run-by-manifest.ts <命令名>`；`vitest.config.ts` 的 `projects` 由 `testProjects[].config` 组装。
- `define-case.ts` 的 `environment` 收窄为 `string` 并按清单运行时校验（只接受 integration/platform 类项目），上下文新增 `environmentClass`；沿用现有 `defineCase`，未引入第二个 runner。
- `SCN-TEMPLATE-EXAMPLE-008` 只保留示例自身分层检查（core 导入 generated、`wx` 全局、Node 内置），并把"跨模块导入""新增模块无需改配置即受约束"两个 checkpoint 完整移交 `SCN-TEMPLATE-ENGINEERING-007`（EX-05 已声明这两项由 ENG-02 承担）。
- `SCN-PROTOCOL-CONTRACT-004` 的受控副本新增复制 `project.manifest.json` 与 `scripts/lib/dependency-rules.cjs`；这是共享配置的必然连带修改，未改动该用例的断言语义。

**已接受的 Minor**
- Task 4（EX-008 受控副本用最小 helper）：`packages/e2e/tests/tooling/repository-copy.ts` 提供 `buildCopyInputs`/`createBuildCopy`，ENG-001、EX-008、ENG-007 使用；Task 5 再统一收敛到仓库副本 helper（含 `git ls-files -co` 复制、`pnpm install --offline`、realpath 断言、`TEMPLATE_COPY` 守卫）。
- Task 4（写死扫描口径）：扫描根 `package.json` 的 scripts **值**（不扫键名），先把与 `requiredCommands` 同名的命令词元剥掉，再按独立词元匹配项目名；探针用例里 `tsx run.ts test:e2e:<platform>` 不判写死。

**优先采用现成方案**
- 依赖规则沿用 dependency-cruiser 的原生规则结构（`from`/`to` + 正则 + 捕获组 `$1`），未自研图算法；ESLint 平台全局禁令用内置 `no-restricted-globals`；副本依赖用符号链接而非重装；源码/构建输入枚举复用 Task 3 的 `git ls-files -co --exclude-standard`。无自研通用基建。

**weapp 重跑记录**：N/A（本任务不改动 weapp 用例，`check:fast` 不含 weapp；weapp 证据在 Task 17/18 运行）。

**按需选择结果**：N/A（任务 9 才交付 `test:affected`；本任务 `test:integration` 全量运行）。

### Task 5 门禁自测隔离

**Commit message**：`test(template): isolate gate self-tests from live repository state`

**RED（预期失败的反例，已实际执行）**
- 用本任务新增的 `createRepositoryCopy()` 建立隔离副本（作用域 `template-core-hardening`，测试后已清理）：删除全部 FLOW 登记（主 Spec 与 active delta 的 FLOW 行 + `git rm` 对应 `FLOW-*` Fixture），并新增一个缺 verification 元数据块的 active Change `zz-isolation-probe`。
- 把 HEAD（改造前）版本的 `scripts/check-scenarios.test.ts` 放回该副本运行 `pnpm test:unit`：退出码 **1**，失败点 `scripts/check-scenarios.test.ts:467`——`AssertionError: expected { output: { …(4) }, exitCode: 1 } to match object { exitCode: 1, output: { …(3) } }`，差异为 `- "contracts": Any<Array>`（改造前用例把副本实时状态（FLOW/contracts 缺失）当成期望输入，且用恒真断言）。日志 `/tmp/task5-red-unit.log`。
- 同一副本换成迁移后的 `scripts/check-scenarios.test.ts` 再跑 `pnpm test:unit`：退出码 **0**，语句/分支/函数/行 100%。日志 `/tmp/task5-green-unit.log`。

**GREEN**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 **0**（日志 `/tmp/task5-checkfast.log`）：`format:check`、`lint`、`build`、`typecheck`、`check:architecture`、`test:unit`、`check:coverage`、`check:fixtures`、`test:integration`、`check:package` 全通过。
- `pnpm test:unit`：47 文件 / 309 用例；`Statements 100% (2120/2120)`、`Branches 100% (1373/1373)`、`Functions 100% (398/398)`、`Lines 100% (1876/1876)`。
- `pnpm test:integration`：34 文件 / 89 用例，含新增 `SCN-SCENARIO-GATE-026 self-test-isolation-cli`（39.3s，副本内安装/构建/多次运行）。
- 门禁自测的恒真断言已清零：`git grep -n "expect.any" -- scripts packages/e2e` 仅剩 `packages/e2e/src/bootstrap.test.ts:22` 的 `expect.any(Function)`（函数身份断言，非门禁结果断言）与新 Fixture 的 `forbiddenAssertions` 字面量。

**命令与退出码**
| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 副本探针 + HEAD `check-scenarios.test.ts`：`pnpm test:unit` | 1（RED） | `/tmp/task5-red-unit.log`（失败于 `scripts/check-scenarios.test.ts:467`） |
| 同一副本 + 迁移后 `check-scenarios.test.ts`：`pnpm test:unit` | 0（GREEN） | `/tmp/task5-green-unit.log`（100% 覆盖率） |
| `pnpm build` | 0 | `/tmp/task5-build.log` |
| `pnpm typecheck` | 0 | `/tmp/task5-typecheck.log` |
| `pnpm test:unit` | 0 | 47 文件 / 309 用例，100% 覆盖率 |
| `pnpm test:integration` | 0 | 34 文件 / 89 用例（含 GATE-026，39.3s） |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | `/tmp/task5-checkfast.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:scenarios --inventory` | 1（inventory 语义：存在问题） | `/tmp/task5-inventory.json`，395 条，全部归属后续任务（见下） |

**报告路径**
- 单测覆盖率：`artifacts/local/coverage/`；集成报告：`artifacts/local/reports/*.json`（`VERIFY_RUN_ID` 未设置时落到 `local`）。
- weapp 报告：本任务未运行（见下）。

**场景门禁剩余问题归属（395 条）**
- 381 条 `missing binding for <project>`：分别为 test-tools-unit / integration / weapp 尚未登记的绑定，逐条对应当前或后续 Task 创建/迁移的 case（Task 6–7 的 fixture/绑定改造、Task 10–13 的协议与示例解耦、Task 14–17 的规模/地图/文档/示例用例）。
- 13 条 `checkpoint did not execute`（`integration/*`、`test-tools-unit/*`）：属尚未交付的 checkpoint，由后续 Task 的用例补齐。
- 1 条 `FLOW-TEMPLATE-EXAMPLE-001/normal: missing FLOW binding for weapp`：weapp 绑定在 Task 17/18 的 weapp 运行中产生。
- 无"无法归属后续任务"的回归项。本任务新增的 `SCN-SCENARIO-GATE-026`（单元证据 `self-test-isolation-rules` 与集成 case `self-test-isolation-cli`）绑定均已登记。

**Review / Acceptance：改造前依赖实时状态的用例清单与改造方式**
- **门禁逻辑自测 → 改为受控临时根（不读仓库实时状态）**
  - `scripts/check-scenarios.test.ts`：`writeProjectManifest` 改用 `minimalManifest()`；`runs both controlled-input and live-inventory CLI composition paths` 的 live-inventory 分支改在 `createControlledRoot`（注入仓库清单 + `enableInventory`）上运行，断言由 `expect.any(Array)` 换成具体的 `issues`/`scenarios`/`flows`/`contracts` 值；新增 `falls back to the real openspec CLI when no command is injected` 覆盖 `defaultScenarioCommand`（恢复该文件的分支覆盖率到 100%）。
  - `scripts/lib/scenario-gate.evidence.test.ts`：`temporaryRoot` 改用 `createControlledRoot`（清单作为契约输入从真实仓库读入）；`missing-specs-dir` 反例先删除受控根的 `openspec/specs`；新增 `SCN-SCENARIO-GATE-026 self-test-isolation-rules` 证据（受控临时根 / FLOW 分支由测试输入提供 / 副本内固定版本 OpenSpec CLI 核验）。
  - `scripts/check-package.test.ts`：`runPackageCli` 的 `process.cwd()` 改用受控根（补齐测试包 `package.json`）。
  - 新增 `packages/e2e/tests/tooling/SCN-SCENARIO-GATE-026.spec.ts`：整个 case 在仓库副本内运行（删 FLOW、加缺陷 Change、跑 build/unit/integration/事实核验）。
- **模板自身事实核验 → 保留只读真实仓库，去掉对调用方工作目录的依赖（`repositoryRoot` 由模块位置推导）**
  - `scripts/lib/dependency-rules.test.ts`、`scripts/lib/project-manifest.test.ts`、`scripts/lib/schema-docs.test.ts`：读取真实仓库的清单 / 根 `package.json` / schema 与 AGENTS 文档（模板对外契约）。
  - `scripts/lib/contract-inventory.test.ts`：读取真实仓库已提交的 `packages/protocol/src/generated` 产物。
  - `packages/e2e/tests/tooling/helpers.ts`、`scenario-gate-helpers.ts`：导出模块位置推导的 `repositoryRoot`；`runScenarioCli` 与 `enableInventory`（从根清单读协议目录）不再用 `process.cwd()`。
  - tooling 用例 `SCN-SCENARIO-GATE-008`、`SCN-TEMPLATE-ENGINEERING-002/005/006/007/009`、`SCN-TEMPLATE-EXAMPLE-007/008`、`SCN-PROTOCOL-CONTRACT-004`：`const repositoryRoot = process.cwd()` 改为从 `helpers.ts` 导入。
  - 这些事实核验用例均按模块相对路径/真实仓库读取，不消费 Spec 来源，因此无需 `--change` 作用域；GATE-026 的 `fact-checks-scoped` checkpoint 在一个存在无关缺陷 active Change 的副本中运行它们并断言通过，证明结论不受无关 active Change 影响。
- **仍保留 `process.cwd()` 的非测试默认参数**（不在任务 Files 的 `git grep` 范围内，函数签名默认值，由调用方显式传根）：`scripts/check-*.ts`、`scripts/lib/spec-inventory.ts`、`scripts/run-by-manifest.ts`、`scripts/sdk-release.ts`。
- **残留（非门禁自测）**：`packages/e2e/src/cases/define-case.test.ts:57` 的 `process.cwd()`（单测 `environmentClassOf` 默认根；不在任务限定的 grep 范围 `scripts packages/e2e/tests/tooling` 内，随副本运行也成立）。

**方案与实际的差异**
- 排除项落在 `packages/e2e/vitest.config.integration.ts` 而非根 `vitest.config.ts`：实测根 `vitest.config.ts` 的 `test.exclude` 不作用于 `projects` 中的子项目，只有项目自身 config 的 `exclude` 生效；任务意图（`TEMPLATE_COPY` 存在时不运行会创建副本的用例）不变。
- 排除清单除任务点名的 `SCN-TEMPLATE-ENGINEERING-001`、`SCN-SCENARIO-GATE-026` 外，还含 `SCN-TEMPLATE-ENGINEERING-007`、`SCN-TEMPLATE-EXAMPLE-008`：二者经 Task 4 的 `createBuildCopy` 也会创建副本，受同一"会创建副本的用例"规则覆盖；`SCN-TEMPLATE-ENGINEERING-008` 按计划留待 Task 17 加入。
- `createRepositoryCopy` 的 `copyEnvironment()` 额外剔除 `VERIFY_REPORT_FILE`、`VERIFY_RUN_ID`：副本内运行若继承调用方的报告路径会覆盖外层报告。
- `process.cwd()` 的隔离未给 `check-scenarios.ts` 增加作用域参数，而是统一为"显式 root + `enableInventory`"，与 Task 7 的 `--change` 作用域正交。
- 未改任何已有用例的断言语义：仅替换输入来源（临时根/模块根）与恒真断言为具体断言。

**优先采用现成方案**
- 复用 Task 3 的 `git ls-files -co --exclude-standard` 枚举复制输入、Task 4 的最小副本 helper 收敛为仓库副本 helper；副本依赖用 `pnpm install --offline --frozen-lockfile` 从本机 pnpm store 安装（不链接原仓库 `node_modules`）；归档用任务 1 固定版本的 OpenSpec CLI（`openspec archive -y`），未自研归档实现。无自研通用基建。

**weapp 重跑记录**：N/A（本任务不改动 weapp 用例，`check:fast` 不含 weapp）。

**按需选择结果**：N/A（任务 9 才交付 `test:affected`；本任务 `test:integration` 全量运行）。


### Task 6 Fixture 来源模型改为 ID + Requirement 块摘要

**Commit message**：`feat(template): bind fixtures to requirement digests instead of spec paths`

**RED（预期失败的反例，已实际执行）**
- 临时还原 HEAD 旧实现：`git stash push -- scripts/check-fixtures.ts packages/e2e/tests/fixtures/fixture.schema.json`（保留 Task 6 的 `spec-sources.ts`，使新用例可加载 helper），随后运行 6 个新用例：
  `VERIFY_REPORT_FILE=artifacts/t6-red/reports/integration.json node_modules/.bin/vitest run --project integration packages/e2e/tests/tooling/SCN-SCENARIO-GATE-01{2,3,4,5,7,8}.spec.ts`
  退出码 **1**，`6 failed | 1 passed (7)`，日志 `/tmp/t6-red-integration.log`；失败点：
  - 012 `fixture-source-cli` / `fixture-missing-owner-cli`、014、017、018：`AssertionError: expected +0 to be 1`（旧实现不按摘要校验、不识别 `--change`，过期/歧义/非法参数一律返回 0）。
  - 013 `fixture-refresh-cli`：`AssertionError: expected '' to contain 'SCN-SAMPLE-CONTRACT-002: 来源摘要过期'`（旧实现无 `fixtures:refresh` CLI，输出为空）。
  - 015 `archive-digest-stability` 在旧实现下**通过**：旧实现根本不校验 Requirement 摘要，因此该 Scenario 的红灯由 012/013 的摘要绑定承担；015 只证明“归档前后摘要稳定 + 不改 Fixture”在真实 CLI 下成立。
- 新 schema 的反例（与 012 `path-field-rejected` 同一断言）：`sources.spec` 仍写 `path` 或缺 `requirementDigest` 的 manifest 被报 `manifest schema`，退出码 1；旧实现（`additionalProperties: true`、无来源校验）不报。
- 执行后 `git stash pop` 恢复，工作区无残留（`git stash list` 为空）。

**GREEN**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 **0**，日志 `/tmp/t6-checkfast7.log`：`format:check`、`lint`、`build`、`typecheck`、`check:architecture`、`test:unit`、`check:coverage`、`check:fixtures`、`test:integration`、`check:package` 全通过。
- `pnpm test:unit`：47 文件 / 317 用例；`Statements 100% (2247/2247)`、`Branches 100% (1453/1453)`、`Functions 100% (417/417)`、`Lines 100% (1989/1989)`。
- `pnpm test:integration`：40 文件 / 96 用例全通过（含 6 个新用例）。
- `pnpm check:fixtures`（不带作用域）与 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fixtures` 均 `{"manifests":17,"issues":[]}`；`pnpm check:fixtures --change template-core-hardening` 同样 17/0。
- 15 个任务内 Fixture 的迁移：`node_modules/.bin/tsx scripts/fixtures-refresh.ts <17 owners>` 输出 `updated: 17, issues: []`；迁移后 17 个 manifest 的 `sources.spec` 键集合恰为 `{requirementDigest}`（Python 逐文件核对），无 `path`。

**命令与退出码**
| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 旧实现 + 6 新用例：`vitest run --project integration ...` | 1（RED） | `/tmp/t6-red-integration.log`（6 failed / 1 passed） |
| `pnpm test:unit` | 0 | 47 文件 / 317 用例，100% 覆盖率 |
| `pnpm test:integration` | 0 | 40 文件 / 96 用例 |
| `pnpm check:fixtures`（无作用域） | 0 | `{"manifests":17,"issues":[]}` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fixtures` | 0 | `{"manifests":17,"issues":[]}` |
| `pnpm check:fixtures --change template-core-hardening` | 0 | `{"manifests":17,"issues":[]}` |
| `pnpm typecheck` | 0（首次 2，见下） | `/tmp/t6-typecheck3.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | `/tmp/t6-checkfast7.log` |
| `pnpm check:scenarios --change template-core-hardening` | 1（覆盖门禁语义：仍缺后续任务绑定） | `/tmp/t6-scenarios.json`，383 条（见下） |
| `node_modules/.bin/tsx scripts/fixtures-refresh.ts <17 owners>` | 0 | `updated: 17 / issues: []` |

**报告路径**
- 单测覆盖率：`artifacts/local/coverage/`；集成报告 `artifacts/local/reports/{unit,integration}.json`（`VERIFY_RUN_ID` 未设置时落 `local`）；本任务新用例的临时报告 `artifacts/t6-new/`、RED 报告 `artifacts/t6-red/`。
- weapp 报告：本任务未运行（见下）。

**真实归档结果（Review / Acceptance）**
- 受控临时副本（`openspec: 'real'`，固定版本 `@fission-ai/openspec` 1.6.0）中，主 Spec 有一个 MODIFIED Requirement 与一个 ADDED Requirement，两者下各有 Fixture；归档前 `check:fixtures --change zz-archive` 退出 0。
- `openspec archive zz-archive -y` 退出 0，stdout：`+ 1 added / ~ 1 modified / Specs updated successfully / Change 'zz-archive' archived as '2026-10-09-zz-archive'`。
- 归档后不改动任何 Fixture（manifest 文本逐字节相同），`check:fixtures`（不带作用域）退出 0；规范化摘要在 delta 与归档后主 Spec 之间相同：
  - MODIFIED（`SCN-SAMPLE-CONTRACT-001`）：`33dc7fe34c4703db7f250a28a594dc0fbab0eace23fd6ee29b17e9d3f5b8c436`（归档前 = 归档后）。
  - ADDED（`SCN-SAMPLE-CONTRACT-003`）：`cbcd30b4431ce213a8b9ef7637b611eef6dc516b580a9258e82a93ea2ffb08eb`（归档前 = 归档后）。
  - 与规划阶段实验结论一致（`/tmp/t6-015-probe.mts` 复现输出）。

**场景门禁剩余问题归属（383 条）**
- 369 条 `missing binding for <project>`：Task 7、10–17 尚未登记的 case（协议义务、示例、文档、规模用例等）。
- 13 条 `checkpoint did not execute`：属 Task 7（`inventory-cli`、`protocol-matrix`）与协议/示例任务的 checkpoint（`derivation-rules` 的 8 个、`sdk-does-not-reexport-network`、`missing-comment-rejected` 的 2 个）。
- 1 条 `FLOW-TEMPLATE-EXAMPLE-001/normal: missing FLOW binding for weapp`：weapp 绑定在 Task 17/18 的运行中产生。
- 本任务 6 个 Scenario 侧除 `SCN-SCENARIO-GATE-017/change-scope-scenarios-cli`（Task 7 的 `check:scenarios` 部分）外，012/013/014/015/018 与 017 的 `change-scope-fixtures-cli` 均已 0 问题。无“无法归属后续 Task”的回归项。

**方案与实际的差异**
- Fixture 迁移用 `pnpm fixtures:refresh` 生成，输出统一为 2 空格缩进 JSON：原 pretty 文件只有 `sources.spec` 2 行变化；原单行 JSON 的 7 个 manifest 被规整为 pretty（合计 `17 files, +135/-26`）。逐键核对确认只丢 `sources.spec.path/sha256`、加 `requirementDigest`，其余来源（`idlFiles`、`gateway`、`commonSdk`、`extraction`、`generatedCompatibility`、`provenance` 等）无变化。
- 非法作用域时 `check:fixtures` / `fixtures:refresh` 返回不含 `manifests`/`updated`（不输出覆盖结论、不退化为全量运行）；单测与 018 用例以 `not.toHaveProperty('manifests')` 与“过期摘要不得出现”断言该行为。
- `spec-sources.ts` 的 `readEffectiveSpecs` 保留原签名（内容改为 Requirement 块），既有消费者无需改动；新增 `projectEffectiveSpecs`/`findOwnerRequirement`/`resolveChangeScope` 供 `check:fixtures`（本任务）与 `check:scenarios`（Task 7）共用。
- Task 6 的 6 个 tooling 用例复用既有 `cliEvidence`（与 GATE-011 一致），未在仓库登记 Fixture 目录：用例在受控临时根内自建 Fixture；`Files` 中的“及 Fixture”由新的 `fixture-gate-helpers.ts` 承担。
- 修复一处跨用例污染：`runFixtureCli`/`runRefreshCli` 原先继承调用方的 `SCENARIO_GATE_CHANGES`（`check:fast` 带作用域时，受控根读到 `template-core-hardening` 并报“不存在于 active 目录”），现从子进程环境中剔除该变量，仅在用例显式传入时生效。
- 013 的 `refresh-rejects-invalid` 中，对“无 Fixture 目录的 owner”`refresh` 会先报“没有对应的 Fixture 目录”，两处证据都用“有目录但 owner 不在有效 Spec / 存在歧义”覆盖，规则一致（非零退出且不写入）。
- 首次 `pnpm typecheck` 暴露 5 处 `exactOptionalPropertyTypes` / `MatcherState` 类型错误（`changes: undefined` 可选属性、测试里误用 `getState().assertions`），已按类型修正，未改语义。

**weapp 重跑记录**：N/A（本任务不改动 weapp 用例，`check:fast` 不含 weapp）。
- 附带观察（非本任务回归）：`SCN-TEMPLATE-EXAMPLE-005 window-and-timeout` 在一次 `check:fast` 全量运行中因真实计时抖动失败（`expected 1 to be greater than or equal to 2`，日志 `/tmp/t6-checkfast6.log`），单跑与随后全量均通过（`/tmp/t6-rerun-005.log`）。

**按需选择结果**：N/A（任务 9 才交付 `test:affected`；本任务按 `check:fast` 全量运行）。
**OI-CH-02 统计**：本任务无“按需通过、全量失败”记录（上一条为不计入 OI-CH-02 的既有计时抖动，全量与单跑一致通过）。

**优先采用现成方案**
- Requirement 块定位/规范化复用既有 `remark-parse`/`remark-gfm`/`unified`（FLOW 表）与 `node:crypto` sha256；归档用固定版本官方 OpenSpec CLI（`openspec archive -y`），未自研归档；CLI 运行用仓库既有 `tsx`；无新增依赖、无自研通用基建。
- 摘要来源与作用域解析直接在 `spec-sources.ts` 内实现（唯一自研点），因为任务契约要求 `check:fixtures` 与 Task 7 的 `check:scenarios` 共用同一套“有效来源合并 + 作用域”语义；已用受控根与真实归档双向验证。

### Task 7 checkpoint 双向对账与 Change 作用域

**Commit message**：`feat(template): reconcile checkpoints both ways and scope the gate by change`

**RED（预期失败的反例，已实际执行）**
- `git stash push -- scripts/check-scenarios.ts`（保留 Task 6 已提交的 `spec-sources.ts` 作用域 API，使新用例可加载 helper），随后运行新增/改动的用例：
  - 集成：`node_modules/.bin/vitest run --project integration SCN-SCENARIO-GATE-016.spec.ts 017.spec.ts 018.spec.ts 019.spec.ts 003.spec.ts`，退出码 **1**，`6 failed | 2 passed (8)`，日志 `/tmp/t7-red-int.log`：016 三个 case（未登记 checkpoint 仍通过）、017 `change-scope-scenarios-cli`（`--change`/`SCENARIO_GATE_CHANGES` 不识别）、018 `change-arg-cli` 的 scenarios 断言、019 `unscoped-format-cli` 全失败；003 `active-change-cli` 与 017 `change-scope-fixtures-cli`（Task 6 已交付）通过，证明 RED 只打在本次新增能力上。
  - 单测：`vitest run --project test-tools-unit scripts/check-scenarios.test.ts`，退出码 **1**，`3 failed | 19 passed (22)`，日志 `/tmp/t7-red-unit.log`：`prints help, rejects illegal change scope, and scopes the inventory`（旧实现不识别 `--help`/`--change`）、`SCN-SCENARIO-GATE-016 reverse-checkpoint-rules`、`SCN-SCENARIO-GATE-019 unscoped-format-rules`。
- 执行后 `git stash pop` 恢复，`git stash list` 为空。

**GREEN**
- `pnpm typecheck` 退出 0；`pnpm test:unit` 47 文件 / 320 用例，`Statements/Branches/Functions/Lines` 均 100%。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:integration` 连续 **2 次**退出 0（42 文件 / 101 用例），日志 `/tmp/t7-integration-runA.log`、`/tmp/t7-integration-runB.log`。
- `pnpm check:scenarios --change template-core-hardening` 从 383 条降到 **376 条**，且**没有**任何「未登记的 checkpoint」：现仓库协议矩阵用例（同时 cover `SCN-PROTOCOL-CONTRACT-002` 与全部派生协议义务）不被误报。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出 0，日志 `/tmp/t7-checkfast.log`。

**命令与退出码**
| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 旧实现 + 6 新集成用例（RED） | 1 | `/tmp/t7-red-int.log`（6 failed / 2 passed） |
| 旧实现 + 3 新单测（RED） | 1 | `/tmp/t7-red-unit.log`（3 failed / 19 passed） |
| `pnpm typecheck` | 0 | `/tmp/t7-typecheck2.log` |
| `pnpm test:unit` | 0 | 47 文件 / 320 用例，100% 覆盖率（`/tmp/t7-unit-full4.log`） |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:integration`（第 1 次） | 0 | 42 文件 / 101 用例，`/tmp/t7-integration-runA.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:integration`（第 2 次） | 0 | 42 文件 / 101 用例，`/tmp/t7-integration-runB.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:scenarios --change template-core-hardening` | 1（覆盖门禁语义：仍缺后续任务绑定） | 376 条（见下），`/tmp/t7-scenarios.json` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | `/tmp/t7-checkfast.log` |

**报告路径**：单测覆盖率 `artifacts/local/coverage/`；集成报告 `artifacts/local/reports/{unit,integration}.json`；RED/GREEN 期间的临时日志在 `/tmp/t7-*.log`、`/tmp/t7-scenarios.json`。

**场景门禁剩余问题归属（376 条）**
- 362 条 `missing binding for <project>`：Task 10–17 尚未登记的 case（协议义务、示例、文档、规模用例等）。
- 13 条 `checkpoint did not execute`，全部属于本任务之外的 Scenario：`SCN-PROTOCOL-CONTRACT-001/derivation-rules`（8）、`SCN-PROTOCOL-CONTRACT-002/protocol-matrix`（2）、`SCN-TEMPLATE-ENGINEERING-001/sdk-does-not-reexport-network`（1）、`SCN-TEMPLATE-ENGINEERING-00x/missing-comment-rejected`（2）→ Task 10/14/15/16 与协议义务用例。
- 1 条 `FLOW-TEMPLATE-EXAMPLE-001/normal: missing FLOW binding for weapp`：weapp 绑定在 Task 17/18 的运行中产生。
- 本任务的 GATE-11/12 相关 Scenario（016 的 4 个 case、017 `change-scope-scenarios-cli`、018/019）已 0 问题；003/004/007 回归通过。

**Review / Acceptance：现仓库在反向检查下的结果**
- 现仓库全部绑定在执行集合上都落在「该绑定全部 cover 的登记集合」内，未登记的 checkpoint 为 0 条，无需补登记或删断言。
- 多 cover 绑定（协议矩阵用例同时 cover 一个 Scenario 与上百条协议义务）以绑定为单位对账，执行集合恰为各 cover checks 的并集，未被误报（集成 016 `multi-cover-binding-cli` + 单测 `binding-union-ledger` 双向佐证）。

**方案与实际的差异**
- **已授权的偏离（涉及 Task 7 Files 之外的文件）**：`scripts/lib/project-manifest.test.ts` 的 `evidence` 包装增加显式 `timeout: 30_000`。原因：`SCN-SCENARIO-GATE-026` 在仓库副本内跑 `pnpm test:unit`，副本内 `SCN-TEMPLATE-ENGINEERING-005 manifest-rules` 在 HEAD 时已用 4651ms（默认 5s 预算的 93%），Task 7 新增的必需用例负载把它推到 5020–5710ms 超时；本分支 `test:integration` 全量因此连续 5 次红，而 HEAD 状态连续 2 次全绿（40 文件/96 用例）、GATE-026 单独跑本分支 39.3s vs HEAD 33.3s。用户裁决选 A：只加超时，不改断言与语义；本行即登记。
- 同类处理（在 Task 7 Files 内，无需额外授权）：`scripts/check-scenarios.test.ts` 的两个 spawn/重负载用例补 `30_000` 显式超时（`runs both controlled-input and live-inventory CLI composition paths`、`prints help, rejects illegal change scope, and scopes the inventory`），与仓库既有 `cliEvidence`（30s）和 `SCN-SCENARIO-GATE-026`（300s）的约定一致。
- 为把副本内负载压回 HEAD 水位：单测 `SCN-SCENARIO-GATE-016 reverse-checkpoint-rules` 改为进程内调用 `evaluateCoverage`（module 类证据的正确粒度），CLI 路径由集成用例 016 的三个 case 承担；集成 016 内复用同一输入的运行结果，不再重复 spawn `tsx`。
- `check:scenarios` 的作用域实现沿用 Task 6 的 `resolveChangeScope`/`changeScopeHelp`：作用域只收窄覆盖清单（`scopedEffective`/`scopedInventory` 的 `other` 桶），GATE-01/02/05/06 的格式桶（id/flow/verification）始终取全量来源，满足 GATE-12「格式前置检查不受作用域影响」；非法作用域在 precheck 之前短路，`--inventory` 同时出现时也只回 `{mode:'inventory', issues}`，不输出覆盖结论。
- 反向对账取 `evaluateCoverage` 的绑定台账（key=`<environment>/<caseId>`）：Scenario/FLOW 用有效 Spec 声明的 `checks`，协议义务 cover 用 `<义务 ID>/<case>`；报告中的 `checkpoints` 不在台账内即报「未登记的 checkpoint：<file> 的绑定 <project>/<caseId> 执行了 <checkpoint>」。
- `SCN-SCENARIO-GATE-003` 相关用例未改动：GATE-03 的文字只在末尾追加了作用域默认语义说明，`SCN-SCENARIO-GATE-003` 的 case 与 checks 未变，003 的 module/CLI 证据在改动前后均通过（回归验证）。
- 受控根/替身 `env` 统一 `delete env.SCENARIO_GATE_CHANGES`，避免外层作用域泄漏到受控根；`runGate` 增加第 4 个 `environment` 参数与 `help` 输出字段，供 017/018 显式注入作用域与断言帮助文本。

**weapp 重跑记录**：N/A（本任务不改动 weapp 用例，`check:fast` 不含 weapp；weapp 证据在 Task 17/18 运行）。

**按需选择结果**：N/A（`test:affected` 由任务 9 交付；本任务按 `test:integration` 全量运行）。

**OI-CH-02 统计**：本任务无“按需通过、全量失败”记录（按需入口尚未交付）。附记：默认 5s 超时造成的全量抖动不属 OI-CH-02，见上「方案与实际的差异」第 1 条。

**优先采用现成方案**
- 反向对账直接复用 `evaluateCoverage` 已有的「cover → ScenarioCase/协议义务」索引，不新建登记表或校验器。
- 作用域解析与帮助文本复用 Task 6 的 `spec-sources.ts`（`parseChangeArguments`/`resolveChangeScope`/`changeScopeHelp`），`check:scenarios` 只做接入，未自研第二套参数解析。
- 集成用例的受控根、OpenSpec 替身、清单复制、`enableInventory` 全部复用 Task 3–6 的 helper（`createControlledRoot`/`scenario-gate-helpers`/`controlled-root`），未新增框架。

### Task 8 统一验收入口与过期说明

**Commit message**：`feat(template): add a single verify entry and explain stale reports`

**RED（预期失败的反例，已实际执行）**
- 先落地 `SCN-SCENARIO-GATE-023/024/025.spec.ts` 与 Fixture，再运行 `node_modules/.bin/vitest run --project integration SCN-SCENARIO-GATE-023.spec.ts SCN-SCENARIO-GATE-024.spec.ts SCN-SCENARIO-GATE-025.spec.ts`，退出码 **1**，`3 failed (3)`，日志 `/tmp/t8-red.log`：
  - 023 `verify-run-cli`：入口不存在，默认 run id 读到空串（`expected '' to match /^feat-scope-\d{8}T\d{6}Z$/`）；
  - 024 `verify-resume-cli`：没有任何步骤被调用（`expected [] to deeply equal ['check:fast', …]`）；
  - 025 `stale-explanation-cli`：过期信息只有 `integration/normal is stale` 与 `integration/normal FLOW evidence is stale` 两句，不含期望/实际 run id、摘要类别与变化文件。

**GREEN**
- `pnpm typecheck` 退出 0；`pnpm test:unit` 48 文件 / 327 用例，`Statements/Branches/Functions/Lines` 均 100%；`pnpm format:check`、`pnpm lint` 退出 0。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:integration` 连续 **2 次**退出 0（45 文件 / 104 用例），日志 `/tmp/t8-integration.log`、`/tmp/t8-integration-runB.log`。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出 0，日志 `/tmp/t8-checkfast.log`。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 新集成用例 + 旧实现（RED） | 1 | `/tmp/t8-red.log`（3 failed / 0 passed） |
| `pnpm typecheck` | 0 | `/tmp/t8-typecheck3.log` |
| `pnpm test:unit` | 0 | 48 文件 / 327 用例，100% 覆盖率（`/tmp/t8-unit-final.log`） |
| `pnpm format:check` / `pnpm lint` | 0 | `/tmp/t8-format3.log`、`/tmp/t8-lint3.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:integration`（第 1 次） | 0 | 45 文件 / 104 用例，`/tmp/t8-integration.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:integration`（第 2 次） | 0 | 45 文件 / 104 用例，`/tmp/t8-integration-runB.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | `/tmp/t8-checkfast.log` |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t8` | 1（第 3 步按预期归属后续任务，见下） | `/tmp/t8-verify-final.log` |
| 过期说明反例：改一个源码文件后 `pnpm check:scenarios --change template-core-hardening` | 1 | `/tmp/t8-scenarios-stale.log`（459 条过期说明，全部列出该文件） |

**报告路径**
- `pnpm verify` 产物：`artifacts/core-hardening-t8/reports/unit.json`、`integration.json`，以及 perFile 项目目录 `artifacts/core-hardening-t8/reports/weapp/` 下的 4 份文件（`SCN-PROTOCOL-CONTRACT-002.json`、`FLOW-TEMPLATE-EXAMPLE-001.json`、`SCN-TEMPLATE-EXAMPLE-002.json`、`SCN-TEMPLATE-EXAMPLE-004.json`）；覆盖率在 `artifacts/core-hardening-t8/coverage/`。
- 单测覆盖率报告沿用 `artifacts/local/coverage/`（直接 `pnpm test:unit` 时）。

**Task 8 Verification：`pnpm verify --change template-core-hardening --run-id core-hardening-t8`**
- 第 1 步 `check:fast` 退出码 **0**（80945ms，含 48 文件 / 327 单测与 45 文件 / 104 集成用例）。
- 第 2 步 `test:e2e:weapp` 退出码 **0**（170642ms，逐文件 4 个），见「weapp 重跑记录」。
- 第 3 步 `check:scenarios` 退出码 **1**（1360ms）：共 **53** 条问题，`未登记的 checkpoint` 0 条、`过期报告` 0 条，全部可按「共同完成条件 4」归属后续任务：

| 归属 | 条数 | 具体 |
| --- | --- | --- |
| Task 9 | 7 | `SCN-SCENARIO-GATE-020/full-trigger-rules`、`020/full-trigger-cli`、`021/affected-selection-rules`、`021/affected-spec-fixture-cli`、`021/affected-code-cli`、`022/partial-report-rules`、`022/partial-report-cli` 的 missing binding |
| Task 10 | 22 | `SCN-PROTOCOL-CONTRACT-001/non-trade-method-cli` 与 `test-tools-unit/derivation-rules`（8）、`002/declared-routes` 与 `integration|weapp/protocol-matrix`（5）、`005/call-scan-rules`、`005/declaration-gate-cli`（2）、`SCN-TEMPLATE-ENGINEERING-003/entry-discovery-rules` 与 `integration/missing-comment-rejected`（3）、`SCN-TEMPLATE-ENGINEERING-001/sdk-does-not-reexport-network`（1）、`SCN-TEMPLATE-EXAMPLE-012`（2）、`integration/inventory-cli`（1） |
| Task 11 | 3 | `SCN-PROTOCOL-CONTRACT-011/request-recording`、`012/path-template`、`013/bounded-poll` |
| Task 12 | 3 | `SCN-PROTOCOL-CONTRACT-006/idl-validator-rules`、`006/shadow-construction`、`007/malformed-claim-rules` |
| Task 13 | 7 | `SCN-PROTOCOL-CONTRACT-008/request-id-wire`（integration + weapp）、`008/client-options-shape`、`008/runtime-port-shape`、`009/generator-non-beijing-tz`、`010/shadow-header-patterns`、`010/context-obligation` |
| Task 14 | 3 | `SCN-TEMPLATE-ENGINEERING-010/baseline-config-rules`、`010/format-check-cli`、`010/max-lines-cli` |
| Task 15 | 2 | `SCN-TEMPLATE-ENGINEERING-011/project-map-rules`、`011/project-map-violations-cli` |
| Task 16 | 4 | `SCN-TEMPLATE-ENGINEERING-006/example-marker-rules`、`006/example-marker-violations-cli`、`012/architecture-doc-rules`、`012/architecture-doc-violations-cli` |
| Task 17 | 2 | `SCN-TEMPLATE-ENGINEERING-008/example-removal-fast`、`008/example-removal-scenarios`（删除演练，由验收方执行） |

- 无法归属的问题 **0** 条，故本任务不触发「门禁问题无法归属」的暂停条件。
- 与 Task 7 记录（`--change` 下 376 条）的差异来自报告集合：Task 7 未运行 weapp 步骤，weapp 环境的用例全部计为 missing binding；本任务产出 `reports/weapp/` 后 weapp 侧缺口清零（53 = 376 − weapp 侧缺口 − 本次新增绑定 + 2 条 weapp checkpoint）。同一份报告集合下，带与不带 `--change` 的结论一致（`/tmp/t8-cs-unscoped-fresh.log`）。

**故意改一个源码文件的过期说明反例**
- 在 `packages/sdk/src/index.ts` 末尾追加一行注释后运行 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:scenarios --change template-core-hardening`，退出码 1；输出 829 条问题，其中 459 条 `is stale`，每条都给出 `摘要类别不同：source；变化文件（共 1 个）：packages/sdk/src/index.ts`。随后 `git checkout -- packages/sdk/src/index.ts` 还原（`git status` 无残留）。

**方案与实际的差异**（含 Task 8 Files 之外的改动，均只同步受影响测试或按契约补充，未改规划语义）
1. `scripts/lib/fingerprints.test.ts`（Files 之外）：GATE-14 的过期说明现在会在 `is stale` 后附带明细，原断言整串相等改为 `expect.arrayContaining([expect.stringContaining('weapp/host-case is stale')])`；判定语义不变，属根 AGENTS 第 4 条要求的受影响测试同步。
2. `scripts/check-coverage.test.ts`（Files 之外）：`pnpm verify` 按 GATE-14 给全部步骤设置 `VERIFY_RUN_ID`，该变量存在时 `check-coverage.ts` 缺省报告路径的 `process.env.VERIFY_RUN_ID ?? 'local'` 只剩一侧分支被执行，`check:fast` 的覆盖率阈值在 verify 内以 99.93% 分支覆盖率失败（`/tmp/t8-verify-real.log`）。用例改为显式覆盖两种取值；改后带/不带该变量都 100%（`/tmp/t8-unit-envset2.log`、`/tmp/t8-unit-noenv.log`）。
3. `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts`（Files 之外）：同一原因——`scripts-by-manifest` 把 `artifacts/local/reports/unit.json` 写死，verify 内必然失败（`/tmp/t8-verify-real2.log`）。改为按 `process.env.VERIFY_RUN_ID ?? 'local'` 计算，同时满足 GATE-15「事实核验结论不受无关 active Change 影响」。
4. Task 8 Files 内的补充：`scripts/check-scenarios.test.ts` 的 `loadReporterOutputs` 用例补「信封带 `files` / 不带 `files`」两路；`scripts/lib/project-manifest.test.ts` 的 `environments-by-manifest` 追加「perFile 项目取目录下全部报告、未生成报告的项目不入集合、非 `.json` 条目忽略」断言。
5. 超时约定：`scripts/verify.test.ts` 的 evidence 包装与 `cliEvidence` 一致给 `30_000`（本次未触发超时重跑）。按 Task 7 裁决，同类副本/重负载用例后续若因默认 5s 超时失败，同样加显式 30s 并在本文件登记。
6. `packages/e2e/AGENTS.md` 按契约改写「微信开发者工具自动化的注意事项」：退出主进程、清理残留与预热由 `pnpm verify` 的逐文件运行与 `weapp:prepare` 自动执行（失败时自动先 prepare 再整文件重跑）；手工单跑仍按原约定执行。
7. 实现细节：逐文件文件清单由 Vitest 配置的 `test.include` 经 `vite.loadConfigFromFile` + Node 内建 `globSync` 解析，缺 include 时直接拒绝；`--from` 以步骤命令名定位；续跑仅在报告存在且全部用例 `passed` 时跳过该文件。

**weapp 重跑记录**
- 4 个文件各 1 个 case，全部首次通过，无重跑；每个文件前由 `pnpm weapp:prepare` 自动执行 `cli quit` → `pkill -f wechatwebdevtools.app` → `cli open --project <仓库根>/packages/e2e/host/weapp` 预热（本步共 4 次 prepare）。
- 各文件耗时：`SCN-PROTOCOL-CONTRACT-002` 11391ms、`FLOW-TEMPLATE-EXAMPLE-001` 11122ms、`SCN-TEMPLATE-EXAMPLE-002` 11209ms、`SCN-TEMPLATE-EXAMPLE-004` 11185ms；第 2 步合计 170642ms（含 4 次预热）。

**按需选择结果**：N/A（`test:affected` 由任务 9 交付；本任务按 `check:fast` 全量运行）。

**OI-CH-02 统计**：本任务无「按需通过、全量失败」记录（按需入口尚未交付；累计仍为 0 次）。

**优先采用现成方案**
- 逐文件枚举复用 Vitest 自身配置加载（`vite.loadConfigFromFile`）与 Node 内建 `globSync` 读 `test.include`，不自研 glob 或 TS 配置解析。
- run id 时间戳复用内建 `Date#toISOString()`（UTC），只去掉分隔符与毫秒；未引入日期库。
- 默认报告集合与过期说明复用 Task 3 的报告 `files` 明细、Task 6/7 的作用域与来源 API（`parseChangeArguments`/`resolveChangeScope`）；`check-scenarios` 只接入 `defaultReportPaths`。
- 平台步骤替身沿用 Task 3–6 的受控根与清单复制 helper（`createControlledRoot`/`scenario-gate-helpers`/`enableInventory`），未新增框架或自研进程控制器。
- 微信开发者工具的退出与预热复用本机 `cli` 与仓库既有约定，未自研工具控制器。

### Task 9 按需测试入口

**Commit message**：`feat(template): add affected-scenario test selection with partial reports`

**RED（预期失败的反例，已实际执行）**
- 入口不存在（把 `scripts/test-affected.ts` 移出工作区、已跟踪改动临时 `git stash`）时：
  - `node_modules/.bin/vitest run scripts/test-affected.test.ts` 退出码 **1**，`Test Files 1 failed (1)`、`Tests no tests`（`Cannot find module './test-affected.ts'`，套件整体不可加载，`/tmp/t9-red-unit.log`）；
  - `node_modules/.bin/vitest run --project integration SCN-SCENARIO-GATE-020.spec.ts SCN-SCENARIO-GATE-021.spec.ts SCN-SCENARIO-GATE-022.spec.ts` 退出码 **1**，`Test Files 3 failed (3)` / `Tests 4 failed (4)`（`/tmp/t9-red-int.log`）：020 `full-trigger-cli` 在清单情形下没有全量计划（`expected 1 to be +0`）；021 `affected-spec-fixture-cli`、`affected-code-cli` 无选择输出；022 `partial-report-cli` 读不到 `affected-<时间戳>` run id 与报告。
- 门禁拒收逻辑缺失（临时 `git stash` 回退 `scripts/check-scenarios.ts` 到 `HEAD`）：`node_modules/.bin/vitest run --project test-tools-unit scripts/check-scenarios.test.ts` 退出码 **1**，`Tests 1 failed | 23 passed (24)`，新增用例 `rejects partial reports from affected runs and keeps full reports acceptable` 报 `expected undefined to deeply equal [ Array(1) ]`（旧实现的 `loadReporterOutputs` 不返回 `partial`，也不报 partial 问题，`/tmp/t9-cs-unit-red.log`）。`git stash pop` 恢复后同文件 24 用例全绿（`/tmp/t9-cs-unit-green.log`）。
- partial 报告被门禁接受（同输入对照新旧实现）：向 `artifacts/core-hardening-t9/reports/integration.json` 临时注入 `partial: true` 后运行 `VERIFY_RUN_ID=core-hardening-t9 pnpm check:scenarios --change template-core-hardening`：
  - `HEAD:scripts/check-scenarios.ts`（临时 `git stash`）退出码 1，但**不含**任何 partial 专属问题、且照常打印覆盖结论（输出有 `summaries`）；其总问题数 831 中的 785 条 `is stale` 来自临时回退 `scripts/check-scenarios.ts` 造成的 source 摘要差异，与本反例的判定信号无关（`/tmp/t9-partial-old.log`）；
  - Task 9 实现退出码 1，问题恰好 1 条：`…/reports/integration.json: partial 报告来自按需运行，并非零退出，不能作为验收证据`，输出**没有** `summaries`（`/tmp/t9-partial-new.log`）；
  - 探针用注入前的备份还原了该报告文件；随后整份 `core-hardening-t9` 报告集合由本任务最终的 `pnpm verify` 重新生成。

**GREEN**
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check` 退出 0（`/tmp/t9-typecheck2.log`、`/tmp/t9-lint2.log`）。
- `pnpm test:unit`：**49 文件 / 344 用例**，Statements/Branches/Functions/Lines 均 100%（`/tmp/t9-unit-full5.log`、`/tmp/t9-unit-preview.log`；后者为新增 `check-scenarios` 用例后的重跑）。
- 新增 3 个工程用例（`SCN-SCENARIO-GATE-020/021/022.spec.ts`）连续两次退出 0（3 文件 / 4 用例，`/tmp/t9-green-int1.log`、`/tmp/t9-green-int2.log`）。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:integration` 连续 **2 次**退出 0（48 文件 / 108 用例，`/tmp/t9-integration-full2.log`、`/tmp/t9-integration-full3.log`）。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出 0（`/tmp/t9-checkfast.log`）。
- 真实仓库改动实验（`--dry-run`，见「按需选择结果」）：产品包 `src` 改动经 `--reaches` 选中 `SCN-TEMPLATE-EXAMPLE-*` 与 weapp 用例并先执行 `pnpm build`；清单、根 `package.json` 或 Vitest 配置改动退化为全量并逐条打印原因。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 单测（RED，入口缺失） | 1 | `/tmp/t9-red-unit.log`（`Tests no tests`） |
| 集成 020/021/022（RED，入口缺失） | 1 | `/tmp/t9-red-int.log`（3 文件 / 4 用例失败） |
| `scripts/check-scenarios.test.ts`（RED，回退门禁实现） | 1 | `/tmp/t9-cs-unit-red.log`（1 failed / 23 passed） |
| `scripts/check-scenarios.test.ts`（GREEN） | 0 | `/tmp/t9-cs-unit-green.log`（24 passed） |
| 旧门禁 + partial 报告（对照） | 1 | 无 partial 问题、有 `summaries`（`/tmp/t9-partial-old.log`） |
| 新门禁 + partial 报告 | 1 | 恰好 1 条 partial 问题、无 `summaries`（`/tmp/t9-partial-new.log`） |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 0 / 0 / 0 | `/tmp/t9-typecheck2.log`、`/tmp/t9-lint2.log` |
| `pnpm test:unit` | 0 | 49 文件 / 344 用例，四项 100%（`/tmp/t9-unit-preview.log`） |
| 020+021+022 集成用例（第 1 次 / 第 2 次） | 0 / 0 | 3 文件 / 4 用例（`/tmp/t9-green-int1.log`、`/tmp/t9-green-int2.log`） |
| `SCENARIO_GATE_CHANGES=… pnpm test:integration`（第 1 次 / 第 2 次） | 0 / 0 | 48 文件 / 108 用例（`/tmp/t9-integration-full2.log`、`/tmp/t9-integration-full3.log`） |
| `SCENARIO_GATE_CHANGES=… pnpm check:fast` | 0 | `/tmp/t9-checkfast.log` |
| `pnpm test:affected`（收尾实跑，工作区含清单改动） | 0 | 85.29s，退化为全量 `check:fast` 并全绿（`/tmp/t9-affected-real.log`） |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t9` | 1（第 3 步按预期归属后续任务，见下） | `/tmp/t9-verify-final2.log` |

**报告路径**
- `pnpm verify` 产物：`artifacts/core-hardening-t9/reports/unit.json`、`integration.json`，perFile 项目目录 `artifacts/core-hardening-t9/reports/weapp/` 下 4 份报告，覆盖率在 `artifacts/core-hardening-t9/coverage/`。
- 收尾 `pnpm test:affected` 退化为全量，报告落默认 `artifacts/local/reports/{unit.json,integration.json}`，不带 `partial`。
- partial 报告只出现在按需路径的 `artifacts/affected-<时间戳>/reports/`；工程用例在受控根内产出（`SCN-SCENARIO-GATE-022`）。

**Task 9 Verification：`pnpm verify --change template-core-hardening --run-id core-hardening-t9`**（256.4s，在补上 `scripts/check-scenarios.test.ts` 用例后重跑，为最终证据）
- 第 1 步 `check:fast` 退出码 **0**（83742ms，含 49 文件 / 344 单测与 48 文件 / 108 集成用例，覆盖率四项 100%）。
- 第 2 步 `test:e2e:weapp` 退出码 **0**（170798ms，逐文件 4 个，全部首次通过）。
- 第 3 步 `check:scenarios` 退出码 **1**（1372ms）：共 **46** 条问题，`过期报告` 0 条、`未登记 checkpoint` 0 条、没有 `SCN-SCENARIO-GATE-020/021/022` 相关项——Task 8 登记的 7 条 Task 9 缺口全部清零（53 → 46）。

| 归属 | 条数 | 具体 |
| --- | --- | --- |
| Task 10 | 22 | `test-tools-unit/derivation-rules` 7、`SCN-PROTOCOL-CONTRACT-001/non-trade-method-cli` 1、`002/declared-routes` 1、`integration|weapp/protocol-matrix` 4、`005/call-scan-rules` 与 `005/declaration-gate-cli` 2、`SCN-TEMPLATE-ENGINEERING-003/entry-discovery-rules` 1、`integration/missing-comment-rejected` 2、`SCN-TEMPLATE-ENGINEERING-001/sdk-does-not-reexport-network` 1、`SCN-TEMPLATE-EXAMPLE-012` 2、`integration/inventory-cli` 1 |
| Task 11 | 3 | `SCN-PROTOCOL-CONTRACT-011/request-recording`、`012/path-template`、`013/bounded-poll` |
| Task 12 | 3 | `SCN-PROTOCOL-CONTRACT-006/idl-validator-rules`、`006/shadow-construction`、`007/malformed-claim-rules` |
| Task 13 | 7 | `SCN-PROTOCOL-CONTRACT-008/request-id-wire`（integration + weapp）、`008/client-options-shape`、`008/runtime-port-shape`、`009/generator-non-beijing-tz`、`010/shadow-header-patterns`、`010/context-obligation` |
| Task 14 | 3 | `SCN-TEMPLATE-ENGINEERING-010/baseline-config-rules`、`010/format-check-cli`、`010/max-lines-cli` |
| Task 15 | 2 | `SCN-TEMPLATE-ENGINEERING-011/project-map-rules`、`011/project-map-violations-cli` |
| Task 16 | 4 | `SCN-TEMPLATE-ENGINEERING-006/example-marker-rules`、`006/example-marker-violations-cli`、`012/architecture-doc-rules`、`012/architecture-doc-violations-cli` |
| Task 17 | 2 | `SCN-TEMPLATE-ENGINEERING-008/example-removal-fast`、`008/example-removal-scenarios` |
| Task 9 | 0 | 本任务交付后清零 |

- 无法归属的问题 **0** 条，未触发「门禁问题无法归属」的暂停条件；续跑提示为 `pnpm verify --from check:scenarios --run-id core-hardening-t9 --change template-core-hardening`。

**weapp 重跑记录**
- 4 个文件各 1 个 case，全部首次通过、无重跑；每个文件前由 `weapp:prepare` 自动执行 `cli quit` → `pkill -f wechatwebdevtools.app` → `cli open --project <仓库根>/packages/e2e/host/weapp` 预热（本步共 4 次 prepare）。
- 各文件耗时：`SCN-PROTOCOL-CONTRACT-002` 11316ms、`FLOW-TEMPLATE-EXAMPLE-001` 11237ms、`SCN-TEMPLATE-EXAMPLE-002` 11213ms、`SCN-TEMPLATE-EXAMPLE-004` 11219ms；第 2 步合计 170798ms（含 4 次预热）。

**按需选择结果**（`--dry-run`；工作区含本任务未提交改动，前两行先用「临时还原 + 用后恢复」的方式清掉本次改动里的全量触发文件，只保留被观察的那一个改动）

| # | 改动 | 耗时 | 选择结果 |
| --- | --- | --- | --- |
| 1 | 产品包 `packages/sdk/src/example/adapters/trade-backend.ts` | 1.65s | 选中 8 个 ID（`FLOW-TEMPLATE-EXAMPLE-001`、`SCN-TEMPLATE-EXAMPLE-001/002/003/004/005/006/011`），11 个测试文件含 3 个 weapp 用例，第 1 步为 `pnpm build`（`/tmp/t9-affected-exp1.log`） |
| 2 | `scripts/lib/project-manifest.ts`（`scripts/` 模块） | 1.65s | 选中 13 个 ID / 17 个测试文件（含 `SCN-SCENARIO-GATE-026` 等 tooling 用例与 4 个 weapp 用例），第 1 步为 `vitest related … --project sdk-unit protocol-unit test-tools-unit --run`，**不含** `pnpm build`（`/tmp/t9-affected-exp2.log`） |
| 3 | `project.manifest.json` + 根 `package.json` + `vitest.config.ts` | 0.61s | 退化为全量 `pnpm check:fast`，触发原因逐条打印：`package.json 命中构建输入`、`project.manifest.json 是清单文件`、`vitest.config.ts 是工具配置`（`/tmp/t9-affected-exp3.log`） |

- 耗时对比：选择阶段 0.6–1.7s（含 dependency-cruiser 分析），全量 `check:fast` 约 84s（`/tmp/t9-affected-real.log`）；选择结果与全量的差集即本次未改动的用例。
- 计划打印包含选中 ID、各自的选中原因与全部测试文件；每个选中 ID 都扩展到其绑定的全部环境（含 weapp）。
- 实验后被改文件已 `git checkout --` 还原，三个临时还原文件用 `shasum` 逐个比对确认与实验前逐字节一致，`git status` 与实验前相同。

**方案与实际的差异**（含 Task 9 Files 之外的改动；均按契约补充或只同步受影响产物，未改规划语义）
1. **超时偏离（沿用 Task 7 裁决 A 的同类处理，用户已预授权）**：`scripts/lib/contract-inventory.test.ts` 的 `derives obligations for the example protocol only` 加显式 `{ timeout: 30_000 }`，该文件不在 Task 9 Files 范围内。原因：`SCN-SCENARIO-GATE-026` 副本内 `pnpm test:unit` 与构建及其他项目并行时默认 5s 超时不够——同一用例在本分支单独运行 1976ms、整文件 8369ms（`/tmp/t9-unit-full5.log`），副本内为 5134ms（`/tmp/t9-integration-full.log`）；同一批补超时的还有 Files 内的 `scripts/test-affected.test.ts` 两个用例（副本内 5266ms）。只放宽超时，未改断言与语义；改后 `test:integration` 全量连续 2 次全绿。
2. `vitest.config.ts`（Files 之外的落点）：Files 只写「报告器（`partial: true` 标记）」，而标记的产生点是根 `vitest.config.ts` 的 reporter 选项，因此同时修改 `packages/e2e/src/reporters/scenario-reporter.ts` 与 `vitest.config.ts`（按 `TEST_AFFECTED_PARTIAL === "1"` 打开）。
3. `scripts/check-scenarios.test.ts`（Files 内「`scripts/check-scenarios.ts` 及单测」）：新增 `rejects partial reports from affected runs and keeps full reports acceptable`，断言 `loadReporterOutputs` 把 partial 信封计入 `partial` 并报出拒收问题、全量信封两项都为空；未改既有断言语义。
4. `--reaches` 分析配置：按 GATE-13 第 4 条生成只供分析的 tsconfig（由清单把各包包名映射到其 `src` 入口）与临时 dependency-cruiser 配置（`forbidden: []`、不跟进 `node_modules`），放临时目录并在运行后删除，不写入仓库、不影响构建与测试的实际模块解析。
5. 工程用例夹具在受控根内自带 `packages/protocol`（名 `@daqian/template-protocol`）的最小 generated 结构：Task 10 之前 `contract-inventory` 仍从 `infra/trade/v1/trade.ts` 推导，缺该文件时真实门禁会报错，故夹具提供同名最小产物；Task 10 去掉写死后该夹具可简化。
6. 退化为全量时沿用默认报告位置（不设置 `VERIFY_RUN_ID`）：全量路径不写 partial 报告，`affected-<时间戳>` 只用于按需路径的 `artifacts/<run-id>/reports/`。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。说明：本任务首轮全量 `test:integration` 的 1 处红是 GATE-026 副本内默认 5s 超时（`/tmp/t9-integration-full.log`），不属于「按需通过但全量失败」，已按超时偏离单独登记；补超时后全量连续 2 次全绿。 附注（Task 9 交付物缺陷修复后修订）：本轮按需运行的 unit 步骤实际为空（根因与证据见「Task 9 交付物缺陷修复」），该轮按需结果标为**无效基线**，不计入 OI-CH-02。

**优先采用现成方案**
- integration / platform 用例的代码改动选择按 GATE-13 用 dependency-cruiser `--reaches`，unit 类项目用 Vitest `related`，未自研导入图或影响面分析。
- 改动文件枚举用 `git diff --name-only <base>` 与 `git ls-files --others --exclude-standard`（根 AGENTS 点名的 `git ls-files`）。
- `defineCase` 绑定提取复用仓库既有 devDependency `typescript` 的 AST API，未写正则解析。
- run id 时间戳复用内建 `Date#toISOString()`（UTC）。
- 受控根、报告替身与 gate helper 沿用 Task 3–8 的既有 helper（`createRepositoryCopy`、`scenario-gate-helpers`），未新增进程控制器或测试框架。
- 门禁拒收 partial 复用既有 `loadReporterOutputs` 装载点，未新增报告解析路径。

### Task 10 协议义务以消费接口声明派生与注释门禁按入口发现

**Commit message**：`feat(template): derive protocol obligations from declared consumed operations`

**RED（预期失败的反例，已实际执行）**

1. **派生器缺声明读取（覆盖 RED 第 1、2 条）**：把 `scripts/lib/contract-inventory.ts` 临时回退到 `HEAD`（临时 `git stash push -- scripts/lib/contract-inventory.ts`，其余实现保持 Task 10 状态）后：
   - `node_modules/.bin/vitest run --project integration packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-005.spec.ts` 退出码 **1**，`Test Files 2 failed (2)` / `Tests 3 failed (3)`（`/tmp/t10-red-a.log`）：
     - `SCN-PROTOCOL-CONTRACT-001 inventory-cli`：`expected 1 to be +0`（空声明根下仍按写死的 `requestPolicies` 派生，退出码非 0）；
     - `SCN-PROTOCOL-CONTRACT-001 non-trade-method-cli`：`expected [] to deeply equal [ 'idl.error-contract', …(2) ]`（合成 `pay.ts` 的方法不产生义务）；
     - `SCN-PROTOCOL-CONTRACT-005 declaration-gate-cli`：`expected '' to contain '未使用的声明：FastCharge'`（双向对账未生效，未声明调用/未使用声明都不报）。
   - `node_modules/.bin/vitest run scripts/lib/contract-inventory.test.ts` 退出码 **1**，`Tests 8 failed | 4 passed (12)`（`/tmp/t10-red-a-unit.log`）：声明位置推导、前缀、`defineMethodSpec` 报错、双向检查等新单测逐条失败。
   - `git stash pop` 恢复后同两组均退出码 0（001/005 两文件 3 用例、单测 12 用例全绿，见下方 GREEN）。
2. **矩阵 Fixture 键未按声明（覆盖 RED 第 3 条）**：把 `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` 临时回退到 `HEAD`（键为 `create`/`query`）：
   - 直接运行 `vitest run --project integration …SCN-PROTOCOL-CONTRACT-002.spec.ts`：退出码 **1**，报 `fixture sha256 mismatch for protocol-matrix.json`（`/tmp/t10-red-b.log`，Fixture 摘要是内容寻址的，回退旧内容先被摘要守卫拦下）；
   - 用 `pnpm fixtures:refresh SCN-PROTOCOL-CONTRACT-002` 让旧键 Fixture 摘要自洽后再运行同一用例：退出码 **1**，报 `协议矩阵 Fixture 缺少接口 CreateTrade 的数据`（`/tmp/t10-red-b2.log`）——用例按声明遍历接口并在缺键时指出接口名，证明"写死键"状态无法通过。
3. **入口发现缺失（覆盖 RED 第 4 条）**：把 `packages/e2e/tests/tooling/public-doc.ts` 移出工作区后运行 `SCN-TEMPLATE-ENGINEERING-003.spec.ts`：退出码 **1**，`Cannot find module './public-doc.ts'`、`Tests no tests`（`/tmp/t10-red-c.log`）；放回后 2 用例通过。
4. **标记校验缺失（覆盖 RED 第 5 条）**：把 `scripts/lib/example-markers.ts` 移出工作区并把 `scripts/check-architecture.ts` 临时回退到 `HEAD`：
   - `SCN-TEMPLATE-ENGINEERING-006.spec.ts` 退出码 **1**，`Tests 1 failed | 1 passed`：新增 `example-marker-violations-cli` 报 `expected '' to contain 'packages/sdk/src/marked.ts:1: templat…'`（未闭合标记不报错），`guide-violations-cli` 仍通过（证明失败来自新校验而非其他改写，`/tmp/t10-red-d.log`）；
   - `vitest run scripts/check-architecture.test.ts` 退出码 **1**，`Tests 1 failed | 14 passed`（标记规则单测失败，`/tmp/t10-red-d-unit.log`）；恢复后 15 用例全绿。

**GREEN**
- 上述四组反例恢复后：001/005/002/003/006 五个用例文件 **5 文件 / 8 用例**退出码 0（`/tmp/t10-green-after-red.log`）；`contract-inventory.test.ts`、`check-architecture.test.ts` 全绿。
- `pnpm test:integration`（全量）退出码 **0**，`Test Files 50 passed (50)` / `Tests 112 passed (112)`（`/tmp/t10-integ1.log`，80.71s；verify 内再次运行同为 50/112（85.57s））。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 **0**（`/tmp/t10-fast3.log`；verify 内 138775ms）：`test:unit` 52 文件 / 355 用例，覆盖率 Statements/Branches/Functions/Lines 均 **100%**（2946/1955/540/2603）；`check:package` 两个 pack 命令退出码 0、`issues: []`。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` 退出码 **0**（退化为全量，见「按需选择结果」）。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 001+005 集成（RED：派生器回退 HEAD） | 1 | 3 用例失败，`/tmp/t10-red-a.log` |
| `contract-inventory.test.ts`（RED） | 1 | 8 failed / 4 passed，`/tmp/t10-red-a-unit.log` |
| 002 集成（RED：Fixture 回退旧键） | 1 | sha256 守卫；刷新摘要后报「缺少接口 CreateTrade」，`/tmp/t10-red-b.log`、`/tmp/t10-red-b2.log` |
| 003 集成（RED：入口发现模块缺失） | 1 | `Cannot find module './public-doc.ts'`，`/tmp/t10-red-c.log` |
| 006 集成 / `check-architecture.test.ts`（RED） | 1 / 1 | 标记用例失败，`/tmp/t10-red-d.log`、`/tmp/t10-red-d-unit.log` |
| 001+005+002+003+006 集成（GREEN） | 0 | 5 文件 / 8 用例，`/tmp/t10-green-after-red.log` |
| `pnpm test:integration`（全量） | 0 | 50 文件 / 112 用例，`/tmp/t10-integ1.log` |
| `SCENARIO_GATE_CHANGES=… pnpm check:fast` | 0 | `/tmp/t10-fast3.log`（52 文件 / 355 单测，覆盖率四项 100%） |
| `SCENARIO_GATE_CHANGES=… pnpm test:affected` | 0 | 退化为全量，`/tmp/t10-affected-real.log` |

**Task 10 Verification：`pnpm verify --change template-core-hardening --run-id core-hardening-t10`**（三步合计 310813ms）
- 第 1 步 `check:fast` 退出码 **0**（138775ms；报告 `artifacts/core-hardening-t10/reports/{unit.json,integration.json}`，覆盖率 `artifacts/core-hardening-t10/coverage/`）。
- 第 2 步 `test:e2e:weapp` 退出码 **0**（170658ms；报告 `artifacts/core-hardening-t10/reports/weapp/`）。
- 第 3 步 `check:scenarios` 退出码 **1**（1380ms；报告 `artifacts/core-hardening-t10/reports/scenarios.json`）：共 **22** 条问题，全部是后续任务 case 的 `missing binding`，`过期报告` 0 条、`未登记 checkpoint` 0 条、**协议义务问题 0 条**（没有"未声明的调用""未使用的声明""待定字段"或义务与声明不一致的报告）。Task 9 记录中归属 Task 10 的 22 条与 `SCN-TEMPLATE-ENGINEERING-006/example-marker-*` 2 条共 **24 条全部清零**（46 → 22）。

| 归属 | 条数 | 具体 |
| --- | --- | --- |
| Task 11 | 3 | `SCN-PROTOCOL-CONTRACT-011/request-recording`、`012/path-template`、`013/bounded-poll` |
| Task 12 | 3 | `SCN-PROTOCOL-CONTRACT-006/idl-validator-rules`、`006/shadow-construction`、`007/malformed-claim-rules` |
| Task 13 | 7 | `SCN-PROTOCOL-CONTRACT-008/request-id-wire`（integration + weapp）、`008/client-options-shape`、`008/runtime-port-shape`、`009/generator-non-beijing-tz`、`010/shadow-header-patterns`、`010/context-obligation` |
| Task 14 | 3 | `SCN-TEMPLATE-ENGINEERING-010/baseline-config-rules`、`010/format-check-cli`、`010/max-lines-cli` |
| Task 15 | 2 | `SCN-TEMPLATE-ENGINEERING-011/project-map-rules`、`011/project-map-violations-cli` |
| Task 16 | 2 | `SCN-TEMPLATE-ENGINEERING-012/architecture-doc-rules`、`012/architecture-doc-violations-cli` |
| Task 17 | 2 | `SCN-TEMPLATE-ENGINEERING-008/example-removal-fast`、`008/example-removal-scenarios` |

- 无法归属的问题 **0** 条，未触发「门禁问题无法归属」的暂停条件；续跑提示为 `pnpm verify --from check:scenarios --run-id core-hardening-t10 --change template-core-hardening`。

**义务清单对比（改造前后，Review / Acceptance）**
- 改造前基线用同一份清单在 `HEAD` 快照上跑 `check-scenarios --inventory`（`/tmp/head-repo`，`/tmp/t10-head-inventory.log`），与本次 verify 输出逐条对比：
  - 义务总数同为 **177**，ID 集合**完全相同**（`set(id)` 无增无减），`contractFields` 同为 83 项；
  - 义务 ID 前缀不变（`infra.trade.v1.CreateTrade` 81 条、`infra.trade.v1.QueryTrade` 95 条、`idl.error-contract#business-error#$` 1 条）；
  - 请求字段映射义务**逐项相同**：把 `HEAD` 的 `requestPolicies` 与派生结果逐条比对，`CreateTrade` 21 项、`QueryTrade` 7 项，键与 `cases` **完全相等**（含 `base_req.product_id` 的 `configured-value`/`omitted` 与 `items.sku_snapshot.*` 的 `omitted`）；
  - 唯一差异是 `idl.error-contract#business-error#$` 的 `cases` **顺序**（集合与多重集完全相同，7 个错误码不变）：改造前读 `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/idl-errors.json` 的 Fixture 顺序，改造后按 PC-02 读协议包手写 `businessErrors` 模块的声明顺序——属"来源说明变化"，非义务内容变化。同一棵树两次独立运行顺序一致（`/tmp/t10-scen.log` 与 `/tmp/t10-verify.log`）。
- 派生器按路径映射把协议包名解析到 `packages/protocol/src/`（不读 `dist`），`contract-inventory` 单测覆盖合成非 `trade.ts` 声明文件的前缀与类型源文件、`defineMethodSpec` 报错、未登记/未导出数组报错。

**weapp 重跑记录**
- 4 个文件各 1 个 case，全部首次通过、无重跑；每个文件前由 `weapp:prepare` 自动执行 `cli quit` → `pkill -f wechatwebdevtools.app` → `cli open --project <仓库根>/packages/e2e/host/weapp` 预热（本步共 4 次 prepare）。
- 各文件耗时：`SCN-PROTOCOL-CONTRACT-002` 11379ms、`FLOW-TEMPLATE-EXAMPLE-001` 11171ms、`SCN-TEMPLATE-EXAMPLE-002` 11099ms、`SCN-TEMPLATE-EXAMPLE-004` 11243ms；第 2 步合计 170658ms。
- 本任务改写了 `packages/e2e/host/weapp/{app.js,setup.ts,vite.config.ts,protocol-runner.ts}` 与 `packages/e2e/src/drivers/weapp-host.test.ts` 的示例注册片段（`template-example` 标记内），weapp 用例仍经真实 `wx.request` 访问 Shadow，结果不变。

**按需选择结果**
- 工作区含本任务全部未提交改动（43 个文件）时，`SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected --dry-run` 的选择结果是**退化为全量** `pnpm check:fast`，触发原因逐条打印：`packages/e2e/host/weapp/{app.js,protocol-runner.ts,setup.ts,vite.config.ts} 在宿主目录（全量触发）`、`packages/e2e/src/drivers/weapp-host.test.ts 在驱动目录（全量触发）`、`project.manifest.json 是清单文件（全量触发）`（`/tmp/t10-affected-dry.log`）。
- 实际运行 `pnpm test:affected` 退出码 **0**：单测 52 文件 / 355 用例、集成 50 文件 / 112 用例、`check:package` `issues: []`（`/tmp/t10-affected-real.log`）。退化为全量时沿用默认报告位置（`artifacts/local/reports/`），不写 partial 标记。
- 加 `--scenario SCN-PROTOCOL-CONTRACT-001 SCN-PROTOCOL-CONTRACT-005` 仍是全量（全量触发优先于 ID 选择），已记录。
- 未做 Task 9 那样的"临时还原到单文件"实验：本任务改动覆盖清单、宿主目录与驱动目录，任何单个文件的隔离实验都仍需先把 42 个文件搬走，风险与收益不成比例；选择结果以退化原因逐条记录为准。

**方案与实际的差异**（含 Task 10 Files 之外的改动；均按契约补充或只同步受影响产物，未改规划语义）
1. **`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-007.spec.ts`（Files 之外的回归修复）**：本任务的 `consumed-operations.ts` 在 `example/` 之外仍以 `@daqian/template-protocol/generated/*` 子路径导入方法常量与 `RpcMethodMeta`，而 `createBuildCopy` 按 Design"临时构建复制"只复制 `sourceRoots`、`buildInputs` 与包的 `package.json`/tsconfig，副本内没有 `packages/protocol/dist`，于是 `expectRestored` 的全图巡航报 2 条 `not-to-unresolvable`（`packages/sdk/src/consumed-operations.ts → …/generated/std` 与 `…/generated/idl/infra/trade/v1/trade`，已用探针在副本内复现）。修法是**在 007 的副本 `beforeAll` 里先 `pnpm --filter @daqian/template-protocol build`**（与同一 helper 的既有用法 `SCN-TEMPLATE-ENGINEERING-001` 一致：ENG-001 也在副本内构建协议包与产品包），使依赖图在副本内可解析。已核对副本内构建不会写回仓库的 `packages/{sdk,protocol}/dist`（巡航前后 `shasum` 逐文件相同）；未改任何断言与断言语义。曾评估并放弃两条备选：给 `tsconfig.base.json`/`tsconfig.test.json` 加 `@daqian/template-protocol/generated/*` 路径映射（会让 `tsc -p packages/sdk/tsconfig.build.json`、`tsc -p tsconfig.test.json` 把协议包 `src/generated/**` 拉进程序，`globalThis.atob/btoa` 在无 DOM lib 的程序里报 TS7017；为它补 DOM lib 会放宽产品包的类型检查），以及在 `createBuildCopy` 里复制 `dist`（与 Design 的副本输入定义相悖、且依赖先有构建产物）。
2. `packages/e2e/tests/tooling/scenario-gate-helpers.ts`（Files 之外的共享 helper）：`enableInventory` 增加 `realSources` 选项并把受控根的源码树改为"普通目录建实目录、文件逐个 symlink、`generated/.generated/dist/node_modules` 整目录 symlink"（`mirrorSources`）。原因：`SCN-PROTOCOL-CONTRACT-001` 的 `non-trade-method-cli` 需要受控根里真实的 `git ls-files` 语义与可被 `readFileSync` 读取的源码，纯 symlink 目录会让 `git ls-files`／覆盖率脚本报 EISDIR。属受控根构造适配，未改被测门禁语义。
3. `packages/e2e/tests/tooling/declaration-fixture.ts`（新 helper）：把 Task 4 在 EX-008 用例内构造的受控副本收敛为一个合成声明 Fixture（`syntheticMethodFile` 等），供 `SCN-PROTOCOL-CONTRACT-001`/`005` 复用；Task 4 的 Minor 约定（EX-008 先用最小 helper、Task 5 再收敛）在 Task 5 已收敛到 `repository-copy`，本文件是其上的声明 Fixture 补充。
4. `packages/protocol/src/client.test.ts` 与 `packages/protocol/testing/shadow/idl-routes.ts`（Files 之外）：矩阵 Fixture 键改名后，protocol-unit 的矩阵用例同步把 Fixture 键从 `create`/`query` 换成接口名；`idl-routes.ts` 新增导出类型 `RpcMethodSource`（`RpcMethodMeta<unknown, unknown>` 别名），让新的 `declared-routes.ts` 只依赖 `idl-routes.ts` 的中立输入而不直接导入 generated，避免触发本 Change 新增的 `shadow-engine-no-generated` 规则（已用 `pnpm check:architecture` 归零）。
5. `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts` 的逐文件过滤：入口发现的要求可能落在多个文件（`consumed-operations.ts`、`example/contracts.ts`、`example/factory.ts`），而 `missing-comment-rejected` 只检查 `example/contracts.ts` 的文本，直接传全量要求会把其他文件的类型误报为 `missing`。修法是按 `requirement.file === 相对 contracts.ts` 过滤后再检查（`source-and-dual-declarations` 里的 `sourceIssues` 早已按文件过滤），断言与语义不变；`ExampleConfigurationError.code` 的中文注释已在源码补齐，构建产物随 `pnpm build` 同步。
6. Fixture 摘要刷新：`pnpm fixtures:refresh SCN-PROTOCOL-CONTRACT-002|SCN-TEMPLATE-ENGINEERING-001|SCN-TEMPLATE-ENGINEERING-003`（键改名、导出集合改为由根入口计算、检查要求随入口变化）。
7. 实施中为定位 007 而临时做的探针文件（`.probe007.mts`、`/tmp/probe-*.mts`）与 `HEAD` 快照（`/tmp/head-repo`）只用于诊断，均未进入工作区。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。说明：本任务结束时按需入口退化为全量 `check:fast` 并通过；全量 `verify` 的第 3 步 `check:scenarios` 非零是任务进行中的既定状态（22 条全部归属后续任务 11–17、协议义务问题 0 条），与"按需通过但全量发现新增失败"不同类。本任务执行中出现的 1 处红（007 副本 `not-to-unresolvable`）在提交前已按上面第 1 条修复。 附注（Task 9 交付物缺陷修复后修订）：本轮按需运行的 unit 步骤实际为空（根因与证据见「Task 9 交付物缺陷修复」），该轮按需结果标为**无效基线**，不计入 OI-CH-02。

**优先采用现成方案**
- 矩阵用例的声明遍历直接用 generated 方法常量携带的 `meta`（`RpcMethodMeta`：`name`/`method`/`path`/`requestType`/`responseType`/codec），未自研路由描述。
- 声明与调用的双向对账、注释门禁的入口发现都复用仓库既有 devDependency `typescript` 的 Compiler API（`createProgram` + `getExportsOfModule` + 符号声明位置），未写正则解析，也未引入新的解析依赖。
- 依赖与平台规则的反例沿用 Task 4/5 的 `dependency-cruiser` 与受控副本 helper；007 的副本内构建复用仓库既有 `pnpm --filter … build`（ENG-001 已在使用），未新增构建器或进程控制器。
- Fixture 摘要沿用既有 `pnpm fixtures:refresh`；受控根沿用 `scenario-gate-helpers`／`repository-copy`。
- 已评估 `tsconfig` `paths` 子路径映射方案（现成的模块解析机制）并在验证其副作用（无 DOM lib 程序报 TS7017）后放弃，理由记在上面第 1 条。

### Task 11 Shadow 请求记录、路径转换与有界轮询

**Commit message**：`feat(template): record every shadow request and support bounded polling`

**RED（预期失败的反例，已实际执行）**
- 新增用例 `packages/protocol/testing/shadow/records-and-polling.test.ts`（011/012/013 的 protocol-unit module case）后、实现前运行
  `node_modules/.bin/vitest run --project protocol-unit testing/shadow/records-and-polling.test.ts`：退出码 **1**，`Test Files 1 failed (1)` / `Tests 3 failed (3)`（`/tmp/t11-red-unit.log`）：
  - `SCN-PROTOCOL-CONTRACT-011 request-recording`：`records().map(path)` 收到 `[undefined]`——旧引擎只记录命中已编排路由的请求，已注册未编排与未注册路径都不进记录，`verify()` 也不报，故断言先失败在记录缺失。
  - `SCN-PROTOCOL-CONTRACT-012 path-template`：`/trades/{tradeId}` 原样注册，请求 `/trades/abc` 得到 **404**（期望 200）——未做 `{name}` → `:name` 转换；两条残留花括号的路径也未在构造期报错。
  - `SCN-PROTOCOL-CONTRACT-013 bounded-poll`：第 3 次请求得到 **409**（期望 422）——旧引擎把 `index >= expectedRequests.length` 一律当"多发请求"，既不重复最后一个 step，也不按最后一个期望请求校验。

**GREEN**
- `node_modules/.bin/vitest run --project protocol-unit testing/shadow/` 退出码 **0**，`Test Files 9 passed (9)` / `Tests 23 passed (23)`（`/tmp/t11-green-unit.log`）：新增 3 个 case 通过，既有 `server.test.ts`（8）、`routes.test.ts`（1）、`example/routes.test.ts`（3）等未改动即回归通过——**不使用 `poll` 的既有 Shadow 单测无需传入 `environmentClass`**（Minor 约定）。
- `pnpm typecheck` 退出码 **0**（`/tmp/t11-typecheck.log`）。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 **0**（`/tmp/t11-checkfast.log`）：`test:unit` **53 文件 / 358 用例**，覆盖率 Statements/Branches/Functions/Lines 均 **100%**（2964/1969/542/2620）；`test:integration` **50 文件 / 112 用例**；`check:package` 两个 pack 命令退出码 0、`issues: []`。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` 退出码 **0**（`/tmp/t11-affected.log`）：16 个改动文件选出 12 个步骤，含 `integration` 6 个文件与 `weapp` 4 个文件，全部通过；`sdk-unit`/`protocol-unit`/`test-tools-unit` 走 `vitest related`。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 011/012/013 module case（RED：实现前） | 1 | 3 failed / 3，`/tmp/t11-red-unit.log` |
| protocol-unit `testing/shadow/`（GREEN） | 0 | 9 文件 / 23 用例，`/tmp/t11-green-unit.log` |
| `pnpm typecheck` | 0 | `/tmp/t11-typecheck.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` | 0 | 单测 53/358、集成 50/112、覆盖率 100%，`/tmp/t11-checkfast.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` | 0 | 12 步（含 4 个 weapp 文件），`/tmp/t11-affected.log` |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t11`（全量首跑） | 1 | check:fast 0（136020ms）；weapp 1（345985ms，FLOW-001 挂起）；check:scenarios 跳过，`/tmp/t11-verify-full.log` |
| `pnpm verify --change template-core-hardening --from test:e2e:weapp --run-id core-hardening-t11`（weapp 整文件复跑并续跑到门禁） | 1 | weapp 0（128553ms）；check:scenarios 1（1371ms，19 条），`/tmp/t11-verify-resume.log` |

**报告路径**：单测与集成报告 `artifacts/core-hardening-t11/reports/{unit.json,integration.json}`，覆盖率 `artifacts/core-hardening-t11/coverage/`，weapp 逐文件报告 `artifacts/core-hardening-t11/reports/weapp/<文件名>.json`；RED/GREEN 与复跑日志在 `/tmp/t11-*.log`。`check:scenarios` 的结论以 stdout JSON 为准（本任务未落盘 `scenarios.json`），完整输出在 `/tmp/t11-verify-resume.log`。

**场景门禁剩余问题归属（19 条，22 → 19）**
- 均为后续任务 case 的 `missing binding`：**未登记 checkpoint 0 条、过期报告 0 条、协议义务问题 0 条**。Task 10 记录中归属 Task 11 的 3 条（`SCN-PROTOCOL-CONTRACT-011/request-recording`、`012/path-template`、`013/bounded-poll`）全部清零。

| 归属 | 条数 | 具体 |
| --- | --- | --- |
| Task 12 | 3 | `SCN-PROTOCOL-CONTRACT-006/idl-validator-rules`、`006/shadow-construction`、`007/malformed-claim-rules` |
| Task 13 | 7 | `SCN-PROTOCOL-CONTRACT-008/request-id-wire`（integration + weapp）、`008/client-options-shape`、`008/runtime-port-shape`、`009/generator-non-beijing-tz`、`010/shadow-header-patterns`、`010/context-obligation` |
| Task 14 | 3 | `SCN-TEMPLATE-ENGINEERING-010/baseline-config-rules`、`010/format-check-cli`、`010/max-lines-cli` |
| Task 15 | 2 | `SCN-TEMPLATE-ENGINEERING-011/project-map-rules`、`011/project-map-violations-cli` |
| Task 16 | 2 | `SCN-TEMPLATE-ENGINEERING-012/architecture-doc-rules`、`012/architecture-doc-violations-cli` |
| Task 17 | 2 | `SCN-TEMPLATE-ENGINEERING-008/example-removal-fast`、`008/example-removal-scenarios` |

- 无法归属的问题 **0** 条，未触发「门禁问题无法归属」的暂停条件；续跑提示为 `pnpm verify --from check:scenarios --run-id core-hardening-t11 --change template-core-hardening`。

**Review / Acceptance：新记录规则在现有用例中暴露的请求**
- **新增问题 0 条**。现有 integration（50 文件 / 112 用例）与 weapp（4 文件）在 `verify()` 断言下全绿：协议矩阵用例 `expect(run.verify()).toEqual([])`、示例用例 `expect(server.verify()).toEqual([])` 均未因"未编排/未注册请求"报错。
- 说明现有用例没有此前被掩盖的多余请求：所有被 SDK 真实发出的请求都在当前场景的编排集合内；已注册未编排与未注册路径的请求此前既不记录也不报，本轮没有命中。

**方案与实际的差异**（含 Task 11 Files 之外的改动；均为按契约补充或只同步受影响产物，未改规划语义）
1. `packages/protocol/testing/index.ts`（Files 之外）：新增 `export type { ShadowEnvironmentClass }`（**type-only**，运行期导出集合不变，`bootstrap.test.ts` 的"精确导出名"断言未改且通过），供 e2e harness 与用例标注 `environmentClass` 参数类型。
2. `packages/e2e/tests/example/{SCN-TEMPLATE-EXAMPLE-003,005,006,FLOW-TEMPLATE-EXAMPLE-001}.spec.ts` 与 `example-harness.ts`（Files 之外）：`exampleServer(id, routes, environmentClass)` 增加第三参数后，全部 9 处调用点同步传入 `defineCase` 上下文的 `environmentClass`。属"使用 Shadow 的 harness 与用例"范围内。
3. `packages/e2e/tests/example/SCN-TEMPLATE-EXAMPLE-002.spec.ts` 等既有示例用例：只改 `defineCase` 解构与 `createShadowServer`/`exampleServer` 参数，断言与语义未动（`git diff` 逐条核对）。
4. 路径转换放在 `routes.ts` 的 `toExpressRoutePath`（Files 已列 `routes.ts`）：只用正则把 `{name}` 换成 `:name`，残留花括号即抛错，复用 express 5 内建的 `:param` 与 `app.use` 兜底，不引入路由器或中间件框架。
5. `packages/e2e/AGENTS.md` 新增"轮询用例写法"一条，措辞取自 Design「Decision: AGENTS 约定」的两类轮询，未改其他约定。
6. **weapp 复跑**：首跑 `FLOW-TEMPLATE-EXAMPLE-001` 出现断言前 120s 挂起（详见下），按 AGENTS 约定整文件复跑取得通过证据；未改任何断言、未跳过用例、未缩小统计范围。

**weapp 重跑记录**
- 首跑（全量 `verify`，run id `core-hardening-t11`）：`SCN-PROTOCOL-CONTRACT-002` 首次通过（11377ms）；`FLOW-TEMPLATE-EXAMPLE-001` **失败**，`Error: Test timed out in 120000ms`（120013ms），统一入口自动 `weapp:prepare` 后整文件重跑仍为同一 120011ms 挂起；因该步失败，后续两个文件未执行。
- 复跑：先手工 `pnpm weapp:prepare`（`cli quit` → `pkill -f wechatwebdevtools.app` → `cli open --project packages/e2e/host/weapp`），再 `pnpm verify --from test:e2e:weapp --run-id core-hardening-t11`，weapp 步骤退出码 **0**（128553ms）：`SCN-PROTOCOL-CONTRACT-002` 复用首跑通过报告，`FLOW-TEMPLATE-EXAMPLE-001` 11125ms、`SCN-TEMPLATE-EXAMPLE-002` 11117ms、`SCN-TEMPLATE-EXAMPLE-004` 11159ms，全部通过。
- 失败现象是断言前的 120s 挂起（开发者工具 launch/evaluate 不返回），不是断言失败；同一改动在更早的独立 weapp 运行中 `FLOW-TEMPLATE-EXAMPLE-001` 曾 11126ms 通过，与被测行为无关（`packages/e2e/AGENTS.md` 第 2 条）。

**按需选择结果**
- 16 个改动文件被 `test:affected` 转为 12 个步骤：3 个 unit 项目走 `vitest related`（`sdk-unit` 无相关文件，退出码 0），`integration` 逐文件 6 个（示例 5 + 协议矩阵 1），`weapp` 逐文件 4 个；全部退出码 0。
- 未退化为全量：`packages/protocol/testing/**` 与 `packages/e2e/tests/**` 不在"清单/宿主/驱动"全量触发路径上（本任务未改 `project.manifest.json`、`packages/e2e/host/`、`packages/e2e/src/`）。选择结果为精确子集，`artifacts/local/reports/` 沿用默认位置且无 partial 标记。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。说明：全量首跑的红色来自 `FLOW-TEMPLATE-EXAMPLE-001` 的 weapp 断言前 120s 挂起（AGENTS 已登记的基础设施抖动，整文件复跑即通过），不属于"按需通过但全量发现新增失败"；`check:scenarios` 的非零是 19 条全部归属后续任务 12–17 的 `missing binding`，与按需选择无关。 附注（Task 9 交付物缺陷修复后修订）：本轮按需运行的 unit 步骤实际为空（根因与证据见「Task 9 交付物缺陷修复」），该轮按需结果标为**无效基线**，不计入 OI-CH-02。

**优先采用现成方案**
- 路径转换复用 express 5 内建的 `:param` 路由参数，只把 IDL 侧的 `{name}` 模板用一条正则规范化；未自研路由器、路径匹配器或协议解析器。
- 未注册路径的兜底复用 express 内建的 `app.use` catch-all 中间件，未引入中间件框架。
- 请求记录与有界轮询沿用 Shadow 引擎既有的"每路由 cursor + steps"执行模型（只加 `poll.maxRequests` 上限与最后一个 step 的重复语义），未新建录制层或调度器。
- `environmentClass` 复用 Task 4 的 `defineCase` 上下文（`environmentClassOf` 按清单测试项目 `class` 解析），未新增第二套环境判定。
- AGENTS"轮询用例写法"直接采用 Design 已确认的两类划分，未自行改写职责边界。

### Task 12 Shadow 响应与协议同形校验

**Commit message**：`feat(template): validate shadow responses against the protocol shape`

**RED（预期失败的反例，已实际执行）**
- **校验器模块缺失**：新增 `packages/protocol/testing/shadow/response-shape.test.ts`、把 `idl-routes.ts` 改为从 `scripts/lib/response-shape.ts` 导入后、实现前运行 `pnpm exec vitest run --project protocol-unit packages/protocol/testing/shadow/response-shape.test.ts`：退出码 **1**，`Test Files 1 failed (1)` / `Tests no tests`（`/tmp/t12-red-module.log`）——模块解析失败（`response-shape.ts` 不存在）。
- **构造期校验未接线**：实现 `scripts/lib/response-shape.ts` 后、在 `server.ts` 加入构造期校验块前运行同一文件：退出码 **1**，`Tests 2 failed | 1 passed (3)`（`/tmp/t12-red-construction.log`）：
  - `SCN-PROTOCOL-CONTRACT-006 shadow-construction`：非法 step（未知字段 / 编码或类型不符 / 同一 oneof 多分支 / 非法枚举名）本应在 `createShadowServer` 构造期抛错，实际构造成功——`expected [Function] to throw`。
  - `SCN-PROTOCOL-CONTRACT-007 malformed-claim-rules`：`malformed.reason` 为空串时本应报错，实际静默放行。
  - 同文件 `SCN-PROTOCOL-CONTRACT-006 idl-validator-rules` 已通过（派生器行为正确，仅缺构造期接线）。
- **中立路由快照未适配**：把两处 e2e spec 的 `routes-from-declaration` 断言暂时还原为整对象 `toEqual` 后运行 `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`：退出码 **1**（`/tmp/t12-red-route-shape.log`）——实际路由对象多出 `validateResponse` 函数字段，`toEqual` 因多字段失败；这是 PC-04"路由描述新增可选 `validateResponse`"的直接后果。
- 上述 RED 用的临时改动（删除 `server.ts` 校验块、还原 spec 断言、隐藏 `scripts/lib/response-shape.ts`）全部还原；还原后 `git diff` 与 `/tmp/t12-backup/engine.patch` 逐字节一致。

**GREEN**
- `pnpm exec vitest run --project protocol-unit packages/protocol/testing/shadow/` 退出码 **0**，`Test Files 10 passed (10)` / `Tests 26 passed (26)`（`/tmp/t12b-green-unit.log`）：新增 `response-shape.test.ts` 的 006/007 case 通过，既有 `server.test.ts`、`routes.test.ts`、`example/routes.test.ts`、`idl-routes.test.ts`、`declared-routes.test.ts` 同步回归通过。
- `pnpm lint`、`pnpm typecheck`、`pnpm format:check`、`pnpm check:architecture` 退出码均 **0**（`/tmp/t12b-{lint,typecheck,format,arch}.log`）；`check:architecture` 中 `shadow-engine-no-generated`（dependency-cruiser）通过，证明 Shadow 引擎仍不导入 generated。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 **0**（`/tmp/t12b-verify.log` 前段）：`test:unit` **54 文件 / 361 用例**，覆盖率 Statements/Branches/Functions/Lines 均 **100%**；`test:integration` **50 文件 / 112 用例**；`check:package` 两个 pack 命令退出码 0、`issues: []`。
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` 退出码 **0**（`/tmp/t12b-affected.log`）：12 个改动文件选出 3 步，全部通过（详见下"按需选择结果"）。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 006/007 module case（RED：`server.ts` 校验块缺失） | 1 | 2 failed / 3，`/tmp/t12-red-construction.log` |
| `response-shape.test.ts`（RED：校验器模块缺失） | 1 | 模块解析失败，`/tmp/t12-red-module.log` |
| `SCN-PROTOCOL-CONTRACT-002.spec.ts`（RED：快照未适配） | 1 | 多 `validateResponse` 字段，`/tmp/t12-red-route-shape.log` |
| `pnpm exec vitest run --project protocol-unit packages/protocol/testing/shadow/`（GREEN） | 0 | 10 文件 / 26 用例，`/tmp/t12b-green-unit.log` |
| `pnpm lint` | 0 | `/tmp/t12b-lint.log` |
| `pnpm typecheck` | 0 | `/tmp/t12b-typecheck.log` |
| `pnpm format:check` | 0 | `/tmp/t12b-format.log` |
| `pnpm check:architecture` | 0 | `/tmp/t12b-arch.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` | 0 | 3 步全部通过，`/tmp/t12b-affected.log` |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t12b` | 1 | check:fast 0（139778ms）、weapp 0（172411ms）、check:scenarios 1（1372ms，16 条）；`/tmp/t12b-verify.log` |

**报告路径**：单测与集成报告 `artifacts/core-hardening-t12b/reports/{unit.json,integration.json}`，覆盖率 `artifacts/core-hardening-t12b/coverage/`，weapp 逐文件报告 `artifacts/core-hardening-t12b/reports/weapp/<文件名>.json`；RED/GREEN/复跑日志在 `/tmp/t12-*.log` 与 `/tmp/t12b-*.log`。`check:scenarios` 的结论以 stdout JSON 为准（本任务未落盘 `scenarios.json`），完整输出在 `/tmp/t12b-verify.log`。

**场景门禁剩余问题归属（16 条，19 → 16）**
- 均为后续任务 case 的 `missing binding`：**未登记 checkpoint 0 条、过期报告 0 条、协议义务问题 0 条**（`check:scenarios` 输出 `issues` 共 16 条，`summaries.protocol` 635/635、`flows` 2/2 全通过）。Task 11 记录中归属 Task 12 的 3 条（`SCN-PROTOCOL-CONTRACT-006/idl-validator-rules`、`006/shadow-construction`、`007/malformed-claim-rules`）全部清零。

| 归属 | 条数 | 具体 |
| --- | --- | --- |
| Task 13 | 7 | `SCN-PROTOCOL-CONTRACT-008/request-id-wire`（integration + weapp）、`008/client-options-shape`、`008/runtime-port-shape`、`009/generator-non-beijing-tz`、`010/shadow-header-patterns`、`010/context-obligation` |
| Task 14 | 3 | `SCN-TEMPLATE-ENGINEERING-010/baseline-config-rules`、`010/format-check-cli`、`010/max-lines-cli` |
| Task 15 | 2 | `SCN-TEMPLATE-ENGINEERING-011/project-map-rules`、`011/project-map-violations-cli` |
| Task 16 | 2 | `SCN-TEMPLATE-ENGINEERING-012/architecture-doc-rules`、`012/architecture-doc-violations-cli` |
| Task 17 | 2 | `SCN-TEMPLATE-ENGINEERING-008/example-removal-fast`、`008/example-removal-scenarios` |

- 无法归属的问题 **0** 条，未触发「门禁问题无法归属」的暂停条件；续跑提示为 `pnpm verify --from check:scenarios --run-id core-hardening-t12b --change template-core-hardening`。

**Review / Acceptance：启用校验时发现的不同形响应数量 = 0**
- 构造期对"Fixture JSON 体"与"测试代码内联体"走同一校验。启用后 `test:integration`（50 文件 / 112 用例）与 weapp（4 文件）在构造期全绿——**不同形响应 0 处**，无既有响应被修错或被误判。
- 现有用例没有"需要故意返回非法响应"的场景（`error-handling/codec-error` 测的是请求编解码，不是服务端返回非法体），Task 12 当时**补 `malformed` 声明的步骤 0 处**，`malformed` 语义仅由 `response-shape.test.ts` 的新 case 覆盖。**该记录已在「Final Code Review 与演练修复」第 6 条修正**：Shadow 之后（本 Change 交付前）补了"`rawBody` 必须显式声明 `malformed`"的构造期规则，`protocol/SCN-PROTOCOL-CONTRACT-002`、`weapp/SCN-PROTOCOL-CONTRACT-002`、`weapp/SCN-PROTOCOL-CONTRACT-008` 三处 `rawBody` step 随之补声明，实际补 3 处。
- 构造错误信息含"路由/步骤序号/字段路径"（`${id}/${method} step ${n}: 响应与协议不一致：<issues>`），`shadow-construction` case 逐项断言。

**方案与实际的差异**（含 Task 12 Files 之外的改动；均为按契约补充或只同步受影响产物，未改规划语义）
1. **`scripts/lib/response-shape.ts`（新增，Files 只说"如需把 `deriveFields` 抽到可复用位置"）**：从 `contract-inventory.ts` 迁出 `deriveFields` 一族（字段派生、编码类别、oneof 分支、枚举取值）与新的 `validateResponseShape`，只依赖 `typescript`。落点选 `scripts/lib/` 而非协议包内，是因为 Task 4 的 `scanHardcodedTopology` 禁止 `scripts/**` 出现 `packages/protocol` 字面量（ENG-05）：共享实现只能在门禁脚本侧。改为协议侧 `idl-routes.ts` 反向导入它，`shadow-engine-no-generated` 依旧成立（引擎不导入 generated）。
2. **`scripts/lib/contract-inventory.ts`（Files 未列，属"抽到可复用位置"）**：删除本地派生实现，改为 `import ... from './response-shape.ts'`；已用改前/改后 `--inventory` 输出逐字节比对，177 条义务 / 83 个字段完全一致（diff 0）。
3. **`packages/protocol/testing/shadow/response-shape.test.ts`（新增，Files 写"及单测"）**：006 的 `idl-validator-rules`、`shadow-construction` 与 007 的 `malformed-claim-rules`；含合成 `ts.Program`（临时目录写 `sample.ts`）覆盖枚举联合会话、map、数组/元素编码、Any/unknown 待定、自引用、非法 oneof 形态、单个枚举字面量。
4. **两处 e2e spec 快照适配（Design PC-04 的直接后果）**：`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts` 与 `packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts` 的 `routes-from-declaration` 检查改为比较中立字段 `{methodName, httpMethod, path}`，并额外断言每条路由都带 `validateResponse` 函数。checkpoint 登记含义（"与声明一一对应、不取自示例路由"）未变。
5. **`declared-routes.test.ts` 的输入**：改用真实 `CreateTrade.meta`/`QueryTrade.meta`（不再合成 `requestType`/`responseType` 字符串），使响应校验器可派生；路由字段来源仍只读 `meta`，`meta.name`/`meta.path` 被覆盖验证。
6. **8 处 `timeout: 30_000`（预授权项，因默认 5s 超时在副本/负载下误判）**：`idl-routes.test.ts`（`SCN-PROTOCOL-CONTRACT-004 idl-route-source`）、`example/routes.test.ts`（前两个 it 与 `SCN-TEMPLATE-EXAMPLE-009 shadow-create-route`）、`response-shape.test.ts`（3 个 test）、`declared-routes.test.ts`（`SCN-PROTOCOL-CONTRACT-002 declared-routes`）。只加超时，断言与语义未动。

**weapp 重跑记录**：本任务**无需重跑**——全量 `verify`（run id `core-hardening-t12b`）weapp 步骤退出码 **0**（172411ms），4 个文件首跑全绿：`SCN-PROTOCOL-CONTRACT-002` 11406ms、`FLOW-TEMPLATE-EXAMPLE-001` 11550ms、`SCN-TEMPLATE-EXAMPLE-002` 11538ms、`SCN-TEMPLATE-EXAMPLE-004` 11413ms。先前一次 `--run-id core-hardening-t12` 曾出现 `SCN-PROTOCOL-CONTRACT-002` 断言前 120s 挂起（该次在改 spec 后 `check:fast` 源摘要过期，`check:scenarios` 报 497 条 stale），已由全新 run id 的完整首跑取代。

**按需选择结果**
- 12 个改动文件被 `test:affected` 检出 1 个场景 ID（`SCN-PROTOCOL-CONTRACT-002`），转为 3 步、退出码均 0：`vitest related`（`sdk-unit`/`protocol-unit`/`test-tools-unit`）、`integration` 逐文件 1 个、`weapp` 逐文件 1 个。
- 未退化为全量：`packages/protocol/testing/**` 与 `packages/e2e/tests/**` 不在"清单/宿主/驱动"全量触发路径上（本任务未改 `project.manifest.json`、`packages/e2e/host/`、`packages/e2e/src/`）。选择结果为精确子集。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。说明：全量三项中 `check:fast`、`test:e2e:weapp` 退出码 0；`check:scenarios` 非零来自 16 条全部归属后续任务 13–17 的 `missing binding`，与按需选择无关，也不构成"按需通过但全量发现新增失败"。 附注（Task 9 交付物缺陷修复后修订）：本轮按需运行的 unit 步骤实际为空（根因与证据见「Task 9 交付物缺陷修复」），该轮按需结果标为**无效基线**，不计入 OI-CH-02。

**优先采用现成方案**
- 响应结构校验复用 TypeScript 编译器 API（`ts.Program`/`ts.TypeChecker`，仓库既有 `typescript` 依赖）派生可达字段，未自研类型解析或引入 JSON Schema 生成器。
- Shadow 构造期校验沿用既有 `steps[]` 编排模型（只在构造循环内插入一次校验调用与 `malformed` 认领分支），未新建校验框架或独立校验阶段。
- 错误信息与字段路径沿用既有的 snake_case 路径与 `snakeCase()` 工具，未引入第二套命名规则。

### Task 13 X-Request-Id 按公司规范内化

**规划修订（Apply 期间用户裁决，先于本任务提交）**
- 单独提交 `17e94e8 docs(openspec): amend request-id random source by user decision`，只含 `specs/protocol-contract/spec.md`、`design.md`、`plan-review.md`；digest 由 `f42e312797a3460a7e0399ff430c959e77f0505ee57838855836f15747682dd8` 变为 `14514624116f04e0780771215b4ab6166504df3c9afd402dbacb44706d2a8fa1`，`freshness=PASS`（`--check-review` 退出码 0）。
- 触发原因：本任务首次真实运行 weapp 用例时，实测本机微信开发者工具小程序宿主（基础库 3.10.3）没有 `globalThis.crypto`，只有异步 `wx.getRandomValues`（探针输出 `{"sdkVersion":"3.10.3","cryptoType":"undefined","randomKeys":["getRandomValues"],"syncResult":"absent"}`，`/tmp/t13-probe2.log`），原 design 规定的 `crypto.getRandomValues` 在小程序不可实现。
- 裁决结果：PC-05 与 SCN-009 改为「默认随机源 `Math.random`，小程序/浏览器/Node 同一实现，不设平台点位，生成器保持同步」；其余规定不变（26 位格式、按北京时间、头名 `X-Request-Id`、与 `BaseReq.requestId` 同值、宿主不可覆盖、注入参数不公开）。

**Commit message**：`feat(template): generate X-Request-Id per company convention`

**RED（预期失败的反例，已实际执行）**
- **008（integration）**：临时把 `transport/context.ts` 还原为旧行为（头名 `request_id`、值加 `pay-` 前缀），其余保持现状，运行 `pnpm exec vitest run --project integration packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-008.spec.ts`：退出码 **1**（`/tmp/t13-red-008.log`），`request-id-wire` 报 `$.headers.x-request-id: expected "^\d{8}_\d{6}_\d{3}_[a-z]{6}$", received undefined`。临时改动已还原（与备份 `diff` 一致），还原后同文件退出码 **0**（`/tmp/t13-green-008-int2.log`）。
- **009（protocol-unit）**：实现前运行 `packages/protocol/src/transport/request-id.test.ts`：退出码 **1**，`Cannot find module './request-id.ts'`（`/tmp/t13-red-009.log`）。
- **010（protocol-unit）**：实现前运行 `packages/protocol/testing/shadow/header-patterns.test.ts`：退出码 **1**，`缺少该头: expected 200 to be 422`（`/tmp/t13-red-010.log`）。
- **010（test-tools-unit 义务派生）**：改 `contract-inventory.ts` 前运行 `SCN-PROTOCOL-CONTRACT-010 context-obligation`：退出码 **1**，`expected [ 'authorization', …(11) ] to include 'x-request-id-header'`（`/tmp/t13-red-010-obligation.log`）。

**GREEN**
- 009/010 单测：`/tmp/t13-green-009.log`、`/tmp/t13-green-010.log`、`/tmp/t13-010-obligation.log` 退出码均 **0**。
- `pnpm test:unit`（run id `t13d-unit`）退出码 **0**：56 文件 / 365 用例；覆盖率 Statements **3102/3102**、Branches **2080/2080**、Functions **566/566**、Lines **2743/2743**，四项 **100%**（`/tmp/t13d-unit.log`）。
- `pnpm lint`、`pnpm typecheck` 退出码 **0**（`/tmp/t13d-lint2.log`、`/tmp/t13d-typecheck.log`）。
- weapp 单文件真实运行：`pnpm weapp:prepare` + `pnpm exec vitest run --project weapp packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts` 退出码 **0**，11457ms（`/tmp/t13-weapp-008d.log`）。
- Fixture 摘要刷新：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm fixtures:refresh SCN-PROTOCOL-CONTRACT-008 --change template-core-hardening` 退出码 **0**，008 manifest 的 `requirementDigest` 更新为 `e933fcd4aa102f83495a66efd1240a0c7ab05c3405f5770b230a6c614c5f8d60`（`/tmp/t13b-fixtures2.log`）；随后作用域内 `pnpm check:fixtures` 退出码 **0**（18 manifests、issues 0，`/tmp/t13b-checkfixtures.log`）。
- 全量 `pnpm verify --change template-core-hardening --run-id core-hardening-t13`（`/tmp/t13-verify2.log`）：`check:fast` **0**（142585ms）、`test:e2e:weapp` **0**（367173ms）、`check:scenarios` **1**（1401ms，9 条，全部可归属后续任务）。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 008 integration（RED：旧头名/旧前缀） | 1 | `x-request-id` received undefined，`/tmp/t13-red-008.log` |
| 008 integration（还原后复跑） | 0 | 34ms，`/tmp/t13-green-008-int2.log` |
| 009 protocol-unit（RED：生成器缺失） | 1 | 模块解析失败，`/tmp/t13-red-009.log` |
| 010 protocol-unit（RED：`headerPatterns` 未接线） | 1 | 缺头仍 200，`/tmp/t13-red-010.log` |
| 010 context-obligation（RED：义务仍用旧头名） | 1 | 缺 `x-request-id-header`，`/tmp/t13-red-010-obligation.log` |
| `pnpm test:unit`（run id `t13d-unit`） | 0 | 56 文件 / 365 用例，覆盖率四项 100%，`/tmp/t13d-unit.log` |
| `pnpm lint` / `pnpm typecheck` | 0 | `/tmp/t13d-lint2.log`、`/tmp/t13d-typecheck.log` |
| weapp 008 单文件（`prepare` + `vitest`） | 0 | 11457ms，`/tmp/t13-weapp-008d.log` |
| `fixtures:refresh SCN-PROTOCOL-CONTRACT-008 --change …` | 0 | `updated: 1`，`/tmp/t13b-fixtures2.log` |
| `SCENARIO_GATE_CHANGES=… pnpm check:fixtures` | 0 | 18 manifests、issues 0，`/tmp/t13b-checkfixtures.log` |
| `SCENARIO_GATE_CHANGES=… pnpm check:fast`（run id `t13c`） | 0 | 56/365 单测 + 51/113 集成，`/tmp/t13c-checkfast.log` |
| `SCENARIO_GATE_CHANGES=… pnpm test:affected` | 0 | 宿主/驱动改动 → 全量触发 `check:fast`，`/tmp/t13-affected.log` |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t13` | 1 | check:fast 0（142585ms）、weapp 0（367173ms）、check:scenarios 1（1401ms、9 条），`/tmp/t13-verify2.log` |

**报告路径**：`artifacts/core-hardening-t13/reports/{unit.json,integration.json}`；weapp 逐文件报告 `artifacts/core-hardening-t13/reports/weapp/{SCN-PROTOCOL-CONTRACT-002,SCN-PROTOCOL-CONTRACT-008,FLOW-TEMPLATE-EXAMPLE-001,SCN-TEMPLATE-EXAMPLE-002,SCN-TEMPLATE-EXAMPLE-004}.json`；覆盖率 `artifacts/core-hardening-t13/coverage/`。`check:scenarios` 结论以 stdout JSON 为准（完整输出在 `/tmp/t13-verify2.log`）。

**场景门禁剩余问题归属（9 条，16 → 9）**
- `SCN-TEMPLATE-ENGINEERING-010`：3 条（`baseline-config-rules`、`format-check-cli`、`max-lines-cli`）→ **Task 14**。
- `SCN-TEMPLATE-ENGINEERING-011`：2 条（`project-map-rules`、`project-map-violations-cli`）→ **Task 15**。
- `SCN-TEMPLATE-ENGINEERING-012`：2 条（`architecture-doc-rules`、`architecture-doc-violations-cli`）→ **Task 16**。
- `SCN-TEMPLATE-ENGINEERING-008`：2 条（`example-removal-fast`、`example-removal-scenarios`）→ **Task 17 自动化部分**（用例由本会话交付，演练与勾选由验收方执行）。
- 本任务新增的 008/009/010 用例已全部完成绑定；无改前存在的 `did not execute` / `no executed assertions` 回归项，剩余 9 条全部可归属 Task 14–17。

**Review / Acceptance**
- 逐项对照 PC-05 与 SCN-008/009/010：
  - **头名**：`transport/context.ts` 的头键为 `X-Request-Id`，不再发送 `request_id`；`context.test.ts` 与两处 002 spec 断言 `headers.request_id === undefined`。
  - **格式**：`createRequestId` 输出 `yyyyMMdd_HHmmss_SSS_abcdef`（26 字符）；时间用 `Date.UTC` 分量加 8 小时换算成北京时间，与宿主时区无关；末尾 6 位由随机字节映射到小写字母。009 在 `TZ=UTC` 与 `TZ=America/Los_Angeles` 子进程里跑固定时刻（UTC 2025-12-31T16:00Z，跨北京日期边界），结果相同且为 `20260101_000000_000_abzaza`。
  - **生成方与不可覆盖**：`ProtocolContextOptions`/`ProtocolClientOptions` 的 `runtime` 与 SDK `RuntimePort` 均删除 `nextRequestId`；双格式声明核对——`packages/protocol/dist/index.d.ts`（及 `index.d.cts`）的导出只有 `createProtocolClient`、`createWechatMiniappHttp`、`getBusinessError`、`businessErrors` 等既有名字，`rg nextRequestId packages/protocol/dist packages/sdk/dist` 无匹配，`rg getRandomValues packages/protocol/dist` 亦无匹配（旧实现已删除）。`client-options-shape` 额外断言宿主多传 `nextRequestId` 也不生效、`Object.keys(protocol)` 不含 `createRequestId`；`runtime-port-shape` 断言 SDK 根入口无 `requestId` 导出。
  - **Shadow 校验**：`expectedRequests[].headerPatterns` 在构造期 `new RegExp` 编译，非法正则立即抛错；请求时缺失、只剩旧头名或格式错误由 `verify()` 报出「头名 + 期望模式」，符合格式的请求不产生问题。
  - **写死点**：`scripts/lib/contract-inventory.ts` 的 `header-base-req` 义务由 `request-id-header` 改为 `x-request-id-header` + `x-request-id-format`。
- **破坏性变更记录**：`nextRequestId` 从协议包与 SDK 的公共类型与产物中消失（两套 d.ts 已核对）；能力地图中的注明按契约留到 Task 16。
- `git grep -n "request_id" -- packages scripts` 残留只有三类，均非「发送旧头」路径：①`BaseReq.requestId` 字段的 snake_case 编解码（`generated/idl/base.ts`、`generated/idl/infra/pay/v1/pay.ts` 注释）与消费声明（`consumed-operations.ts` 的 `base_req.request_id`）；②断言「不再发送该头」的用例（`client.test.ts`、`context.test.ts`、两处 002 spec、`contract-inventory.test.ts`）；③generated 注释文本。生产代码中不再有 `request_id` 头。

**方案与实际的差异**（含 Task 13 Files 之外的改动；均为按契约补充或同步受影响产物）
1. **随机源改为 `Math.random`（用户裁决 A1，规划已同步修订并单独提交 `17e94e8`）**：design 原文用 `crypto.getRandomValues`，实测小程序宿主无 `crypto`（证据见上），weapp 008 连续两次 120s 挂起、断言数 0（`/tmp/t13-weapp-008.log`、`/tmp/t13-weapp-008b.log`）；用同步兜底的对照实验使该文件 11.3s 通过（`/tmp/t13-weapp-008c.log`）。裁决后实现改为单份 `Math.random` 随机源，并删除「缺 `crypto` 就抛错」的分支与其单测；格式、头名、同值、不可覆盖、注入参数不公开均未变。
2. **`runSharedEvidence` 的期望请求由固定 `body` 改为记录式（`recordOnly: true`）**：`SCN-PROTOCOL-CONTRACT-002` 协议矩阵的共享证据分支复用同一 Fixture 请求体，而 `baseReq.requestId` 现在每次生成，固定比对会返回 422，导致 `CreateTrade/response-handling/success` 等断言为 false（`/tmp/t13-integration.log`）。改为记录式后，请求体仍由矩阵用例逐字段核验（去掉动态请求 ID 的 `compareJsonPresence`），断言覆盖面未缩小。
3. **4 个 plain 单测补 `scenario-evidence` 标注**：`client.test.ts`（client-options-shape）、`default.test.ts`（runtime-port-shape）、`request-id.test.ts`（generator-non-beijing-tz）、`header-patterns.test.ts`（shadow-header-patterns）是按 `test(...)` + `meta.scenarioCase` 直接写的用例，不经过 `defineCase` 的 `checkpoint`，须自行 `context.annotate(JSON.stringify({assertions, checkpoints}))` 上报；否则场景门禁报 13 条 `has no executed assertions` / `checkpoint did not execute`。标注后这 13 条清零，剩余 9 条全部可归属后续任务。
4. **覆盖率补充**：为把行覆盖补回 100%，新增 `server.ts` 非法 `headerPatterns` 构造期抛错的用例（`header-patterns.test.ts` 第三段）；裁决后同一文件删除了「缺 `crypto` 抛错」分支与其断言，覆盖总分支数由 2082 降到 2080、总行数由 2744 降到 2743，四项仍 100%。
5. **Fixture 来源摘要刷新**：PC-05 Requirement 正文修订后 008 manifest 的 `requirementDigest` 过期；按裁决先刷新再跑 `check:fast`。注意 `fixtures:refresh` 脚本要求至少一个 owner 参数，实际命令为 `pnpm fixtures:refresh SCN-PROTOCOL-CONTRACT-008 --change template-core-hardening`（未裸跑 `pnpm fixtures:refresh`）。
6. **新增文件落点**：`packages/protocol/src/transport/request-id.ts` 及单测、`packages/protocol/testing/shadow/header-patterns.test.ts`（Files 写「Shadow 期望请求头支持 `headerPatterns`；及单测」）、`packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-008/{manifest.json,request-id-wire.json}`、`packages/e2e/tests/{protocol,weapp}/SCN-PROTOCOL-CONTRACT-008.spec.ts`。生成器不从任何根入口导出（`client.test.ts` 断言）。

**weapp 重跑记录**
- 单文件（手工，先 `prepare` 再运行）：`SCN-PROTOCOL-CONTRACT-008` 首跑 **11457ms 通过**（`/tmp/t13-weapp-008d.log`）。
- 全量 `verify`（run id `core-hardening-t13`）的 weapp 步骤（逐文件 + 每文件前 `weapp:prepare`）：`SCN-PROTOCOL-CONTRACT-002` 11645ms 通过；`SCN-PROTOCOL-CONTRACT-008` 首次 **120009ms 挂起失败、断言数 0**（`packages/e2e/AGENTS.md` 记录的主进程挂起现象），`pnpm verify` 自动 `weapp:prepare` 后整文件重跑 **11254ms 通过**；`FLOW-TEMPLATE-EXAMPLE-001` 11420ms、`SCN-TEMPLATE-EXAMPLE-002` 11392ms、`SCN-TEMPLATE-EXAMPLE-004` 11424ms 均首跑通过。该次 weapp 步骤退出码 **0**。
- 此前两次单文件首跑也出现过同样的 120s 挂起（`/tmp/t13-weapp-008.log`、`/tmp/t13-weapp-008b.log`），当时原因是实现抛错（见差异 1），已在裁决后修复；修复后的三次运行（手工两次、`verify` 自动重跑一次）均通过。

**按需选择结果**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected`（run id `affected-20261010T001933Z`）退出码 **0**：23 个改动文件中 `packages/e2e/host/weapp/protocol-runner.ts` 与 `packages/e2e/src/drivers/weapp-host.test.ts` 落在宿主/驱动目录 → **全量触发 `pnpm check:fast`**，未退化为精确子集；全量退出码 0。选择规则按契约生效（宿主/驱动目录即全量触发路径），未发现选择错误。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。本次按需运行因宿主/驱动改动升级为全量并全绿；全量三项中 `check:scenarios` 非零来自 9 条全部归属 Task 14–17 的 `missing binding`，不构成新增失败。 附注（Task 9 交付物缺陷修复后修订）：本轮按需运行的 unit 步骤实际为空（根因与证据见「Task 9 交付物缺陷修复」），该轮按需结果标为**无效基线**，不计入 OI-CH-02。

**优先采用现成方案**
- **例外登记（用户裁决）**：随机源直接用平台内置 `Math.random`，不引入 `nanoid/non-secure` 等库。理由：实现只有几行，而协议包要同时发布 ESM 与 CJS 两种格式，为一个非安全随机后缀增加运行时依赖不划算；公司规范只规定格式，请求 ID 只用于链路追踪、不是凭据。
- Shadow 的 `headerPatterns` 复用平台内置 `RegExp` 与既有 `verify()` 问题通道，未引入 JSON Schema 或正则库。
- 单测的断言上报复用 Vitest 原生 `context.annotate` 与 `context.expect.getState()`（仓库既有 `records-and-polling.test.ts` 使用同一模式），未自研上报机制。
- 时区证据复用 Node 内置 `execFileSync` 子进程 + `TZ` 环境变量，未引入时区库。

### Task 14 行数上限与超限文件拆分

**Commit message**：`refactor(template): enforce max-lines and split oversized modules`

**RED（预期失败的反例，已实际执行）**
- 规则启用后 `pnpm lint` 退出码 **1**，列出 10 个超限文件（`/tmp/t14-red-lint2.log`）；括号内为 ESLint `max-lines` 报出的有效行数（空行与注释不计）：`scripts/check-scenarios.test.ts` 1123、`scripts/check-scenarios.ts` 705、`scripts/lib/contract-inventory.test.ts` 1258、`scripts/lib/contract-inventory.ts` 548、`scripts/lib/spec-sources.ts` 306、`scripts/sdk-release.test.ts` 794、`scripts/sdk-release.ts` 513、`scripts/test-affected.test.ts` 670、`scripts/test-affected.ts` 578、`scripts/verify.ts` 309。
- 新增用例自身也先失败：临时删除 `eslint.config.js` 的 `...dependencyRules.maxLinesConfig(manifest)` 后运行 `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-010.spec.ts`，退出码 **1**（`max-lines-cli` 的 `max-lines-enforced` 断言 `expected +0 not to be +0`：301 行源文件未被拦下，`/tmp/t14-red-scn010.log`）；用备份还原（逐字节一致）后同一命令退出码 **0**（`/tmp/t14-green-scn010.log`）。

**GREEN**
- `pnpm lint` 退出码 **0**（`/tmp/t14-lint2.log`）。
- `pnpm test:unit`（run id `t14-unit2`）退出码 **0**：62 文件 / 366 用例；覆盖率 Statements **3113/3113**、Branches **2082/2082**、Functions **571/571**、Lines **2753/2753**，四项 **100%**（`/tmp/t14-unit2.log`）。
- `pnpm typecheck`、`tsc -p tsconfig.tools.json --noEmit`、`pnpm format:check` 退出码 **0**（`/tmp/t14-typecheck2.log`、`/tmp/t14-tsc-tools.log`、`/tmp/t14-format2.log`）。
- 新增用例的两个 case 单独运行退出码 **0**（`/tmp/t14-green-scn010.log`）：`format-check-cli` 439ms、`max-lines-cli` 1857ms。
- 作用域内 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast`（run id `t14-checkfast2`）退出码 **0**（`/tmp/t14-checkfast2.log`）：单测 62/366、覆盖率四项 100%、集成 52 文件 / 115 用例、`check:fixtures` 与 `check:package` 均 `issues: []`。
- 作用域内 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected`（run id `affected-20261010T005120Z`）退出码 **0**（`/tmp/t14-affected2.log`）：39 个改动文件因 `eslint.config.js` 属工具配置 → **全量触发 `pnpm check:fast`**，全量退出码 0。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `pnpm lint`（RED，规则启用未拆分） | 1 | 10 个超限文件，`/tmp/t14-red-lint2.log` |
| SCN-010 integration（RED：`maxLinesConfig` 未接线） | 1 | 301 行未被拦下，`/tmp/t14-red-scn010.log` |
| SCN-010 integration（还原后复跑） | 0 | 2 case 通过，`/tmp/t14-green-scn010.log` |
| `pnpm lint`（GREEN） | 0 | `/tmp/t14-lint2.log` |
| `pnpm test:unit`（run id `t14-unit2`） | 0 | 62 文件 / 366 用例，覆盖率四项 100%，`/tmp/t14-unit2.log` |
| `pnpm typecheck` / `tsc -p tsconfig.tools.json` / `pnpm format:check` | 0 | `/tmp/t14-typecheck2.log`、`/tmp/t14-tsc-tools.log`、`/tmp/t14-format2.log` |
| `SCENARIO_GATE_CHANGES=… pnpm check:fast`（run id `t14-checkfast2`） | 0 | 62/366 单测 + 52/115 集成，`/tmp/t14-checkfast2.log` |
| `SCENARIO_GATE_CHANGES=… pnpm test:affected` | 0 | 工具配置 → 全量触发 `check:fast`，`/tmp/t14-affected2.log` |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t14c` | 1 | check:fast **0**（120794ms）、weapp **0**（215613ms）、check:scenarios **1**（1405ms、6 条，全部可归属后续任务），`/tmp/t14-verify3.log` |

**报告路径**：`artifacts/core-hardening-t14c/reports/{unit.json,integration.json}`；weapp 逐文件报告 `artifacts/core-hardening-t14c/reports/weapp/<文件名>.json`；覆盖率 `artifacts/core-hardening-t14c/coverage/`。`check:scenarios` 结论以 stdout JSON 为准（完整输出在 `/tmp/t14-verify3.log`）；首次全量（`core-hardening-t14b`）与首次按需（`affected-20261010T004948Z`）的失败日志分别在 `/tmp/t14-verify2.log`、`/tmp/t14-affected.log`。

**场景门禁剩余问题归属（6 条，9 → 6）**
- 全部为后续任务 case 的 `missing binding`，本任务负责的 `SCN-TEMPLATE-ENGINEERING-010` 三条（`baseline-config-rules`、`format-check-cli`、`max-lines-cli`）已全部绑定并清零。
- `SCN-TEMPLATE-ENGINEERING-011`：2 条（`project-map-rules`、`project-map-violations-cli`）→ **Task 15**。
- `SCN-TEMPLATE-ENGINEERING-012`：2 条（`architecture-doc-rules`、`architecture-doc-violations-cli`）→ **Task 16**。
- `SCN-TEMPLATE-ENGINEERING-008`：2 条（`example-removal-fast`、`example-removal-scenarios`）→ **Task 17 自动化部分**（用例由本会话交付，演练与勾选由验收方执行）。
- 无过期报告、无未登记 checkpoint、无 `did not execute` / `no executed assertions` 回归项（工程类 executed 103/107、module 54/56，差额即上述 6 条）。

**Review / Acceptance：拆分前后行数与新模块职责**
- 行数口径 = ESLint `max-lines` 自身计数（临时把上限设为 1 读出 N，`skipBlankLines`/`skipComments` 生效），与门禁判据同一套；拆分前数字取自 RED 的失败信息。

| 原文件（拆分前有效行） | 拆分后（有效行） | 新模块职责 |
| --- | --- | --- |
| `scripts/verify.ts` 309 | `verify.ts` 258 + `lib/verify-arguments.ts` 54 | 帮助文案与 CLI 参数解析 |
| `scripts/lib/spec-sources.ts` 306 | `spec-sources.ts` 237 + `lib/spec-parse.ts` 73 | 目录枚举、Requirement 块、FLOW 表外文本与 delta 小节解析 |
| `scripts/test-affected.ts` 578 | `test-affected.ts` 276 + `lib/affected-types.ts` 6 + `lib/affected-analysis.ts` 81 + `lib/affected-bindings.ts` 98 + `lib/affected-triggers.ts` 44 + `lib/affected-spec.ts` 98 | 类型、变化分析、Spec 绑定解析、全量触发路径、受影响 Spec 计算 |
| `scripts/test-affected.test.ts` 670 | `test-affected.test.ts` 553 + `test-affected.arguments.test.ts` 122 | 参数与静态提取段独立；公共夹具 `writeProjectManifest`/`base()` 移到 `packages/e2e/tests/tooling/helpers.ts`（206） |
| `scripts/sdk-release.ts` 513 | `sdk-release.ts` 281 + `lib/release-plan.ts` 91 + `lib/release-execution.ts` 57 + `lib/release-guards.ts` 134 | Plan 生成、执行步骤、前置守卫；原公共出口全部 re-export，入口不变 |
| `scripts/sdk-release.test.ts` 794 | `sdk-release.test.ts` 509 + `sdk-release.plan.test.ts` 172 | 计划/预检段独立；共享夹具移到 `packages/e2e/tests/tooling/sdk-release-fixture.ts`（149） |
| `scripts/lib/contract-inventory.ts` 548 | `contract-inventory.ts` 297 + `lib/contract-fields.ts` 160 + `lib/contract-ast.ts` 112 | 义务与字段派生 ／ 程序、别名与字面量解析 |
| `scripts/lib/contract-inventory.test.ts` 1258 | `contract-inventory.test.ts` 297 + `contract-inventory.derivation.test.ts` 350 + `contract-inventory.scan.test.ts` 593 | 真实仓库事实核验 ／ 派生规则 ／ 扫描与调用绑定；共享夹具移到 `packages/e2e/tests/tooling/contract-inventory-fixture.ts`（68） |
| `scripts/check-scenarios.ts` 705 | `check-scenarios.ts` 221 + `lib/scenario-precheck.ts` 102 + `lib/scenario-coverage.ts` 269 + `lib/scenario-reports.ts` 73 + `lib/scenario-staleness.ts` 58 | 预检、覆盖率对账、报告读取、过期判定 |
| `scripts/check-scenarios.test.ts` 1123 | `check-scenarios.test.ts` 369 + `check-scenarios.gate.test.ts` 368 + `check-scenarios.checkpoint.test.ts` 321 | 主流程 ／ 门禁规则 ／ checkpoint 对账 |
| （本任务新增） | `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-010.spec.ts` 192 | 格式与行数基线的受控根 CLI 用例 |

- 拆分只移动代码：`pnpm test:unit` 用例总数由 365 → 366（仅新增 SCN-010 的 module case），既有断言语义未改；`sdk-release.ts`、`contract-inventory.ts` 等公共出口集合未变（`check:package`、`check:architecture` 均通过）。
- 拆分后所有源文件 < 300、测试文件 < 600 有效行；清单 `quality.maxLinesExemptions` 保持为 `[]`（无整文件豁免）。

**方案与实际的差异**（含 Task 14 Files 之外的改动；均为按契约补充或同步受影响产物，未改规划语义）
1. **规则实现落在共享 CJS 生成器**：`scripts/lib/dependency-rules.cjs` 新增 `SOURCE_MAX_LINES`/`TEST_MAX_LINES`/`testFilePatterns`/`maxLinesExemptions`/`maxLinesConfig`，`eslint.config.js` 只展开 `...dependencyRules.maxLinesConfig(manifest)`；与 dependency-cruiser 规则同源，避免在 eslint 配置里另写一份清单读取逻辑。测试文件模式限定代码扩展名（`{js,mjs,cjs,ts,mts,cts}`），E2E 目录按清单测试包派生。
2. **受控根夹具的清单需写成 `format:check` 认得的样式**：`createControlledRoot` 用 `JSON.stringify(...,null,2)` 写清单，短数组会被 Prettier 判为未格式化；用例改用 `prettier.format(...)` 写夹具清单。这是夹具细节，不在断言面内，也不改门禁语义。
3. **unit 用例不加载 `eslint.config.js`**：实测在 test-tools-unit 里 `await import('eslint.config.js')` 会让 `dependency-rules.cjs` 经 Vite 二次实例化，覆盖率归因错位（该文件由 100% 掉到 60.41%，`/tmp/t14-unit.log`）。改为断言配置源码的全局 `ignores` 段含 `.local/**`；「显式指向 `.local` 下文件被跳过」的行为证据由 `max-lines-cli` 的 `ignore-entries` 承担。
4. **覆盖率补齐**：`maxLinesExemptions` 的兜底分支（清单无 `quality` 时返回 `[]`）由本任务 module case 覆盖，覆盖率回到四项 100%。
5. **超时调整（预授权项，均为副本/重负载用例；只改超时，断言与语义未动）**：
   - `scripts/lib/contract-inventory.scan.test.ts` 两个用例补 `{ timeout: 30_000 }`：GATE-026 副本内命中默认 5s（实测 12482ms / 6764ms，`/tmp/t14-checkfast.log`）。
   - `scripts/lib/contract-inventory.test.ts` 四个用例补 `{ timeout: 30_000 }`：副本内实测 5833ms / 4295ms / 3038ms / 5807ms（`treats a single-params union…` 在 5s 处超时，`/tmp/t14-verify.log`）。
   - `scripts/lib/contract-inventory.derivation.test.ts` 的单用例由 `30_000` 提到 `60_000`：这条**超出预授权的字面范围**（原已有 30s，不是默认 5s），原因是拆分让三个重负载文件并行后副本内实测 38.3s（`/tmp/t14-verify.log`）、满负载 21.5s（`/tmp/t14-checkfast2.log`），30s 预算不再够用。
6. **`SCN-TEMPLATE-EXAMPLE-005 window-and-timeout` 计时抖动（非本任务回归）**：首次全量 `core-hardening-t14b` 的 `check:fast` 因 `expected 1 to be greater than or equal to 2` 失败（`/tmp/t14-verify2.log`），单跑 493ms 通过（`/tmp/t14-rerun-005.log`），随后 `core-hardening-t14c` 的 check:fast 通过。与 Task 11 记录的同一计时抖动现象一致，本任务未改动示例与运行时。

**weapp 重跑记录**：本任务无 weapp 改动。全量 `verify`（run id `core-hardening-t14c`）weapp 步骤退出码 **0**（215613ms），5 个文件首跑全绿、**无重跑**：`SCN-PROTOCOL-CONTRACT-002` 11530ms、`SCN-PROTOCOL-CONTRACT-008` 11256ms、`FLOW-TEMPLATE-EXAMPLE-001` 11698ms、`SCN-TEMPLATE-EXAMPLE-002` 10986ms、`SCN-TEMPLATE-EXAMPLE-004` 11488ms。

**按需选择结果**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected`（run id `affected-20261010T005120Z`）退出码 **0**：39 个改动文件命中全量触发，原因是 `eslint.config.js` 属工具配置（全量触发路径），未退化为精确子集；全量 `check:fast` 退出码 0。选择规则按契约生效，未发现选择错误。
- 首次按需运行（`affected-20261010T004948Z`）同样升级为全量，但全量在 `contract-inventory.derivation.test.ts` 的 30s 超时处失败（差异 5 第 3 条），修复后重跑通过。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。需要说明的一次事件：首次按需运行升级为全量后失败（30s 超时，属本任务拆分引起的负载变化，已在按需流程内发现并修复），随后全量 `verify`（`core-hardening-t14b`）又在 `SCN-TEMPLATE-EXAMPLE-005` 计时抖动处失败，再跑 `core-hardening-t14c` 全绿。两次失败都不属于「按需子集漏测、全量才暴露」的选择规则缺陷（前者是全量自身超时，后者是与本任务无关的已知抖动），故计 0，并在此如实登记事件与证据。 附注（Task 9 交付物缺陷修复后修订）：本轮按需运行的 unit 步骤实际为空（根因与证据见「Task 9 交付物缺陷修复」），该轮按需结果标为**无效基线**，不计入 OI-CH-02。

**优先采用现成方案**
- 行数上限直接用 ESLint 内置 `max-lines` 的 `skipBlankLines`/`skipComments`，豁免用配置块 `max-lines: 'off'`，未自研行数统计；测试文件集合与豁免来源都从清单派生，未在门禁脚本里写死清单。
- 格式基线用现成 Prettier CLI（`prettier --check .`）与仓库既有 `.prettierignore`，受控根复制同一份 `.prettierrc.json`/`.prettierignore`，未自研格式检查。
- 用例断言上报复用既有 `cliEvidence` / `evidence` 包装（Vitest 原生 `context.annotate`），受控根复用既有 `createControlledRoot`，未新建夹具框架。
- 未新增任何运行时或开发依赖；本任务**无自研通用能力**。

### Task 9 交付物缺陷修复（fix commits `29e322a`、`f89546d`）

Task 16 实施期间按 ENG-06 运行约定执行 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected`，发现 Task 9 交付的按需入口存在两处缺陷。经用户裁决授权，在 Task 16 提交前单独修复并提交，**不改规划语义**（未改 proposal/specs/design/tasks，未改任何 Scenario 的 checkpoints）。

**缺陷 1：unit 步骤从未真正运行（`29e322a`）**

- 现象：`pnpm test:affected` 退出码 0，但 unit 步骤只输出 `No test files found, exiting with code 0`，没有任何用例结果（`/tmp/t16-affected.log`，1.9KB）。
- 根因：`scripts/test-affected.ts` 组装的是 `vitest related <改动文件> --project sdk-unit protocol-unit test-tools-unit --run`。Vitest 5.0.3 的 `--project` 只接受一个值，其后的项目名被当成**路径过滤器**：只有第一个项目生效，其余项目名成为过滤器，命中不到文件即“无测试文件”并以 0 退出。
- 四份实测日志：
  1. `/tmp/t16-related-3.log`：空格分隔三项目 → `No test files found`（`projects: sdk-unit`）。
  2. `/tmp/t16-run3.log`：同参数换成 `vitest run <文件>` 形态，Vitest 直接打印 `filter: <文件>, protocol-unit, test-tools-unit`，退出码 **1**，证明后两个名字被当作过滤器。
  3. `/tmp/t16-related-1.log`：只给 `--project test-tools-unit` → 16 用例通过。
  4. `/tmp/t16-related-repeat.log`：重复旗标 `--project sdk-unit --project protocol-unit --project test-tools-unit` → protocol-unit 7 文件 + test-tools-unit 1 文件，36 用例通过。
- 修复：改为 `unitProjects.flatMap((name) => ['--project', name])`，每个项目各带一个旗标，与既有 `scripts/run-by-manifest.ts` 的写法一致。

**缺陷 2：受控根/副本继承调用方的按需运行环境（`f89546d`）**

- 现象：修复缺陷 1 后按需运行真的跑起了 unit 用例，`scripts/test-affected.test.ts` 两条「写入 partial 报告后门禁拒收，全量报告被接受」立刻变红（`/tmp/t16-affected2.log`：`integration.json: partial 报告来自按需运行…`）。
- 根因：`pnpm test:affected` 给 unit 步骤注入 `TEST_AFFECTED_PARTIAL=1` 与 `VERIFY_REPORT_FILE`/`VERIFY_RUN_ID`；`createControlledRoot` 的 env 是 `{...process.env, …}`（只剔除了 `SCENARIO_GATE_CHANGES`），于是夹具内 `writeFullReport` 调用的替身 vitest 也被判为 partial，写出 partial 报告。同一份夹具在按需与全量下行为不同，这正是「按需与全量分叉」的一类来源；此前 unit 步骤为空，该缺陷被完全掩盖。
- 取证：`TEST_AFFECTED_PARTIAL=1 pnpm exec vitest run --project test-tools-unit scripts/test-affected.test.ts` 退出码 **1**、2 条 AssertionError（`/tmp/t16-partial-env.log`）；不带该变量退出码 **0**（`/tmp/t16-partial-noenv.log`）。
- 修复：按 `repository-copy.ts` 的既有做法，`createControlledRoot` 的环境剔除 `VERIFY_REPORT_FILE`、`VERIFY_RUN_ID`、`TEST_AFFECTED_PARTIAL`（与既有 `SCENARIO_GATE_CHANGES` 同一处理），`repository-copy.ts` 的 `copyEnvironment()` 补上 `TEST_AFFECTED_PARTIAL`。修复后带/不带该变量均退出码 0（`/tmp/t16-partial-env2.log`）。

**按用户要求的双层防退化**

- module 断言（`scripts/test-affected.test.ts` 的 `unit-related-selection`）：`product-unit` 与 `test-tools-unit` 在参数中的前一项都必须是 `--project`；只保留 `toContain` 不足以发现退化（本轮就是这样漏掉的）。
- 行为断言（`SCN-SCENARIO-GATE-021` 的 `tooling-selection`，未新增 checkpoint、未改 Spec）：在仓库副本中改动 `scripts/lib/affected-sample.ts`，**真实运行** `test:affected`，断言退出码 0、输出不含 `No test files found`、unit 报告中出现该源文件对应的 `scripts/lib/affected-sample.test.ts` 且用例数大于 0。为让该断言能识别「项目名退化为过滤器」，替身 vitest 按 Vitest 的真实参数语义解析（`--project` 每次只取一个值，其余位置参数是路径过滤器），无命中时打印 `No test files found` 并写 0 用例。
- RED：把实现临时改回缺陷写法后，module 断言报 `expected 'product-unit' to be '--project'`（`/tmp/t16-fix-red-unit.log`），行为断言报 `expected 'No test files found, exiting with code 0' not to contain 'No test files found'`（`/tmp/t16-fix-red-int.log`）；恢复修复后两份均绿（`/tmp/t16-fix-unit.log`、`/tmp/t16-fix-int.log`）。

**同类问题排查（用户要求第 3 项：检查 scripts/ 下所有拼外部命令的地方）**

| 位置 | 命令与多值参数 | 结论 |
| --- | --- | --- |
| `scripts/test-affected.ts:144` | `vitest related … --project` | **缺陷，已修**（空格分隔 → 每项目一个旗标） |
| `scripts/run-by-manifest.ts:33` | `vitest run --project` | 正确：`for (const name of projects) args.push('--project', name)` |
| `scripts/verify.ts:130` | `vitest run --project <单个>` | 正确：一步一个项目名 |
| `scripts/lib/affected-analysis.ts` | `depcruise … --reaches <正则>` | 正确：多文件用 `\|` 合并成单个正则，本就不该重复旗标 |
| `scripts/check-architecture.ts` `cruiseArguments` | `depcruise --config/--output-type` + 多个目录 | 正确：目录是位置参数，选项均单值 |
| `scripts/weapp-prepare.ts` | `cli quit` / `pkill -f` / `cli open --project <host>` | 正确：均单值 |
| `scripts/lib/release-plan.ts`、`scripts/check-package.ts` | `pnpm --filter <包> pack/run build` | 正确：一条命令一个过滤器 |
| `scripts/check-fixtures.ts`、`fixtures-refresh.ts`、`check-scenarios.ts` | `--change`、`--report`、`--scenario` | 正确：这些是本仓库自己的 CLI，逗号/重复值由各自解析器负责，不经外部工具的多值旗标语义 |
| `scripts/lib/scenario-precheck.ts` | `openspec --version` | 正确：单值 |
| `scripts/lib/source-inventory.ts` | `git ls-files -co --exclude-standard -- <patterns…>` | 正确：`--` 之后的路径本就是位置参数 |

结论：除 `test-affected.ts` 外，未发现第二处「多值旗标用空格分隔」。同时按第 2 项的同类思路检查了环境泄漏：`repository-copy.ts` 已剔除 `VERIFY_*` 但漏了 `TEST_AFFECTED_PARTIAL`，已在本次一并补上（见缺陷 2）。

**修复提交后的验证**

- `pnpm exec vitest run --project test-tools-unit scripts/test-affected.test.ts` 退出码 **0**（12 用例）；带 `TEST_AFFECTED_PARTIAL=1` 同样 **0**。
- 定向集成复跑（020/021/022/005/006/011/012）退出码 **0**（`/tmp/t16-fix-int.log`、`/tmp/t16-fix-int2.log`）。
- 作用域内 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 **0**（单测 369、集成 117，覆盖率四项 100%，`/tmp/t16-checkfast3.log`、`/tmp/t16-checkfast4.log`）。

**OI-CH-02 重新统计**

- **无效基线**：Task 9–16 各轮按需运行的 unit 步骤实际为空（`No test files found` 且退出码 0），这些轮次的按需结论不构成有效证据，已在各任务段落的 OI-CH-02 行标注「无效基线」，不计入统计。
- **补跑 Task 13 提交点**（b551b27，用修复后的入口、`--base b551b27^`，日志 `/tmp/t13-affected-rerun.log`）：该提交的改动含 `packages/e2e/host/weapp/` 与 `packages/e2e/src/drivers/`，按规则升级为全量 `pnpm check:fast`（`全量触发`），退出码 **0**，单测 56 文件/365 用例、集成 51 文件/113 用例全部通过，与该任务当时的全量 `verify` 结论一致。
- **补跑 Task 16 提交点**（修复提交 `f89546d` 为基线，日志 `/tmp/t16-affected-final.log`）：退出码 **0**，未升级为全量，unit 步骤**真实执行** 7 文件/63 用例（含 `scripts/check-architecture.test.ts`），与该任务全量 `verify` 的结论一致。
- **重新统计**：补跑点「按需通过、全量失败」**0** 次；Task 9–15 轮次因基线无效不计入。修复后未再出现「按需与全量结论不一致」的情况。

### Task 16 技术架构文档与指南修订

**Commit**：`docs(template): add architecture document and revise the template guide`

**RED**

- `/tmp/t16-red-unit.log`：`vitest run --project test-tools-unit scripts/check-architecture.test.ts` 退出码 **1**，006 新增的 `guide-rules` 与 012 新增的 `architecture-doc-rules` 各 1 条失败（16 测试 2 failed）。
- `/tmp/t16-red-integration.log`：012 的 `architecture-doc-violations-cli` 与 006 的 `guide-violations-cli` 失败（3 测试 2 failed）。
- `/tmp/t16-red-check.log`：干净 HEAD 副本 + 新检查器运行 `pnpm check:architecture` 退出码 **1**，20 条 issue（`missing docs/architecture.md` + 5 条缺章节 + 14 条白名单缺项）。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| `pnpm check:architecture` | 0 | `issues: []`，83 modules / 181 dependencies，`/tmp/t16-arch.log` |
| `vitest run --project test-tools-unit scripts/check-architecture.test.ts` | 0 | 16 用例，`/tmp/t16-unit-arch2.log` |
| 定向集成子集（002/005/006/012/GATE-008/GATE-011） | 0 | 21 用例，`/tmp/t16-tooling-subset3.log` |
| `pnpm test:unit` | 0 | 63 文件 / 369 用例，覆盖率四项 **100%**（3291/2172/604/2910），`/tmp/t16-unit2.log` |
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | 0 | `/tmp/t16-lint2.log`、`/tmp/t16-format.log`、`/tmp/t16-typecheck.log` |
| `SCENARIO_GATE_CHANGES=… pnpm check:fast` | 0 | 单测 369 + 集成 117，`/tmp/t16-checkfast4.log`（首跑 `/tmp/t16-checkfast.log` 因 `SCN-TEMPLATE-EXAMPLE-005` 计时抖动失败，`/tmp/t16-checkfast2.log` 通过） |
| `SCENARIO_GATE_CHANGES=… pnpm test:affected` | 0 | run id `affected-20261010T020412Z`，unit 步骤 7 文件 / 63 用例，`/tmp/t16-affected-final.log` |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t16b` | 1 | check:fast **0**（118164ms）、weapp **0**（366941ms）、check:scenarios **1**（1380ms、2 条），`/tmp/t16-verify2.log` |

**报告路径**：`artifacts/core-hardening-t16b/reports/{unit.json,integration.json}`；weapp 逐文件报告 `artifacts/core-hardening-t16b/reports/weapp/<文件名>.json`；覆盖率 `artifacts/core-hardening-t16b/coverage/`。`check:scenarios` 结论以 stdout JSON 为准（完整输出见 `/tmp/t16-verify2.log`）。

**无上下文 Agent 验收（Task 16 Verification 要求）**

- 实验设置：另起一个**不带上下文**的子代理，提示词只含一个问题（"这个模板的质量体系如何防止'门禁全绿但其实没有检查到'？"）与一条硬约束（**只允许读取** `docs/architecture.md`，不读其他文件与 git 历史、不执行命令），并要求指出文档不足之处。
- 回答摘录（覆盖本 Change 机制）：仍按手写源码清单派生覆盖率（`check:coverage`，否决 glob 维护 `include`）、checkpoint 双向对账（声明与执行都必须一致、skip 不计覆盖）、报告与 Fixture 按来源摘要绑定（旧报告失效）、`partial` 报告被场景门禁拒收、门禁自身由合成反例与受控根自测（否决"改仓库实时状态再还原"）、IDL 义务与调用点双向对账（`method#request#field`）、证据分类（behavior/module/engineering 不可互相抵扣）与清单不回退、按入口发现需注释的手写类型（否决清单里手列类型名）。
- 结论：**部分能**。给出的理由是：上述机制方向上都能让"没真正检查"无法通过；但文档未写明 5 处细节——(1) 来源摘要覆盖哪些输入、如何计算；(2) checkpoint 的"执行"如何被机器强制确认；(3) 100% 覆盖率的口径（行/分支/函数）与被排除文件是否另有证据要求；(4) 文档与指南的内容准确性只由评审与复刻验收保证、不做机械检查；(5) 复刻验收是方法而非可机械复算的门禁。
- 处置：**本会话未在该实验之后改动 `docs/architecture.md`**，使已记录的全量 `verify`（`core-hardening-t16b`）与被提交的文档内容一致。上述 5 处属"文档详略"层面的观察，是否需要补写由验收方判定；若补写，必须重跑 `check:fast` 与全量 `verify` 以保持证据一致。

**场景门禁剩余问题归属（2 条，4 → 2）**

- `SCN-TEMPLATE-ENGINEERING-012` 两条（`architecture-doc-rules`、`architecture-doc-violations-cli`）已在本任务绑定并执行，**清零**。
- `SCN-TEMPLATE-ENGINEERING-008`：2 条（`example-removal-fast`、`example-removal-scenarios` 的 `missing binding for integration`）→ **Task 17 自动化部分**（用例由本会话交付，演练与勾选由验收方执行）。
- 无过期报告、无未登记 checkpoint、无 `did not execute` / `no executed assertions` 回归项。

**Review / Acceptance**

- 四部分齐全：`docs/architecture.md` 的细节层 33 个 `###` 能力节覆盖指南「能力地图」28 行标题，每节固定「解决的问题 / 实现机制与关键文件 / 关键设计决策与被否决的方案 / 演进记录」；演进记录用 Change 名纯文本，本 Change 只写 `template-core-hardening`，未链接 `openspec/changes/`。
- 设计理由逐一核对四个归档 Change 的 design：`2026-09-22-headless-payment-sdk`、`2026-09-30-template-example`、`2026-10-02-generalize-template`、`2026-10-02-remove-payment-business`；被否决的方案均能在归档或本 Change 的 design 中找到出处。
- 归档已知限制为**实测**结论（openspec 1.6.0）：要求全量 REMOVED → `Spec must have at least one requirement` + `Aborted. No files were changed.`；保留 ID 改标题 → `current spec contains scenario(s) not present in the modified block`。
- 指南 19 项删除白名单逐项与清单角色派生，章节、运行约定、复刻验收与示例片段标记（`<!-- template-example:begin/end -->`）均由 ENG-06/ENG-10 机械核验；根 `AGENTS.md` 删除 `artifacts/<run-id>/tasks/` 要求并改链接，`README.md` 链接架构文档。

**方案与实际的差异**（含 Task 16 Files 之外的改动；均为按契约补充或同步受影响产物，未改规划语义）

1. **既有架构夹具必须能生成"清单一致"的指南与架构文档**：`packages/e2e/tests/tooling/helpers.ts` 的 `writeTemplateGuideFixture` 改为按清单角色的包目录派生白名单文本（默认 `sdk`/`protocol`/`e2e`），并新增 `writeArchitectureFixture`；`SCN-TEMPLATE-ENGINEERING-005.spec.ts` 的 `architectureFixture` 按清单传目录、`rename-by-manifest` 在按清单改名后重写指南。原因是删除白名单由清单派生（ENG-06 新增检查），005 原夹具用的是 `sample-sdk`/`sample-protocol` 目录，改名后必然与指南不一致。
2. **夹具文案避免误触"未登记 pnpm 命令"**：`helpers.ts` 指南夹具中 `fixtures:refresh` 由行内代码改为纯文本（夹具清单只声明 `check:fast`，行内代码会按 `pnpm` 命令核对）。
3. **抽取 Markdown 解析共用模块**：新增 `scripts/lib/markdown-docs.ts` 与 `scripts/lib/architecture-doc.ts`，`check-architecture.ts` 改为复用前者（原文件内的同名实现删除）。原因既是 Task 16 需要表格解析，也是 Task 14 的行数上限：继续在 `check-architecture.ts` 内堆实现会超限。
4. **覆盖率四项 100% 需要补分支**：`capabilityMapNames` 原用 `?? []` 兜底产生不可达分支，改为按 Markdown AST 的必然结构直接取子节点；012 的 `architecture-links-resolve` 增加一条**可解析**的相对链接，覆盖断链检查的另一侧分支。断言语义未改。
5. **用户裁决要求的 fix commits 不计入本任务**：`29e322a`、`f89546d` 是 Task 9 交付物缺陷修复，单独提交并在上文单列。

**weapp 重跑记录**：本任务无 weapp 源码改动。全量 `verify`（run id `core-hardening-t16b`）weapp 步骤退出码 **0**（366941ms）：`SCN-PROTOCOL-CONTRACT-002` 11439ms 首跑通过；`SCN-PROTOCOL-CONTRACT-008` 首次断言前 **120012ms 挂起失败、断言数 0**（`packages/e2e/AGENTS.md` 记录的主进程挂起现象），`pnpm verify` 自动 `weapp:prepare` 后**整文件重跑 11150ms 通过**；`FLOW-TEMPLATE-EXAMPLE-001` 11491ms、`SCN-TEMPLATE-EXAMPLE-002` 11443ms、`SCN-TEMPLATE-EXAMPLE-004` 11430ms 均首跑通过。与 Task 13 记录的同一现象一致。

**按需选择结果**

- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected`（run id `affected-20261010T020412Z`）退出码 **0**：改动 14 个文件（文档、脚本、tooling 夹具）未命中任何全量触发路径，退化为 1 个步骤 `vitest related <8 个代码改动文件> --project sdk-unit --project protocol-unit --project test-tools-unit --run`，unit 步骤真实执行 **7 文件 / 63 用例**全部通过，与全量 `check:fast` 的单测结论一致。
- 首次按需运行（`/tmp/t16-affected.log`）因 Task 9 缺陷 unit 步骤为空，已按上文标为**无效基线**。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次。首轮按需运行无效（unit 步骤为空，见「Task 9 交付物缺陷修复」）；补跑（`/tmp/t16-affected-final.log`）unit 步骤真实执行且与全量一致。全量 `verify` 的 `check:scenarios` 退出码 1 由 **2 条尚未交付的 `SCN-TEMPLATE-ENGINEERING-008` case（Task 17 自动化部分）**引起，不是回归，也不属于"按需子集漏测"。

**附记（非本任务回归的计时抖动）**：全量 `verify` 首跑（run id `core-hardening-t16`，`/tmp/t16-verify.log`）在 `SCN-TEMPLATE-EXAMPLE-006 host-cancel` 失败（`expected [] to have a length of 1`，取消竞态），该文件单跑连续 3 次通过（`/tmp/t16-ex006-1..3.log`），此后所有全量运行通过。现象与 Task 11/14 记录的示例计时抖动同类，本任务未改动示例与运行时。

**优先采用现成方案**

- Markdown 解析复用既有 `unified` + `remark-parse` 链（与 `check-architecture.ts`、`example-markers.ts` 同源）；表格只对指南「能力地图」启用官方 `remark-gfm`（`markdown-docs.ts` 注释说明为何与断链检查用的解析链分开，避免自动链接改变既有断链判定）。
- 相对链接解析、根文件链接补齐复用既有 `linkTarget`/`linkRootDocument`；删除白名单、章节清单、能力节清单全部由清单与指南派生，未自研第二套清单格式。
- 用例复用既有 `cliEvidence`/`evidence` 包装与受控根 helper，未新建夹具框架；未新增任何依赖（`remark-gfm` 已在 Task 6/15 使用）。


### Task 15 渐进式项目地图、CLAUDE.md 配对与 AGENTS 约定

**Commit message**：`docs(template): add progressive project map with paired CLAUDE.md`

**RED（预期失败的反例，已实际执行）**
- 为不污染工作区，RED 在 `git archive HEAD` 得到的干净副本 `/tmp/t15-red` 中采集（该副本保留 HEAD 的文档、`package.json`、清单与 `check-architecture.ts`，只放入本任务新增的用例与共享夹具 `writeProjectMapFixture`/`runProjectMap`，不含 `scripts/check-project-map.ts` 与各模块 AGENTS/CLAUDE）。副本内 `git init` 以满足源码清单对 git 工作区的要求。
  - 011 的 module case 先失败：`vitest run --project test-tools-unit scripts/check-project-map.test.ts` 退出码 **1**，`Cannot find module './check-project-map.ts'`（`/tmp/t15-red-unit.log`）。
  - 011 的 engineering case 先失败：`vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-011.spec.ts` 退出码 **1**（`/tmp/t15-red-integration.log`）：HEAD 的 `check-architecture.ts` 未接线项目地图，`runArchitecture` 对新增模块目录不报错，`wired-into-architecture` 取到 `undefined`。
  - “现仓库运行 `check:project-map` 报缺失”：把本任务的 `scripts/check-project-map.ts` 单独放入 HEAD 副本后运行 `tsx scripts/check-project-map.ts`，退出码 **1**，**38** 条 issue，首条为 `missing packages/sdk/src/example/AGENTS.md`（`/tmp/t15-red-check.log`）；HEAD 的根 `package.json` 无 `check:project-map` 脚本（`git show HEAD:package.json | grep -c check:project-map` = 0）。

**GREEN**
- `pnpm test:unit` 退出码 **0**：63 文件 / 368 用例（较 Task 14 的 62/366 增加 011 的 module case）；覆盖率 Statements **3241/3241**、Branches **2148/2148**、Functions **593/593**、Lines **2865/2865**，四项 **100%**（`/tmp/t15-unit.log`）。`scripts/check-project-map.ts` 单文件 100%（128/128、66/66、22/22、108/108）。
- `pnpm lint`、`pnpm format:check`、`pnpm typecheck` 退出码 **0**（`/tmp/t15-lint.log`、`/tmp/t15-format.log`、`/tmp/t15-typecheck.log`）。
- `pnpm check:architecture` 退出码 **0**，`issues: []`，dependency-cruiser `no dependency violations found (83 modules, 181 dependencies)`。
- 011 两个 case 直接运行通过：module `project-map-rules` 506ms、engineering `project-map-violations-cli` 5942ms（全量 verify 内，`/tmp/t15-verify.log`）。
- 受影响夹具适配后定向复跑：`SCN-SCENARIO-GATE-008`、`SCN-TEMPLATE-ENGINEERING-002`、`-005`、`-006`（共 18 用例）连同 `-011` 的 1 个 engineering case，合计 **19** 用例退出码 **0**（`/tmp/t15-tooling-subset.log`）。
- 作用域内 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` 退出码 **0**（`/tmp/t15-checkfast.log`）：单测 63/368、覆盖率四项 100%、集成 53 文件 / 116 用例（含新增 011）、`check:fixtures` 与 `check:package` 均 `issues: []`。
- 模块级 AGENTS.md 加载确认：仓库新增 **19** 个模块/包/根 AGENTS.md 与 **19** 个 CLAUDE.md（根 1 + 包 3 + 模块 15），每个 CLAUDE.md 首个非空行为 `@AGENTS.md`，由 `check:project-map` 的双向配对检查逐项核验（`/tmp/t15-checkfast.log` 的 `issues: []` 即该检查通过）；`.claude`/`generated`/`fixtures` 等目录不参与。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 011 module case（RED，干净 HEAD 副本） | 1 | `Cannot find module './check-project-map.ts'`，`/tmp/t15-red-unit.log` |
| 011 engineering case（RED，干净 HEAD 副本） | 1 | `wired-into-architecture` 取到 `undefined`，`/tmp/t15-red-integration.log` |
| `tsx scripts/check-project-map.ts`（RED，HEAD 副本 + 仅检查器） | 1 | 38 条 issue，`/tmp/t15-red-check.log` |
| `pnpm test:unit`（GREEN） | 0 | 63 文件 / 368 用例，覆盖率四项 100%，`/tmp/t15-unit.log` |
| `pnpm lint` / `pnpm format:check` / `pnpm typecheck` | 0 | `/tmp/t15-lint.log`、`/tmp/t15-format.log`、`/tmp/t15-typecheck.log` |
| `pnpm check:architecture` | 0 | `issues: []`，83 modules / 181 dependencies |
| 既有 tooling 夹具定向复跑（008/002/005/006/011） | 0 | 19 用例，`/tmp/t15-tooling-subset.log` |
| `SCENARIO_GATE_CHANGES=… pnpm check:fast` | 0 | 63/368 单测 + 53/116 集成，`/tmp/t15-checkfast.log` |
| `SCENARIO_GATE_CHANGES=… pnpm test:affected` | 0 | run id `affected-20261010T011835Z`，全量触发 `check:fast`（退出码 0），`/tmp/t15-affected.log` |
| `pnpm verify --change template-core-hardening --run-id core-hardening-t15` | 1 | check:fast **0**（119363ms）、weapp **0**（220869ms）、check:scenarios **1**（1619ms、4 条），`/tmp/t15-verify.log` |

**报告路径**：`artifacts/core-hardening-t15/reports/{unit.json,integration.json}`；weapp 逐文件报告 `artifacts/core-hardening-t15/reports/weapp/<文件名>.json`；覆盖率 `artifacts/core-hardening-t15/coverage/`。`check:scenarios` 结论以 stdout JSON 为准（完整输出在 `/tmp/t15-verify.log`；单独复算在 `/tmp/t15-gate2.log`）。

**场景门禁剩余问题归属（4 条，6 → 4）**
- `SCN-TEMPLATE-ENGINEERING-011` 两条（`project-map-rules`、`project-map-violations-cli`）已在本任务绑定并执行，**清零**。
- `SCN-TEMPLATE-ENGINEERING-012`：2 条（`architecture-doc-rules`、`architecture-doc-violations-cli`）→ **Task 16**。
- `SCN-TEMPLATE-ENGINEERING-008`：2 条（`example-removal-fast`、`example-removal-scenarios`）→ **Task 17 自动化部分**（用例由本会话交付，演练与勾选由验收方执行）。
- 无过期报告、无未登记 checkpoint、无 `did not execute` / `no executed assertions` 回归项。

**Review / Acceptance**
- 19 个模块/包/根 AGENTS.md 的内容按实际文件与依赖逐个核对：模块五节均为 `职责 / 对外入口 / 允许依赖 / 本地约束 / 子模块`，无内容的节写「无」；包级「子模块」列出的目录与 `moduleDirectories` 实测一致（sdk：`example`、`runtime`；protocol：`adapters`、`errors`、`ports`、`transport`、`testing/shadow`；e2e：`src/cases`、`src/drivers`、`src/reporters`、`host/weapp`、`tests/example`、`tests/protocol`、`tests/tooling`、`tests/weapp`）；`generated/` 与 `tests/fixtures/` 未登记。
- `packages/e2e/AGENTS.md` 的「断言反模式」5 条各附正确写法（恒真断言、checkpoint 名实不符、循环空转、单飞合并下计数恒真、只断言没有抛错），「断言审查清单」给出“先读登记含义、再看断言会不会因实现出错而失败”的评审判据。
- 包级规则只写在包级文件，模块文件只写本模块边界与链接，未复制上级规则。

**方案与实际的差异**（含 Task 15 Files 之外的改动；均为按契约补充或同步受影响产物，未改规划语义）
1. **既有“架构根”夹具必须补齐项目地图**（Task 15 Files 未列，但 `check:architecture` 新增调用后 `toEqual([])` 的既有断言会失败）：`scripts/check-architecture.test.ts` 的 `fixture()`、`packages/e2e/tests/tooling/scenario-gate-helpers.ts` 的 `writeRepositoryPackages` 各补一次 `writeProjectMapFixture(root)`；`SCN-SCENARIO-GATE-008.spec.ts` 在恢复阶段重写根 AGENTS.md 后重新补齐项目地图；`SCN-TEMPLATE-ENGINEERING-005.spec.ts` 的 `architectureFixture` 补一次、`rename-by-manifest` 在按清单改名后重新生成。断言语义未改，只更新夹具输入。
2. **根 AGENTS 的“能力变化同步架构文档”用行内代码而非链接**：`docs/architecture.md` 由 Task 16 创建，此刻写成相对链接会被架构检查判为断链（AGENTS/README 的相对链接必须可解析）；Task 16 建文档后改为链接（ENG-10 要求链接）。
3. **新增共享夹具落在既有 helper**：`moduleSkeleton`/`writeProjectMapFixture` 加在 `packages/e2e/tests/tooling/helpers.ts`，`runProjectMap` 加在 `scenario-gate-helpers.ts`，与既有 `writeTemplateGuideFixture`/`runArchitecture` 同址，避免新建第二套夹具文件。
4. **CLI 分支的覆盖率登记**：`check-project-map.ts` 的进程入口（`if (process.argv[1] && …)`）用既有的 `/* v8 ignore start/stop */` 包裹——真实进程级行为由 011 的 integration case 承担，unit 覆盖率仍需四项 100%，与 `check-architecture.ts`、`run-by-manifest.ts` 的登记方式一致。
5. **RED 在 HEAD 副本补采**：本任务在同一会话内连续实施与验证，为给出可复现的“先失败”证据，用 `git archive HEAD` 建 `/tmp/t15-red` 复现实现前的状态；副本只含新用例与新夹具，不含检查器、接线与模块文档（详见 RED 段）。
6. **清单 `moduleRoots` 已在 Task 3 登记**：本任务只向 `requiredCommands` 追加 `check:project-map`；未改包目录、包名与 `moduleRoots`。
7. **Minor（用户指定，Task 15）**：根 `package.json` 新增 `"check:project-map": "tsx scripts/check-project-map.ts"`，紧邻 `check:architecture`，并由清单 `requiredCommands` 纳入架构检查。

**weapp 重跑记录**：本任务无 weapp 源码改动。全量 `verify`（run id `core-hardening-t15`）weapp 步骤退出码 **0**（220869ms），5 个文件首跑全绿、**无重跑**：`SCN-PROTOCOL-CONTRACT-002` 11840ms、`SCN-PROTOCOL-CONTRACT-008` 11514ms、`FLOW-TEMPLATE-EXAMPLE-001` 11537ms、`SCN-TEMPLATE-EXAMPLE-002` 15433ms、`SCN-TEMPLATE-EXAMPLE-004` 11555ms。

**按需选择结果**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected`（run id `affected-20261010T011835Z`）退出码 **0**：本轮改动含 `package.json`（构建输入）、`project.manifest.json`（清单）与 `packages/e2e/host/weapp/`、`packages/e2e/src/drivers/` 下的 AGENTS/CLAUDE（宿主/驱动目录），全部命中全量触发路径，选择规则升级为全量 `check:fast`（退出码 0），未退化为精确子集，未发现选择错误。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。全量 `verify` 的 `check:scenarios` 退出码 1 由 **4 条尚未交付的后续任务 case（012 与 008）**引起，不是回归，也不属于“按需子集漏测”，故不计入。 附注（Task 9 交付物缺陷修复后修订）：本轮按需运行的 unit 步骤实际为空（根因与证据见「Task 9 交付物缺陷修复」），该轮按需结果标为**无效基线**，不计入 OI-CH-02。

**优先采用现成方案**
- 项目地图结构检查复用既有 `unified`/`remark-parse`/`unist-util-visit` Markdown 解析链（与 `check-architecture.ts`、`example-markers.ts` 同源），未自研 Markdown 解析；路径集合用既有的 `git`/清单派生方式，未在脚本里写死包名与目录。
- CLAUDE.md 配对使用官方约定的 `@AGENTS.md` 导入行，未使用软链接（Windows 检出会退化、编辑工具拒绝写入），符合 Design 已核实结论。
- 用例断言上报复用既有 `cliEvidence`/`evidence` 包装（Vitest 原生 `context.annotate`），受控根复用既有 `minimalManifest`/`createControlledRoot` 与 `writeTemplateGuideFixture`，未新建夹具框架。
- 未新增任何运行时或开发依赖；本任务**无自研通用能力**。

### T10/T12/T13 交付物缺陷修复（示例绑定证据迁出补完 · fix commits `8b5e08f`、`eb5df99`）

Task 17 自动化层要求"示例删除后共享能力的证据仍能独立运行"。按用户裁决补完 Task 10/12/13 遗留的示例绑定证据迁出，**不改规划语义**：证明共享能力 Scenario（protocol-contract / scenario-gate / template-engineering）的证据必须自供输入；只有证明 `template-example` 自身 Scenario 的证据才允许用 `template-example` 标记包装。

**每个文件的处理方式**

| 文件 | 处理方式 |
| --- | --- |
| `packages/sdk/src/consumed-operations.ts` | 标记包装：示例条目与 `requestAuthority` 位于 `template-example:begin/end` 内（template-example 自身 Scenario 的证据，允许包装） |
| `packages/sdk/src/consumed-operations.test.ts` | 标记包装：`SCN-TEMPLATE-EXAMPLE-012` 的模块证据在标记内，标记外只留"每条声明的 method 都是 generated 方法描述" |
| `packages/protocol/src/client.test.ts` | 自供输入：请求/响应载荷改为用例内常量，不再读 `SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` |
| `packages/protocol/testing/shadow/response-shape.test.ts` | 自供输入：`baseResp` + `fixtureSamples` 取代协议矩阵 Fixture |
| `packages/protocol/src/transport/context.test.ts` | 新增 module 用例：观测传给 `sleepMs` 的 `Cancellation.isStopped()`，覆盖副本里会丢失的 `context.ts:34` 分支 |
| `packages/e2e/tests/tooling/declaration-fixture.ts` | 自供输入：新增 `exampleDeclarationSource`/`exampleCallerSource`/`repositoryProtocolSource` 与 `protocolFiles`/`generatedFromRepository`（受控根复制仓库 generated，generated 不在示例删除白名单内） |
| `packages/e2e/tests/tooling/contract-inventory-fixture.ts` | 自供输入：新增 `exampleInventoryRoot()`/`inventoryTradeFile()` |
| `scripts/lib/contract-inventory.test.ts`、`contract-inventory.scan.test.ts` | 自供输入：`derivation-rules`、`context-obligation`、`pending-*`、`oneof-*` 等改用受控根，不再读仓库示例声明与 generated |
| `scripts/lib/project-manifest.test.ts` | 从清单派生：`obligation-environments` 的期望值为 `testProjectsByClass(manifest, ['integration','platform'])` 与 `['integration']`，不写死 `integration+weapp`；输入取自受控根 |
| `packages/e2e/host/weapp/protocol-runner.ts` | 运行器按消费接口声明遍历：声明外的矩阵项跳过、声明为空正常结束（不抛"没有 CreateTrade"），与 SCN-008 `empty-declaration-matrix` 同口径 |
| `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts` | 自供输入：`missing-comment-rejected` 用受控声明源，不再依赖 `packages/sdk/src/example/contracts.ts` |
| `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-009.spec.ts` | 从宿主目录派生：允许的覆盖率例外由 `packages/e2e/host/weapp/*.ts` 派生（示例删除后 `example-runner.ts` 消失，期望值随之收敛） |
| `packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-001.spec.ts` | 自供输入：`inventory-cli` 在 `enableInventory(realSources)` 前写入受控声明与调用 |
| `packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts` | 断言修复（`eb5df99`）：标记计数改为"存在且成对"，见下 |

**副本验证（A 的完成条件：副本内 `check:fast` 退出码 0）**
- 副本由 008 用例构造（`git ls-files -co --exclude-standard` 复制、`git init` 提交、`pnpm install --offline --frozen-lockfile`、归档作用域内 Change、清除 `SCENARIO_GATE_CHANGES`、`TEMPLATE_COPY=1`）。副本内 `pnpm check:fast` 退出码 **0**（`$TMPDIR/t17-copy-check-fast.log`）：单测 58 文件/319 用例、覆盖率 Statements **3073/3073（100%）**、集成 39 文件/91 用例、`check:package` issues `[]`。
- 标记外的共享能力证据（协议客户端、Shadow 同形校验、义务派生、门禁自测）自供输入后仍可运行；副本内不再因缺少示例声明/generated 输入而失败。

**A 后暴露的缺陷与修复（`eb5df99`）**
- 现象：A 把 `requestAuthority` 包进标记后，`packages/sdk/src/consumed-operations.ts` 的 `template-example:begin` 标记由 2 对变 3 对，两处写死的计数断言失效——`packages/sdk/src/consumed-operations.test.ts:67`（sdk-unit）与 `packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts:90`（integration）。
- 副本为什么没暴露：两处断言都在 `template-example` 标记内，副本按白名单剥离标记片段时整段删除（`SCN-TEMPLATE-EXAMPLE-012` 的模块 case 随示例消失），所以副本 `check:fast` 全绿；只有仓库内全量才暴露——这正是"按需升级为全量"的价值。
- RED：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` 升级为全量 `check:fast` 后 `test:unit` 退出码 **1**（`/tmp/t17-affected.log`：`expected [ '// template-example:begin', …(2) ] to have a length of 2 but got 3`）；integration 侧单独复现同一失败（`/tmp/t17-red-012.log`，退出码 1，同一条 AssertionError）。
- 修复：断言改为"标记存在且成对"（`begins.length > 0`、`ends.length === begins.length`），不写死数量。GREEN：`pnpm exec vitest run --project sdk-unit packages/sdk/src/consumed-operations.test.ts` 退出码 **0**（2 用例）；`SCENARIO_GATE_CHANGES=template-core-hardening pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts` 退出码 **0**（1 用例）。
- 修复对副本无影响（断言位于标记内，副本仍整段剥离）；随后仓库内 scoped `check:fast`（含 008 副本流程）与全量 `verify` 均通过。

### Task 17 自动化部分：示例删除验证（自动化层）

**范围**：本 Change 的 `SCN-TEMPLATE-ENGINEERING-008` 自动化用例及其依赖迁出。用户交接明确「示例删除演练」与 Task 18 由验收方派发**全新的无上下文 Agent** 在隔离副本中执行，本任务**不勾选 Task 17**、不提交演练记录。

**规划修订（Apply 期间用户裁决，先于本任务提交）**
- 单独提交 `7a4c87c docs(openspec): amend example-removal gate expectation by user decision`，只含 `specs/template-engineering/spec.md`、`design.md`、`plan-review.md`。
- 触发（A2 与补充）：本任务实测副本清单模式问题 16 条，其中 14 条由 `TEMPLATE_COPY` 排除列表解释，另 2 条（`SCN-PROTOCOL-CONTRACT-002/protocol-matrix`、`SCN-PROTOCOL-CONTRACT-008/request-id-wire` 的 `missing binding for weapp`）无法归属：门禁的绑定来自运行报告（`scripts/lib/scenario-reports.ts:70`），平台项目（清单 `class=platform`，此处 weapp）在副本中不运行也无法运行，故必然缺绑定。原字面口径（"问题数 0"/"只扣排除项"）在副本里没有可达的绿灯。
- 裁决：期望集合 = 排除列表推导出的缺失项 + 清单 `class=platform` 测试项目对应的缺失绑定；两部分都不手写，多一条少一条都失败，其余问题为 0；反例保留。
- digest：`8ddc5d01b814f19fe2ab3ecb0d9d9e37ef903763a61430a6cd1fe9ed5f3bc15b`（A2）→ `4d72484291f3f8493ec8f3932d68e13aa740dcbdcb27a3d5605147e2199523bd`（补充），`--check-review` 退出码 0、`freshness=PASS`（每次运行 008 前后均复核）。
- Requirement 正文变化使 008 Fixture 来源摘要过期（`pnpm check:fixtures` 报 1 条），按用户要求先 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm fixtures:refresh SCN-TEMPLATE-ENGINEERING-008`（退出码 0，`updated:["SCN-TEMPLATE-ENGINEERING-008"]`），随后 `pnpm check:fixtures` issues `[]`。

**Files**
- Create：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`、`packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/{manifest.json,example-removal.json}`。
- Modify：`packages/e2e/vitest.config.integration.ts`（`TEMPLATE_COPY` 排除列表加入 008；并具名导出该列表供期望集合推导，见"方案与实际的差异"第 1 条）。

**RED（实际执行，可复现）**
- 断言保持原口径（`inventory.issues` 必须为 `[]`）时运行 008：`SCN-TEMPLATE-ENGINEERING-008 example-removal-fast` 通过、`example-removal-scenarios` 失败（`/tmp/t17-red-final.log`，91.61s，1 failed | 1 passed）；失败信息列出副本清单模式实测的 16 条 `missing binding`。同一次运行的副本 `check:fast` 已通过，说明缺的正是场景门禁口径。
- 修复后同文件退出码 **0**，2 用例通过（首次 81.87s；仓库内 scoped `check:fast` 与全量 `verify` 各复跑一次同样通过）。

**GREEN 与期望集合推导**
- 期望集合由 `expectedMissingBindings(copy, inventory)` 推导，两部分：
  1. 排除列表（具名导出的 `copyCreatingSpecs`）里每个仍存在的 spec 文件 → 取该文件的 `ownerId`/`environment` 字面量 → 有效 Spec 清单中该 Scenario 的、`requiredIn` 含该环境的用例（用例名取自门禁自己的 `--inventory` 输出，不另写名单）；
  2. 清单 `testProjectsByClass(manifest, ['platform'])` 的项目 → `requiredIn` 含该项目的用例。
- 实测两条与期望一致：副本问题集合 16 条 = ENG-001 6 + ENG-007 5 + ENG-008 2 + SCN-SCENARIO-GATE-026 1（均 integration）+ weapp 2（`$TMPDIR/t17-copy-inventory.log`）。
- 反例（同一次用例运行内）：删除副本 integration 报告里共享 Scenario `SCN-PROTOCOL-CONTRACT-003/wrong-code` 的那条执行记录后复跑同一门禁 —— 退出码非 0，问题数 16 → 17，多出恰好 1 条 `SCN-PROTOCOL-CONTRACT-003/wrong-code: missing binding for integration`（`$TMPDIR/t17-copy-inventory-probe.log`）；期望集合不含该条，精确扣除断言会拦住它。

**命令与退出码**

| 命令 | 退出码 | 证据 |
| --- | --- | --- |
| 008 integration（RED：`issues === []` 口径） | 1 | 1 failed \| 1 passed，`/tmp/t17-red-final.log` |
| 008 integration（GREEN，两条 case） | 0 | 2 用例通过 81.87s |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm fixtures:refresh SCN-TEMPLATE-ENGINEERING-008` | 0 | `updated:["SCN-TEMPLATE-ENGINEERING-008"]` |
| `pnpm check:fixtures`（刷新后） | 0 | issues `[]` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` | 1 | 升级为全量 `check:fast`，暴露 A 的标记计数缺陷，`/tmp/t17-affected.log` |
| `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast`（修复后） | 0 | 单测 63 文件/370 用例、集成 55 文件/119 用例、覆盖率四项 100%、`check:package` issues `[]`，`/tmp/t17-checkfast.log` |
| `pnpm verify --change template-core-hardening`（run id `template-core-hardening-apply-20261010T031045Z`） | 0 | `check:fast` 0（160475ms）、`test:e2e:weapp` 0（519450ms）、`check:scenarios` 0（1507ms），`/tmp/t17-verify.log` |

**方案与实际的差异**（含本任务 Files 之外的改动；未改规划语义）
1. **排除列表位置与导出**：规格写"根 `vitest.config.ts` 的排除列表"，实际列表在 `packages/e2e/vitest.config.integration.ts`（Task 4/5 已登记：根 `test.exclude` 不作用于 `projects` 中的子项目，只有项目自身 config 的 `exclude` 生效）。本任务把该数组具名导出 `copyCreatingSpecs` 供用例 `import`，满足"排除列表要能被导入或解析、不在用例里再手写一份名单"；Files 只点名"排除列表加入 008"，导出属同一文件的实现细节，按 Task 7 先例在此登记。
2. **显式超时 900s**（用例级 `vi.setConfig({ testTimeout: 900_000 })`）：副本内要重建依赖、归档作用域内 Change、跑完整 `check:fast`（仓库内单跑实测 118.1–135.6s，副本内更慢）并跑两次场景门禁，默认 5s 与 026 的 300s 都不够。只改超时，断言与语义未动。
3. **平台缺失绑定纳入期望集合**：见上"规划修订"；Gate 的 `check()` 只在绑定缺失时报 `missing binding`，副本不运行平台项目，故这类问题在清单模式下不可消除。
4. **A 的缺陷由本任务的全量触发暴露**，按用户授权单独提交 `eb5df99`（见上节），未并入 Task 17 提交。
5. **排除列表里的示例 spec 在副本中已被白名单删除**：推导时跳过不存在的文件（`SCN-TEMPLATE-EXAMPLE-008.spec.ts`），其 Scenario（`template-example`）也随示例删除而不存在，没有可推导的缺失项——与实测集合一致。

**weapp 重跑记录**
- 本任务无 weapp 源码改动；自动化层不运行小程序项目（副本不能运行平台用例，这正是平台缺失绑定需纳入期望集合的原因）。
- 全量 `verify`（run id `template-core-hardening-apply-20261010T031045Z`）的 weapp 步骤：5 个文件，`FLOW-TEMPLATE-EXAMPLE-001` 首跑在断言前 120s 挂起（`/tmp/t17-verify.log`，与 `packages/e2e/AGENTS.md` 记录的基础设施抖动一致），按"失败整文件重跑"约定复跑通过（11913ms）；其余 4 个文件首跑通过：`SCN-PROTOCOL-CONTRACT-002` 11327ms、`SCN-PROTOCOL-CONTRACT-008` 11337ms、`SCN-TEMPLATE-EXAMPLE-002` 11454ms、`SCN-TEMPLATE-EXAMPLE-004` 11707ms。未使用 `-t`。

**按需选择结果**
- `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected`（`/tmp/t17-affected.log`）：4 个改动文件命中全量触发（`packages/e2e/vitest.config.integration.ts` 属工具配置），升级为全量 `check:fast`；首轮在该全量里暴露 A 的标记计数缺陷（退出码 1），修复后 scoped `check:fast` 退出码 0。选择规则本身未发现错误，未出现"选择不足"。

**OI-CH-02 统计**：本任务「按需通过、全量失败」**0** 次（累计 0）。本轮按需结论**有效**（unit 步骤真实执行：63 文件/370 用例）。需登记的一次事件：首轮按需运行升级为全量后失败（交付物缺陷，已在按需流程内发现并修复），属"全量自身暴露的缺陷"，不是"按需子集漏测、全量才发现"，故计 0。

**优先采用现成方案**
- 期望集合推导复用既有能力与自身输出：排除列表用具名导出直接 `import`（Node ESM 原生，无解析器）；用例名取门禁自己的 `--inventory` 输出（`scenarios[].verification.cases[]`）；平台项目取清单 `testProjectsByClass(manifest, ['platform'])`。未自研第二套 Scenario/case 解析器，未新增依赖。
- 副本构造、Change 归档、`TEMPLATE_COPY` 守卫、门禁运行全部复用 Task 5 的仓库副本 helper 与既有 `check:fast`/`check:scenarios` 入口；反例探针只改写副本内既有报告文件后复跑同一门禁，未新增门禁能力或夹具框架。
- 本任务**无自研通用能力、未新增任何运行时或开发依赖**。

---

## Final Code Review 与演练修复

**范围**：验收方对 Task 17 自动化部分与示例删除演练日志的最终代码评审共 14 条。先取消勾选受影响的 Task（`39385c7 docs(openspec): uncheck tasks under final review`），再逐条修复、复验、自审，最后重新勾选；Task 17 / 18 仍不勾选。每条（或同一 Task 的几条）单独提交，提交信息见各条；本节逐条登记根因、改动、证据（命令、退出码、日志路径）与反例。

**证据基线**：只读演练副本 `/private/tmp/claude-501/-Users-liyongning-Projects-workspace-sdk-template/f9f56b99-68ab-4be9-a947-7e43849bb047/scratchpad/drill-17/repo`，日志在同级 `drill-17-tools/`；本目录内不做任何改动。

### 第 1 条 · Task 3/4 + Task 17：无 active Change 时副本构造必然失败

- **根因**：两处把「本 Change 仍在 active」当成事实。
  1. `SCN-TEMPLATE-ENGINEERING-001.spec.ts` 的复制输入探针把 `openspec/changes/template-core-hardening/tasks.md` 追加进清单 `fingerprints.buildInputs`，归档后该路径不存在、`git ls-files` 匹配不到 → 断言失败（演练 `drill-17-tools/verify-2.log:422`：`expected [ '.dependency-cruiser.cjs', …(345) ] to include 'openspec/changes/template-core-harden…'`）。核心 Change 归档后主仓库会一直处于这个状态。
  2. `SCN-TEMPLATE-ENGINEERING-008.spec.ts` 的仓库副本构造要求 `scopedChangeNames().length > 0`，归档后固定执行 `git commit -m "copy: archive scoped change"`；作用域为空时没有可提交内容 → `git commit` 退出码非 0 → 抛错（演练 `verify-2.log:403`：`Error: git -c commit.gpgsign=false commit -q -m copy: archive scoped change:`）。
- **改动**：
  - 001：探针路径改为用例在临时根里自造（`mkdtempSync` + `git init` + 写入 `openspec/changes/probe-change/tasks.md`），不再引用主仓库某个 active Change 的路径。
  - 008：`copy: archive scoped change` 只在 `git status --porcelain` 非空时才提交；`assertCopyConstruction` 改为「作用域为空时跳过归档断言，只断言副本中没有 active Change」；作用域非空时行为不变。
  - `SCN-SCENARIO-GATE-026` 等其它使用仓库副本 helper 的用例逐条核对：只断言「作用域内 Change 不在 active 目录」，作用域为空时天然成立，无需改动。
- **证据（副本内 `test:integration` 全绿）**：临时脚本 `/tmp/tcfix-item1-evidence.mts` 走 `createRepositoryCopy` 构造副本，再跑一次全量 `test:integration`。两次运行的 `copyEnvironment()` 都设 `TEMPLATE_COPY=1` 并清空副本内的 `SCENARIO_GATE_CHANGES`，差别只在宿主有没有作用域：
  - **A. 作用域为空**（宿主未设 `SCENARIO_GATE_CHANGES`，脚本打印 `scope from env: []`）：副本里没有可归档的作用域，本 Change 按 helper 规则被**直接移出副本（不是归档）**，主 Spec 不含本 Change 的 delta。结果：`active changes: []`、`TEMPLATE_COPY=1`、`SCENARIO_GATE_CHANGES: undefined`、`build exit: 0`、`test:integration` 50 文件 / 104 用例全绿（22.55s，exit 0）；5 个 `TEMPLATE_COPY` 排除项（ENGINEERING-001、ENGINEERING-007、GATE-026、ENGINEERING-008、EXAMPLE-008）都 `present in output: false`——也就是这一轮里 ENG-001、ENG-008 等**没有真实执行**。日志 `/tmp/fcr-item1-evidence.log`。
  - **B. 作用域非空**（宿主设 `SCENARIO_GATE_CHANGES=template-core-hardening`，脚本打印 `scope from env: [ 'template-core-hardening' ]`）：副本里走真实归档，主 Spec 合入本 Change 的 delta；其余与 A 相同（同样 `TEMPLATE_COPY=1`，5 个排除项都没执行）。日志 `/tmp/tcfix-item1-evidence.log`。
  - 两次都只覆盖 `test:integration`，都没有让被排除的副本用例真实执行。「真实归档 + 不带作用域 + 不设 `TEMPLATE_COPY`」的 `check:fast` 全绿证据见「第二轮修复」第 7 条。
- **反例**：修复前同一场景在演练副本里 008 两条 case 全失败、001 `package-boundaries` 失败（`drill-17-tools/verify-2.log:402-445`，`Test Files 2 failed | 41 passed`）。
- **提交**：`fix(template): construct copy probes without an active change`。

### 第 2 条 · Task 13：weapp 的 PC-008 证据改走 generated 方法

- **根因**：`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts` 经宿主 `runProtocolSuite` 发请求，而该运行器按 SDK 的消费接口声明（`packages/sdk/src/consumed-operations.ts`）遍历接口。PC-008 是共享能力，示例删除后声明数组为空（`// template-example` 标记整段剥离），运行器按约定「声明为空时正常结束」，一个请求都不发；用例却固定期望 `records.length === steps.length`（8 次 CreateTrade），于是 Shadow 报告 `missing request 1 of 8`（演练 `drill-17-tools/weapp-008-rerun.log`）。同时该用例没有 `template-example` 标记，删示例后照常运行，属于缺绑定。
- **改动**（`idl: 'generated'` 这一条只影响本用例，不改变声明语义）：
  - `packages/e2e/host/weapp/protocol-runner.ts`：新增第二条接口来源 `idl: 'generated'`——按接口名在 generated IDL 模块导出里解析 HTTP 方法描述（支持多个入口模块，不写死方法名），GATE/声明路径完全不变：默认仍是 `declared`，声明为空时 `continue` 后返回空结果集。
  - `packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts`：调用 `runProtocolSuite` 时传 `idl: 'generated'`，请求序列仍是本用例自己声明的 8 条（矩阵 1、稀疏 1、共享证据 4、在途超时 1、网络分支 1），断言仍由用例自身的 `steps` 派生；顺带按第 6 条给该序列里的 `rawBody` step 补了 `malformed`。
  - generated IDL 不在示例删除白名单内，PC-008 的宿主证据与 integration 版同源（都只依赖协议来源）。
- **证据**：
  - 修复前（演练）`weapp-008-rerun.log`：`request-id-wire-weapp/CreateTrade: missing request 1 of 8`，退出码 1。
  - 修复后真实运行：`pnpm weapp:prepare`（退出码 0，51s，含新增就绪探测）→ `pnpm exec vitest run --project weapp packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts`：1 用例通过 10011ms，退出码 0（`/tmp/tc2-weapp-008.log`）。未用 `-t`。
  - 反例（证明不依赖声明）：把 `packages/sdk/src/consumed-operations.ts` 的数组临时清空（`export const consumedOperations: ReadonlyArray<ConsumedOperation> = []`）后重跑同一文件，仍 1 用例通过 9221ms、退出码 0（`/tmp/tc2-weapp-008-empty-decl.log`）；随后立即还原该文件（`git diff` 无输出）。
- **代价**：宿主 runner 打包体积 14.37 kB → 70.87 kB（gzip 4.66 kB → 13.22 kB），因为 generated IDL 入口模块进了 bundle；这是共享能力证据不再依赖产品声明的直接结果。
- **同文件跨越**：`protocol-runner.ts` 里「消费接口声明不经 SDK 根入口导出，改按源码路径读取」这一行属第 3 条（同一条提交承载，见第 3 条）。
- **提交**：`fix(template): source weapp request-id evidence from generated idl`。

### 第 3 条 · Task 10（用户已裁决）：SDK 根入口不再导出消费接口声明

- **根因**：`packages/sdk/src/index.ts` 把包内实现 `consumed-operations.ts` 的类型与常量当公共 API 导出（`consumedOperations`、`ConsumedMethod`、`ConsumedOperation`、`ConsumedRequestField`）。声明模块是门禁的分析输入，不应固化成产品公共接口；示例删除后它还留在 `dist` 声明里。
- **改动**（不改规划语义）：
  - `packages/sdk/src/index.ts`：删除上述 4 个导出，只保留 `template-example` 标记内的示例客户端导出，并把「声明是包内实现、门禁与用例都按清单登记的源码路径读取」写进入口注释。
  - 消费点改为按源码/分析路径读取：`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts` 直接用相对路径 import `packages/sdk/src/consumed-operations.ts`；宿主 `protocol-runner.ts` 用 `../../../sdk/src/consumed-operations`（该行随第 2 条提交）。
  - 清单 `packages[role=product].consumedOperations = ["packages/sdk/src/consumed-operations.ts"]` 未变，`check-fixtures` / `check-scenarios` 仍按清单读源码。
- **证据**：
  - `pnpm build` 退出码 0（`/tmp/tc3-build.log`）；`grep -n "consumedOperations\|ConsumedMethod\|ConsumedOperation\|ConsumedRequestField" packages/sdk/dist/index.d.ts packages/sdk/dist/index.d.cts packages/sdk/dist/index.js packages/sdk/dist/index.cjs` 退出码 1（四处产物均不再出现这些名字）。
  - `pnpm typecheck` 退出码 0。
  - `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`：2 文件 / 2 用例通过，退出码 0（365ms / 4076ms）。
  - `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fixtures`：`manifests: 19, issues: []`，退出码 0（证明门禁仍按清单路径读源码）。
- **反例**：`packages/sdk/dist/index.d.ts` 修复前导出 `export { consumedOperations } from './consumed-operations';`（原始内容见本 Change 提交前的 `packages/sdk/src/index.ts`）；若有人把声明再当公共 API 导出，`grep` 的退出码会变回 0。
- **提交**：`fix(template): keep the consumed-operations declaration package-internal`。

### 第 5 条 · Task 3：源码清单剔除工作区已删除但未暂存的路径

- **根因**：`scripts/lib/source-inventory.ts:42` 的 `git ls-files -co` 会列出「工作区已删除、但索引里还在（未 `git rm`/未暂存删除）」的文件，下游 `readSourceInventory` 按清单 `readFileSync` 读内容 → `ENOENT` 崩溃。演练副本里出现过这条崩溃路径（先删文件再跑门禁）。
- **改动**：`listGitFiles` 在 `git ls-files -co` 之后统一过滤掉磁盘上不存在的路径（`existsSync(join(root, path))`）。用 `existsSync` 而不是 `git ls-files --deleted` 做差集：`--deleted` 只覆盖索引态，`-co` 的另一个来源是未跟踪新文件，两套口径叠加反而更容易漏；单次 `existsSync` 判定与现有实现同一处收敛，无额外进程与状态。
- **证据**：
  - 单测 `scripts/lib/source-inventory.test.ts` 新增用例 `drops tracked files deleted from the worktree but not yet staged`：RED（旧实现）断言 `['scripts/kept.ts']` 时得到 `['scripts/kept.ts','scripts/removed.ts']`；GREEN 后 `scripts/lib/source-inventory.test.ts` 4 用例通过（`pnpm exec vitest run --project test-tools-unit scripts/lib/source-inventory.test.ts`，退出码 0，同一命令在 `scripts/lib/source-inventory.test.ts scripts/check-fixtures.test.ts` 下 2 文件 / 11 用例通过、961ms）。
  - 反例：`rmSync('scripts/removed.ts')` 后 `listGitFiles` 仍应返回该路径（旧行为）；对应 `codeFiles(readSourceInventory(root))` 从 `['scripts/kept.ts','scripts/removed.ts']` 变为 `['scripts/kept.ts']`，不再给下游留下 `ENOENT`。
- **提交**：`fix(template): drop worktree-deleted paths from the source inventory`。

### 第 7 条 · Task 6：Fixture 不写 `sources.spec` 即跳过 owner 与摘要检查

- **根因**：`scripts/check-fixtures.ts:85` 用 `const spec = manifest.sources.spec; if (spec?.requirementDigest) { … }` 包裹 owner 存在性与来源摘要检查，Fixture 来源里只要不写 `spec`（或写了 `spec` 但没有 `requirementDigest`）就整段跳过。演练复现：新建 `SCN-TEMPLATE-ENGINEERING-999/manifest.json`、`sources` 只写 `{"note":"x"}`，`check:fixtures` 的 `issues` 为空。
- **改动**：
  - `packages/e2e/tests/fixtures/fixture.schema.json`：`sources` 增加 `"required": ["spec"]`（`minProperties: 1` 保留）。
  - `scripts/check-fixtures.ts`：`Manifest.sources.spec` 改为必需字段，去掉可选分支，无条件按目录名解析 owner 并比对来源摘要——不存在「不声明来源即不校验」的路径。
  - `scripts/check-fixtures.test.ts`：`writeFixture` 支持直接给 `sources`（构造缺失 `spec` 的反例）；`reports missing, invalid, mismatched and undeclared fixture manifests` 里的干净 Fixture 补上真实 Requirement 块与摘要（schema 变严后的连带修正）。
- **证据**：
  - 修复后复现同一反例：`packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-999/manifest.json`（`sources` 只有 `note`）→ `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fixtures`：`manifests: 20`、`issues: ["SCN-TEMPLATE-ENGINEERING-999: manifest schema data/sources must have required property 'spec'"]`、进程退出码 1；随后删除该 Fixture 目录（`git status` 只剩本条的 schema 改动）。
  - 正向：同一命令在仓库内为 `manifests: 19, issues: []`、退出码 0。
  - 单测：`pnpm exec vitest run --project test-tools-unit scripts/lib/source-inventory.test.ts scripts/check-fixtures.test.ts` → 2 文件 / 11 用例通过（891ms 级），其中 `scripts/check-fixtures.test.ts` 7 用例含新增的 note-only 反例与摘要修正后的干净 Fixture。
- **反例口径**：断言的是 `issues` 里出现 `manifest schema`（schema 层拦截），不是"恰好一条问题"——owner/摘要检查现在无条件执行，schema 判断先失败时不再进入摘要比对。
- **提交**：`fix(template): require fixture spec sources and always resolve owners`。

### 第 6 条 · Task 12（I-1）：rawBody 不声明 malformed 就能跳过同形校验

- **根因**：`packages/protocol/testing/shadow/server.ts:122` 的构造期结构校验只对 `body` 生效——`malformed` 分支之后直接 `if (!hasOwnProperty(step,'body')) return;`，于是只给 `rawBody`（原样发送、不做 JSON 序列化）的 step 既不做结构校验、也不认领 `malformed`，留下 PC-04 禁止的「不声明即不校验」路径。
- **改动**：
  - `server.ts`：`malformed` 已声明时照旧提前返回；否则若 step 自带 `rawBody` 就在构造期抛 ``rawBody 必须显式声明 malformed（结构校验只覆盖 body）``，与 `body` 校验同一循环、同一报错前缀（含 scenario/route/step 序号）。
  - 三处 `rawBody` step 补 `malformed: { reason: '非法 JSON 响应体（解码错误义务）' }`：`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts:248`、`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts:205`、`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts:57`；`server.test.ts` 里既有的 `rawBody: 'not-json'` step 同样补上。
  - `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts` 的 `requestStep` 形参类型补 `malformed`。
- **证据**：`pnpm exec vitest run --project protocol-unit` → 18 文件 / 94 用例通过、退出码 0，其中 `packages/protocol/testing/shadow/response-shape.test.ts`（3 用例，含新增反例断言）与 `server.test.ts` 覆盖两条分支；`protocol/SCN-PROTOCOL-CONTRACT-002` 集成用例此前同改动运行通过（4076ms）。
- **反例**：新增断言 `expect(() => createShadowServer({ ..., scenarios: [scenarioWith({ rawBody: '{', contentType: 'application/json' })] })).toThrow(/rawBody 必须显式声明 malformed/)`——修复前 `scenarioWith` 里这一形态构造成功且静默放行；断言只有在该 step 不声明 `malformed` 时才通过，声明了 `malformed` 的三处新用例同时覆盖"声明即放行"的另一侧。
- **记录修正**：Task 12 段原有「补 `malformed` 声明的步骤 0 处」已在该段就地改注，指向本条。
- **提交**：`fix(template): require malformed claims for rawBody shadow steps`。

### 第 8 条 · Task 10（I-3）：协议矩阵的"空声明"断言恒真

- **根因**：`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts:541-545` 在 `declaredNames.length === 0` 时断言 `expect(declaredObligationKeys()).toEqual([])`，而 `declaredObligationKeys()` 本身就是"把空声明按义务展开"的结果：无论门禁派生是否出错，它都必然是空数组，属于恒真断言（断言审查清单里的第 1 类）。
- **改动**：改成核验**真实派生结果** `inventory.obligations`——除 `idl.error-contract#`（由 IDL 错误契约派生、不属于消费接口派生的矩阵范围）之外的义务必须为空；同时要求 `idl.error-contract#` 义务数量大于 0，作为"这是同一份真实 inventory、不是空集合"的存在性证据。非空声明分支的断言保持原样。
- **证据**：`pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts` → 2 文件 / 2 用例通过、退出码 0（`SCN-PROTOCOL-CONTRACT-002 protocol-matrix` 4076ms）；`SCN-TEMPLATE-ENGINEERING-008` 的 `empty-declaration-matrix` checkpoint 仍断言同一 inventory 里 `idl.error-contract#business-error#` 恰好 1 条且 `requiredIn=['integration']`，与本条的存在性断言互相印证。
- **反例**：把 `declaredObligationKeys()` 换成恒真的空数组断言时，即使门禁多派生出一条义务也不会失败；新断言取 `inventory.obligations`，多派生一条即 F`toBeGreaterThan(0)`/`toEqual([])` 失败。
- **提交**：`fix(template): assert the real derived obligations when the declaration is empty`。

### 第 4 条 · Task 3：开发者工具改写的项目配置让验收报告一跑完就过期

- **根因**：`packages/e2e/host/weapp/project.config.json` 受 git 跟踪，而微信开发者工具打开项目时会改写它（实测删掉末尾换行）。该文件在清单 `fingerprints.sourceRoots` 的 `packages/e2e/host` 覆盖范围内，所以一次完整 `pnpm verify`（内含 weapp 用例）跑完，源码摘要就与报告不一致——演练 `scenarios.log:2899` 记录到 181 条 stale，变化文件正是它（`integration/all-errors is stale … 变化文件（共 1 个）：packages/e2e/host/weapp/project.config.json`）。
- **改动**：
  - 仓库只跟踪模板 `packages/e2e/host/weapp/project.config.template.json`，内容与原来的 `project.config.json` 逐字节相同。
  - 新增 `scripts/lib/weapp-project-config.ts`：`writeProjectConfig(hostDirectory)` 由模板幂等生成 `project.config.json`（先复制再覆盖，开发者工具改写后重跑会还原）。
  - `.gitignore` 忽略生成物；`scripts/weapp-prepare.ts` 的 `prepareWeapp` 与宿主 Vitest `globalSetup`（`packages/e2e/host/weapp/setup.ts`，供手工 `pnpm test:e2e:weapp` 不经 `weapp:prepare` 时使用）都在启动前生成一次。
  - `hostProject(root)` 从 `planWeappPrepare` 中抽出，供生成与预热共用（仍按清单里的测试包目录派生，不写死包目录）。
- **证据**：
  - 修复前：`git ls-tree 367f7d7 packages/e2e/host/weapp/` 仍列出 `project.config.json`（受跟踪）；`scenarios.log:2899` 的 stale 变化文件为 `packages/e2e/host/weapp/project.config.json`。
  - `pnpm weapp:prepare` 退出码 0（30.6s，日志 `/tmp/tc4-prepare.log`）；生成物与模板 `diff` 退出码 0；`git status --porcelain packages/e2e/host/weapp/` 不含该文件。
  - 反例（模拟开发者工具改写）：把生成物末尾换行删掉（270 → 269 字节）后，`git status --porcelain packages/e2e/host/weapp/` 仍只有本条自己的改动，源码清单不再包含该文件，摘要不再可能因它变化。
  - 单测：`pnpm exec vitest run --project test-tools-unit scripts/lib/weapp-project-config.test.ts` → 1 用例通过、退出码 0（覆盖模板生成与"改写后重新生成"两侧）。
  - 收尾证据（完整 `pnpm verify --change template-core-hardening` 之后单独再跑 `check:scenarios`、问题数为 0）见本节末尾「最终全量验收」。
- **偏差**：模板重命名（`git mv`）被并入第 5 条提交 `d893185`（该提交里它是 0 行内容变化的纯重命名）；本条提交只含 `.gitignore`、`scripts/weapp-prepare.ts`、`packages/e2e/host/weapp/setup.ts` 与新增的 `scripts/lib/weapp-project-config.{ts,test.ts}`。
- **提交**：`fix(template): generate the weapp devtools config from a tracked template`。

### 第 12 条 · Task 13 / 验收流程：小程序冷启动改为就绪探测

- **根因**：`prepareWeapp` 原实现只按固定流程退出、清理、`cli open` 后返回，是否可跑由后续 spec 自己撞运气。演练 `verify-3.log:20`、`:66` 记录同一文件连续两次失败：自动 prepare 之后 `SCN-PROTOCOL-CONTRACT-002` 在 `MiniProgram.checkVersion` 处 `Cannot read properties of undefined (reading 'split')`（`Tool.getInfo` 还没返回 `SDKVersion`，`licia/cmpVersion` 拿到 `undefined`），手工多等 25 秒后同一用例 11085ms 通过（`weapp-manual.log:21`）。
- **改动**（`scripts/weapp-prepare.ts`，不依赖固定 sleep）：
  - 新增 `readyProbe = { attemptTimeoutMs: 30_000, intervalMs: 5_000, attemptCount: 12 }` 与 `waitForDevtoolsReady(host, cli)`：反复 `automator.launch` + `checkVersion()`，成功一次即返回；每次失败 `disconnect` 后按 `intervalMs` 重试，预算耗尽抛 ``微信开发者工具未就绪：<最后一次错误>``。
  - `prepareWeapp` 改为 `async`、末尾 `await waitForDevtoolsReady(...)`；模块入口改 `process.exitCode = await prepareWeapp(process.cwd())`，`pnpm weapp:prepare` 的退出码即"就绪与否"的判定结果（`scripts/verify.ts` 逐文件前调用该命令）。
- **证据**：`pnpm weapp:prepare` 退出码 0、24.7s（日志 `/tmp/tc12-prepare.log`）；对照演练：固定等待版本在同一次演练里两次失败（`verify-3.log`），本机不等待额外秒数、探测首次即通过。
- **反例**：固定 sleep 不构成判定依据——`verify-3.log` 两次运行之间已有间隔仍然失败；新实现只有在 `checkVersion()` 真正读到版本号时才返回，否则以非零退出码失败，`verify` 据此判失败而不是让用例随机红。
- **提交**：`fix(template): probe devtools readiness before running weapp specs`。

### 第 9 条 · Task 15/16：指南补齐三处 SHALL 内容

- **根因**：Final Code Review 指出指南缺 ENG-09、PC-01、PC-05 三处 SHALL 要求的陈述：ENG-09 要求在指南写明 Claude Code 版本下限与 `CLAUDE.local.md` 的开头约定；PC-01 要求能力地图写明"新增消费接口"的操作；PC-05 要求在能力地图注明删除 `runtime.nextRequestId` 是破坏性变更。
- **改动**（只改 `docs/template-guide.md`，不动规划语义）：
  - 能力地图「渐进式项目地图与 CLAUDE.md 配对」承载文件列补"Claude Code 版本不低于 v2.1.277"；「使用方约定」新增一条：根与各级 `CLAUDE.md` 首个非空行固定为 `@AGENTS.md`，本地的 `CLAUDE.local.md` 同样必须以 `@AGENTS.md` 开头，配对由 `pnpm check:project-map` 核对（ENG-09）。
  - 能力地图「IDL 协议义务派生与消费接口双向对账」补矩阵 Fixture 链接，并在验证方式列写明新增消费接口只有两步：声明里登记方法与请求字段策略、矩阵 Fixture 里补该接口名的键，不需要改门禁脚本或矩阵用例代码（PC-01）。
  - 能力地图「X-Request-Id 按公司规范」验证方式列注明删除 `runtime.nextRequestId` 是协议包与产品包公共 API 的破坏性变更（双格式类型声明随之变化），宿主无法再覆盖或注入请求 ID（PC-05）。
- **证据**：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:architecture` 退出码 0、`{"issues": []}`（能力地图每行仍有 architecture.md 同名节）；`pnpm check:project-map` 退出码 0、`{"issues": []}`；`pnpm exec prettier --write docs/template-guide.md` 退出码 0。
- **反例**：三处 SHALL 缺一时，指南与 Spec 的表述不一致——能力地图不再说明"新增消费接口只改声明与矩阵 Fixture"，读者会去改门禁脚本；删除 `runtime.nextRequestId` 的破坏性也没有任何指南线索。事实检查覆盖不到的文本缺口靠本条的逐句比对发现。
- **提交**：`fix(template): document the guide SHALLs for ENG-09, PC-01 and PC-05`（`20d89b1`，该提交只改 `docs/template-guide.md`；本条验收记录随第 10 条提交落地）。

### 第 10 条 · Task 15/16：指南笔误、清单派生措辞与示例绑定文档

- **根因**（逐条）：
  - 指南第 101 行把作用域变量写成 `SCN-SCENARIO_GATE_CHANGES=...`（笔误），照抄执行得到的是未知变量；同时没写"删除示例后至少 `git add -A` 或提交"这一步。
  - 第 72 行收尾验收仍写"三项证明"，与统一入口 `pnpm verify` 不一致。
  - 第 64 行仍要求手改 `vitest.config.ts`、`eslint.config.js`、`.dependency-cruiser.cjs` 里的包名 glob，而这三处已按清单派生。
  - 示例描述散落在 `README.md`、`docs/architecture.md`、`packages/sdk/AGENTS.md`、`packages/e2e/AGENTS.md`、`packages/e2e/host/weapp/AGENTS.md` 与 ENG-001 Fixture 的 `sdkExports`，删除示例后会留下悬挂引用或写死的示例导出名。
- **改动**：
  - `docs/template-guide.md`：笔误改为不带作用域的运行口径并补 `git add -A`/提交前置（仍在 active Change 中时按第 4 条带作用域）；第 72 行改为 `pnpm verify`；第 64 行改为"glob 已按清单派生，不要手改"；两处预热描述统一为同一个数值"约 25 秒"，并写明 `weapp:prepare` 轮询到读到版本号为止、以退出码为就绪判定。
  - 示例绑定文档：`README.md` 三包表把"示例能力（`src/example/`）"改为与示例无关的业务能力表述；`docs/architecture.md` 去掉"写法模板给在示例 `contracts.test.ts`（随示例删除）"，改为就近单测；`packages/sdk/AGENTS.md` 的分层指引去掉 `src/example/` 参照；`packages/e2e/AGENTS.md` 测试目录说明去掉 `tests/example/`；`packages/e2e/host/weapp/AGENTS.md` 的对外入口与覆盖率排除两条去掉 `example-runner.ts`。以上均按"改写为与示例无关的表述"处理，不加标记（Markdown 标记按整行识别，行内标记不会被裁剪逻辑识别，反而留下悬挂文字）。
  - ENG-001 Fixture：5 个 case 文件里的 `sdkExports` 写死了示例导出名（`ExampleConfigurationError`、`createExampleClient`）；该字段已不再被断言使用（`SCN-TEMPLATE-ENGINEERING-001` 的导出集合改由 `discoverEntryExports` 从产品包根入口计算），因此直接删除字段与 `SCN-TEMPLATE-ENGINEERING-001.spec.ts` 里对应的类型成员，并 `pnpm fixtures:refresh SCN-TEMPLATE-ENGINEERING-001` 更新摘要。
  - 事实检查增强（拦住不可执行的命令写法）：`scripts/check-architecture.ts` 新增 `templateEnvironmentNames` 白名单（`SCENARIO_GATE_CHANGES`、`TEMPLATE_COPY`、`TEST_AFFECTED_PARTIAL`、`VERIFY_REPORT_FILE`、`VERIFY_RUN_ID`、`WECHAT_DEVTOOLS_CLI`）与 `environmentPrefixes()`，行内代码里出现表外的 `NAME=` 前缀即报 `unknown environment variable <NAME>`；变量名允许小写字母与连字符，所以 `SCN-SCENARIO_GATE_CHANGES=` 这类笔误会命中，`==` 比较不会。
- **证据**：
  - `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:architecture` 退出码 0、`{"issues": []}`（说明修正后的指南不含表外变量、能力地图与 architecture.md 同名节仍对齐）。
  - `pnpm check:project-map` 退出码 0、`{"issues": []}`（各级 `AGENTS.md` 与 `CLAUDE.md` 结构未受影响）。
  - `pnpm exec vitest run --project test-tools-unit scripts/check-architecture.test.ts` → 16 用例通过、退出码 0（新增断言：`VERIFY_RUN_ID=` 不报错，`SCN-SCENARIO_GATE_CHANGES=` 报 `unknown environment variable`）。
  - `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts` → 6 用例通过、退出码 0（删掉 `sdkExports` 后各消费方断言不受影响）。
  - `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fixtures` → `manifests: 19, issues: []`、退出码 0。
- **反例**：
  - 事实检查：把指南恢复成修复前的第 101 行写法（`SCN-SCENARIO_GATE_CHANGES=... pnpm check:fast`）时，`check:architecture` 非零退出并报 `unknown environment variable SCN-SCENARIO_GATE_CHANGES`；单测 `guide-facts-consistent` 用同一形态断言该报错存在、且 `VERIFY_RUN_ID=` 不误报。
  - ENG-001 Fixture：保留 `sdkExports` 会在示例删除后指向不存在的导出名，属于"门禁依赖示例"；删除后 `check:fixtures` 摘要与内容一致（`fixtures:refresh` 的 `updated` 列表只有 `SCN-TEMPLATE-ENGINEERING-001`）。
- **提交**：`fix(template): correct the example-removal guide wording and example-bound docs`。

### 第 11 条 · Task 9：按需入口的两处缺陷（M-3 分析路径映射、M-4 报告与准备）

- **根因**：
  - M-3：`analysisTsconfig` 只把清单里的包名映射到 `packages/<dir>/src/index.ts`，没有仓库自己的 TS 路径别名。用例经 `@template-test/protocol`（→ `packages/protocol/testing/index.ts` → `shadow/server.ts`）导入协议测试包，依赖图在这个别名处断开，`depcruise --reaches` 找不到任何 e2e 用例——实测改 `packages/protocol/testing/shadow/server.ts` 后选中的用例数为 0。
  - M-4(a)：unit 的 `vitest related` 步骤即使实际 0 用例，只要 Vitest 退出码 0 就整体通过，等于允许"选中了改动文件、却一个用例都没跑"。
  - M-4(b)：非 unit 项目的报告名只按项目取名，同一项目的多个文件互相覆盖同一份 `integration.json`：后跑的覆盖先跑的，丢证据也不报错。
  - M-4(c)：平台用例（清单登记 `perFile` + `prepare`）在按需入口里直接跑文件，没有执行 prepare——等于跳过退出开发者工具与预热。
- **改动**（不改规划语义：未改 proposal/specs/design/tasks，未新增 checkpoint）：
  - `scripts/lib/affected-analysis.ts`：`analysisTsconfig` 除清单包名外，合并 `tsconfig.base.json` / `tsconfig.test.json` 的 `paths`（含 `@template-test/*`），并按协议包目录派生 `<协议包名>/generated/*` 映射；映射只供分析，构建与测试的模块解析不变。
  - `scripts/test-affected.ts`：新增 `affectedReportIssues`——`runAffectedCli` 执行完所有步骤后核对 unit 报告，`related` 非空而报告缺失/不可读或 0 用例即退出码 1；同一份报告的文件合成一次 `vitest run`（同一项目的多个文件只写一份报告，不互相覆盖）；`perFile` 项目逐文件运行，每个文件前按清单 `testProjects[].prepare` 插入 prepare 步骤，报告写 `reports/<项目名>/<文件名>.json`（沿用 GATE-14 的逐文件约定）。
  - `scripts/lib/report-names.ts`：抽出 `reportNameForFile` 供 `verify.ts` 与 `test-affected.ts` 共用，`verify.ts` 保持同名再导出。**优先采用现成方案**：直接复用验收入口已有的逐文件报告命名与 `testProjects[].prepare` 语义，不另造一套。
- **证据**：
  - M-3 前/后（`pnpm exec tsx -e` 调用 `reachedTestFiles(root, manifest, ['packages/protocol/testing/shadow/server.ts'])`）：修复前 `reached=7`，全部在协议包内（`packages/protocol/testing/shadow/*.test.ts`），没有任何 `packages/e2e/tests/**`；修复后 `reached=20`，含 `packages/e2e/tests/example|protocol|weapp` 下的用例。
  - `pnpm exec vitest run --project test-tools-unit scripts/test-affected.test.ts` → 14 用例通过、退出码 0（新增 2 条：`平台文件按清单登记先执行 prepare，同一项目的文件合成一份报告`、`unit related 命中却零用例时判失败…`）。
  - `pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-SCENARIO-GATE-020.spec.ts … -021 … -022 … -023 …` → 4 文件 / 5 用例通过、退出码 0。SCN-022 的真实按需运行里：替身 pnpm 记录到 `run weapp:prepare`（平台文件运行前执行 prepare，清单派生），平台报告写在 `reports/sample-platform/SCN-SAMPLE-A-001.json`，非 perFile 的 `integration` 仍是一份 `reports/integration.json`（含该项目选中的全部文件）。
  - `pnpm exec vitest run --project test-tools-unit scripts/verify.test.ts` → 报告名抽到 lib 后仍通过（`reportNameForFile` 三个用例).
- **反例**：
  - M-4(a)：unit 报告写成 `{"tests": []}` → `affectedReportIssues` 返回 `unit 报告没有任何用例：…实际执行 0 个用例`，CLI 退出码 1；报告文件不存在时返回 `unit 报告缺失或不可读…`；报告有真实用例、或没有 related 选择/没有 related 步骤时返回空（不误报）。
  - M-4(b)：同一 integration 项目的两个文件进入计划时只有一条 `vitest run`、一份 `artifacts/<runId>/reports/integration.json`（断言 `new Set(reports).size === reports.length`）。
  - M-4(c)：prepare 步骤完全由清单 `testProjects[].prepare` 派生（测试用真实清单的 `weapp` 项目断言命令为 `pnpm run weapp:prepare` 且排在平台文件步骤之前），清单不登记时不会凭空出现该步骤。
- **提交**：`fix(template): map test aliases and keep per-project affected reports`

### 第 13 条 · Task 5/17（M-5）：`harmonizeScenarioTitles` 偏离登记

- **事实**：`packages/e2e/tests/tooling/repository-copy.ts` 的 `applyChangeScope` 在调用真实 OpenSpec CLI 归档前，会把主 Spec 里同 ID Scenario 的标题按 delta 机械对齐（`harmonizeScenarioTitles`）。原因：归档校验比 OpenSpec 自己的合并语义更严——MODIFIED 块里被改写的标题会被判成「主 Spec 有、修改块没有」而拒绝归档。
- **当前状态**：主 Spec 仍是旧标题（`openspec/specs/protocol-contract/spec.md`：`SCN-PROTOCOL-CONTRACT-001 义务清单只针对示例消费的接口`、`002 示例接口的协议义务都有运行证据`），delta 的最终标题是 `001 义务清单只针对产品声明的消费接口`、`002 声明接口的协议义务都有运行证据`。
- **归档阶段前置动作（由验收方在 Archive 阶段执行，本次不做）**：真实归档前必须先把主 Spec 的这两个标题改成最终标题并单独提交，否则真实归档会被 CLI 拒绝。副本里的机械对齐只服务演练，不是归档的替代品。
- **边界**：本项只登记，未改主 Spec、未改规划语义。

### 第 13 条 · Task 17（M-6）：删除归档后多余的 `fixtures:refresh`

- **根因**：`SCN-TEMPLATE-ENGINEERING-008.spec.ts` 在副本基线提交前对整个 Fixture 目录跑了一次 `pnpm fixtures:refresh <全部 owner>`。副本 helper 已经按作用域归档，归档前后 Requirement 块摘要不变，这次全量 refresh 不产生任何变化；它还掩盖了「归档是否真的改变摘要」这一事实。
- **实证**：探针 `/tmp/m6-probe.mts`（构造受控副本 → 归档本 Change → 对磁盘上 19 个 owner 各跑一次 refresh）→ `/tmp/fcr-m6-probe.log`：`owners 19 changed-after-archive-refresh 0 []`，退出码 0。
- **改动**：删除该步骤与随之不再使用的 `fixtureOwners` helper；保留「被删除内容改动的 Fixture 才 refresh」的那一次（`SCN-PROTOCOL-CONTRACT-002`）。
- **反例（证明保留的那次不可省）**：同一探针把 `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` 置空后不 refresh 直接 `pnpm check:fixtures` → 退出码 **1**、`SCN-PROTOCOL-CONTRACT-002: sha256 mismatch for protocol-matrix.json`；只 refresh 该 owner 后 `manifests: 19, issues: []`、退出码 **0**（同一日志）。
- **证据**：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` → 2 用例通过、78.55s、退出码 **0**（`/tmp/s008-r3.log`）；同一探针在副本内跑完整 `check:fast` → 退出码 **0**，副本内 `test:integration` 39 文件 / 91 用例全绿（`/tmp/s008-probe-3.log`）。

### 第 13 条 · Task 17（M-8）：`SCN-026` 的 concrete-assertions 扫描范围扩大

- **根因**：GATE-026 的 `concrete-assertions` 只扫 `scripts/check-scenarios.test.ts`、`scripts/lib/scenario-gate.evidence.test.ts` 与 Fixture 登记的 GATE-001~011 用例。GATE-012~025 与门禁自身的 checkpoint / gate 单测不在范围内，「只用具体断言证明结论」的退化写法可以绕过。
- **改动**：Fixture `SCN-SCENARIO-GATE-026/self-test-isolation-cli.json` 的 `gateSelfTestSpecs` 补齐 GATE-012~025（`fixtures:refresh SCN-SCENARIO-GATE-026` 重算摘要）；被扫文件列表增加 `scripts/check-scenarios.checkpoint.test.ts` 与 `scripts/check-scenarios.gate.test.ts`。
- **证据**：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm fixtures:refresh SCN-SCENARIO-GATE-026` 退出码 **0**；`SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fixtures` → `manifests: 19, issues: []`、退出码 **0**；`SCENARIO_GATE_CHANGES=template-core-hardening pnpm exec vitest run --project integration packages/e2e/tests/tooling/SCN-SCENARIO-GATE-026.spec.ts` → 1 用例通过、54.22s、退出码 **0**（`/tmp/fcr-026.log`）。
- **反例**：扫描范围内的 22 个文件若出现 `expect.any(` 或 `process.cwd()`，`concrete-assertions` checkpoint 立即失败（已有的 `not.toContain` 断言）；本轮先按目录清点确认这 22 个文件当前都不含这两个写法。

### 第 14 条（M-7）：`response-shape` 对没有可达字段的类型直接放行（已知限制，不修复）

- **现状**：`scripts/lib/response-shape.ts` 的同形校验按响应类型声明的「可达字段」遍历；类型没有可达字段（空对象类型或全部字段不可达）时校验直接放行，不产生 issue。
- **影响**：这类声明的同形证据弱于有字段的声明。当前协议来源与模板示例没有该形态的响应类型，实际不触发。
- **处置**：按验收方要求只登记为已知限制，本 Change 不修复（改判定会改变校验语义，超出本次评审范围）。

## 连带修复（修复清单条目落地时暴露的回归）

修复清单第 3、7、11 条按原样落地后，仓库自身的门禁与示例删除演练仍有非绿项；以下三处是这三条的直接连带回归，已一并修复并复验。

### 第 3 条 连带 · SDK 根入口在示例删除后必须仍是模块

- **根因**：第 3 条删掉根入口的消费接口声明导出后，`packages/sdk/src/index.ts` 在示例删除后只剩注释（示例导出整段被 `template-example` 标记剥离）→ 副本内 `pnpm typecheck` 报 `packages/sdk/src/runtime/default.test.ts(47,30): error TS2306: File '<copy>/packages/sdk/src/index.ts' is not a module`，PC-05「SDK 根入口不导出请求 ID 生成器」的根入口检查失去可导入对象，示例删除演练无法全绿。
- **改动**：入口在标记之外保留空导出块 `export {};`，并在注释里说明「删除模板示例后入口没有公共导出，仍保持模块身份」。不恢复任何被裁决删除的导出。
- **证据**：副本内 `check:fast` 从 `typecheck` 失败（`/tmp/s008-probe-2.log`）变为退出码 **0**（`/tmp/s008-probe-3.log`）；SCN-008 用例 2/2 通过、退出码 **0**（`/tmp/s008-r3.log`）。
- **反例**：去掉 `export {};` 后同一副本可复现 TS2306（`/tmp/s008-probe-2.log`）。

### 第 7 条 连带 · `scripts/check-fixtures.ts` 未按 Prettier 格式化

- **根因**：第 7 条把一处 `issues.push(...)` 写成多行后没有执行格式化，`format:check` 在仓库与副本里都会失败。
- **改动**：`pnpm exec prettier --write scripts/check-fixtures.ts`；diff 只涉及那一行的折行（对照 `/tmp/check-fixtures.before.ts`），无语义变化。
- **证据**：修复前 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast` → `[warn] scripts/check-fixtures.ts`、退出码 **1**（`/tmp/repo-check-fast-1.log`）；修复后 `format:check` 通过（完整 `check:fast` 的日志见「完成标准复验」，`/tmp/fcr-verify-1.log` 第 20 行起）。

### 第 11 条 连带 · 按需入口的文件超限与单测覆盖率缺口

- **根因**：第 11 条给 `scripts/test-affected.ts`（+60 有效行）与 `scripts/test-affected.test.ts`（+85 有效行）加代码与用例，越过仓库的行数上限（源文件 300、测试文件 600，空行与注释不计，ENG-08）——`pnpm lint` 退出码 1；同时新增的几条分支（平台项目没登记 `prepare`、报告缺 `tests` 字段、related 命中但 0 用例、缺少仓库 tsconfig、清单里没有协议包）没有 unit 证据，`pnpm test:unit` 的 100% 阈值失败。这两项在副本里被 SCN-026 / SCN-008 放大成「副本 check:fast 红」。
- **改动**（不改规划语义、不改断言语义）：
  - `scripts/lib/affected-commands.ts`（新增）：把 `affectedCommands`、`reportFor`、`reportPath`、`affectedReportIssues` 从 `scripts/test-affected.ts` 抽出；`test-affected.ts` 保持同名再导出，公共出口不变。
  - `scripts/test-affected.evidence.test.ts`（新增）：把 SCN-020/021/022 的 module 证据用例拆出，连同它们需要的前导（`evidence`、`reasonOf`、`planFor` 与受控根常量）；场景绑定按 case 的 `meta` 登记，与文件路径无关。
  - `scripts/test-affected.test.ts`：补 3 条 unit 证据——平台项目未登记 `prepare` 时只按文件运行；按需入口在 unit 报告零用例或缺 `tests` 字段时非零退出；分析用 tsconfig 在缺少仓库 tsconfig 或清单缺协议包时仍可用。
- **证据**：
  - `pnpm lint` 退出码 **0**；有效行数 `scripts/test-affected.ts` 353 → **247**、`scripts/test-affected.test.ts` 723 → **399**、`scripts/test-affected.evidence.test.ts` **341**。
  - `pnpm test:unit` → 65 文件 / 377 用例通过，`statements / branches / functions / lines` 全部 **100%**，退出码 **0**。
  - `pnpm exec vitest run --project test-tools-unit scripts/test-affected.test.ts scripts/test-affected.evidence.test.ts` → 2 文件 / 17 用例通过、退出码 **0**（`/tmp/fcr-affected-unit.log`）。
- **反例（修复前）**：`pnpm lint` 退出码 1（副本日志 `/tmp/s008-probe-2.log`：`scripts/test-affected.test.ts 719 > 600`、`scripts/test-affected.ts 334 > 300`、`'_prepare' is assigned a value but never used`）；`pnpm test:unit` 退出码 1（`ERROR: Coverage for statements (99.97%)` / `branches (99.81%)`，未覆盖 `scripts/test-affected.ts:166,230,367` 与 `scripts/lib/affected-analysis.ts:39`，日志 `/tmp/fcr-coverage-before.log`）。

## 第二轮修复（示例删除演练第二轮 + 修复复核）

> 背景：第二轮示例删除演练（证据目录 `scratchpad/drill-17b-tools/`、副本 `drill-17b/repo`，本轮只读引用）确认第一轮暴露的 4 个缺陷都没有再出现、weapp 两个文件首跑即通过；同时复核提出 F1–F6 与演练猜测 1/2/4。用户裁决规划修订 A3，并追加「A3 白名单与 Scenario ID 检查」口径。本节按复核清单第 0–8 条逐条登记根因、改动、证据（命令 / 退出码 / 日志路径）与反例。

### 第 0 条 · A3 规划修订与实施（T17 自动化 + 指南 / 门禁）

- **根因**：`SCN-TEMPLATE-ENGINEERING-008` 证明的是"删除模板示例后门禁仍全绿"，但它在示例被真正删除后**必然失败**——`assertWhitelistOnly` 要求副本里还有可删目录、`matrixKeys.length > 0`；对使用方又是长期开销。用户裁决把它移入 `template-example` 的 EX-10，随示例一起删除；ENG-06 保留删除保证与副本构造规定，SCN-026 改为引用 ENG-06 的副本规定。
- **规划修订（单独提交）**：`51516cd docs(openspec): move example-removal proof into template-example by user decision`，含 `design.md`、`plan-review.md`、`specs/scenario-gate/spec.md`、`specs/template-engineering/spec.md`、`specs/template-example/spec.md`、`tasks.md` 共 6 个文件；`freshness=PASS`（digest `39e9fbf6…`）。
- **改动 a~f**：
  - a) 指南删除白名单补齐 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 与 `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`：`docs/template-guide.md`、`scripts/check-architecture.ts` 的 `exampleWhitelistEntries`、`packages/e2e/tests/tooling/helpers.ts` 的 `writeTemplateGuideFixture`、`scripts/check-architecture.test.ts` 的指南夹具。
  - b) `packages/e2e/vitest.config.integration.ts` 的 `copyCreatingSpecs` 中 ENGINEERING-008 与 EXAMPLE-008 条目、`include` 的 `tests/example/` 部分用 `// template-example:begin` / `// template-example:end` 包裹——示例在时与删除后，A2 的期望集合推导都成立。
  - c) `scripts/lib/dependency-rules.cjs` 注释去掉 `testing/shadow/example/`，改为与示例无关的表述或加标记。
  - d) SCN-008 自证：`assertWhitelistOnly` 追加"白名单路径在副本中都已不存在""集成配置不再引用已删除用例与示例目录"；`no-recursive-copy` 改为由 `copyCreatingSpecs` 派生（仍存在的排除条目都在配置里、自身已不在）。
  - e) SCN-006 白名单完整性反例同步：删掉指南里 `openspec/specs/template-example/` 后必须报缺失。
  - f) `SCN-SCENARIO-GATE-026` 与 `SCN-TEMPLATE-ENGINEERING-008` 的 Fixture 来源摘要按新 Requirement 正文刷新（3 份 JSON）。
- **追加裁决（Scenario ID 检查口径）**：
  - `scripts/check-architecture.ts` 的 `extractScenarioIds` 收窄为"只看 ID 后面的字符"：后随 `.` 或 `/` 时视为文件名 / 目录名的一部分，不算 Scenario 引用；`.../SCN-X-001` 位于路径末尾（后随反引号、空格、行尾或中文标点）仍按引用检查。
  - **ENG-06「指南中出现的 Scenario ID 都已登记」这条检查的实现口径**：路径中的 ID 不算引用（ID 后紧跟 `.` 或 `/`）。原因是删除白名单必须写明 SCN-008 自身的用例与 Fixture 路径，而删除示例后这个 ID 已不再登记；不修改 Spec 文字。
  - 反例单测 6 条：`SCN-SAMPLE-998` / `997`（路径内，不报）、`996`（路径末尾，报）、`995。`（中文标点，报）、`994 的引用`（空格，报）、`993` / `992`（行尾 / 文末，报）。`check-architecture.test.ts` 第 42、189 行的"应无问题"夹具按新口径自然恢复，未放宽任何断言。
  - 指南能力地图"模板示例解耦与删除白名单"行整块用 `template-example` 标记包裹；Markdown 表格不能在行间插注释，因此这一行单独成一块表，随示例一起删除。
  - **实施中自己引入的回归**：把 SCN-008 的用例与 Fixture 加进 `removal.files` 后，`assertWhitelistOnly` 原有的 `for (const file of removal.files) expect(value.coverageExcluded).toContain(file)` 必然失败——它把"白名单里的每个文件都必须出现在 `coverageExclusions` 里"当成事实，而这只在 `removal.files` 恰好等于 `example-runner.ts`（唯一同时被覆盖排除的白名单文件）时成立。按 Spec「同步：`manifest.quality.coverageExclusions` 中指向已删除文件的条目」改为派生断言：期望集合 = 清单原有排除项中位于删除面下者，多一条、少一条都失败。
- **证据**：
  - `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm check:architecture`、`pnpm check:fixtures` 全部退出码 0（`/tmp/tch2/gates1.log`；`check:architecture` 输出 `{"issues":[]}`，`check:fixtures` 输出 `{"manifests":19,"issues":[]}`）。
  - `pnpm test:unit` 退出码 0，65 文件 / 377 用例；`pnpm check:coverage` 退出码 0（`/tmp/tch2/unit1.log`）。
  - 副本 `check:fast` 退出码 0（`/tmp/tch2/scope-evidence.log`，详见第 7 条）。
- **反例**：改完 a~f 但未修覆盖率断言时，副本 `check:fast` 退出码 **1**：SCN-008 两条 case 都在 `assertWhitelistOnly` 失败（`Test Files 1 failed | 54 passed`、`Tests 2 failed | 117 passed`、`check:fast exit: 1`）；失败副本保留在 `/var/folders/4f/q224nvmj26z8z7tnv1cs5tm00000gn/T/tch2-scope-HPF9MM`，摘录 `/tmp/tch2/scope-evidence-fail-excerpt.log`。修好断言后同一条命令退出码 0。
- **提交**：`51516cd`（规划）、`97e8d73`（实现）、`c4d456f`（补救）。
- **提交过程的偏离**：第 0 条与第 2 条落在同一个文件上，拆提交时 `29c1fe1` 误把"仅含第 2 条 hunk"的版本写回该文件，覆盖掉第 0 条 d) 的新增断言；随后用 `c4d456f fix(template): restore the example-removal proof dropped by the previous commit` 把文件复原到第 0 条版本。为遵守"不改写已有提交历史"，选择向前补提交而不是 amend；最终文件与拆分前逐字节一致（`diff -q` 通过）。

### 第 1 条 · T9：被选中的 unit 文件与 `vitest related` 共用报告名（复核 F1）

- **根因**：`scripts/lib/affected-commands.ts` 里 `vitest related` 与被选中的 unit 类文件都写 `artifacts/<run-id>/reports/unit.json`，后写的覆盖先写的；related 选中了改动文件却一个用例都没跑时，被覆盖的报告让 `affectedReportIssues` 读到非 0，漏报（靠 `passWithNoTests` 兜底）。实测路径：改 `packages/protocol/testing/shadow/server.ts` 后 related 无命中，unit 报告被逐文件运行覆盖。
- **改动**：被选中的 unit 文件改写到独立报告 `unit-files`；`related` 仍写 `unit`，核对只读 `unit` 这一步的真实结果；`scripts/test-affected.test.ts` 把"unit 类项目的报告名合并为 unit"换成"related 与被选中的 unit 文件各写一份报告，不互相覆盖"的组合单测。
- **证据**：`pnpm test:unit` 退出码 0（65 文件 / 377 用例，`/tmp/tch2/unit1.log`）；全量 `pnpm verify` 三步全绿（见「第二轮完成标准复验」）。
- **反例**：新单测同时构造 `related` 与非空 unit 文件列表，断言两者 `VERIFY_REPORT_FILE` 分别是 `unit.json` 与 `unit-files.json`；改动前两者都是 `unit.json`，断言不成立（单测在改动前为红）。
- **提交**：`a1f0d8a fix(template): give selected unit files their own report name`。

### 第 2 条 · T17：SCN-008 内层 `check:fast` 失败被 ENOENT 掩盖（复核 F4）

- **根因**：`SCN-TEMPLATE-ENGINEERING-008.spec.ts` 的 `runRemoval` 里，`fast`（`pnpm check:fast`）的状态从未被检查，紧接着无条件跑 `probeSharedBindingBreak(copy)`；探针读 `artifacts/<run-id>/reports/integration.json`——内层 `check:fast` 失败时这份报告根本不存在，于是抛出 `ENOENT`，把真正的失败原因（`fast.status`）盖掉，且证据里的 `fastStatus` 与 `fastOutput` 也没落盘。
- **改动**：`fast.status !== 0` 时先把整段输出写进日志（`t17-copy-check-fast.log`）再抛错，探针移到这之后；清单模式输出解析失败时也带上日志路径与 `cause`。内层失败现在一定以"退出码 + 日志路径"呈现。
- **证据**：`pnpm test:unit` / `pnpm typecheck` 退出码 0（`/tmp/tch2/gates1.log`、`/tmp/tch2/unit1.log`）；第 7 条的副本 `check:fast` 退出码 0 即该用例真实跑通的证据（`/tmp/tch2/scope-evidence.log` 中 `SCN-TEMPLATE-ENGINEERING-008` 出现在执行清单里）。内层日志路径 `/var/folders/4f/.../T/t17-copy-check-fast.log`。
- **反例（构造性）**：修复前的代码顺序可由 `git show 0b64cdb~1:packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 复现——`const fast = run(...)` 之后直接 `const probe = probeSharedBindingBreak(copy)`，中间没有状态判断与落盘；把副本内任意门禁改成失败即可看到抛出的错误是 `ENOENT ... reports/integration.json` 而不是 `check:fast` 的真实输出。第一轮演练未触发这一路径（那一轮 `git commit` 在更早处就抛错了，见 `drill-17-tools/verify-2.log`）。
- **提交**：`29c1fe1 fix(template): log the copy fast-gate output before probing reports`。

### 第 3 条 · weapp 就绪探测加超时（复核 F6）

- **根因**：`scripts/weapp-prepare.ts` 的就绪探测只有单次尝试超时与次数上限，没有总预算；`automator.launch`（`miniprogram-automator`）与 `checkVersion`（内部 `Tool.getInfo`）都可能**一直不返回**，只有次数上限时整体会挂死。
- **改动**：新增 `withTimeout` 与总预算 `totalTimeoutMs: 180_000`；每次尝试的超时取 `min(attemptTimeoutMs, 剩余预算)`，预算耗尽即明确失败（错误信息含预算与最后一次错误），`launch` 后无论成败都 `disconnect`。
- **证据**：`pnpm typecheck`、`pnpm lint` 退出码 0（`/tmp/tch2/gates1.log`）；全量 `pnpm verify` 的 `test:e2e:weapp` 步骤退出码 0（见下），即真实环境里探测按新逻辑就绪并跑完 5 个 weapp 文件。
- **反例**：`planWeappPrepare` 的预算由单测固定断言（`attemptTimeoutMs` / `intervalMs` / `attemptCount` / 新增 `totalTimeoutMs`），超出预算时的失败文案为 `微信开发者工具在 180000ms 预算内未就绪`，与"只依赖固定 sleep"的行为区分开。
- **提交**：`5aa842d fix(template): bound the weapp prepare readiness probe`。

### 第 4 条 · T5：`test-affected.evidence.test.ts` 读真实仓库清单（复核 F2）

- **根因**：`scripts/test-affected.evidence.test.ts` 的 `full-run-triggers` 用 `loadProjectManifest(process.cwd())` 读**真实仓库**的清单与路径（`packages/protocol/src/adapters/network/wechat.ts`、`packages/e2e/host/weapp/app.js`、`packages/sdk/src/runtime/default.ts`），删除示例或改仓库布局就会失效；而且它没有列进 SCN-026 的 concrete-assertions 扫描范围，断了也没人拦。
- **改动**：改用受控根 `createAffectedFixture()` 自带的清单与示例路径（`packages/sample-product/src/core.ts`）；`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-026.spec.ts` 的 `sources` 清单加入 `scripts/test-affected.evidence.test.ts`。
- **证据**：`pnpm test:unit` 退出码 0（`/tmp/tch2/unit1.log`）；`pnpm check:architecture` 退出码 0（`/tmp/tch2/gates1.log`）；`SCN-SCENARIO-GATE-026` 在副本与全量 verify 中均通过。
- **反例**：把该用例的 `loadProjectManifest` 换回 `process.cwd()` 或从 `sources` 清单里去掉它，SCN-026 的 concrete-assertions 检查会失败（该用例正是"不许依赖仓库根真实文件、必须出现在扫描清单里"的守卫）。
- **提交**：`97099a4 fix(template): read the affected evidence manifest from a controlled root`。

### 第 5 条 · `GATE-024` 副本超时 30s → 60s

- **根因**：`SCN-SCENARIO-GATE-024`（verify-resume-cli）在演练的全量并发下实测 28.66s，逼近 `cliEvidence` 的默认 30s 超时，演练中有一次超时失败——与用例语义无关的计时抖动。
- **改动**：`packages/e2e/tests/tooling/scenario-gate-helpers.ts` 的 `cliEvidence` 支持 `{ timeoutMs }`（默认仍是 30s）；GATE-024 显式传 `60_000`。按已授权规则（副本 / 重负载用例可补显式超时）执行。
- **证据**：`pnpm test:unit`、`pnpm typecheck` 退出码 0（`/tmp/tch2/unit1.log`、`/tmp/tch2/gates1.log`）；全量 `pnpm verify` 的 `test:integration` 中 GATE-024 通过（`/tmp/tch2/verify-round2.log`）。
- **反例**：其余 `cliEvidence` 用例不传 `timeoutMs`，超时仍为 30s；只有 GATE-024 放宽，未整体放宽。
- **提交**：`0b64cdb fix(template): raise the verify-resume evidence timeout to 60s`。

### 第 6 条 · 指南五处修订

- **根因 / 改动**（`docs/template-guide.md`）：
  1. 原文把"未跟踪 / 已删除未暂存的文件不会进入报告"当成不 add 就不更新的理由，与实际行为不符：源码清单取自 `git ls-files -co --exclude-standard`，未跟踪的新文件**会**进入清单，而工作区里已删除但尚未暂存删除的文件会在读取前被剔除。照实改写。
  2. 删除片段后会留下空行与折行差异：补上"先运行 `pnpm format`"。
  3. 演练猜测 4：补写 `pnpm verify --from test:e2e:<项目名> --run-id <run-id>` 的续跑方式（在平台步骤中断后补齐平台与门禁证据）。
  4. "移除模板示例"一节写明清单模式下哪些问题属于预期：`requiredIn` 含平台项目的用例会报 `missing binding`，副本里预期存在、不代表删除有问题。
  5. "全仓库所有成对标记"只包括注释行；字符串字面量与 Spec 正文里的同名文字不算标记，也不参与裁剪。
- **证据**：`pnpm format:check`、`pnpm lint` 退出码 0（`/tmp/tch2/gates1.log`）；`pnpm check:architecture` 退出码 0（ENG-006 的 `guide-facts-consistent` 仍通过，说明改写后的行内命令与清单字段引用都合法）。
- **反例**：改动前第 1 条的理由与源码清单实现相矛盾（`scripts/lib/source-inventory.ts` 的 `git ls-files -co` 与"剔除已删除路径"两步）；第 3 条的 `--from` 续跑在第 1 轮演练里是"指南已覆盖但未读到"的猜测项（第二轮复核 F5 直接判为错误）。
- **提交**：`f2828b0 fix(template): correct the guide's example-removal instructions`。

### 第 7 条 · 第 1 条无作用域证据照实改写 + 新证据（复核 F3）

- **根因**：上一轮 verify.md 把"无作用域证据"写成"副本已归档本 Change"，实际是作用域为空、本 Change 被 helper **直接移出**（不是归档），并且设了 `TEMPLATE_COPY=1`、ENG-001 与 ENG-008 都被排除；两处日志路径也不一致。
- **改动**：照实改写「Final Code Review 与演练修复」与「无作用域证据」两处描述（作用域为空 = 直接移出、`TEMPLATE_COPY=1`、5 个排除项都没执行），并明确这一步**不**证明"真实归档后的副本仍全绿"。
- **新证据（真实归档、不带作用域、不设 `TEMPLATE_COPY`）**：
  - **脚本**：`/tmp/tch2/scope-evidence.mts`（宿主先设 `SCENARIO_GATE_CHANGES=template-core-hardening` 让 `createRepositoryCopy` 走真实归档；跑副本门禁前删除副本环境里的 `TEMPLATE_COPY` 与 `SCENARIO_GATE_CHANGES`，并清掉宿主进程自己的作用域）。
  - **命令**：`pnpm exec tsx /tmp/tch2/scope-evidence.mts`；**退出码 0**（日志 `/tmp/tch2/scope-evidence.log`）。
  - **副本状态**：`copy root: /var/folders/4f/q224nvmj26z8z7tnv1cs5tm00000gn/T/tch2-scope-wlRdos`；`active changes in copy: []`；`archived changes in copy: ["2026-09-22-headless-payment-sdk","2026-09-30-template-example","2026-10-02-generalize-template","2026-10-02-remove-payment-business","2026-10-10-template-core-hardening"]`——本 Change 是**真实归档**；`main spec registers SCN-TEMPLATE-ENGINEERING-008: false`（已随 A3 移出 template-engineering）；`TEMPLATE_COPY: undefined SCENARIO_GATE_CHANGES: undefined`。
  - **结果**：副本 `pnpm check:fast` **退出码 0**；`test:unit` 65 文件 / 377 用例全绿；`test:integration` **55 文件 / 119 用例全绿**；5 个曾经被 `TEMPLATE_COPY` 排除的用例（`SCN-TEMPLATE-ENGINEERING-001`、`-007`、`SCN-SCENARIO-GATE-026`、`SCN-TEMPLATE-ENGINEERING-008`、`SCN-TEMPLATE-EXAMPLE-008`）**都真实执行**（`present in output: true`）。
- **反例**：修复前同一条命令退出码 1（见第 0 条反例：SCN-008 在 `assertWhitelistOnly` 失败，`Test Files 1 failed | 54 passed`）。
- **提交**：并入「第二轮修复」的 verify.md 提交（`docs(openspec): record the second-round fixes in verify.md`）。

### 第 8 条 · 只登记：主 Spec 里描述示例的句子删除后过时（不修）

- **登记为已知限制，交给后续 Change**：删除示例后，以下主 Spec 文字会变成对不存在的实现的描述——
  - `template-engineering` 的覆盖率排除说明里"四项含 `example-runner.ts`"；
  - `protocol-contract` 的 `discoverExampleRoutes`；
  - `scenario-gate` 中的 `SCN-TEMPLATE-EXAMPLE-012` 等示例条目。
- **为什么不修**：这些是主 Spec（`openspec/specs/**`）的正文语义，改它属于规划语义变更，超出本轮"修复实现"的授权；按 A3 的口径，示例删除的验收证据已移入 `template-example`，这些句子的清理应随示例正式移除的那个 Change 一起做。
- **证据**：`rg -n 'example-runner|discoverExampleRoutes|SCN-TEMPLATE-EXAMPLE-012' openspec/specs/`（本轮只读取，未改动 `openspec/specs/**`；`git status` 中该目录无改动）。
- **提交**：并入「第二轮修复」的 verify.md 提交。

### 第二轮完成标准复验（复核清单第三节）

- **全量验收入口**：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm verify --change template-core-hardening --run-id feat-template-core-hardening-20261010T060456Z`
  - **退出码 0**（日志 `/tmp/tch2/verify-round2.log`；文件末尾三行即三步结论）。
  - 三步：`check:fast` **通过（165342ms）**、`test:e2e:weapp` **通过（479035ms）**、`check:scenarios` **通过（1494ms）**，退出码均为 0。
  - 报告目录：`artifacts/feat-template-core-hardening-20261010T060456Z/`（`reports/unit.json`、`reports/integration.json`、`reports/weapp/`、`coverage/`）。
  - **weapp 逐文件（5 个文件，每个文件前都真实执行一次 `pnpm weapp:prepare`）：`SCN-PROTOCOL-CONTRACT-002`（9288ms）、`SCN-PROTOCOL-CONTRACT-008`（9441ms）首跑即过；`FLOW-TEMPLATE-EXAMPLE-001`（9554ms）、`SCN-TEMPLATE-EXAMPLE-002`（9512ms）首跑即过；`SCN-TEMPLATE-EXAMPLE-004` 首跑在 120000ms 用例超时失败（`Test timed out in 120000ms`），按 `packages/e2e/AGENTS.md` 的逐文件规则重新 `weapp:prepare` 后整文件重跑，10.03s 通过（该文件 `weapp:prepare` 共执行 2 次，本步合计 6 次）。属于已记录的"小程序自动化冷启动不稳定"已知限制，未使用 `-t`。
- **独立 `check:scenarios`**：`SCENARIO_GATE_CHANGES=template-core-hardening VERIFY_RUN_ID=feat-template-core-hardening-20261010T060456Z pnpm check:scenarios` → **退出码 0**、`mode: complete`、`issues: 0`（日志 `/tmp/tch2/check-scenarios-round2.log`）；覆盖汇总 `allSpec required 61 / executed 61 / passed 61`、`protocol required 639 / executed 639 / passed 639`、`flows 2/2/2`。这一步在完整 verify 之后单独跑、问题数为 0，说明报告没有因为开发者工具改写受跟踪文件而过期（第 4 条目标达成）。
- **第 7 条要求的无作用域证据**：见本节第 7 条（真实归档、不带作用域、不设 `TEMPLATE_COPY` 的副本 `check:fast` 退出码 0，ENG-001 等 5 个用例真实执行）。
- **任务勾选**：本轮受影响的 Task 先取消勾选（`dd27f4b`），修复与复验通过后重新勾选（`docs(openspec): recheck tasks after the second-round fixes`）；Task 17、18 按交接要求保持未勾选。

## 第三轮修复（示例删除演练第三轮）

> 背景：第三轮示例删除演练（证据目录 `scratchpad/drill-17c/logs/`、副本 `drill-17c/repo`，本轮只读引用）按白名单删除示例后，不带作用域的 `pnpm verify` 退出码为 0、场景门禁 0 问题、没有阻塞；演练另指出 6 处低成本残留。本节按清单第 1–6 条逐条登记根因、改动、证据与反例。**不涉及规划语义**：只改实现、注释、文档与门禁的检查范围。

### 第 1 条 · T16：技术架构文档里的 SCN-008 引用未加标记 + 事实检查是否覆盖架构文档

- **根因**：`docs/architecture.md` 的「模板示例解耦与删除白名单」一节写着"删除后的全绿证据由 `SCN-TEMPLATE-ENGINEERING-008` 在隔离副本中承担"，这句话没有 `template-example` 标记；删除示例后该 Scenario 不再登记，这句话就成了悬空引用。而事实检查只扫 `docs/template-guide.md`，架构文档里的 Scenario ID 一直没人核对。
- **改动**：
  - `docs/architecture.md`：这句话单独成段并用 `<!-- template-example:begin -->` / `<!-- template-example:end -->` 包裹，随示例一起删除。
  - **事实检查覆盖架构文档**（评估结论：实现成本低，做）：新增 `scripts/lib/scenario-ids.ts`，把 `extractScenarioIds`（A3 裁决的路径口径：ID 后紧跟 `.` 或 `/` 不算引用）与 `unregisteredScenarioIds` 抽出来共用；`scripts/check-architecture.ts` 除指南外也对 `docs/architecture.md` 做同一检查，架构文档的错误带文档名后缀 `(docs/architecture.md)`，指南沿用不带后缀的既有文案（既有用例与 checkpoint 依赖它）。
  - `scripts/check-architecture.test.ts` 补反例：临时根的架构文档写入未登记的 `SCN-SAMPLE-991` → 报 `unregistered Scenario ID SCN-SAMPLE-991 (docs/architecture.md)`；写入路径形式的 `SCN-SAMPLE-990` → 不报；恢复原文后不再报。
- **证据**：`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm check:architecture`（`{"issues":[]}`）、`pnpm test:unit`（65 文件 / 378 用例）、`pnpm check:coverage`（四项 100%，新 lib 计入覆盖率范围）、`pnpm check:fixtures` 全部退出码 0（日志 `/tmp/tch3/gates.log`）。
- **反例**：见上（未登记 ID 报错、路径形式不报、恢复后不报）。另：本仓库 `docs/architecture.md` 里出现的 21 个 Scenario ID 全部已在有效 Spec 登记，加检查后 `check:architecture` 仍是 0 问题——没有把既有引用误判成悬空。
- **提交**：`62e6c9d`。

### 第 2 条 · T15：根 AGENTS.md 的协议义务派生写了示例接口

- **根因**：根 `AGENTS.md`「IDL 协议义务派生」一节写"协议义务派生针对示例协议的 `CreateTrade`、`QueryTrade` 两个 HTTP 方法"，把派生说成了针对示例接口；示例删除后这句话与实际实现（按消费接口声明派生）不符。
- **改动**：改写为与示例无关的表述——"协议义务派生按产品包登记的消费接口声明（`manifest.packages[].consumedOperations`）派生：派生出哪些方法、每个方法的请求字段策略与义务 ID 都来自声明，不在门禁里写死接口名"；PC-01 与"待定字段为 0"等其余规定不动，未加标记（整节与示例无关）。
- **证据**：`pnpm check:architecture` 退出码 0（根 AGENTS.md 的链接检查与文档事实检查都通过）、`pnpm format:check` 退出码 0（`/tmp/tch3/gates.log`）。
- **反例**：改写前后这条规范都不含 Scenario ID 与示例文件名；区别只在"针对示例接口"这一与实际实现不符的表述。
- **提交**：`d776c13`。

### 第 3 条 · T10：`consumed-operations.test.ts` 删除示例后只剩循环空转

- **根因**：标记外的用例写成 `for (const operation of consumedOperations) { expect(...) }`。删除示例后声明为空数组，循环零次执行，一条断言都不会跑——正是 `packages/e2e/AGENTS.md` 点名的"循环空转"反模式；它证明不了任何东西，却让用例显示为通过。
- **改动**（`packages/sdk/src/consumed-operations.test.ts`，标记外区域）：
  - 新增结构子类型 `DeclaredOperation` 与纯函数 `declarationIssues`：逐条收集"缺接口名 / 缺请求类型 / 缺响应类型 / 请求字段路径为空 / 没有映射策略 / 没有评审依据"。
  - 新用例"受控输入下声明格式校验会报出缺失项"：合法输入 → `[]`；分别注入缺接口名、空 `cases`、空字段路径、空 `authority` 的受控输入 → 精确断言报出的问题（证明校验不是空转）。
  - 新用例"真实声明满足格式校验，声明为空是合法状态"：`expect(declarationIssues(consumedOperations)).toEqual([])` 无论声明是否为空都会实际执行；为空时另断言 `consumedOperations` 仍是空数组。
- **证据**：`pnpm test:unit` 退出码 0，65 文件 / **378** 用例（本轮 +1：原来 1 条空转用例换成 2 条有效用例），`sdk-unit` 中 `consumed-operations.test.ts` 通过；`pnpm check:coverage` 退出码 0（`/tmp/tch3/gates.log`）。
- **反例**：改动前的写法在声明为空时 `assertionCalls` 为 0——循环体一次都不进；改动后用受控输入驱动同一份校验逻辑，四条负例各自让断言失败。
- **提交**：`2629cd3`。

### 第 4 条 · T10/T12：其余残留的示例字样

- **根因**：三处标记外的写法仍绑着示例名。
- **改动**：
  - `packages/protocol/testing/shadow/bootstrap.test.ts`：把"标记外再用 `names.filter((name) => !name.startsWith('discoverExample'))` 反推通用出口"改成"示例出口只在标记内登记的数组 `exampleExports`（删除示例后该数组为空，断言仍然成立且继续拦住多余出口）"；`expect(names).toEqual([...generic, ...exampleExports].sort())`，`discoverExampleRoutes` 的存在性断言留在标记内。
  - `packages/sdk/src/consumed-operations.test.ts`：删掉注释里的"（EX-09）"引用（随第 3 条一并改写，注释改为与示例无关的说明）。
  - `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-009.spec.ts`：注释里的"示例删除后 `example-runner.ts` 随文件消失"改为"宿主文件增删时期望值随之收敛，不需要手改名单（ENG-06）"——SCN-009 是共享能力证据，不绑定示例文件。
- **证据**：`pnpm test:unit` 退出码 0（`protocol-unit` 的 `bootstrap.test.ts` 通过）；`pnpm lint`、`pnpm typecheck` 退出码 0（`/tmp/tch3/gates.log`）。
- **反例**：删除示例后 `exampleExports` 变成空数组，`expect(names).toEqual([...generic].sort())` 仍然拦截"多出未登记的出口"；若把示例出口直接从数组里删掉（不放在标记内），示例存在时该断言会失败。
- **提交**：`2ad8a78`。

### 第 5 条 · T15：共用一台机器时 `weapp:prepare` 会打断别人

- **根因**：`pnpm weapp:prepare` 无条件退出并杀掉开发者工具主进程（`cli quit`，残留时 `pkill`），但 `packages/e2e/AGENTS.md` 只描述了它"退出主进程并预热"，没有提示多工作区/多会话共用一台机器时的相互影响。
- **改动**：在「微信开发者工具自动化的注意事项」的执行约定里新增第 4 条：明确 `weapp:prepare` **无条件**退出并杀掉主进程，不是"只在需要时才重启"；同一台机器上多个工作区或会话并行使用开发者工具时这一步会打断别人的运行，多工作区共用时请错开使用，不要在别人跑 weapp 用例时执行预热或整次 `pnpm verify`。
- **证据**：`pnpm format:check`、`pnpm lint` 退出码 0（`/tmp/tch3/gates.log`）；该文件是包级 AGENTS.md，`check:architecture` 只校验其中的链接。
- **反例**：本轮全量 `pnpm verify` 期间只有一个会话在跑（见「第三轮完成标准复验」），未出现相互打断；这条约定是给多会话并存场景的。
- **提交**：`01c0029`。

### 第 6 条 · 只登记、不实施的两项后续工作

1. **指南没有提供裁剪片段的现成工具**：三轮演练都各自写了自己的 strip 脚本（`drill-17c/logs/strip-markers.mjs` 等），指南只描述"用成对标记包裹、删除标记之间的内容"，没有提供仓库内的裁剪命令。后续可以加一个受控的 `pnpm` 脚本（例如 `scripts/strip-example-markers.ts`）并纳入门禁自测；本轮不改。
2. **主 Spec 中描述示例的句子删除后会过时**（上一轮已登记，这里补充证据）：
   - `openspec/specs/protocol-contract/spec.md:13`；
   - `openspec/specs/template-engineering/spec.md:286`、`:294`；
   - 另见第二轮登记的 `template-engineering`（覆盖率排除四项含 `example-runner.ts`）、`protocol-contract`（`discoverExampleRoutes`）、`scenario-gate`（`SCN-TEMPLATE-EXAMPLE-012`）。
   这些是主 Spec 正文，改它属于规划语义变更；应随"示例正式移除"的那个 Change 一起做。本轮只读取，未改动 `openspec/specs/**`。
- **变更 vs 规划语义**：以上两条都不改本轮代码，只登记为后续工作。

### 第三轮完成标准复验

- **全量验收入口**：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm verify --change template-core-hardening --run-id feat-template-core-hardening-20261010T063533Z`
  - **退出码 0**（日志 `/tmp/tch3/verify-round3.log`；文件末尾三行即三步结论）。
  - 三步：`check:fast` **通过（167768ms）**、`test:e2e:weapp` **通过（452189ms）**、`check:scenarios` **通过（1550ms）**，退出码均为 0。
  - 报告目录：`artifacts/feat-template-core-hardening-20261010T063533Z/`（`reports/unit.json`、`reports/integration.json`、`reports/weapp/`、`coverage/`）。
  - weapp 逐文件（5 个文件，每个文件前都真实执行一次 `pnpm weapp:prepare`）：`SCN-PROTOCOL-CONTRACT-002`（9363ms）、`SCN-PROTOCOL-CONTRACT-008`（9841ms）、`FLOW-TEMPLATE-EXAMPLE-001`（9759ms）、`SCN-TEMPLATE-EXAMPLE-002`（10292ms）首跑即过；`SCN-TEMPLATE-EXAMPLE-004` 首跑在 120000ms 用例超时失败（`Test timed out in 120000ms`），按 `packages/e2e/AGENTS.md` 的逐文件规则重新 `weapp:prepare` 后整文件重跑，9.69s 通过（该文件 prepare 执行 2 次，本步合计 6 次）。属于已登记的"小程序自动化冷启动不稳定"已知限制，未使用 `-t`。
- **独立 `check:scenarios`**：`SCENARIO_GATE_CHANGES=template-core-hardening VERIFY_RUN_ID=feat-template-core-hardening-20261010T063533Z pnpm check:scenarios` → **退出码 0**、`mode: complete`、`issues: 0`；覆盖汇总 `allSpec required 61 / executed 61 / passed 61`、`protocol 639/639/639`（日志 `/tmp/tch3/check-scenarios-round3.log`）。在完整 verify 之后单独跑仍为 0 问题，说明报告没有过期。
- **任务勾选**：本轮不改任务状态（第 4/5/6/8/9/15/16 已在第二轮重新勾选）；Task 17、18 保持未勾选，Task 17 的演练记录由验收方写入本文件。本轮未改动 `tasks.md`。

## 完成标准复验

修复清单第三节要求三份收尾证据：全部修复后的全量 `pnpm verify --change template-core-hardening`（新 run id、各步退出码为 0）、之后再单独跑一次 `check:scenarios`（问题数为 0），以及清单第 1 条要求的无作用域证据。以下按顺序登记。

### 全量 `pnpm verify --change template-core-hardening`

- **命令**：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm verify --change template-core-hardening --run-id feat-template-core-hardening-20261010T044824Z`
- **退出码**：**0**（日志 `/tmp/fcr-verify-1.log`，末三行即三步结论）。
- **三步逐条**：
  - `check:fast`：**通过（164421ms）**，退出码 0。
  - `test:e2e:weapp`：**通过（307737ms）**，退出码 0。
  - `check:scenarios`：**通过（1510ms）**，退出码 0。
- **报告目录**：`artifacts/feat-template-core-hardening-20261010T044824Z/`（`reports/integration.json`、`reports/unit.json`、`reports/weapp/` 下 5 份 perFile 报告与 `coverage/`）。
- **与修复前对照**：修复前该步集合在副本里由第 3/7/11 条连带回归放大成红（`/tmp/s008-probe-2.log`）；本轮全量三步全绿。

### 独立 `check:scenarios`（清单第 4 条要求）

- **命令**：`SCENARIO_GATE_CHANGES=template-core-hardening VERIFY_RUN_ID=feat-template-core-hardening-20261010T044824Z pnpm check:scenarios`
- **退出码**：**0**；输出 `mode: complete`、`"issues": []`；覆盖汇总 `allSpec required 61 / executed 61 / passed 61`（日志 `/tmp/fcr-check-scenarios.log`）。
- **说明**：`check:scenarios` 由 `VERIFY_RUN_ID` 定位 `artifacts/<run-id>/reports/` 下的报告（`scripts/check-scenarios.ts:182`），因此显式传同一 run id，读到的就是上一步全量 verify 产出的报告；本次独立复跑问题数为 0，说明完整 verify 跑完后报告没有过期（第 4 条目标达成，`packages/e2e/host/weapp/project.config.json` 不再受开发者工具改写影响）。

### 无作用域证据（清单第 1 条要求）

- **脚本**：`/tmp/tcfix-item1-evidence.mts`（复用 `packages/e2e/tests/tooling/repository-copy.ts` 的 `createRepositoryCopy`；宿主未设 `SCENARIO_GATE_CHANGES`，所以 `scopedChangeNames()` 为空，副本里本 Change **没有归档、而是被直接移出**，主 Spec 不含本 Change 的 delta；`copyEnvironment()` 设 `TEMPLATE_COPY=1` 并清空副本内作用域）。
- **命令**：`pnpm exec tsx /tmp/tcfix-item1-evidence.mts`（`scope from env: []`）。
- **结果**：副本 `active changes in copy: []`；`TEMPLATE_COPY: 1`、`SCENARIO_GATE_CHANGES: undefined`；`pnpm build` 退出码 **0**；`pnpm test:integration` → **50 文件 / 104 用例全部通过**、退出码 **0**（日志 `/tmp/fcr-item1-evidence.log`）。
- **排除项核对**：`SCN-TEMPLATE-ENGINEERING-001`、`SCN-TEMPLATE-ENGINEERING-007`、`SCN-SCENARIO-GATE-026`、`SCN-TEMPLATE-ENGINEERING-008`、`SCN-TEMPLATE-EXAMPLE-008` 均**未出现**在输出中——它们被 `TEMPLATE_COPY` 规则排除，**没有执行**；其余用例全绿。
- **这一步证明什么、不证明什么**：证明作用域为空时副本不再出现「无内容可提交的归档」失败（第 1 条修复）。不证明「真实归档后的副本仍全绿」，也不覆盖被排除的用例（ENG-001、ENG-008 等）：这两点由「第二轮修复」第 7 条的证据补上（真实归档、不带作用域、不设 `TEMPLATE_COPY`，ENG-001 等确实执行）。

## Task 17 示例删除演练（验收方执行）

**执行者与方式**：由验收方（规划会话）每轮派发一个全新的、不带上下文的 general-purpose Agent（Claude），共 3 轮。三轮提示词相同，只有副本路径不同。

**提示词要点**：
- 副本路径；先读根 `AGENTS.md` 与 `docs/template-guide.md`；
- 目标：按指南"移除模板示例"整块删除示例，并让完整验收通过；
- 规则：
  - 只在副本内工作；
  - 禁止读取 `openspec/changes/`（含 `archive/`）与 `artifacts/`，自己生成的报告只列出路径；
  - 只删除白名单内容，不修改门禁代码、门禁配置与其他能力的 Spec；越不过白名单时如实停下；
  - 副本中没有 active Change，验收用不带作用域的 `pnpm verify`；weapp 按 `packages/e2e/AGENTS.md` 的约定执行；
  - 每次猜测都记录；
  - 可以 `git add`，不提交，不写入任何凭据。

**副本构造**（每轮相同）：
1. 对待验收提交执行 `git archive`；
2. 在副本中执行 `pnpm install --offline --frozen-lockfile`；
3. 按指南"归档已知限制"第 2 条，先把主 Spec 中 SCN-PROTOCOL-CONTRACT-001/002 的标题对齐为最终标题；
4. 用副本中固定版本的 OpenSpec CLI 执行 `openspec archive template-core-hardening -y`；
5. 删除该 Change 的归档目录与 `artifacts/`；
6. `git init`，只做一次初始提交，演练者因此看不到规划和历史。

| 轮次 | 待验收提交 | 结果 | 主要发现 | 处理 |
|---|---|---|---|---|
| 1 | `b176e3c` | 失败 | 4 个缺陷：没有 active Change 时 `pnpm verify` 必然失败（ENG-001 写死 Change 路径、ENG-008 要求作用域非空）；weapp 的 PC-008 隐式依赖示例；开发者工具改写受跟踪的 `project.config.json`，导致报告过期；工作区中删除但未暂存的文件让源码摘要报 ENOENT。另有指南笔误、README/AGENTS 中示例描述未加标记 | 与 Final Code Review 合并为 14 条修复（见"Final Code Review 与演练修复"） |
| 2 | `12f7455` | 失败 | 第 1 轮的缺陷都未复现，weapp 首跑通过。新阻塞：SCN-TEMPLATE-ENGINEERING-008 自身依赖示例存在，示例真正删除后必然失败；GATE-024 超时余量不足；指南有 5 处空白 | 用户裁决 A3：SCN-008 移入 template-example，随示例一起删除；其余见"第二轮修复" |
| 3 | `3e9501d` | **通过** | 不带作用域的 `pnpm verify` 退出码为 0（check:fast 119.8s、weapp 304.5s、check:scenarios 1.5s），场景门禁 `issues: 0`，全部 Spec 49/49/49；weapp 的 PC-002 首跑通过，PC-008 首跑 120s 挂起，经自动 prepare 后整文件重跑通过（已登记的开发者工具不稳定）。共 72 个文件：4 行新增，4952 行删除 | 顺带指出的残留见"第三轮修复"，第三轮修复后全量 verify 复验通过 |

**第 3 轮猜测记录分类**：

| # | 猜测 | 分类 | 处理 |
|---|---|---|---|
| 1 | 指南没有提供裁剪片段的工具，演练者自写脚本，判定规则与 `example-markers.ts` 一致 | 指南缺失需修订 | 登记为后续工作（第三轮第 6 条） |
| 2 | "全仓库成对标记"只算注释行 | 指南已覆盖但未读到（第二轮已补充说明） | 无需处理 |
| 3 | 矩阵删除两个键后保留 `{}` | 合理的自主判断 | 无需处理 |
| 4 | `fixtures:refresh` 与 `pnpm format` 的先后 | 合理的自主判断 | 无需处理 |
| 5 | 开发者工具残留进程来自另一个工作区，是否可以退出 | 指南缺失需修订 | 已修订（第三轮第 5 条） |
| 6 | 自行指定 run id | 合理的自主判断 | 无需处理 |
| 7 | 先跑 `check:fast` 与清单模式，再跑 `pnpm verify` | 指南已覆盖 | 无需处理 |

**证据位置**：会话临时目录 `scratchpad/drill-17c/logs/`（`fast1.log`、`inventory.log`、`verify1.log`、`strip-markers.mjs`）；第 1、2 轮的证据分别在 `drill-17-tools/`、`drill-17b-tools/`。副本不提交。

**结论**：示例删除演练通过；Task 17 验收完成。

## 第四轮修复（支付 SDK 复刻演练）

> 背景：Task 18 支付 SDK 复刻演练的 Agent 在写规划后、实施前做试验，确认两处阻塞（使用方在模板上无法新增协议接口）。证据目录 `scratchpad/drill-18/`（`blocker-repro.patch`、`verify1.log`、`inventory1.txt`，副本 `drill-18/repo` 只读）。用户裁决 A5 并给出第 0–4 条修复清单。受影响的 Task 10、12、16 先取消勾选（`6d7bfdf`），修完并复验后重新勾选。

### 第 0 条 · A5 规划修订与"恰好"断言改为标记内口径

- **规划提交**：`65089db docs(openspec): scope EX-09 exactness to the marked example entries by user decision`（spec template-example、design.md、plan-review.md，digest `6ef30dcf…`，freshness=PASS，提交前后各查一次）。
- **实现提交**：`65209ea fix(template): scope the declaration exactness assertions to the marked example entries`——`scripts/lib/example-markers.ts` 新增 `markedLineRanges`/`lineInRanges`（复用既有"只有注释行才算标记"的判定，不在用例里另写一份标记语法）；`packages/sdk/src/consumed-operations.test.ts` 与 `packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-012.spec.ts` 改为"只对标记内的示例条目断言恰好是 `CreateTrade`、`QueryTrade`"，标记外条目只进派生与双向检查；Fixture 来源摘要已按新口径刷新。
- **补充修复（覆盖率的连带缺口）**：`65209ea` 的 `example-markers.ts` 新函数没有单测，`pnpm test:unit` 掉到 Statements 99.97% / Branches 99.95%。新增 `scripts/lib/example-markers.test.ts`（4 个用例：成对标记区间、字符串字面量里的同名文字不算标记、未闭合 `begin` 延伸到文件末尾、Markdown 标记与不成对报错），提交 `b3acbaf test(template): cover the example marker range helpers`。修复后四项覆盖率恢复 100%。
- **证据**：`pnpm test:unit` → 66 文件 / 383 用例通过，Statements 100%（3375/3375）、Branches 100%（2222/2222）、Functions 100%、Lines 100%。
- **反例**：`scripts/lib/example-markers.test.ts` 中的 `// template-example:end`（无 begin）必须被 `scanExampleMarkers` 报出；字符串字面量中的同名文字必须不参与裁剪。

### 第 1 条 · T10/T12：协议矩阵支持 oneof 响应（integration、weapp、宿主运行器）

- **根因**：`CreateTradePayResponse.pay_params` 是 oneof，派生器按 `wechat_jsapi`、`wechat_native`、`wechat_virtual` 三个分支分别产生 `decoded-branch`、`wire-present`、`wire-absent` 等义务；而矩阵 Fixture 每个接口只允许**一条**响应，用例只取 `responses[0]` 取证（`SCN-PROTOCOL-CONTRACT-002.spec.ts:500` 报 `expected undefined to be defined`）。weapp 侧的 `decodedAt` 也不认识 generated 的 `payParams.params.$case` 结构，分支子字段取不到值。
- **Spec 原文核对（先核对再实施）**：`protocol-contract` 的 PC-01 只规定"矩阵数据放在 Fixture、以接口名为键""每条义务在 integration 与 weapp 都有通过证据"，**没有**"每个接口一条响应"的约束；主 Spec 的 PC-02 是错误码事实与来源校验，与响应条数无关。因此本条不需要改 Spec，A5 之外没有新的规划修订。
- **改动**：
  - 新增 `packages/e2e/tests/protocol/matrix-support.ts`：`MatrixEntry` 支持**多条** `responses`（每条只带一个分支，交给 Shadow 同形校验），`decodedAt` 支持 oneof 的 `$case` 分支，`occurrence`/`wireAt`/`omittedSample`/`missingOmissionSamples` 等纯函数与运行环境无关。
  - 新增 `packages/e2e/tests/protocol/matrix-evidence.ts`：真实执行矩阵并按义务判定取证；每条派生义务必须至少由一条响应取证，找不到取证响应时按**义务 ID** 列进 `missingEvidence`；`missingSamples` 报出"声明了 omitted 却没有逐字段省略样例"的字段。
  - integration `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts` 改为调用共享实现的薄壳，4 个 checkpoint 名称与绑定不变。
  - weapp `packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`SCN-PROTOCOL-CONTRACT-008.spec.ts` 与宿主 `packages/e2e/host/weapp/protocol-runner.ts` 改为按 `samples`（每条响应一条请求 + 每个 omitted 字段一条样例 + 一条不配置上下文）执行；`packages/e2e/src/drivers/weapp-host.test.ts` 同步新入参。
  - Fixture `SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` 的 `responses` 改为数组，并按新内容 refresh 来源摘要（`manifest.json` 的 sha256）。
- **证据（integration）**：`SCENARIO_GATE_CHANGES=template-core-hardening VERIFY_RUN_ID=r4-final-2 pnpm exec vitest run --project integration packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002-extension.spec.ts` → 退出码 0（1 文件 / 1 用例，5.0s，日志 `artifacts/r4-final-2/logs/r4-regression-evidence.log`）；完整 integration 见本节"完成标准复验"。
- **证据（weapp，逐文件、先预热、不用 `-t`）**：
  - `pnpm weapp:prepare` 四次（`artifacts/r4-final-2/logs/prepare1..4.log`，退出码均为 0，每次约 25–48s）。
  - `pnpm exec vitest run --project weapp packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts` → 通过，1 用例，9.3s（日志 `artifacts/r4-final-2/logs/weapp002c.log`）。
  - `pnpm exec vitest run --project weapp packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-008.spec.ts` → 通过，1 用例，9.5s（日志 `artifacts/r4-final-2/logs/weapp008.log`）。
- **weapp 首两次失败与改法（整文件重跑记录）**：`weapp002.log`、`weapp002b.log` 显示 `x-product-id-omitted` 断言失败——头证据用 `methodRecords.at(-1)` 取到的是**整份套件**的最后一条请求（后续故障/超时请求用的是默认上下文），不是矩阵段最后一条"不配置上下文"的请求。改为按 `matrixRecords = methodRecords.slice(0, responses + omitted + 1)` 切出矩阵段后再取首/末记录；第三次整文件重跑通过。失败信息同时改为打印 `headers` 与请求体，便于以后定位（`weapp002b.log` 里能看到 `x-product-id: matrix-product` 与 `baseReq.productId`）。
- **反例**：见第 3 条（少一条分支响应 → 报出该分支的 3 条义务；声明 omitted 却没样例 → 报字段）。

### 第 2 条 · T10：omitted 逐字段取证

- **根因**：稀疏请求只删掉了 `productId`，逐字段省略的证据只覆盖 `base_req.product_id` 一个字段；`requestFields` 里声明 `omitted` 的其它字段（`CreateTrade.items.sku_snapshot*`、`QueryTrade.biz_type/biz_trade_no/sync_channel`）没有样例，等于"声明了不校验"。
- **改动**：Fixture 为每个接口补 `omitted` 列表（`CreateTrade` 4 项、`QueryTrade` 4 项），用例按列表逐字段生成省略样例并各发一次请求；共享实现用 `missingOmissionSamples` 对照声明，缺样例就按 `${接口}#request-mapping#${字段}` 报出，不再写死某个字段。weapp 与 integration 用同一份口径（`matrix-support.ts`）。
- **证据**：两条用例的 `obligations-covered` 都断言 `missingSamples` 为空（integration 见 `r4-regression-evidence.log`；weapp 见 `weapp002c.log`）。
- **反例**：回归证据用例里构造 `omitted: ['base_req.product_id']` 的 Fixture（少了 `open_id`），断言 `missingSamples` 含 `CreateTradePay#request-mapping#open_id` 且只报这一个字段——断言实际执行并命中（`r4-regression-evidence.log`）。

### 第 3 条 · 关键回归证据：示例保留时标记外新增 oneof 消费接口

- **改动**：新增 `packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002-extension.spec.ts`。它在受控根里读**仓库当前**的 `consumed-operations.ts`，把使用方条目追加在示例片段结束标记之后（示例已删除的副本里没有标记，则直接追加到声明数组末尾），并自己声明 `extensionAuthority`（不引用示例片段里会一起删除的 `requestAuthority`）；调用方源码、声明方法集合、矩阵 Fixture 都由当前内容派生，因此示例保留与删除两种状态下都成立。
- **断言的"两步"**：只改声明（登记 `CreateTradePay` 与请求字段策略，含 `omitted`）与矩阵 Fixture（oneof 三个分支各一条响应）后——① 标记内的示例条目仍恰好是 `CreateTrade`、`QueryTrade`（示例删除后为 0 条）；② `buildContractInventory(root).issues` 为 0（双向对账：未使用的声明、未声明的调用都是 0）；③ 该接口派生的每条义务都有取证，三条分支义务都在 `covered` 里。
- **归属**：不新增 Scenario/case，也不改 Spec 文字；作为 SCN-PROTOCOL-CONTRACT-002 `protocol-matrix` case 的附加证据，checkpoint 仍只用绑定里登记的 4 个（用例内的断言不登记成新 checkpoint，避免 GATE-11 的未登记 checkpoint 问题）。
- **反例 1（少一条分支响应）**：去掉 `wechatNative` 那条响应后，`missingEvidence` 必须含该分支的 `decoded-branch`、`wire-present`、`wechat_native.code_url/decoded-value`，且报出的义务**全部**属于 `wechat_native`（其它分支不受影响）。
- **反例 2（声明 omitted 却没有样例）**：见第 2 条。
- **证据**：`r4-regression-evidence.log`（退出码 0，1 用例，5.0s）；两条反例的断言都在同一次运行中执行通过。

### 第 4 条 · T16：指南补充

- **改动**（`docs/template-guide.md`）：① 能力地图"IDL 协议义务派生与消费接口双向对账"一行补三点——新条目写在示例标记之外、oneof 响应按分支各一条（一条只带一个分支）、声明 `omitted` 的字段要有逐字段省略样例；② "从方案到验收"新增第 10 条"用例落位与覆盖率排除"——integration 用例放 `packages/e2e/tests/{protocol,tooling,flows,sdk}/**/*.spec.ts`（示例用例另在 `tests/example/`）、weapp 用例放 `packages/e2e/tests/weapp/**/*.spec.ts`，两组目录来自各 vitest 配置的 `include`；新增 weapp 宿主 runner 要在 `manifest.quality.coverageExclusions` 登记文件与理由，由 `pnpm check:coverage` 按清单核对；③ "已知限制"里补平台能力替身**怎样经用例注入**：替身按产品包定义的端口实现、放在 `packages/e2e/src/drivers/`，由用例在调用宿主 runner 前注入，宿主 runner 只按声明发真实 `wx.request` 并回传原始结果（替身仍没有代码样例，保持已知限制）。
- **证据**：`pnpm format:check`、`pnpm check:architecture`、`pnpm check:fixtures` 退出码 0（`r4-final-2` 的 check:fast 日志 `artifacts/r4-final-2/logs/verify2.log`）。
- **反例**：指南新增文字里不含未登记的 Scenario ID、不引用被删除的示例文件（事实检查与架构检查均 0 问题）。

### 连带修复 · sdk-release 快照查找与并行临时目录

- **根因**：`releaseSnapshot(before)` 用"系统临时目录里新增的 `template-sdk-release-*` 目录"定位本次 release 的暂存目录。`scripts/sdk-release.plan.test.ts` 与 `scripts/sdk-release.test.ts` 会被 vitest 并行执行，两者都会在同一个 `tmpdir()` 下创建并清理同类目录；后者的 `statSync` 可能读到前者**正在清理**的目录，抛 `ENOENT: ... stat '.../template-sdk-release-i90OZN'`，把真正的结论（`record snapshot … integrity/content` 拒绝）盖掉。这不是本轮引入的并发，而是本轮新增的用例文件改变了 vitest 的文件并行时序后稳定复现。
- **改动**：① `scripts/sdk-release.test.ts` 每个用例独占一份 `TMPDIR`（`beforeEach` 里 `mkdtempSync` + `vi.stubEnv('TMPDIR', …)`，随既有 `afterEach` 一起清理/还原），快照查找只看本次用例自己的目录；② `packages/e2e/tests/tooling/sdk-release-fixture.ts` 的 `releaseSnapshot` 跳过已经消失的候选、并要求候选确实含有 `release-record.json`，不再让 ENOENT 成为断言失败原因。
- **证据**：修复前 `artifacts/r4-final-2/logs/verify1.log`（run id `r4-final-1`，check:fast 在 `scripts/sdk-release.test.ts` 失败，退出码 1）与 `artifacts/r4-final-2/logs/fast2.log`（同一失败）；修复后 `pnpm exec vitest run --project test-tools-unit` 连续 2 次各 234 用例全绿，随后全量 verify 的三步全绿（`verify2.log`）。
- **提交**：`e6426ff fix(template): isolate release snapshot lookup from parallel temp directories`。
- **已知限制（只登记，不改）**：`SCN-TEMPLATE-EXAMPLE-005`（示例的窗口/超时用例，断言"窗口内至少重试 2 次"）对 CPU 争用敏感：本轮 `int4.log`、`int5.log`、`fast3.log` 各失败一次，隔离单跑 3 次全部通过、与另一文件并行也通过；同一失败在此前 `artifacts/core-hardening-t14b` 的集成报告里出现过。它是随示例一起删除的示例用例，本轮不改断言；只记录为负载敏感的已知抖动。

### 提交与完成标准复验

- **提交**：`65089db`（A5 规划）、`6d7bfdf`（取消勾选 T10/T12/T16）、`65209ea`（标记内口径）、`b3acbaf`（标记辅助函数单测）、`5ab0244`（oneof + 逐字段 omitted）、`f9cc578`（回归证据）、`dd3a2ff`（指南）、`e6426ff`（sdk-release 竞态）。
- **全量**：`SCENARIO_GATE_CHANGES=template-core-hardening pnpm verify --change template-core-hardening --run-id r4-final-2` → 退出码 **0**；`check:fast` 通过（163807ms）、`test:e2e:weapp` 通过（477736ms）、`check:scenarios` 通过（1464ms）（日志 `artifacts/r4-final-2/logs/verify2.log`）。
- **独立复跑门禁**：`SCENARIO_GATE_CHANGES=template-core-hardening VERIFY_RUN_ID=r4-final-2 pnpm check:scenarios` → 退出码 **0**，`mode: complete`，`"issues": []`（日志 `artifacts/r4-final-2/logs/scenarios2.log`）；说明全量 verify 跑完后报告没有过期。
- **报告目录**：`artifacts/r4-final-2/`（`reports/unit.json`、`reports/integration.json`、`reports/weapp/`、`reports/scenarios.json`、`coverage/`）。
- **本轮不做**：Task 17、18 仍不勾选；示例删除演练与支付 SDK 复刻演练由验收方另派全新 Agent 执行。
