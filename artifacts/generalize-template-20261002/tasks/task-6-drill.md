# Task 6 验收索引：指南演练验收

- run-id: `generalize-template-20261002`；change: `generalize-template`；branch: `codex/generalize-template`
- plan-review gate: PASS（digest `2bb108e6…`，任务开始前与完成后各复算一次均一致）
- 结论: 进行中（D1、D2 已完成；D3～D5 及受影响演练的重做见下）。

## 演练设置

- 隔离：每个演练在任务 5 提交 `02fa2f1` 之上新建独立 detached git worktree（scratch 目录 `/tmp/gt-drills/<id>`），`pnpm install --frozen-lockfile` 后进行；演练改动不进入任何提交（结束删除 worktree）。
- 执行者：每个演练派发一个全新 Agent；提示词只含 worktree 路径、"先读根 `AGENTS.md` 与 `docs/template-guide.md`"、操作目标与规则，不含本 Change 规划内容，并要求不得读取 `openspec/changes/`。
- 规则：只依据仓库文档与代码完成；不得修改 `scripts/` 下的非测试文件；每遇到需要猜测、指南与代码不符、指南缺步骤处记入"猜测记录"。
- 通过标准：`VERIFY_RUN_ID=drill-<id> pnpm check:fast` 退出码 0（本 Change 仍 active，演练只跑 `check:fast`，不跑场景门禁）。
- 重做：指南因某次演练修订后，受影响的演练用新的 worktree（带修订后指南）与新的 Agent 重做。

## D1 按"包发布"删除发布模块

**提示词**：见文末"提示词模板"（D1 目标：按 `docs/template-guide.md` 替换点地图"包发布"一节删除发布模块）。

**步骤摘要**：
1. 读根 `AGENTS.md`、`docs/template-guide.md`；
2. 删除发布脚本 `scripts/sdk-release.ts`、`scripts/check-release.ts` 及其测试，删除发布 Fixture 目录与 `SCN-TEMPLATE-ENGINEERING-004.spec.ts`，删除 `manifest.release`、根脚本 `release:preflight`/`sdk-release`、各包 `publishConfig`；
3. 同步主 Spec、active Change 的 Spec delta、README、指南与 `SCN-TEMPLATE-ENGINEERING-005.spec.ts`；
4. `pnpm check:fast`。

**改动文件**（`git status --short`，19 项）：`README.md`、`docs/template-guide.md`、`openspec/changes/generalize-template/specs/template-engineering/spec.md`、`openspec/specs/template-engineering/spec.md`、`package.json`、`project.manifest.json`、`packages/protocol/package.json`、`packages/sdk/package.json`、`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-005.spec.ts`（改），`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-004.spec.ts` 与 `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-004/**(5)`、`scripts/sdk-release.ts(+test)`、`scripts/check-release.ts(+test)`（删）。

**check:fast**：首次 exit 1（integration 1 failed：`SCN-TEMPLATE-ENGINEERING-005` 仍读取已删除的 `manifest.release`）；修正后 exit 0 —— unit 41 文件/246 用例、覆盖率 100%，integration 30 文件/75 用例。`scripts/` 下只有替换点地图要求的删除，未改门禁逻辑。

**猜测记录与处理**：
1. 指南"包发布"把 `scripts/check-package.ts` 列为发布模块文件，实际它承载 ENG-01 打包/依赖边界检查，删除会破坏 `check:fast` → **已修订**：该节明确 `check-package.ts` 不属于发布模块、不要删除。
2. 指南未说明删除后还要同步 `README.md` 与各 `AGENTS.md` 中声明发布能力的句子 → **已修订**：该节"涉及文件"补充 README/AGENTS。
3. 删除主 Spec 的 ENG-04 Requirement 后，active Change 的 `MODIFIED ENG-04` delta 失效，Spec 清单校验失败（`check:fast` 非零）→ **已修订**：新增维护规则"主 Spec 与未归档 Change 的 Spec delta 必须一致"。
4. 指南"初始化方式"提到 `publishConfig`，在删除发布的语境下易误导 → **接受**：该句属改名步骤（publishConfig 含发布 registry 占位符），与发布模块删除无关；改由 D3 复核。
5. `SCN-TEMPLATE-ENGINEERING-005.spec.ts` 读取 `manifest.release`，删能力后用例失败；指南未提"能力地图对应行的承载文件与验证方式要同步" → **已修订**：维护规则新增"能力地图中对应行的承载文件与验证方式也要同步"。

**判定**：PASS（`check:fast` exit 0；未改门禁逻辑；发布命令、脚本、Spec、用例与清单 `release` 均已删除）。

## D2 按"运行平台"去掉微信小程序平台

**提示词**：同"D1 目标"改为：按替换点地图"运行平台"一节去掉微信小程序平台、不提供替代平台。

**步骤摘要**：删除 weapp 测试主机与用例、`weapp` 驱动与 `vitest.config.weapp.ts`，更新清单（`testProjects`/`fingerprints.hostRoots`/`requiredCommands`/`allowedDirectories`）与根 `package.json`、`vitest.config.ts`，改写主 Spec 中 weapp 表述，补一处单测覆盖。

**改动文件**（31 项）：`README.md`、`docs/template-guide.md`、`package.json`、`project.manifest.json`、`vitest.config.ts`、`packages/e2e/src/bootstrap.test.ts`、`packages/protocol/src/transport/context.test.ts`、`scripts/lib/contract-inventory.test.ts`、`scripts/lib/spec-inventory.test.ts`、`openspec/specs/{protocol-contract,scenario-gate,template-example}/spec.md`（改）；`packages/e2e/host/weapp/**`（11）、`packages/e2e/src/drivers/weapp{,-host}.test.ts`、`weapp.ts`、`packages/e2e/tests/weapp/**`（4）、`packages/e2e/vitest.config.weapp.ts`（删）。

**check:fast**：exit 0，且场景门禁 exit 0；未改 `scripts/` 非测试文件。

**猜测记录与处理**：
1. 指南把 `packages/protocol/src/adapters/network/wechat-miniapp.ts` 列为"运行平台"涉及文件，但根 `AGENTS.md` 硬规则 7 与 `SCN-TEMPLATE-ENGINEERING-001` 要求生产 `HttpPort` 工厂具名导出 → 只能去掉测试侧平台项目，保留生产适配器 → **已修订**：该节拆为"测试侧 / 生产侧"，说明生产网络工厂必须保留。
2. 主 Spec 正文提及 weapp 的表述需一并修改 → **已修订**：维护规则要求同步承载文件与验证方式（并已在该节注明 Spec 表述要调整）。
3. 指南缺联动：根 `package.json` 的 `test:e2e:weapp` 脚本与 `check` 串联、`vitest.config.ts` 的 projects、`bootstrap.test.ts` → **已修订**：该节"涉及文件（测试侧）"补齐这些文件。
4. 删除 weapp host 后 `packages/protocol/src/transport/context.ts` 失去唯一覆盖来源，100% 覆盖率失败 → **已修订**：新增维护规则"删除代码常让 100% 覆盖失去来源，需同步处理单测"。
5. 归档 Spec 相关的 `spec-inventory.test.ts` 需要显式项目集才通过 → **已修订**：维护规则新增"同步工程配置（package.json / vitest.config.ts / .gitignore 等）"。
6. 删平台后残留 `.gitignore`、eslint/vitest globs、AGENTS 中 weapp 章节属无害残留 → **接受**：不影响门禁；替换点地图已提示"同步更新引用已删文件的工程配置"。

**判定**：PASS（`check:fast` 与场景门禁均 exit 0；清单不再有 platform 类项目，`requiredIn` 不再引用 `weapp`）。

## D3 按"初始化方式"把产品包改名为 packages/demo-sdk / @daqian/demo-sdk

**提示词**：见文末"提示词模板"（D3 目标：按"初始化方式"把产品包改名）。

**步骤摘要**：改清单 `packages[0].directory` `sdk→demo-sdk`、`name` `@daqian/template-sdk→@daqian/demo-sdk`、`fingerprints.sourceRoots`；`git mv packages/sdk packages/demo-sdk`；全仓适配旧包名/旧路径（文档、`eslint.config.js`、`.dependency-cruiser.cjs`、`tsconfig.base.json`/`tsconfig.test.json`、`vitest.config.ts`、根 `package.json`、`packages/e2e`、`pnpm-lock.yaml`）；手工重建 workspace 软链（演练环境禁止 `pnpm install`）；`pnpm check:fast`。

**改动文件**：50 项（`packages/sdk → packages/demo-sdk` 全目录改名 + 上列配置/文档/测试适配；`scripts/` 下仅 `*.test.ts` 被改，非测试文件零改动）。

**check:fast**：首轮因 `.dependency-cruiser.cjs` 的 `(sdk|e2e)` 交替组未同步导致 5 个用例失败；修正后 exit 0 —— unit 43 文件/287 用例、覆盖率 100%（1921/1921、1282/1282、334/334、1453/1453），integration 31 文件/79 用例，`check:architecture`/`check:fixtures`/`check:package` 均 `issues: []`。

**猜测记录与处理**：
1. 指南笼统写"包目录与包名"，未说明 protocol/e2e 是否一起改 → **已修订**：明确改名对象（演练只改产品包，protocol/e2e 名与目录按需保留）。
2. 清单 `release.tagPrefix: "template-sdk-v"` 不在指南的清单同步项里 → **已修订**：改名同步项补 `manifest.release`（tagPrefix 随包名）。
3. 根 `AGENTS.md` 最小示例含 `packages/sdk/src` 路径，指南未列为改名点 → **已修订**：补充 AGENTS/README 中路径示例需同步。
4. 禁止 `pnpm install` 时 workspace 软链不会自动更新，e2e 无法解析新包名 → **接受**：属演练环境限制（真实使用方会执行 `pnpm install` 更新锁文件与软链），已在提示词规则中体现。
5. `.dependency-cruiser.cjs`/`eslint.config.js` 用 `(sdk|e2e)` 交替组，按字面替换会漏改 → **已修订**：维护规则补充需同步含包名的工程配置（depcruise/eslint/tsconfig）。
6. 已跟踪的历史 `artifacts/**/tasks/*.md` 被机械替换会篡改历史 → **接受**：历史证据不改写（门禁不读取）。
7. `packages/demo-sdk/vitest.config.ts` 的 `testing/**` glob 指向不存在的目录，未清理 → **接受**：预先存在，与本次改名无关。

**判定**：PASS（`check:fast` exit 0；未改 `scripts/` 非测试文件）。

## D4 以示例为样板新增业务模块 src/notice/

**提示词**：同"D1 目标"改为：按"初始化方式"第 3 条，以 `packages/sdk/src/example` 与 `packages/e2e/tests/example` 为样板新增 `src/notice/`（含工厂、核心、端口、适配器与就近单测）。

**步骤摘要**：新建 `packages/sdk/src/notice/{contracts.ts,errors.ts,factory.ts}` 与 `notice/{ports/gateway.ts,core/notifier.ts,adapters/transport.ts}`，按工厂 → 核心 → 端口 → 适配器分层；4 个就近单测覆盖全部分支；不修改 `src/index.ts`（内部模块）。`pnpm check:fast`。

**改动文件**（10 个新增）：上列 6 个源文件 + `contracts.test.ts`、`core/notifier.test.ts`、`adapters/transport.test.ts`、`factory.test.ts`。

**check:fast**：exit 0 —— unit 47 文件/295 用例、覆盖率 100%（Statements 1956/1956、Branches 1315/1315、Functions 345/345、Lines 1478/1478），integration 31 文件/79 用例，`check:architecture`/`check:fixtures`/`check:package` 均 `issues: []`。

**猜测记录与处理**：
1. 分层守卫只匹配 `example/`：`eslint.config.js` 的 `no-restricted-globals: wx` 与 `.dependency-cruiser.cjs` 的 `core-no-platform-or-node`、`example-core-no-generated` 都写死 `example/(core|ports)`；照指南新增 `notice/` 后这些守卫静默失效 → **已修订**：指南"初始化方式"与 `packages/sdk/AGENTS.md` 增加"新增业务目录后把守卫扩展到新目录"。
2. 指南没说明新增模块必须自带全覆盖单测（100% 阈值） → **已修订**：该条补充"就近单测覆盖新代码以满足 100% 阈值"。
3. 新增模块是否/如何进入公共导出不明确（`src/index.ts` 是唯一公共导出，但未说内部模块如何处理） → **已修订**：该条补充"需要对外时在 `packages/sdk/src/index.ts` 导出"。
4. 业务目录之间不得互相导入（`domain-isolation`）在新模块中的实操只是"照 example 复制"，无额外步骤 → **接受**：`domain-isolation` 自动覆盖产品包内所有业务目录，无需配置。

**判定**：PASS（`check:fast` exit 0；目录结构与示例一致；`domain-isolation` 通过）。

## D5 纸面推演：把协议来源换成 OpenAPI

**提示词**：同"D1 目标"改为：只做纸面推演，列出把协议来源换成 OpenAPI 需要改动的文件与清单项，不实际修改。

**方法**：只读分析，用 `git grep` 枚举生成代码、`RpcMethodMeta`/`routesFromRpcMethods`/`generatedSource` 的消费方与工程接线；对照指南"协议来源"一节的涉及文件核对完整性。

**推演出的改动清单**：
1. 配置与身份：`proto-gen.yaml`、`proto-gen.lock`、根 `package.json`（`proto:*` 脚本与 proto-gen devDependency）、`pnpm-lock.yaml`、ProtoGen Consumer 登记（IDL 仓库）。
2. 生成代码：`packages/protocol/src/generated/**`（18 个文件）整体替换为 OpenAPI 产物或删除。
3. 生成描述消费方：`packages/protocol/src/client.ts`（`RpcMethodMeta`）、`packages/protocol/testing/index.ts`、`packages/protocol/testing/shadow/idl-routes.ts(+test)`、`packages/protocol/testing/shadow/example/routes.ts`、`packages/protocol/testing/shadow/bootstrap.test.ts`、`scripts/lib/contract-inventory.ts(+test)`（协议义务派生）、`packages/protocol/src/errors/**`（Go 来源校验，PC-02）。
4. 业务侧消费方：`packages/sdk/src/example/adapters/trade-backend.ts(+test)`、`packages/e2e/host/weapp/protocol-runner.ts`、`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002/003.spec.ts`、`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts`、`packages/e2e/tests/tooling/SCN-PROTOCOL-CONTRACT-004.spec.ts`。
5. 工程接线：`packages/protocol/package.json`（`./generated/*` 导出）、`packages/protocol/vite.config.ts`、`packages/protocol/tsconfig.build.json`、`vitest.shared.ts`（`generated` 别名）、`vitest.config.ts`（覆盖率排除）、`eslint.config.js`（忽略）、`.dependency-cruiser.cjs`（`sdk-cross-package-exports-only`、`example-core-no-generated`、`shadow-engine-no-generated`）。
6. 清单项：`manifest.requiredCommands`（`proto:validate`/`proto:status`/`proto:sync` 的去留）、`manifest.fingerprints.sourceRoots`（新来源目录）。
7. Spec 与证据：`openspec/specs/protocol-contract/spec.md`（PC-01/PC-02/PC-03 与 SCN-PROTOCOL-CONTRACT-001..004 的 verification/cases）、active Change 的 delta（若在 Change 中执行）、`packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-003/**`（`provenance/current.lock`、`manifest.json` 摘要与 `generatedCompatibility`）。
8. 文档：根 `AGENTS.md`（执行规则 10）、`packages/protocol/AGENTS.md`、`docs/template-guide.md`、`docs/engineering/bootstrap.md`。

**评审对照**：`git grep -l "@daqian/template-protocol/generated"`、`git grep -ln "RpcMethodMeta\|generatedSource\|routesFromRpcMethods\|exampleRpcMethods"` 与 `git grep -ln "proto-gen\|ProtoGen"` 的命中均被清单覆盖（archive/artifacts 历史与 Change 规划除外）。PASS。

**猜测记录与处理**：
1. 指南"协议来源"的"涉及文件"只列了配置、生成目录、`idl-routes.ts`/`example/routes.ts`、`contract-inventory.ts`、errors、Fixture 与 Spec，漏了 `packages/protocol/src/client.ts`（`RpcMethodMeta` 执行）、`packages/protocol/testing/index.ts`、SDK 适配器、weapp `protocol-runner.ts`、多条 e2e 用例，以及工程接线（`package.json` 导出、vite/tsconfig、vitest 别名与覆盖率排除、eslint 忽略、depcruise 规则） → **已修订**：该节补全为"配置 / 生成代码及消费方 / 工程接线 / 证据 / Spec 与文档"。
2. 指南把"清单需要修改的项"只写到 `requiredCommands` 与 `sourceRoots`，未提"生成代码消费方与工程接线"属代码改动而非清单项 → **已修订**：改由"涉及文件"覆盖，避免读者以为只改清单。

**判定**：PASS（文件清单经评审对照 `git grep` 确认完整）。

## 受修订影响的演练重做：方法限制与结论

- 设计要求的重做方式是"用新的 worktree 与全新的 Agent"。本任务执行期间，运行环境的多 Agent 工具在本轮不可用（`spawn_agent`/`close_agent`/`send_input`/`wait_agent` 均返回 `unsupported call`）：D1、D2、D3 由全新 Agent 完成，D4、D5 及本轮重做改由主 Agent 在独立 worktree 中执行。
- 替代验证（逐条猜测记录）：
  - 修订后的指南文本逐条覆盖 D1～D5 的每条猜测记录（上表"已修订"项），并在本仓库 `pnpm exec tsx scripts/check-architecture.ts` 下保持 `issues: []`。
  - D1～D4 的改动集在各自 worktree 中已由 `check:fast` 退出码 0 证明；本轮修订只增加文档说明与规则文字，不改变任何门禁代码（`scripts/` 下非测试文件零改动）。
- **已知限制**：修订后未能在"全新、无本 Change 上下文"的 Agent 中重做一次（工具不可用）。这弱化了本轮重做的独立性证据；建议在工具恢复或真实使用方出现时补做，并登记为 OI-01 的补充说明。
