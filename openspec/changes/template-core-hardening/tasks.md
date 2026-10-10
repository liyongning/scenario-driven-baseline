# 模板核心加固实施计划

**Goal:** 让"门禁全绿"真正意味着该检查的都检查到了，消除多 Change、归档、全量运行带来的生命周期摩擦，去除清单之外的写死拓扑，落地新增的工程规范与文档，并以可复用的复刻验收方法证明改造有效。最终验收：`pnpm verify --change template-core-hardening` 全部步骤退出码 0，场景门禁问题数 0；示例删除演练与支付 SDK 复刻演练通过。

**Architecture:** 先打工程基线（任务 1–2），再扩清单并建立共享的手写源码清单与统一临时根 helper（任务 3），在其上去写死、隔离门禁自测（任务 4–5），然后改造场景门禁的来源与作用域（任务 6）、对账（任务 7）、验收入口（任务 8）与按需测试（任务 9），再改协议侧并完成示例解耦的代码部分（任务 10–13），最后是规模基线、项目地图、文档、示例解耦与演练（任务 14–18）。见 Design"实施顺序与迁移"。

**Tech Stack:** pnpm、Vite、Vitest、Ajv、dependency-cruiser、ESLint、TypeScript 5.9、ProtoGen；新增 Prettier。

**Spec:** [scenario-gate](specs/scenario-gate/spec.md)、[template-engineering](specs/template-engineering/spec.md)、[protocol-contract](specs/protocol-contract/spec.md)、[template-example](specs/template-example/spec.md)、[设计](design.md)。

## Global Constraints

- 手写代码四项覆盖率保持 100%；除 Design 明确的登记机制外不新增豁免。Design 允许的条目：`quality.coverageExclusions` 只含 `packages/e2e/host/weapp/` 下 `setup.ts`、`vite.config.ts`、`protocol-runner.ts`、`example-runner.ts` 四项（理由均为"只在微信开发者工具宿主中执行，行为证据由 weapp 用例承担"），`host` 下已被单测覆盖的其他文件继续计入覆盖率；`quality.maxLinesExemptions` 为空。
- 不修改已归档 Change、ProtoGen Consumer 登记与 IDL；`@daqian/proto-gen` 升级只改版本与锁文件。
- 已有用例的断言语义不变，只允许 Design 明确列出的适配；新行为只通过本 Change Spec 中的新 case 或新 checkpoint 验证。
- 场景门禁结论必须来自本次实际运行，禁止凭推断声称通过。
- weapp 按 `packages/e2e/AGENTS.md`"微信开发者工具自动化的注意事项"执行：每个文件前退出主进程并预热；失败整文件重跑；不用 `-t`。
- 长期约定必须落在项目级载体上（AGENTS.md、schema、清单、脚本、指南、架构文档）；Change 文档不能是唯一出处。
- 遵循新增的根 AGENTS 规则"优先采用现成方案"：实现中需要通用能力时，先查官方文档与社区方案（例如 Vitest `related`、`git ls-files`、Prettier、ESLint 内置规则），自研须在任务验收记录中说明理由。
- 工作区与提交：Apply 在独立 worktree 与分支中进行；用户授权 `--commit` 时按各任务的 Commit 逐任务提交，否则保持未提交；不 merge、不 push。

## 每个任务的共同完成条件

1. Files 中的产物齐全，行为与所列 Requirement/Scenario 及 Design 决定一致。
2. 本 Change active 期间，全量运行一律带作用域（ENG-06 运行约定）：单独运行 `check:fast` 时为 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast`，任务 8 交付 `verify` 后为 `pnpm verify --change template-core-hardening`；下文各任务 GREEN/Verification 中的 `pnpm check:fast`、`pnpm verify` 均指这一带作用域的形式。任务 1–8 结束时运行全量 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm check:fast`，退出码为 0；任务 9 交付按需入口后，任务结束时运行 `SCENARIO_GATE_CHANGES=template-core-hardening pnpm test:affected` 并记录选择结果，同时按 OI-CH-02 的试行节奏插入全量 `pnpm verify --change template-core-hardening`（至少每 3 个任务一次，且任务 13、17、18 结束时必须全量）。
3. RED 已先失败、GREEN 后通过；Verification 中的命令与反例符合预期。
4. 实际运行一次场景门禁（任务 7 起用 `--change template-core-hardening` 限定作用域；任务 6 起 `check:fixtures` 同样以 `--change template-core-hardening` 运行），每个问题写明归属的后续任务，无法归属即为回归。
5. 验收记录写入本 Change 的 `verify.md` 草稿章节"逐任务记录"：实际命令与退出码、报告路径、方案与实际的差异、预期失败的反例、weapp 重跑记录、按需选择结果。不再写入 `artifacts/<run-id>/tasks/`。
6. 任务评审确认职责边界、断言与 Spec 一致后才勾选。

## Implementation Tasks

**Tracking rule:** One independently implementable and reviewable task maps to one unindented top-level checkbox. RED, GREEN, verification, and review steps are indented plain bullets, not additional tracked checkboxes.

- [x] 1. 依赖小版本升级与忽略项修正

  **Files**
  - Modify：根 `package.json`、`pnpm-lock.yaml`（全部 devDependencies 升至最新补丁或小版本，以 `pnpm outdated` 为准；`typescript` 保持 5.9.x；`@types/node` 保持 22.x；`@daqian/proto-gen` 升至私有 registry 最新正式版本并保存精确版本）。
  - Modify：根 `package.json`、`pnpm-lock.yaml` 新增精确版本 devDependency `@fission-ai/openspec`（供需要真实 OpenSpec CLI 的用例与副本归档使用，不依赖全局安装）。精确版本固定为 1.6.0：与本机工作流使用的全局 CLI 一致，也是规划阶段归档实验所用的版本。OpenSpec CLI 的升级不在本 Change 范围内。
  - Modify：`eslint.config.js`（ignores 加入 `.local/**`）；`.gitignore`（删除 `openspec/schemas/`）；`README.md`（维护者说明：本地用 `.git/info/exclude` 排除工作流 schema）。

  **Requirements / Scenarios**
  - template-engineering：ENG-08 / SCN-TEMPLATE-ENGINEERING-010（忽略项相关 checkpoint）

  **Design Decisions**
  - Decision: 工程基线

  **Interfaces**
  - Consumes: 现有依赖与配置。
  - Produces: 升级后的锁文件；`.local/**` 不参与 lint；`openspec/schemas/` 不再被忽略；`pnpm exec openspec --version` 输出固定版本。

  **RED**
  - 在 `.local/` 下放一个含 lint 违规的临时文件，运行 `pnpm lint` 失败；`git check-ignore openspec/schemas/x` 命中。

  **GREEN**
  - 修改后上述两条均不再命中；升级后 `pnpm check:fast` 与 `pnpm test:e2e:weapp` 通过。

  **Verification**
  - `pnpm outdated` 只剩 Design 明确不升级的主版本（typescript、@types/node）；`pnpm exec openspec --version` 与 `package.json` 中的精确版本一致。

  **Review / Acceptance**
  - 记录升级前后版本对照与任何因升级而做的代码适配。

  **Commit**
  - `chore(template): bump tooling patch versions and fix ignore rules`

- [x] 2. Prettier 基线与全量格式化

  **Files**
  - Create：`.prettierrc.json`（Design"工程基线"中的配置）、`.prettierignore`（Design 列出的忽略清单）。
  - Modify：根 `package.json`（新增 `format`、`format:check`；`check:fast` 加入 `format:check`；devDependency `prettier` 精确版本）；`project.manifest.json`（`requiredCommands` 加入 `format`、`format:check`）。
  - Modify：全仓库可格式化文件（本任务只做格式化，不含任何语义修改）。

  **Requirements / Scenarios**
  - template-engineering：ENG-08 / SCN-TEMPLATE-ENGINEERING-010（格式基线相关 checkpoint）

  **Design Decisions**
  - Decision: 工程基线

  **Interfaces**
  - Consumes: 任务 1 的依赖。
  - Produces: `pnpm format:check` 作为 `check:fast` 的一步。

  **RED**
  - 引入配置后先运行 `pnpm format:check`，在未格式化的仓库上失败。

  **GREEN**
  - `pnpm format` 后 `pnpm format:check` 通过；`pnpm check:fast` 通过；Fixture 与生成物的摘要未变（`pnpm check:fixtures` 通过）。

  **Verification**
  - `git diff --stat` 只涉及格式；抽查 `git diff -w --ignore-blank-lines` 无语义差异。

  **Review / Acceptance**
  - 确认本提交为纯格式化提交，可单独回滚。

  **Commit**
  - `style(template): adopt prettier baseline and format the repository`

- [x] 3. 清单扩展、手写源码清单、指纹与覆盖率完整性

  **Files**
  - Modify：`project.manifest.schema.json`、`project.manifest.json`（Design"共享契约：清单扩展"的全部字段：`sourceRoots` 新语义（原 `hostRoots` 的 `packages/e2e/host` 并入）、`buildInputs`、`protocolInputs`、删除 `hostRoots`、`consumedOperations`、`moduleRoots`、`quality.coverageExclusions`、`quality.maxLinesExemptions`、`testProjects[].config`、`testProjects[].perFile`、`testProjects[].prepare`，每个新属性带中文 `description`；`requiredCommands` 加入 `check:coverage`）。`config` 的取值在任务 4 填写，`perFile`/`prepare` 的取值在任务 8 填写。
  - Modify：`project.manifest.json` 的 `quality.coverageExclusions` 登记 Design 允许的四项：`packages/e2e/host/weapp/setup.ts`、`vite.config.ts`、`protocol-runner.ts`、`example-runner.ts`，理由均为"只在微信开发者工具宿主中执行，行为证据由 weapp 用例承担"；不登记其他排除。
  - Create：`scripts/lib/source-inventory.ts` 及单测（分类：`*.test.*`、`*.spec.*` 与 test 角色包 `tests/` 下全部文件为 test，其余 `.ts/.js/.mjs/.cjs` 为 code，其他为 asset）。
  - Create：统一的受控临时根 helper（放在 `packages/e2e/tests/tooling/` 的 helper 模块中，任务 5 起所有门禁逻辑自测改用它）：在临时目录执行 `git init`，写入最小 OpenSpec 结构、清单与所需 Fixture，并做一次初始提交；`openspec` 默认用 `openspec-stub.ts` 替身，需要真实 CLI 时解析仓库 `node_modules` 中任务 1 固定的版本。
  - Modify：`scripts/lib/fingerprints.ts` 及单测（`protocolDigest` 替代 `idlDigest`，读取 `protocolInputs`；记录 `files` 明细）；`scripts/lib/project-manifest.ts` 及单测；报告器 `packages/e2e/src/reporters/scenario-reporter.ts` 及单测（写入新摘要与明细）；`scripts/check-scenarios.ts` 中对摘要字段的读取。
  - Create：`scripts/check-coverage.ts` 及单测；根 `package.json` 新增 `check:coverage` 并加入 `check:fast`（`test:unit` 之后）。
  - Modify：`vitest.config.ts`（`coverage.include` 由清单 `code` 类文件派生，`exclude` 只保留测试文件模式、`generated/` 与登记排除）。
  - Modify：AGENTS.md 中的清单最小示例（`hostRoots` 删除）。
  - Create/Modify：tooling 用例 `SCN-TEMPLATE-ENGINEERING-005.spec.ts`（`digest-inputs-cli`）、新建 `SCN-TEMPLATE-ENGINEERING-009.spec.ts` 及对应 Fixture（含 `template-exclusions-fact`：只读真实仓库核对模板自身排除项只在允许的四项之内）。

  **Requirements / Scenarios**
  - template-engineering：ENG-05 / SCN-TEMPLATE-ENGINEERING-005（摘要输入相关 case 与 `manifest-schema` 中的新字段）；ENG-07 / SCN-TEMPLATE-ENGINEERING-009

  **Design Decisions**
  - Decision: 共享契约：清单扩展；Decision: 共享契约：手写源码文件清单

  **Interfaces**
  - Consumes: `git ls-files -co --exclude-standard`。
  - Produces: `readSourceInventory(root)`（返回分类后的文件清单）；`check:coverage` 的错误信息（缺席文件、失效排除项）；统一临时根 helper（已提交的 git 工作区）。

  **RED**
  - 在临时根中修改 `buildInputs` 中的文件、新增未 `git add` 的源码文件，旧指纹不变 → 新单测失败；`.ts` 文件不在覆盖率 include 中时 `check:coverage` 不存在 → 失败。

  **GREEN**
  - 实现后：改 `vite.config.ts`/锁文件/新文件都会改变 `sourceDigest`；只改 AGENTS.md 不改变；缺席文件被 `check:coverage` 报出。

  **Verification**
  - `pnpm check:fast` 通过；现仓库 `check:coverage` 无问题：`packages/e2e/host/weapp` 下 `setup.ts`、`vite.config.ts`、`protocol-runner.ts`、`example-runner.ts` 按登记排除，`host` 下其余代码文件（现有 `.js`）计入覆盖率并达到 100%，若不达标在本任务补测试；`packages/e2e/tests/` 下的 helper 被分类为 test，不进入覆盖率统计。

  **Review / Acceptance**
  - 列出覆盖率统计范围变化前后的文件差集。

  **Commit**
  - `feat(template): derive fingerprints and coverage scope from one source inventory`

- [x] 4. 去除写死拓扑与通用规则反例

  **Files**
  - Modify：`packages/e2e/src/cases/define-case.ts` 及单测（`environment: string` 运行时按清单校验；上下文新增 `environmentClass`）。
  - Modify：`scripts/check-scenarios.ts`（默认报告名由清单派生）；`scripts/lib/contract-inventory.test.ts`（`requiredIn` 由清单派生）。
  - Modify：`.dependency-cruiser.cjs`、`eslint.config.js`（读取清单按角色生成路径）；`scripts/check-architecture.ts` 及单测（按清单组装 depcruise 参数；根 `check:architecture` 改为只调用该脚本）；ENG-05 的写死扫描扩展到这些配置文件的内容与根 scripts 的值（不扫描 scripts 键名）。
  - Create：`scripts/run-by-manifest.ts` 及单测（按清单组装并执行 `build`（protocol 角色先于 product 角色，逐包 `pnpm --filter <name> build`）、`typecheck`（产品包与协议包的 `tsconfig.build.json` 及根 `tsconfig.test.json`、`tsconfig.tools.json` 执行 `tsc --noEmit`）、`test:unit`（全部 unit 类项目一起运行并开启覆盖率）、`test:integration` 与 `test:e2e:<name>`）。
  - Modify：根 `package.json`（`build`、`typecheck`、`test:unit`、`test:integration`、`test:e2e:weapp` 的值改为 `tsx scripts/run-by-manifest.ts <命令名>`）；`vitest.config.ts`（`projects` 由清单 `testProjects[].config` 组装）；`project.manifest.json`（为每个测试项目填写 `config`）。
  - Modify：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts`（临时构建按 `sourceRoots`/`buildInputs` 复制）；GATE-008、ENG-005、ENG-006 等 tooling 用例中的包名字面量改为读清单。
  - Create：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-007.spec.ts`（受控临时根中的合成业务模块，逐条证明 `domain-core-no-generated`、`core-no-platform-or-node`、`domain-isolation`、core/ports 的 `wx` 禁令与新增模块自动受约束）。
  - Modify：`packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-008.spec.ts`（只保留示例自身分层检查，在受控临时副本中运行）。

  **Requirements / Scenarios**
  - template-engineering：ENG-01 / SCN-TEMPLATE-ENGINEERING-001（`build-copy-by-manifest`）；ENG-02 / SCN-TEMPLATE-ENGINEERING-002（回归）、007；ENG-05 / SCN-TEMPLATE-ENGINEERING-005（去写死相关 checkpoint，含 `scripts-by-manifest`、`no-hardcoded-topology`）
  - template-example：EX-05 / SCN-TEMPLATE-EXAMPLE-008

  **Design Decisions**
  - Decision: 去除写死拓扑；Decision: 模板示例解耦与删除白名单（规则反例部分）

  **Interfaces**
  - Consumes: 任务 3 的清单与源码清单。
  - Produces: 配置文件中的路径正则由清单生成；`defineCase` 上下文 `environmentClass`；`tsx scripts/run-by-manifest.ts <命令名>`；由清单组装的 Vitest projects。

  **RED**
  - 扩展后的写死扫描在现有配置与 scripts 的值中命中包名与项目名（例如 `test:unit` 中的 `--project sdk-unit`、`check:architecture` 中的 `packages/sdk/src`）；在临时副本中把产品包改名并同步清单，依赖规则静默失效（合成模块违规未被拦截）→ 新用例失败。

  **GREEN**
  - 改名副本中合成模块违规全部被拦截；写死扫描零命中；`defineCase` 拒绝清单未登记的环境。

  **Verification**
  - `pnpm check:fast` 通过；SCN-TEMPLATE-ENGINEERING-007 的每条规则都有"违规被拦截、恢复后通过"两段证据。

  **Review / Acceptance**
  - 核对原 SCN-TEMPLATE-EXAMPLE-008 去掉的两个检查点（跨模块导入、新增模块受约束）已由 SCN-TEMPLATE-ENGINEERING-007 完整承接。

  **Commit**
  - `refactor(template): remove hard-coded topology from gates, configs and tooling tests`

- [x] 5. 门禁自测隔离

  **Files**
  - Modify：`scripts/*.test.ts`、`scripts/lib/*.test.ts` 与 `packages/e2e/tests/tooling/` 中对仓库实时状态运行门禁的用例（以 `git grep -n "process.cwd()" -- scripts packages/e2e/tests/tooling` 的命中为准），改为受控临时根并断言具体结果；`check-scenarios.ts` 的 FLOW 分支覆盖由测试输入提供。
  - Modify：`packages/e2e/tests/tooling/scenario-gate-helpers.ts`、`helpers.ts`（改用任务 3 的统一临时根 helper）。
  - Modify：模板自身事实核验用例（SCN-TEMPLATE-EXAMPLE-012 对应用例——在 GATE-026 的事实核验列表中用 `template-example` 标记包裹、SCN-PROTOCOL-CONTRACT-001 的 `inventory-cli`、SCN-TEMPLATE-ENGINEERING-005 的写死扫描、SCN-TEMPLATE-ENGINEERING-003 的注释检查）：保持只读真实仓库，涉及 Spec 来源时以 `--change` 限定或只读主 Spec 与所属 Change，使结论不受无关 active Change 影响。
  - Create：仓库副本 helper（`git ls-files -co --exclude-standard` 复制、`git init` 并提交；在副本中执行 `pnpm install --offline --frozen-lockfile` 从本机 pnpm store 安装依赖，不链接原仓库 `node_modules`，并断言副本中 `@daqian/template-sdk` 的 realpath 位于副本内；以副本中固定版本 OpenSpec CLI 归档作用域内（`SCENARIO_GATE_CHANGES` 所列）的 active Change 并移除其余 active Change；归档后在副本运行环境中清除 `SCENARIO_GATE_CHANGES`），在 `TEMPLATE_COPY` 已设置时拒绝创建；副本中设置 `TEMPLATE_COPY=1`。
  - Modify：`vitest.config.ts`（`TEMPLATE_COPY` 存在时排除会创建副本的用例：SCN-TEMPLATE-ENGINEERING-001 的临时构建、SCN-SCENARIO-GATE-026 中运行副本的 case；任务 17 再加入 SCN-TEMPLATE-ENGINEERING-008）。
  - Create：`packages/e2e/tests/tooling/SCN-SCENARIO-GATE-026.spec.ts` 及 Fixture。

  **Requirements / Scenarios**
  - scenario-gate：GATE-15 / SCN-SCENARIO-GATE-026

  **Design Decisions**
  - Decision: 门禁自测隔离

  **Interfaces**
  - Consumes: 任务 3、4 的清单读取。
  - Produces: 门禁逻辑自测全部基于统一临时根 helper；仓库副本 helper 与 `TEMPLATE_COPY` 防递归（任务 17 复用）。

  **RED**
  - 在仓库中临时新增一个缺 verification 块的 active Change、或临时删除示例 FLOW，现有门禁单测或覆盖率失败。

  **GREEN**
  - 同样操作下 `pnpm test:unit`（含覆盖率）通过；断言不再使用 `expect.any(Array)` 一类恒真断言。

  **Verification**
  - `pnpm check:fast` 通过。

  **Review / Acceptance**
  - 列出改造前依赖实时状态的用例清单与改造方式，并逐个标明属于"门禁逻辑自测"（改为临时根）还是"模板自身事实核验"（保留只读真实仓库并限定作用域）。

  **Commit**
  - `test(template): isolate gate self-tests from live repository state`

- [x] 6. Fixture 来源模型改为 ID + Requirement 块摘要

  **Files**
  - Modify：`packages/e2e/tests/fixtures/fixture.schema.json`（`sources.spec` 改为 `{ requirementDigest }`）；`scripts/check-fixtures.ts` 及单测（按 owner 解析生效 Requirement、规范化摘要、owner 不存在、歧义；`--change` 多值、逗号分隔、空值与不存在报错、帮助文本；命令行无 `--change` 时读取 `SCENARIO_GATE_CHANGES`）；`scripts/lib/spec-sources.ts` 及单测（导出 Requirement 块定位与规范化，块边界按 Design；Change 作用域：只合并主 Spec 与所列 Change、参数与环境变量的解析和校验，供 `check:fixtures` 与任务 7 的 `check:scenarios` 共用）。
  - Create：`scripts/fixtures-refresh.ts` 及单测；根 `package.json` 新增 `fixtures:refresh`；清单 `requiredCommands` 加入。
  - Modify：模板内全部 Fixture `manifest.json`（一次性迁移，用 `pnpm fixtures:refresh` 生成）。
  - Create：tooling 用例 `SCN-SCENARIO-GATE-012/013/014/015.spec.ts` 及 Fixture；014 用 `check:fixtures --change` 完成歧义与作用域两段证据；015 在临时副本中以任务 1 固定版本的 `openspec archive` 执行真实归档，覆盖 MODIFIED 与 ADDED。
  - Create/Modify：SCN-SCENARIO-GATE-017 的 `change-scope-rules` 与 `change-scope-fixtures-cli`、SCN-SCENARIO-GATE-018 中 `check:fixtures` 部分的用例（`check:scenarios` 部分在任务 7）。

  **Requirements / Scenarios**
  - scenario-gate：GATE-10 / SCN-SCENARIO-GATE-012、013、014、015；GATE-12 / SCN-SCENARIO-GATE-017（`change-scope-rules`、`change-scope-fixtures-cli`）、018（`check:fixtures` 部分）

  **Design Decisions**
  - Decision: Fixture 来源绑定改为 ID + Requirement 块摘要；Decision: 场景门禁的 Change 作用域（spec-sources 作用域与 `check:fixtures` 部分）

  **Interfaces**
  - Consumes: `spec-sources.ts` 的有效来源合并。
  - Produces: `pnpm fixtures:refresh <owner...>`；`check:fixtures --change <name>[,<name>]` 与 `SCENARIO_GATE_CHANGES` 读取；`spec-sources.ts` 的作用域 API（任务 7 消费）；错误信息"owner 在有效 Spec 中不存在"、"来源摘要过期（运行 pnpm fixtures:refresh <owner>）"、"多个 active Change 修改同一 Requirement，请指定 --change"。

  **RED**
  - 新 schema 下现有 manifest 校验失败；012–015 用例失败（旧实现按路径校验，`check:fixtures` 不识别 `--change`）。

  **GREEN**
  - 迁移后 `pnpm check:fixtures` 通过；014 的歧义与指定作用域两段证据在本任务内完成；015 证明归档前后无需改动 Fixture。

  **Verification**
  - `pnpm check:fast` 通过；`pnpm check:fixtures --change template-core-hardening` 通过；`git grep -n '"path"' -- 'packages/e2e/tests/fixtures/*/manifest.json'` 中不再有 spec 路径。

  **Review / Acceptance**
  - 记录 015 在真实归档下的结果，与规划阶段的实验结论一致。

  **Commit**
  - `feat(template): bind fixtures to requirement digests instead of spec paths`

- [x] 7. checkpoint 双向对账与 Change 作用域

  **Files**
  - Modify：`scripts/check-scenarios.ts` 及单测（反向检查：以绑定为对账单位，登记集合为全部 cover 的 checks 并集，Scenario/FLOW 取有效 Spec 声明、协议义务取派生义务清单且 checkpoint 形如 `<义务 ID>/<case>`；`--change` 接入任务 6 的作用域 API、命令行无 `--change` 时读取 `SCENARIO_GATE_CHANGES`、帮助文本）。
  - Create：tooling 用例 `SCN-SCENARIO-GATE-016.spec.ts`（含多 cover 绑定与协议矩阵绑定不误报）、`SCN-SCENARIO-GATE-019.spec.ts`；`SCN-SCENARIO-GATE-017/018.spec.ts` 补齐 `check:scenarios` 部分的 case；及 Fixture。
  - Modify：`SCN-SCENARIO-GATE-003` 相关用例（如 GATE-03 文字修改影响断言）。

  **Requirements / Scenarios**
  - scenario-gate：GATE-11 / SCN-SCENARIO-GATE-016；GATE-12 / SCN-SCENARIO-GATE-017（`change-scope-scenarios-cli`）、018（`check:scenarios` 部分）、019；GATE-03 / SCN-SCENARIO-GATE-003、004、007（回归）

  **Design Decisions**
  - Decision: checkpoint 双向对账；Decision: 场景门禁的 Change 作用域

  **Interfaces**
  - Consumes: 报告中的 `scenario-evidence` 注解；任务 6 的 `spec-sources.ts` 作用域 API。
  - Produces: `check:scenarios --change <name>[,<name>]` 与 `SCENARIO_GATE_CHANGES` 读取；错误信息"未登记的 checkpoint"（含测试文件、绑定与 checkpoint 名）。

  **RED**
  - 用例执行一个未登记的 checkpoint 时门禁通过 → 016 失败；`check:scenarios` 不识别 `--change` → 017/018 的 `check:scenarios` 部分失败。

  **GREEN**
  - 实现后上述用例通过；现仓库的协议矩阵用例（同时 cover SCN-PROTOCOL-CONTRACT-002 与全部派生义务）不被误报；不带参数的行为与原先一致（003/004/007 回归通过）。

  **Verification**
  - 在仓库中执行 `pnpm check:scenarios --change template-core-hardening`，只对账本 Change；`pnpm check:fast` 通过。

  **Review / Acceptance**
  - 记录现仓库在反向检查下暴露的未登记 checkpoint（若有）及其处理（补登记或删除断言，须符合 Spec）。

  **Commit**
  - `feat(template): reconcile checkpoints both ways and scope the gate by change`

- [x] 8. 统一验收入口与过期说明

  **Files**
  - Create：`scripts/verify.ts` 及单测（默认 run id 规则；三步顺序；`--from <命令名>`；`--change` 经 `SCENARIO_GATE_CHANGES` 传给全部步骤，未传时不设置；perFile 项目逐文件运行、每文件前执行 `prepare`、每文件一份 `reports/<项目名>/<文件名>.json`、失败先 `prepare` 再整文件重跑一次、续跑跳过已有通过报告的文件；各步耗时与结论）；根 `package.json` 新增 `verify`，`check` 改为调用 `verify`；清单 `requiredCommands` 加入 `verify`。
  - Create：weapp 准备命令脚本（例如 `scripts/weapp-prepare.ts`：按 `packages/e2e/AGENTS.md` 的约定执行 `cli quit`、残留时 `pkill -f wechatwebdevtools.app`、`cli open --project <仓库根>/packages/e2e/host/weapp` 预热，不以 `cli open` 退出码判断就绪）；根 `package.json` 新增 `weapp:prepare`；`project.manifest.json` 为 weapp 项目登记 `perFile: true` 与 `prepare: "weapp:prepare"`，`requiredCommands` 加入 `weapp:prepare`。
  - Modify：`scripts/check-scenarios.ts` 及单测（过期说明：run id、摘要类别、最多 20 个变化文件与总数；默认报告集合加入 perFile 项目目录 `reports/<name>/` 下的全部文件）。
  - Create：tooling 用例 `SCN-SCENARIO-GATE-023/024/025.spec.ts` 及 Fixture（平台步骤与 `prepare` 用桩命令替代真实小程序，含一个 perFile 项目与一个非 perFile 项目）。
  - Modify：`packages/e2e/AGENTS.md`"微信开发者工具自动化的注意事项"改为说明由 `pnpm verify` 的逐文件运行与 `weapp:prepare` 自动执行退出、预热与整文件重跑。

  **Requirements / Scenarios**
  - scenario-gate：GATE-14 / SCN-SCENARIO-GATE-023、024、025
  - template-engineering：ENG-05 / SCN-TEMPLATE-ENGINEERING-005（`environments-by-manifest` 中 perFile 默认报告部分）

  **Design Decisions**
  - Decision: 验收入口与过期说明

  **Interfaces**
  - Consumes: 清单 platform 类项目及其 `perFile`/`prepare`；报告中的 `files` 明细（任务 3）；任务 6、7 的 `SCENARIO_GATE_CHANGES` 读取。
  - Produces: `pnpm verify [--run-id] [--from <命令名>] [--change ...]`；`pnpm weapp:prepare`；续跑提示文本；perFile 报告目录。

  **RED**
  - 023–025 用例失败（入口不存在、过期信息只有一句"is stale"）。

  **GREEN**
  - 实现后用例通过；默认 run id 格式符合 Design；`verify --change A` 时 `check:fast` 内的 `check:fixtures` 按 A 限定作用域。

  **Verification**
  - 实际执行一次 `pnpm verify --change template-core-hardening --run-id core-hardening-t8`（含逐文件 weapp）：第 1 步 `check:fast` 与第 2 步 `test:e2e:weapp` 退出码为 0；第 3 步场景门禁的问题全部可归属后续任务（按共同完成条件 4 逐条记录归属），无法归属即为回归；"全部步骤通过"只作为任务 18 的完成标准。故意改一个源码文件后单独运行 `check:scenarios --change template-core-hardening`，输出列出该文件。

  **Review / Acceptance**
  - 记录 verify 各步耗时，作为后续按需测试节奏的基线。

  **Commit**
  - `feat(template): add a single verify entry and explain stale reports`

- [x] 9. 按需测试入口

  **Files**
  - Create：`scripts/test-affected.ts` 及单测（全量触发、Spec/Fixture/代码/`scripts/` 选择规则、扩展到所有环境、`--scenario`、`--dry-run`、计划打印；run id 取 `affected-<YYYYMMDDTHHmmssZ>`）；根 `package.json` 新增 `test:affected`；清单 `requiredCommands` 加入。
    - 代码改动：integration 与平台用例用 dependency-cruiser `--reaches` 推导，配一份只供分析的 tsconfig 路径映射（由清单生成，把各包包名映射到其 `src` 入口，不参与构建与测试的模块解析），再静态提取命中测试文件中 `defineCase` 绑定的 ID；改动落在产品包或协议包 `src` 时计划先执行 `pnpm build`；unit 类项目执行 `vitest related <改动文件>` 并关闭覆盖率阈值。
  - Modify：报告器（`partial: true` 标记）；`scripts/check-scenarios.ts` 及单测（拒收 partial 报告）。
  - Create：tooling 用例 `SCN-SCENARIO-GATE-020/021/022.spec.ts` 及 Fixture。
  - Modify：`docs/template-guide.md`"从方案到验收"中按需运行与全量节奏的临时说明（最终节奏在任务 18 依据 OI-CH-02 写定）。

  **Requirements / Scenarios**
  - scenario-gate：GATE-13 / SCN-SCENARIO-GATE-020、021、022

  **Design Decisions**
  - Decision: 按需测试入口

  **Interfaces**
  - Consumes: dependency-cruiser `--reaches`（integration 与平台用例）；Vitest `related`（unit 类项目）；任务 6 的 Requirement 块摘要；清单与 `buildInputs`。
  - Produces: `pnpm test:affected [--base] [--scenario] [--dry-run]`；partial 报告。

  **RED**
  - 020–022 用例失败；partial 报告被门禁接受。

  **GREEN**
  - 实现后用例通过；在仓库中修改一个示例适配器文件，`--dry-run` 经 `--reaches` 列出 SCN-TEMPLATE-EXAMPLE-* 相关场景及其 weapp 用例、计划包含先执行 `pnpm build`；修改清单则退化为全量。

  **Verification**
  - `pnpm check:fast` 通过；从本任务起执行"共同完成条件"第 2 条的按需节奏，并开始记录"按需通过但全量失败"的次数（OI-CH-02）。

  **Review / Acceptance**
  - 记录 3 组真实改动的选择结果与耗时对比。

  **Commit**
  - `feat(template): add affected-scenario test selection with partial reports`

- [x] 10. 协议义务以消费接口声明派生与注释门禁按入口发现

  **Files**
  - Create：`packages/sdk/src/consumed-operations.ts`（导出 `consumedOperations`，元素为 `{ method, requestFields }`，数组显式标注元素类型；示例条目所依赖的 import 语句与条目一起放在 `template-example` 标记内；示例的 `CreateTrade`、`QueryTrade` 条目及其 `requestFields`（自 `contract-inventory.ts` 的 `requestPolicies` 原样迁入）用 `// template-example:begin/end` 包裹）及单测（标记外只断言每个元素的 `method` 都是 generated 方法描述；"恰好是 CreateTrade、QueryTrade"的示例断言及 SCN-TEMPLATE-EXAMPLE-012 的证据绑定在标记内）；清单 product 包登记 `consumedOperations`。
  - Modify：`scripts/lib/contract-inventory.ts` 及单测（读取声明；删除按方法名写死的 `requestPolicies`，请求字段义务改取声明元素的 `requestFields`；创建 TS program 时以路径映射把协议包名解析到协议包 `src/`，不解析到 `dist`；每个元素的 `method` 解析到 generated 中的声明位置，以该文件为请求/响应类型源文件、以其相对 `generated/idl/` 的目录为义务 ID 前缀，不从 `meta` 取包名，去掉 `deriveFields` 中写死的 `idl/infra/trade/v1/trade.ts`；`method` 不是 `createMethod` 常量时报错；错误码义务来自 `businessErrors`；双向检查；清单未登记按空声明、模块不存在或未导出数组报错）；反例在受控临时根中合成：一个非 `trade.ts` 的 generated 文件（含 `createMethod` 常量及请求/响应类型）并与 trade 方法同时声明，证明前缀与类型源文件按声明位置推导；一个 `method` 只有 `defineMethodSpec` 的元素，证明派生器报错。不引用仓库真实的其他 generated 文件。
  - Create：通用的 `discoverDeclaredRoutes()`（由消费接口声明生成中立路由，替代 `discoverExampleRoutes()` 在协议矩阵中的用途）及单测；`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts` 与 `packages/e2e/host/weapp/protocol-runner.ts` 改用它并通用化：不再写死 `CreateTrade`/`QueryTrade`，遍历声明中的接口，用方法常量的 `meta`（请求/响应类型、codec、路径）构造请求、解码响应，声明的接口在矩阵 Fixture 中缺键时失败并指出接口名；声明为空时断言义务清单为空并结束。
  - Modify：Fixture `packages/e2e/tests/fixtures/SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` 的键由 `create`/`query` 改为接口名（`CreateTrade`、`QueryTrade`），并以 `pnpm fixtures:refresh SCN-PROTOCOL-CONTRACT-002` 刷新摘要。
  - Modify：`packages/protocol/testing/shadow/idl-routes.test.ts`（不再导入 `./example/routes.ts` 的 `exampleRpcMethods`，改为直接用 generated 方法常量构造输入，承担 SCN-PROTOCOL-CONTRACT-004 `idl-route-source` 的证据）。
  - Modify：示例解耦的代码部分：`packages/sdk/src/index.ts` 的示例导出、`packages/e2e/host/weapp/app.js`、`setup.ts`、`vite.config.ts`、`packages/e2e/src/drivers/weapp-host.test.ts` 中注册与配置示例运行器的片段，用 `// template-example:begin/end` 包裹；`packages/protocol/testing/index.ts` 中只属于示例的导出同样包裹；`packages/protocol/testing/shadow/bootstrap.test.ts`、`server.test.ts` 改用中立的合成路由，不再导入示例路由；新增 `packages/protocol/testing/shadow/declared-routes.ts`（`discoverDeclaredRoutes(declaration)`）及 protocol-unit 单测。
  - Modify：架构检查（`scripts/check-architecture.ts` 或其拆出的模块）新增 `template-example` 标记校验：成对出现、不嵌套，违规时指出文件与行号；对应 SCN-TEMPLATE-ENGINEERING-006 的 `example-marker-rules`、`example-marker-violations-cli` case。
  - Modify：`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-001.spec.ts` 及其 Fixture（`sdkExports` 改为从产品包根入口实际导出计算，不写死示例导出名）。
  - Modify：ENG-03 检查实现（`packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-003.spec.ts` 及其依赖的检查模块）：从产品包根入口发现导出类型，每个声明位置都检查。
  - Create：tooling 用例 `SCN-PROTOCOL-CONTRACT-005.spec.ts`、`SCN-TEMPLATE-EXAMPLE-012` 对应用例及 Fixture；修改 `SCN-PROTOCOL-CONTRACT-001.spec.ts`（新增 `non-trade-method-cli`）。
  - 若入口发现暴露出现有缺少中文注释的公共类型，在本任务补齐注释。

  **Requirements / Scenarios**
  - protocol-contract：PC-01 / SCN-PROTOCOL-CONTRACT-001（含 `non-trade-method-derived`、`request-fields-from-declaration`、`invalid-declaration-rejected`）、002（`routes-from-declaration`、`matrix-iterates-declaration`、`declared-routes`）、005；PC-03 / SCN-PROTOCOL-CONTRACT-004（`idl-route-source` 的输入改为不依赖示例）
  - template-example：EX-09 / SCN-TEMPLATE-EXAMPLE-012
  - scenario-gate：GATE-07 / SCN-SCENARIO-GATE-009（回归）
  - template-engineering：ENG-03 / SCN-TEMPLATE-ENGINEERING-003；ENG-01 / SCN-TEMPLATE-ENGINEERING-001（`sdk-exports-from-entry`）；ENG-06 / SCN-TEMPLATE-ENGINEERING-006（`example-markers-paired`）

  **Design Decisions**
  - Decision: 协议义务以产品声明的消费接口派生；Decision: 中文注释门禁按入口发现；Decision: 模板示例解耦与删除白名单（共享文件迁出与片段标记的代码部分）

  **Interfaces**
  - Consumes: generated 方法描述的声明位置与 `meta`；产品包根入口。
  - Produces: `consumedOperations` 声明模块（元素 `{ method, requestFields }`）；以接口名为键的协议矩阵 Fixture；`discoverDeclaredRoutes()`；`template-example` 标记校验；错误信息"未使用的声明"、"未声明的调用"、标记未闭合/多余/嵌套。

  **RED**
  - 在临时副本的适配器中新增一个未声明接口的调用，派生器不报错 → 005 失败；在受控临时根中声明合成的非 `trade.ts` generated 文件中的方法时派生器仍从 `trade.ts` 取类型、前缀写死，声明只有 `defineMethodSpec` 的元素时不报错 → 001 新 case 失败；矩阵用例中写死 `CreateTrade`/`QueryTrade` 与 `create`/`query` 键 → 002 `matrix-iterates-declaration` 失败；在示例之外的导出类型上去掉注释，ENG-03 不报错 → 003 新 case 失败；放入未闭合的 `template-example:begin`，架构检查不报错 → 006 新 case 失败。

  **GREEN**
  - 实现后各类反例被报出；义务清单与改造前对 `CreateTrade`、`QueryTrade` 的义务一致（ID 前缀不变，请求字段义务的 case 与原 `requestPolicies` 逐项相同）；协议矩阵经 `discoverDeclaredRoutes()` 运行通过；ENG-001 的导出集合由根入口计算。

  **Verification**
  - `pnpm check:fast` 通过；`pnpm check:scenarios --change template-core-hardening` 中协议义务问题为 0。

  **Review / Acceptance**
  - 对比改造前后义务清单（diff 应为空或只有来源说明变化）。

  **Commit**
  - `feat(template): derive protocol obligations from declared consumed operations`

- [x] 11. Shadow 请求记录、路径转换与有界轮询

  **Files**
  - Modify：`packages/protocol/testing/shadow/server.ts`、`routes.ts` 及单测（未编排与未注册请求的记录和报告、兜底处理器、`{x}`→`:x`、`poll.maxRequests`、`environmentClass` 约束）。
  - Modify：使用 Shadow 的 harness 与用例，传入 `environmentClass`（取自 `defineCase` 上下文）。
  - Modify：`packages/e2e/AGENTS.md`（轮询用例写法，按 Design"AGENTS 约定"中两类轮询的区分）。

  **Requirements / Scenarios**
  - protocol-contract：PC-06 / SCN-PROTOCOL-CONTRACT-011、012、013

  **Design Decisions**
  - Decision: Shadow 请求记录、路径转换与有界轮询；Decision: AGENTS 约定（轮询用例写法）

  **Interfaces**
  - Consumes: `defineCase` 的 `environmentClass`（任务 4）。
  - Produces: `verify()` 新问题类型"未编排的请求"、"未注册的请求"、"轮询超过上限"。

  **RED**
  - 011–013 的 module case 失败。

  **GREEN**
  - 实现后通过；现有全部 integration 与 weapp 用例在新记录规则下无新增问题（若出现，说明存在被掩盖的多余请求，按 Spec 处理并记录）。

  **Verification**
  - `pnpm check:fast` 与逐文件 weapp 通过。

  **Review / Acceptance**
  - 记录新规则在现有用例中暴露的请求（若有）。

  **Commit**
  - `feat(template): record every shadow request and support bounded polling`

- [x] 12. Shadow 响应与协议同形校验

  **Files**
  - Modify：`packages/protocol/testing/shadow/routes.ts`（路由描述可选 `validateResponse`、step 的 `malformed: { reason }`）、`server.ts`（构造时校验）及单测。
  - Modify：`packages/protocol/testing/shadow/idl-routes.ts` 及单测（基于 `deriveFields` 的结构校验器注入；如需把 `deriveFields` 抽到可复用位置，保持 `shadow-engine-no-generated` 规则成立）。
  - Modify：现有 Fixture 与内联响应中不同形的数据（按 Spec 修正）；故意非法的响应补 `malformed` 声明。

  **Requirements / Scenarios**
  - protocol-contract：PC-04 / SCN-PROTOCOL-CONTRACT-006、007；PC-03 / SCN-PROTOCOL-CONTRACT-004

  **Design Decisions**
  - Decision: Fixture 响应与协议同形

  **Interfaces**
  - Consumes: generated 类型（经 IDL 路由来源）。
  - Produces: 构造期错误"路由/步骤/字段路径 与协议不一致"。

  **RED**
  - 006、007 的 module case 失败；对现有用例启用校验后列出不同形的响应清单。

  **GREEN**
  - 修正或认领后全部用例构造成功；Shadow 引擎仍不导入 generated（depcruise 通过）。

  **Verification**
  - `pnpm check:fast` 与逐文件 weapp 通过。

  **Review / Acceptance**
  - 记录启用校验时发现的不同形响应数量与处理方式。

  **Commit**
  - `feat(template): validate shadow responses against the protocol shape`

- [x] 13. X-Request-Id 按公司规范内化

  **Files**
  - Create：`packages/protocol/src/transport/request-id.ts` 及单测（显式设置非 +8 的 `TZ` 运行）。
  - Modify：`packages/protocol/src/transport/context.ts` 及单测（头名 `X-Request-Id`、与 `BaseReq.requestId` 同值；公共类型 `ProtocolContextOptions`/`ProtocolClientOptions` 的 `runtime` 删除 `nextRequestId`，改为调用内部标准生成器）；`packages/protocol/src/client.test.ts` 等构造 `runtime.nextRequestId` 的测试同步删除该字段，改用 `headerPatterns` 与"头与 `BaseReq.requestId` 相等"断言；`packages/sdk/src/runtime/default.ts`、`port.ts` 及单测（删除 requestId 提供能力与 `pay-` 生成器）。
  - 公共 API 与产物影响：协议包与产品包的公共类型变化会反映到 ESM/CJS 双格式类型声明（`dist`）中，属于破坏性变更；本任务核对两套声明中 `nextRequestId` 均已消失、生成器及其注入参数不在任何公共导出中，在 Change 说明中记录该破坏性变更，能力地图中的注明在任务 16 完成。
  - Modify：Shadow 期望请求头支持 `headerPatterns`；`scripts/lib/contract-inventory.ts` 公共上下文义务；`packages/e2e/tests/protocol/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`packages/e2e/tests/weapp/SCN-PROTOCOL-CONTRACT-002.spec.ts`、`packages/e2e/host/weapp/protocol-runner.ts`、`packages/e2e/tests/fixtures/base.json` 中的 `request_id`。
  - Create：`SCN-PROTOCOL-CONTRACT-008/009/010` 对应用例；008 的 `request-id-wire` 经协议包公共入口 `createProtocolClient` 发请求（integration 与 weapp 各一份，weapp 经 `protocol-runner.ts`），不依赖示例；`client-options-shape`（protocol-unit）与 `runtime-port-shape`（sdk-unit）检查公共类型与导出。

  **Requirements / Scenarios**
  - protocol-contract：PC-05 / SCN-PROTOCOL-CONTRACT-008、009、010；PC-01 / SCN-PROTOCOL-CONTRACT-002（回归）

  **Design Decisions**
  - Decision: X-Request-Id 按公司规范内化

  **Interfaces**
  - Consumes: 无。
  - Produces: `createRequestId(now?, random?)`（内部，时钟与随机源参数只供单测注入，不进入协议包或 SDK 的任何公共导出）；删除 `runtime.nextRequestId` 后的公共类型。

  **RED**
  - 008–010 用例失败（头名为 `request_id`，格式为 `pay-...`）。

  **GREEN**
  - 实现后 integration 与 weapp 中请求头符合格式；`git grep -n "request_id" -- packages scripts` 只剩 BaseReq 字段的 snake_case 编解码相关位置。

  **Verification**
  - 全量 `pnpm verify --change template-core-hardening`：第 1 步 `check:fast` 与第 2 步 `test:e2e:weapp` 退出码为 0；第 3 步场景门禁的问题全部可归属后续任务（按共同完成条件 4 逐条记录归属），无法归属即为回归；"全部步骤通过"只作为任务 18 的完成标准。

  **Review / Acceptance**
  - 记录规范来源与本实现逐项对照。

  **Commit**
  - `feat(template): generate X-Request-Id per company convention`

- [x] 14. 行数上限与超限文件拆分

  **Files**
  - Modify：`eslint.config.js`（`max-lines`：源 300、测试 600、`skipBlankLines`/`skipComments`，豁免读取 `quality.maxLinesExemptions`）。
  - Modify：拆分超限文件，至少 `scripts/check-scenarios.ts`、`scripts/sdk-release.ts`、`scripts/sdk-release.test.ts`，以及启用规则后 `pnpm lint` 报出的其他文件；拆分只移动代码，不改语义。
  - Create：SCN-TEMPLATE-ENGINEERING-010 中行数相关 case 的用例。

  **Requirements / Scenarios**
  - template-engineering：ENG-08 / SCN-TEMPLATE-ENGINEERING-010（行数相关 checkpoint）

  **Design Decisions**
  - Decision: 工程基线（行数上限）

  **Interfaces**
  - Consumes: 清单 `quality.maxLinesExemptions`。
  - Produces: 拆分后的模块；豁免登记为空。

  **RED**
  - 启用规则后 `pnpm lint` 列出超限文件。

  **GREEN**
  - 拆分后 `pnpm lint` 通过；覆盖率保持 100%。

  **Verification**
  - `pnpm check:fast` 通过。

  **Review / Acceptance**
  - 记录每个被拆分文件的拆分前后行数与新模块职责。

  **Commit**
  - `refactor(template): enforce max-lines and split oversized modules`

- [x] 15. 渐进式项目地图、CLAUDE.md 配对与 AGENTS 约定

  **Files**
  - Create：各模块目录的 `AGENTS.md`（五节骨架）与全部 `CLAUDE.md`（首行 `@AGENTS.md`），范围按清单 `moduleRoots`。
  - Modify：根 `AGENTS.md`（"项目地图"一节；执行规则新增"优先采用现成方案"与"能力变化同步架构文档"）、各包 `AGENTS.md`（"子模块"一节；其中列出的示例模块条目（如 `sdk/src/example`、`e2e/tests/example`）用 `<!-- template-example:begin -->` 与 `<!-- template-example:end -->` 包裹，删除示例后 `check:project-map` 的列表仍与实际模块目录一致）、`packages/e2e/AGENTS.md`（断言反模式、断言审查清单）；清单为各包登记 `moduleRoots`。
  - Create：`scripts/check-project-map.ts` 及单测；`check:architecture` 调用它；清单 `requiredCommands` 加入 `check:project-map`。
  - Create：`SCN-TEMPLATE-ENGINEERING-011.spec.ts` 及 Fixture。

  **Requirements / Scenarios**
  - template-engineering：ENG-09 / SCN-TEMPLATE-ENGINEERING-011

  **Design Decisions**
  - Decision: 渐进式项目地图与 CLAUDE.md 配对；Decision: AGENTS 约定

  **Interfaces**
  - Consumes: 清单 `moduleRoots`。
  - Produces: `pnpm check:project-map` 与其四类错误信息。

  **RED**
  - 011 用例失败；现仓库运行 `check:project-map` 报缺失。

  **GREEN**
  - 补齐后通过；在本地用 Claude Code 读取一个模块目录下的文件，确认模块级 AGENTS.md 被加载（记录 `Loaded` 行或等价证据）。

  **Verification**
  - `pnpm check:fast` 通过。

  **Review / Acceptance**
  - 评审各 AGENTS.md 内容与代码现状一致；断言反模式每条都有正确写法示例。

  **Commit**
  - `docs(template): add progressive project map with paired CLAUDE.md`

- [ ] 16. 技术架构文档与指南修订

  **Files**
  - Create：`docs/architecture.md`（粗略层与按能力的细节层，存量内容从四个归档 Change 的 design 整理；本 Change 新增能力的演进记录只写 Change 名称纯文本，不链接 `openspec/changes/template-core-hardening/`）。
  - Modify：指南"复刻验收"与"从方案到验收"写入运行约定：有 active Change 时，任何可能触发副本用例的运行（全量与 `test:affected`）都带作用域。
  - Modify：`docs/template-guide.md`（能力地图（含 X-Request-Id 公共 API 破坏性变更的注明；新增消费接口的操作：在 `consumedOperations` 声明中登记 `{ method, requestFields }`、在 `SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` 中以接口名为键补该接口的数据，不改门禁脚本与矩阵用例代码）、从方案到验收、初始化方式与"移除模板示例"（完整删除白名单与片段标记规则，与 ENG-06 一致）、归档已知限制、版本对齐、使用方约定、复刻验收、替换点地图字段同步）；指南、根与各级 AGENTS.md 中指向示例文件或引用 `SCN-TEMPLATE-EXAMPLE-*` 的段落用 `<!-- template-example:begin/end -->` 包裹；根 `AGENTS.md`"场景门禁与归档"（删除 `artifacts/<run-id>/tasks/` 要求）；`README.md`（链接架构文档）。
  - Modify：ENG-06 指南检查实现（新增章节、删除白名单完整性）；新增 ENG-10 检查（文档存在、链接、能力地图同名章节、相对链接）。
  - Create/Modify：`SCN-TEMPLATE-ENGINEERING-006.spec.ts`、新建 `SCN-TEMPLATE-ENGINEERING-012.spec.ts` 及 Fixture。

  **Requirements / Scenarios**
  - template-engineering：ENG-06 / SCN-TEMPLATE-ENGINEERING-006；ENG-10 / SCN-TEMPLATE-ENGINEERING-012

  **Design Decisions**
  - Decision: 技术架构文档；Decision: 指南修订；Decision: 复刻验收方法与本次验收（方法部分）

  **Interfaces**
  - Consumes: 归档 Change 的 design；本 Change 的 design。
  - Produces: `docs/architecture.md`；指南新章节。

  **RED**
  - 006 新 checkpoint 与 012 用例失败。

  **GREEN**
  - 文档补齐后通过。

  **Verification**
  - `pnpm check:fast` 通过；由一个无上下文的 Agent 只读 `docs/architecture.md`，回答"模板的质量体系如何防止门禁全绿但未检查到"，回答覆盖本 Change 的各项机制。

  **Review / Acceptance**
  - 评审架构文档每节的四部分齐全，设计理由与归档 design 一致。

  **Commit**
  - `docs(template): add architecture document and revise the template guide`

- [ ] 17. 示例删除验证

  **Files**
  - Create：`SCN-TEMPLATE-ENGINEERING-008.spec.ts` 及 Fixture：复用任务 5 的仓库副本 helper（`git ls-files -co --exclude-standard` 复制、`git init` 并提交、在副本中 `pnpm install --offline --frozen-lockfile` 且断言 `@daqian/template-sdk` 的 realpath 位于副本内、以固定版本 OpenSpec CLI 归档作用域内（`SCENARIO_GATE_CHANGES=template-core-hardening`）的 active Change 并移除其余 active Change、归档后清除 `SCENARIO_GATE_CHANGES`、`TEMPLATE_COPY=1`），再按白名单删除整目录、整文件、全部 `template-example` 标记片段与对应 `coverageExclusions` 条目，运行 `check:fast` 与 `check:scenarios --inventory`。
  - Modify：`vitest.config.ts` 的 `TEMPLATE_COPY` 排除列表加入 SCN-TEMPLATE-ENGINEERING-008。
  - 本任务只做验证，不做迁出：迁出工作已在任务 4、5、10、13、16 完成。

  **Requirements / Scenarios**
  - template-engineering：ENG-06 / SCN-TEMPLATE-ENGINEERING-008

  **Design Decisions**
  - Decision: 模板示例解耦与删除白名单

  **Interfaces**
  - Consumes: 指南白名单（任务 16）；片段标记与 `discoverDeclaredRoutes()`（任务 10）；仓库副本 helper（任务 5）。
  - Produces: 删除后仍全绿的证据。

  **RED**
  - 先运行 008 用例，记录删除后失败的门禁（预期为 0；若非 0，说明前序任务的迁出不完整：回到负责该迁出的任务修复并重新评审，不在本任务内迁出）。

  **GREEN**
  - 008 通过。

  **Verification**
  - 本仓库全量 `pnpm verify --change template-core-hardening`（008 在该作用域下归档本 Change 后删除示例）。
  - 复刻验收的"示例删除演练"：按指南"复刻验收"一节，在隔离副本中由无上下文 Agent 按白名单删除示例，运行完整 `pnpm verify`（含逐文件 weapp）全绿；副本中本 Change 仍为 active 时，演练前按 ENG-06 的副本构造归档本 Change 并移除其余 active Change，此后副本中没有 active Change，`pnpm verify` 不带 `--change`。

  **Review / Acceptance**
  - 演练记录（提示词、执行者、步骤、改动文件、门禁结果、猜测记录分类）写入 `verify.md`。

  **Commit**
  - `test(template): prove gates stay green after removing the example`

- [ ] 18. 支付 SDK 复刻演练与最终验收

  **Files**
  - 无仓库内代码产物（演练在隔离副本中进行，副本不提交）；按演练发现修订的指南、AGENTS 或门禁随本任务提交。
  - Modify：`docs/template-guide.md`（依据 OI-CH-02 的统计写定 Apply 期间全量运行节奏）；`design.md` 关闭 OI-CH-02。

  **Requirements / Scenarios**
  - 本 Change 全部 Requirement 与 Scenario（最终全量验收）

  **Design Decisions**
  - Decision: 复刻验收方法与本次验收

  **Interfaces**
  - Consumes: 本 Change 全部产物；归档 `2026-09-22-headless-payment-sdk` 的子集（Design 中固定）。
  - Produces: 复刻演练记录；最终 `pnpm verify` 证据。

  **RED**
  - N/A — 演练任务，以猜测记录与门禁结果为判定依据。

  **GREEN**
  - 按 Design"复刻验收方法与本次验收"准备隔离副本（归档本 Change、移除其余 active Change、删除本 Change 的归档目录与 `artifacts/`），无上下文 Agent 在副本中按 Design 固定的子集复刻支付 SDK（SDK + IDL + 小程序），副本中按 ENG-06 运行约定执行验收：演练 Agent 的工作仍在其 active Change 中时运行 `pnpm verify --change <该 Change>`，副本中没有 active Change 时不带作用域，结果全绿；演练提示词的"规则"部分写入这一约定；猜测记录全部分类，"指南缺失需修订"类在本任务修订并复核。

  **Verification**
  - 在本仓库执行最终 `pnpm verify --change template-core-hardening`（全新 run id），全部步骤退出码 0，场景门禁问题数 0；核对 Design 列出的 xueshan 反馈问题在演练中均未复现。

  **Review / Acceptance**
  - `verify.md` 记录两次演练、OI-CH-02 统计与结论、最终 verify 证据。

  **Commit**
  - `test(template): record payment SDK replication drill and final acceptance`
