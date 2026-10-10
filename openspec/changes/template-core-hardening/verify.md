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
- 现有用例没有"需要故意返回非法响应"的场景（`error-handling/codec-error` 测的是请求编解码，不是服务端返回非法体），因此**补 `malformed` 声明的步骤 0 处**；`malformed` 语义仅由 `response-shape.test.ts` 的新 case 覆盖。
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
- **证据（无作用域全绿）**：临时脚本 `/tmp/tcfix-item1-evidence.mts` 走 `createRepositoryCopy` 构造副本、归档本 Change、清空 `SCENARIO_GATE_CHANGES`，再跑一次全量 `test:integration` → `/tmp/tcfix-item1-evidence.log`：副本 `active changes: []`、`TEMPLATE_COPY=1`、`SCENARIO_GATE_CHANGES: undefined`、`build exit: 0`、`test:integration` 50 文件 / 104 用例全绿（22.45s，exit 0）；5 个 `TEMPLATE_COPY` 排除项（ENGINEERING-001、ENGINEERING-007、GATE-026、ENGINEERING-008、EXAMPLE-008）均 `present in output: false`。
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
