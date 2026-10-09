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
