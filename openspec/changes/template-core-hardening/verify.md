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
