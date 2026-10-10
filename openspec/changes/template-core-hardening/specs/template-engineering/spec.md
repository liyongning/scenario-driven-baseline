## ADDED Requirements

### Requirement: ENG-07 覆盖率完整性

覆盖率的统计范围 MUST 由"手写源码文件清单"派生，而不是由手工维护的 glob 决定。手写源码文件清单 SHALL 对清单 `manifest.fingerprints.sourceRoots` 的每个目录取 git 已跟踪文件与未被忽略的新文件，固定排除 `generated/` 下的生成代码与各级 `AGENTS.md`、`CLAUDE.md`，并把每个文件按以下顺序分类：

- `test`：`*.test.*`、`*.spec.*`，以及清单中 test 角色包 `tests/` 目录下的全部文件（用例的 helper、harness、stub 属于测试支撑，与 ENG-08 的测试文件口径一致）；
- `code`：其余 `.ts`、`.js`、`.mjs`、`.cjs` 文件；
- `asset`：其他文件。

覆盖率只统计 `code` 类文件，并减去登记的排除项：

- `vitest.config.ts` 的 `coverage.include` SHALL 取清单中的 `code` 类文件；`coverage.exclude` MUST 只包含测试文件模式、`generated/` 与清单 `manifest.quality.coverageExclusions` 登记的路径，不得在配置中另行增加排除项。
- `manifest.quality.coverageExclusions` 的每一项 MUST 同时给出路径与非空理由。排除 MUST 只在被测代码确实只能在平台宿主进程中执行、无法由 unit 类项目加载时登记。模板自身登记的条目限于 `packages/e2e/host/weapp/` 下的 `setup.ts`、`vite.config.ts`、`protocol-runner.ts`、`example-runner.ts` 四个文件，理由均为"只在微信开发者工具宿主中执行，行为证据由 weapp 用例承担"；`packages/e2e/host/` 下已被单测覆盖的其他文件（如现有 `.js` 文件）继续计入覆盖率；模板 SHALL NOT 登记其他排除项。
- 新增命令 `pnpm check:coverage`：比对"`code` 类文件减去登记排除"与覆盖率报告中出现的文件。任何应统计的文件在报告中缺席 SHALL 非零退出并列出该文件；登记的排除项指向不存在的文件 SHALL 非零退出并指出该项。
- `check:coverage` SHALL 加入 `check:fast`，位于 `test:unit` 之后。

本要求保证"100% 覆盖率"不会因 include 漏配或 exclude 新增而让整个文件静默缺席。

#### Scenario: SCN-TEMPLATE-ENGINEERING-009 覆盖率报告缺席手写文件被拒绝
- **WHEN** 在受控临时根中分别：新增一个尚未 `git add` 的手写代码文件但不让任何测试覆盖它；在覆盖率配置之外让某个已登记的代码文件不出现在覆盖率报告中；在 `manifest.quality.coverageExclusions` 中登记一个不存在的路径；登记一项缺少理由的排除；放入被 `.gitignore` 忽略的文件、`generated/` 下的文件、测试文件、test 角色包 `tests/` 下不带 `.test`/`.spec` 后缀的 helper 与 `AGENTS.md`；随后恢复合法输入。另读取模板自身的清单与覆盖率配置
- **THEN** 缺席的代码文件被逐个列出并非零退出；指向不存在文件的排除项被指出并非零退出；缺少理由的排除项被清单 schema 拒绝；被忽略文件、生成代码、测试文件、`tests/` 下的 helper 与 AGENTS.md 不要求出现在覆盖率报告中（helper 被分类为 test）；覆盖率配置的 include 与清单的 `code` 类文件一致；恢复后检查通过；模板自身的 `quality.coverageExclusions` 只含 `packages/e2e/host/weapp/` 下 `setup.ts`、`vite.config.ts`、`protocol-runner.ts`、`example-runner.ts` 这四项允许条目且各带理由，`packages/e2e/host/` 下其余代码文件出现在覆盖率报告中。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "inventory-classification": "手写源码文件清单包含已跟踪与未忽略的新文件，排除被忽略文件、generated 与 AGENTS.md/CLAUDE.md，并正确分为 code、test、asset 三类；*.test.*、*.spec.* 与 test 角色包 tests/ 下的全部文件为 test",
    "coverage-config-derived": "覆盖率 include 等于清单中的 code 类文件，exclude 只含测试文件模式、generated 与清单登记的排除项",
    "missing-file-reported": "应统计的代码文件在覆盖率报告中缺席时被逐个列出并非零退出",
    "stale-exclusion-reported": "登记的覆盖率排除项指向不存在的文件时被指出并非零退出",
    "exclusion-reason-required": "覆盖率排除项缺少理由时被清单 schema 拒绝",
    "coverage-restorable": "恢复合法输入后检查通过",
    "template-exclusions-allowed": "模板自身的覆盖率排除只含 packages/e2e/host/weapp 下 setup.ts、vite.config.ts、protocol-runner.ts、example-runner.ts 这四项允许条目（示例删除后 example-runner.ts 一项随白名单同步移除）且各带理由，host 下其余代码文件计入覆盖率"
  },
  "cases": [
    {"key": "coverage-completeness-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["inventory-classification", "coverage-config-derived", "missing-file-reported", "stale-exclusion-reported", "exclusion-reason-required"]},
    {"key": "missing-file-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["missing-file-reported", "coverage-restorable"]},
    {"key": "stale-exclusion-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["stale-exclusion-reported", "coverage-restorable"]},
    {"key": "template-exclusions-fact", "kind": "engineering", "requiredIn": ["integration"], "checks": ["template-exclusions-allowed"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-08 代码风格与规模基线

模板 SHALL 提供确定性的格式与规模基线：

- **格式**：采用 Prettier，配置为 `printWidth 100`、`singleQuote`、`semi`、`trailingComma all`、`arrowParens always`、`endOfLine lf`。根 `package.json` SHALL 提供 `format` 与 `format:check` 两个命令，`format:check` MUST 加入 `check:fast`；存在未格式化的文件时 `format:check` 非零退出并列出文件。`.prettierignore` MUST 排除 `openspec/`、`.local/`、`.claude/`、`artifacts/`、`dist/`、`coverage/`、`**/generated/**`、`pnpm-lock.yaml`、带摘要的 `packages/e2e/tests/fixtures/**` 与协议来源锁文件，这些路径不受格式检查。
- **行数上限**：ESLint `max-lines` 规则 SHALL 开启 `skipBlankLines` 与 `skipComments`；源文件上限 300 行，测试文件（`*.test.*`、`*.spec.*`、`packages/e2e/tests/**`）上限 600 行；generated 豁免。其他豁免 MUST 只登记在清单 `manifest.quality.maxLinesExemptions`，每项给出路径与非空理由，ESLint 配置从清单读取，不得在配置中另行豁免。模板自身的 `maxLinesExemptions` MUST 为空，超限文件以拆分解决。
- **忽略项**：`eslint.config.js` 的忽略列表 MUST 包含 `.local/**`；`.gitignore` MUST NOT 忽略 `openspec/schemas/`，使用方提交的工作流 schema 不得被静默忽略（模板维护者如需不跟踪，在本地排除中处理，并在 README 的维护者说明中写明）。

工具版本保持在当前最新的补丁或小版本，TypeScript 主版本保持 5.x（受 typescript-eslint 与后续协议工具的 peer 范围约束）；版本选择由评审负责，不设机械检查。

#### Scenario: SCN-TEMPLATE-ENGINEERING-010 格式与行数基线被门禁执行
- **WHEN** 在受控临时根中分别：放入一个未按 Prettier 格式化的源文件；在 `.prettierignore` 排除的目录中放入未格式化文件；放入一个有效行数为 301 的源文件，以及一个总行数超过 300、但去掉空行与注释后不超过 300 的源文件；放入有效行数为 601 与 600 的测试文件；在 `manifest.quality.maxLinesExemptions` 中登记一个超限文件；登记一项缺少理由的豁免；在 `.local/` 下放入 lint 违规文件；随后恢复合法输入。另检查模板自身的清单、`check:fast`、ESLint 忽略列表与 `.gitignore`
- **THEN** 未格式化的源文件使 `format:check` 非零退出并被列出，排除目录中的文件不受检查；有效行数 301 的源文件与 601 的测试文件使 lint 非零退出并指出文件，只因空行或注释超出的文件与 600 行测试文件通过；登记豁免的文件通过，缺少理由的豁免被清单 schema 拒绝；`.local/` 下的文件不被 lint；模板自身豁免为空，`check:fast` 包含 `format:check`，ESLint 忽略 `.local/**`，`.gitignore` 不忽略 `openspec/schemas/`；恢复后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "format-enforced": "未格式化的文件使 format:check 非零退出并被列出，format:check 包含在 check:fast 中",
    "format-ignore-list": ".prettierignore 排除的路径不受格式检查",
    "max-lines-enforced": "源文件超过 300 有效行、测试文件超过 600 有效行时 lint 非零退出并指出文件，空行与注释不计入",
    "exemptions-by-manifest": "行数豁免只来自清单登记且必须带理由，模板自身豁免为空",
    "ignore-entries": "ESLint 忽略 .local/**，.gitignore 不忽略 openspec/schemas/",
    "baseline-restorable": "恢复合法输入后门禁通过"
  },
  "cases": [
    {"key": "baseline-config-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["max-lines-enforced", "exemptions-by-manifest", "ignore-entries"]},
    {"key": "format-check-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["format-enforced", "format-ignore-list", "baseline-restorable"]},
    {"key": "max-lines-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["max-lines-enforced", "exemptions-by-manifest", "ignore-entries", "baseline-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-09 渐进式项目地图与 CLAUDE.md 配对

仓库 SHALL 以三级 AGENTS.md 组成渐进式项目地图：根 `AGENTS.md` 含"项目地图"一节（包 → 职责 → 包级 AGENTS 链接）；每个包的 `packages/<dir>/AGENTS.md` 含"子模块"一节；清单 `manifest.packages[].moduleRoots` 登记的每个根目录下的一级子目录视为模块，各有模块级 `AGENTS.md`。`generated/` 与 `tests/fixtures/` 不算模块。模块级 AGENTS.md MUST 依次包含"职责、对外入口、允许依赖、本地约束、子模块"五节，没有内容的节写"无"，不得删节。包级规则只写在包级文件中，下级文件只链接不复制。

每个 AGENTS.md 旁 MUST 有一个 CLAUDE.md，其首个非空行固定为 `@AGENTS.md`，其后可追加只给 Claude 的内容；每个 CLAUDE.md MUST 有同目录的 AGENTS.md。指南 SHALL 写明 Claude Code 版本要求不低于 v2.1.277，以及本地的 `CLAUDE.local.md` 同样必须以 `@AGENTS.md` 开头。

新增命令 `pnpm check:project-map` 并由 `check:architecture` 调用，SHALL 逐项检查并对违规非零退出、指出文件：

1. 根目录、每个包目录、每个模块目录都有 AGENTS.md；
2. 模块级 AGENTS.md 五节齐全；
3. 包级"子模块"一节以行内代码列出的目录与实际模块目录集合完全一致；根"项目地图"一节列出的包与清单一致；
4. AGENTS.md 与 CLAUDE.md 双向配对，CLAUDE.md 首个非空行为 `@AGENTS.md`。

各节内容是否准确由评审负责，机器只检查结构。

#### Scenario: SCN-TEMPLATE-ENGINEERING-011 项目地图结构缺失或不一致
- **WHEN** 在受控临时根中分别：删除某个模块目录的 AGENTS.md；删除模块级 AGENTS.md 的某一节；新增一个模块目录但不在包级"子模块"一节登记，或在该节登记一个不存在的目录；让根"项目地图"一节的包与清单不一致；删除某个 AGENTS.md 旁的 CLAUDE.md；让 CLAUDE.md 首个非空行不是 `@AGENTS.md`；放入没有同目录 AGENTS.md 的 CLAUDE.md；在 `generated/` 或 `tests/fixtures/` 下新增目录；随后恢复合法输入
- **THEN** 每类违规都被指出具体文件并非零退出；`generated/` 与 `tests/fixtures/` 下的目录不要求 AGENTS.md；`check:architecture` 同样因这些违规失败；恢复后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "agents-present": "根目录、每个包目录与每个模块目录都有 AGENTS.md，generated 与 tests/fixtures 不算模块",
    "module-skeleton": "模块级 AGENTS.md 包含职责、对外入口、允许依赖、本地约束、子模块五节",
    "map-consistent": "包级子模块列表与实际模块目录集合一致，根项目地图的包与清单一致",
    "claude-pairing": "AGENTS.md 与 CLAUDE.md 双向配对，CLAUDE.md 首个非空行为 @AGENTS.md",
    "wired-into-architecture": "check:architecture 调用项目地图检查，违规时同样失败",
    "map-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "project-map-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["agents-present", "module-skeleton", "map-consistent", "claude-pairing"]},
    {"key": "project-map-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["agents-present", "module-skeleton", "map-consistent", "claude-pairing", "wired-into-architecture", "map-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-10 技术架构文档

模板 MUST 提供技术架构文档 `docs/architecture.md`，回答"解决什么问题、为什么这样设计"，与指南（回答"怎么用、怎么换"）分工。文档 SHALL 包含粗略层（模板要解决的问题、整体架构图、质量体系主线、关键原则）与细节层；细节层中指南"能力地图"表格第一列的每一项 MUST 有同名的二级或三级标题，每节固定写解决的问题、实现机制与关键文件、关键设计决策与被否决的方案、演进记录四部分。演进记录用 Change 名称纯文本标注；相对链接只允许指向已存在的归档 Change 目录（`openspec/changes/archive/<日期>-<名称>/`），正在交付的 Change MUST NOT 以相对链接指向 `openspec/changes/<名称>/`，否则归档搬迁或演练删除目录后链接失效。根 `AGENTS.md` 与 `README.md` SHALL 链接该文档。

架构检查 MUST 校验：文档存在；根 AGENTS.md 与 README.md 都链接它；能力地图的每一项在文档中都有同名的二级或三级标题；文档中的相对链接都能解析。违规时非零退出并指出缺失项。

根 AGENTS.md 的执行规则 SHALL 规定：新增或改变能力的 Change 在 Design 阶段同步更新该文档；遇到问题先查官方文档与业界或社区的成熟方案，查不到再做实验，最后才考虑自研，引入框架生态时优先使用官方脚手架，确需自研通用能力时在 Design 中写明已查过的方案与不采用的理由。这两条约定与文档各节内容是否准确由评审负责，不做机械检查。

#### Scenario: SCN-TEMPLATE-ENGINEERING-012 技术架构文档缺失或与能力地图不一致
- **WHEN** 在临时副本中分别：删除架构文档；删除根 AGENTS.md 或 README.md 中指向它的链接；在指南能力地图中新增一项但不在架构文档中增加同名标题；在架构文档中加入无法解析的相对链接；随后恢复合法输入
- **THEN** 架构检查逐项指出缺失的文档、缺失的链接、缺少同名章节的能力项与断链，并非零退出；恢复后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "architecture-present-and-linked": "架构文档存在，且根 AGENTS.md 与 README.md 都链接它",
    "capability-sections": "指南能力地图的每一项在架构文档中都有同名的二级或三级标题",
    "architecture-links-resolve": "架构文档中的相对链接都能解析",
    "architecture-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "architecture-doc-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["architecture-present-and-linked", "capability-sections", "architecture-links-resolve"]},
    {"key": "architecture-doc-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["architecture-present-and-linked", "capability-sections", "architecture-links-resolve", "architecture-restorable"]}
  ],
  "blockedBy": []
}
```

## MODIFIED Requirements

### Requirement: ENG-01 三包边界与产品交付

工程 SHALL 由产品包、协议包和私有 E2E 包组成。依赖方向只能是产品包依赖协议包，两者都不得依赖 E2E。产品包与协议包 MUST 交付 ESM、CommonJS 双格式及类型声明：协议包根入口提供平台网络工厂；产品包根入口不转导出协议包的网络工厂；产品包打包后对协议包的依赖固定为精确版本，使用方只安装产品包即可运行。测试设施（testing、tests、fixtures、e2e）不得进入任何产品包产物。验证产物边界所用的临时构建 MUST 按清单复制输入：`manifest.fingerprints.sourceRoots`、`manifest.fingerprints.buildInputs` 与各包的 `package.json`、tsconfig，不得维护写死的文件清单；清单新增构建输入后，临时构建无需修改测试即可包含它。产物边界检查中产品包根入口的期望导出集合 MUST 从产品包根入口的实际导出计算，MUST NOT 在 Fixture 或测试中写死示例导出名，删除模板示例后检查无需修改。本要求验证工程边界；产品包的业务导出由其所属能力（例如 `template-example` 的 EX-01）另行验证。

#### Scenario: SCN-TEMPLATE-ENGINEERING-001 产品包与协议包的产物边界与消费
- **WHEN** 按清单登记的源码目录与构建输入复制临时构建根，打包协议包与产品包，分别在临时的 ESM、CommonJS、TypeScript 消费工程中安装并导入协议包网络工厂；只安装产品包的消费工程安装运行；检查产物清单与源码依赖图
- **THEN** 临时构建只依据清单复制输入即可完成；三种方式都能导入协议包网络工厂；产品包根入口不导出网络工厂，且用于比对的产品包导出集合由根入口实际导出计算而非写死示例导出名；只安装产品包的工程能解析到精确版本的协议包；产物中不包含测试设施；产物与当前源码及依赖图一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "protocol-network-export": "协议包根入口的网络工厂可以通过 ESM、CJS、类型声明三种方式消费",
    "sdk-export-boundary": "产品包根入口不转导出协议包网络工厂",
    "sdk-exports-from-entry": "产物比对使用的产品包导出集合从产品包根入口的实际导出计算，Fixture 与测试中不写死示例导出名",
    "dependency-release-contract": "只安装产品包即可解析到精确版本的协议包依赖",
    "production-package-clean": "产品包产物不包含 testing、tests、fixtures、e2e 等测试设施",
    "source-and-graph-current": "产物与当前源码及依赖图一致",
    "build-copy-by-manifest": "临时构建按清单的 sourceRoots、buildInputs 与各包 package.json、tsconfig 复制输入，不含写死的文件清单"
  },
  "cases": [
    {"key": "protocol-network-esm-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "protocol-network-commonjs-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "protocol-network-types-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "sdk-does-not-reexport-network", "kind": "engineering", "requiredIn": ["integration"], "checks": ["sdk-export-boundary", "sdk-exports-from-entry"]},
    {"key": "sdk-only-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dependency-release-contract"]},
    {"key": "package-boundaries", "kind": "engineering", "requiredIn": ["integration"], "checks": ["production-package-clean", "source-and-graph-current", "build-copy-by-manifest"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-02 架构与质量门禁

静态、架构、产物与覆盖率等机器门禁 MUST 对可以机械检测的违规非零退出，并指出违规位置。违规包括：缺少必需的 AGENTS 入口；产品代码反向依赖；生产入口夹带 Shadow 等测试设施；场景测试目录越界；lint 或类型违规；存在未被测试导入的手写文件。恢复合法输入后门禁 SHALL 通过。削减门禁规则时必须留有维护者评审记录；机器只校验记录的结构、关联版本与新鲜度，不判断语义。代码托管平台的合并保护不属于本要求。

通用的依赖与平台规则 SHALL 按清单中的包角色生成路径，并 MUST 由不依赖模板示例的反例证明会拦截：协议包不得反向依赖产品包与测试包；生产代码不得依赖测试设施；跨包只能经对方根入口或生成产物导入；产品包内不同业务模块互不导入；业务模块的 `core/`、`ports/` 不得导入生成代码、Node 内置模块或使用平台全局对象（如 `wx`）；Shadow 引擎不得导入生成代码。反例在受控临时根中构造一个合成模块逐条触发，模板示例被删除后这些证据仍然成立；示例自身的分层检查由其所属能力另行验证。

#### Scenario: SCN-TEMPLATE-ENGINEERING-002 架构与质量门禁缺失或违规
- **WHEN** 分别引入缺少 AGENTS 入口、反向依赖、生产入口夹带 Shadow、场景目录越界、lint 违规、类型违规、未被测试导入的手写文件等违规，或在没有评审记录的情况下削减门禁
- **THEN** 对应的门禁命令逐项非零退出并指出违规；恢复合法输入后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "machine-gates": "静态、架构、产物和覆盖命令对可机械检测的违规非零退出",
    "boundary-enforcement": "反向依赖、生产夹带 Shadow、场景目录越界和未测手写文件被拒绝",
    "rules-restorable": "恢复合法输入后机器门禁通过",
    "review-record": "规则减项必须有维护者评审记录；机器只校验记录结构、关联版本与新鲜度，不判断语义"
  },
  "cases": [
    {"key": "missing-agent-entry", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates"]},
    {"key": "reverse-dependency", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "shadow-in-production", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "scenario-directory-escape", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "lint-violation", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates"]},
    {"key": "type-violation", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates"]},
    {"key": "untested-handwritten-file", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "restored-valid-input", "kind": "engineering", "requiredIn": ["integration"], "checks": ["rules-restorable"]},
    {"key": "gate-reduction-review-evidence", "kind": "engineering", "requiredIn": ["integration"], "checks": ["review-record"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-TEMPLATE-ENGINEERING-007 合成模块逐条证明依赖与平台规则
- **WHEN** 在不含模板示例的受控临时根中构造一个合成业务模块（含 `core/`、`ports/`），不修改任何门禁配置，分别引入：协议包导入产品包或测试包；生产代码导入测试设施；跨包直接导入对方非入口文件；合成模块与另一个合成模块互相导入；合成模块 `core/` 导入生成代码、导入 Node 内置模块、使用 `wx` 全局对象；Shadow 引擎文件导入生成代码；随后恢复合法依赖。另以改名后的清单生成依赖与 lint 规则
- **THEN** 架构或 lint 门禁对每条违规逐项非零退出并指出违规文件与规则；恢复后门禁通过；规则路径随清单中的包目录生成，改名后同样拦截。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "rules-by-role": "依赖与 lint 规则中的包路径按清单角色生成，改名后的清单生成的规则指向新目录",
    "dependency-direction-blocked": "协议包反向依赖、生产代码依赖测试设施、跨包导入非入口文件被逐条拦截",
    "module-isolation-blocked": "合成业务模块之间互相导入被拦截",
    "core-platform-blocked": "合成模块 core 导入生成代码、Node 内置模块或使用 wx 全局对象被逐条拦截",
    "shadow-engine-blocked": "Shadow 引擎导入生成代码被拦截",
    "synthetic-restorable": "恢复合法依赖后门禁通过，且整个过程不依赖模板示例"
  },
  "cases": [
    {"key": "rule-generation-by-manifest", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["rules-by-role"]},
    {"key": "synthetic-dependency-direction", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dependency-direction-blocked", "synthetic-restorable"]},
    {"key": "synthetic-module-isolation", "kind": "engineering", "requiredIn": ["integration"], "checks": ["module-isolation-blocked", "synthetic-restorable"]},
    {"key": "synthetic-core-platform", "kind": "engineering", "requiredIn": ["integration"], "checks": ["core-platform-blocked", "synthetic-restorable"]},
    {"key": "synthetic-shadow-engine", "kind": "engineering", "requiredIn": ["integration"], "checks": ["shadow-engine-blocked", "synthetic-restorable"]},
    {"key": "synthetic-renamed-manifest", "kind": "engineering", "requiredIn": ["integration"], "checks": ["rules-by-role", "dependency-direction-blocked"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-03 公共类型中文注释随双格式声明交付

产品包公共入口导出的手写公共类型、字段和状态值 MUST 在源码中带中文 JSDoc，并且这些注释 SHALL 原样保留在 ESM 与 CommonJS 两套类型声明产物中。检查对象 MUST 由入口发现而不是固定文件列表决定：以清单中 product 角色包的根入口 `src/index.ts` 为起点，解析全部导出符号，追溯到它们在包内的手写声明（排除生成代码），检查每个类型、字段、联合类型的字面量分支与枚举成员。同名字段在每个声明位置都 MUST 单独检查，不得只检查首次出现。缺少注释，或注释在构建中被移除时，检查 SHALL 失败并指出声明位置。删除模板示例后，检查对象随入口变化，检查本身仍然成立。注释语义是否准确由评审负责，机器只检查结构。

#### Scenario: SCN-TEMPLATE-ENGINEERING-003 公共类型注释随源码与声明交付
- **WHEN** 检查产品包公共入口导出的类型源码与双格式声明产物；另在受控临时根中构造反例：入口新导出一个缺少注释的类型；两个类型声明同名字段，只有第一个带注释；联合类型的某个字面量分支或枚举成员缺少注释；入口重新导出的生成类型不带注释；构建后声明产物中的注释被移除
- **THEN** 正常情况下源码与两套声明中都有对应的中文注释；新导出的无注释类型、第二处同名字段、无注释的字面量分支与枚举成员被逐项拒绝并指出位置；生成类型不在检查范围内；声明产物丢失注释被拒绝。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "entry-discovery": "检查对象由 product 包根入口的导出符号追溯得到，排除生成代码，不依赖固定文件列表",
    "source-comment-structure": "公共入口导出的类型、字段、联合类型字面量分支与枚举成员在源码中都有中文 JSDoc",
    "every-declaration-site": "同名字段在每个声明位置都单独检查",
    "dual-declaration-structure": "ESM 与 CJS 两套声明产物都保留这些注释"
  },
  "cases": [
    {"key": "entry-discovery-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["entry-discovery", "source-comment-structure", "every-declaration-site"]},
    {"key": "source-and-dual-declarations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-comment-structure", "dual-declaration-structure"]},
    {"key": "missing-comment-rejected", "kind": "engineering", "requiredIn": ["integration"], "checks": ["entry-discovery", "source-comment-structure", "every-declaration-site", "dual-declaration-structure"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-05 项目清单驱动工程门禁

项目形态 MUST 由根目录 `project.manifest.json` 统一登记，格式唯一权威是 `project.manifest.schema.json`，其中每个属性（含嵌套属性）SHALL 带非空中文 `description`。清单登记：各包的目录、包名、角色（product、protocol、test 各一个）、是否私有与允许的目录；必需命令；测试项目及其类别（unit、integration、platform）；摘要输入；质量例外；发布设置。具体字段：

- `fingerprints.sourceRoots`：源码目录。目录下全部 git 跟踪文件与未被忽略的新文件都参与源码清单，不按扩展名过滤；固定排除 `generated/` 下的生成代码与各级 `AGENTS.md`、`CLAUDE.md`。
- `fingerprints.buildInputs`：影响构建或测试结果、但不在源码目录内的文件或目录（例如构建配置、tsconfig、锁文件、测试配置），支持末段通配。
- `fingerprints.protocolInputs`：协议来源锁文件，替代写死的协议锁文件路径。
- `fingerprints.hostRoots` 删除，其内容并入 `sourceRoots`；schema SHALL 拒绝该字段。
- `packages[].consumedOperations`：产品包内声明消费接口的模块路径，只允许 product 角色填写。
- `packages[].moduleRoots`：包内承载模块的根目录，其一级子目录视为模块。
- `quality.coverageExclusions[]` 与 `quality.maxLinesExemptions[]`：覆盖率排除与行数豁免，每项 MUST 有路径与非空理由。
- `testProjects[].config`：该测试项目的 Vitest 项目配置文件路径，根 `vitest.config.ts` 的 `projects` 由它组装。
- `testProjects[].perFile`（可选）：为 true 时验收入口逐文件运行该项目，每个文件一份报告（见 `scenario-gate` 的 GATE-14）。
- `testProjects[].prepare`（可选）：逐文件运行前执行的准备命令名（例如退出并预热微信开发者工具）。

源码清单的分类规则（code、test、asset，其中 test 包含 `*.test.*`、`*.spec.*` 与 test 角色包 `tests/` 下的全部文件）见 ENG-07。源码摘要 `sourceDigest` SHALL 由源码清单（code、test、asset 三类文件）与 `buildInputs` 计算；协议摘要 `protocolDigest`（原 `idlDigest`）SHALL 由 `protocolInputs` 计算。仓库不是 git 工作区时源码清单 MUST 报错退出，不退化为全目录扫描。

工程门禁 SHALL 从清单读取上述事实。门禁脚本（`scripts/` 下的非测试文件）、`.dependency-cruiser.cjs`、`eslint.config.js`、`vitest.config.ts` 的内容，以及根 `package.json` 中 scripts 的**值** MUST NOT 以字面量写死产品包与协议包的目录名和包名、与测试项目类别不同名的测试项目名，以及发布 registry。根 scripts 的**键名**不在扫描范围内：`test:e2e:<平台项目名>` 这类键名由清单 `requiredCommands` 登记，本身就是清单事实。依赖与 lint 规则中的包路径按清单角色生成，`check:architecture` 由架构检查脚本按清单组装依赖检查参数。根 scripts 与 Vitest 项目列表 SHALL 按清单派生：

- 根 `package.json` 中 `build`、`typecheck`、`test:unit`、`test:integration` 与各 `test:e2e:<name>` 的值 SHALL 为 `tsx scripts/run-by-manifest.ts <命令名>`，由 `scripts/run-by-manifest.ts` 按清单组装并执行：`build` 按依赖顺序（protocol 角色先于 product 角色）对每个包执行 `pnpm --filter <name> build`；`typecheck` 对每个产品包与协议包的 `tsconfig.build.json` 以及根 `tsconfig.test.json`、`tsconfig.tools.json` 执行 `tsc --noEmit`；`test:unit` 一起运行全部 unit 类项目并开启覆盖率；`test:integration` 与 `test:e2e:<name>` 运行对应项目；
- 根 `vitest.config.ts` 的 `projects` SHALL 由清单 `testProjects[].config` 组装。测试包是门禁赖以运行的测试基础设施（门禁导入它的工具代码、读取它的 Fixture 目录），其固定路径 `packages/e2e/` 不在此限，测试包也不作为可改名的替换点。具体要求：
- 架构检查按清单校验包目录集合、包名、私有标记、协议包不得依赖产品包与测试包、允许目录与必需命令；
- 场景门禁按清单校验 `requiredIn` 只引用已登记的测试项目，`verification.schema.json` 与 `flow.schema.json` 不枚举具体项目名；场景门禁的默认报告由清单派生：unit 类项目合并为 `unit.json`，其余每个非 perFile 测试项目一份 `<name>.json`，perFile 项目取其目录 `<name>/` 下的全部报告文件；
- 用例绑定的运行环境不以联合类型写死，运行时校验它属于清单中 integration 或 platform 类项目，不属于时拒绝；
- IDL 协议义务的运行环境取自清单：路由、字段与共享方法义务取全部 integration 与 platform 类项目，错误码义务取全部 integration 类项目；
- 源码摘要与协议摘要的输入取自清单；
- 包消费检查（含测试包中的包消费工具）与发布脚本按角色从清单取包名；
- 门禁自身的单测与工程用例中的包名、测试项目名同样从清单读取，不写死。

使用方按清单改名、删除 platform 类项目或删除发布设置后，只需同步清单与相应文件，门禁无需修改即可工作。

#### Scenario: SCN-TEMPLATE-ENGINEERING-005 门禁按项目清单工作
- **WHEN** 在临时副本中分别：按清单把某个包改名并同步目录与 package.json；放入清单未登记的包目录；让 package.json 包名与清单不一致；删除清单要求的命令；让某个 case 的 `requiredIn` 引用清单未登记的测试项目；从清单删除 platform 类项目；在清单中保留 `hostRoots` 或为非 product 包填写 `consumedOperations`；为某个测试项目登记 `perFile` 与 `prepare`；改动 `testProjects[].config` 与包的角色顺序并查看 `run-by-manifest` 组装出的命令与 Vitest 项目列表；修改源码目录中的非代码文件、修改一项 `buildInputs`、修改 `protocolInputs`、只修改 AGENTS.md 并比较前后摘要；新增尚未 `git add` 的源码文件与被忽略的文件；在非 git 工作区运行源码清单；让用例绑定清单未登记的运行环境；检查门禁脚本与依赖、lint、测试配置的内容及根 scripts 的值中是否残留清单登记的名称字面量
- **THEN** 改名后的副本门禁通过；未登记目录、包名不一致、缺少命令、未登记的测试项目被逐项指出并非零退出；删除 platform 类项目后全部协议义务只要求 integration 类环境、默认报告不再包含该项目；`hostRoots` 与非 product 包的 `consumedOperations` 被清单 schema 拒绝；`run-by-manifest` 按清单组装 build（protocol 先于 product）、typecheck、test:unit、test:integration 与 test:e2e:<name>，Vitest 项目列表等于清单 `testProjects[].config`，perFile 项目的默认报告取其目录下的全部文件；非代码文件、构建输入与未 `git add` 的新文件改动使源码摘要变化，只改 AGENTS.md 或被忽略文件不变，协议锁文件改动使协议摘要变化；非 git 工作区报错退出；未登记的运行环境被拒绝；上述配置文件内容与根 scripts 的值中没有清单登记名称的字面量（scripts 键名不扫描）；清单 schema 的每个属性都有中文说明。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "manifest-schema": "清单通过 schema 校验，schema 的每个属性都有非空中文说明；hostRoots 与非 product 包的 consumedOperations 被拒绝，质量例外必须带理由，testProjects 支持 config、perFile、prepare 字段",
    "rename-by-manifest": "只按清单与对应文件改名后，架构检查通过，无需修改门禁代码",
    "architecture-violations": "未登记目录、包名不一致、缺少必需命令被逐项指出并非零退出",
    "projects-by-manifest": "requiredIn 只能引用清单登记的测试项目，未登记的项目被指出",
    "obligation-environments": "路由、字段与共享方法义务的运行环境等于清单中全部 integration 与 platform 类项目，错误码义务等于全部 integration 类项目",
    "source-roots-by-manifest": "源码清单只覆盖清单登记目录中的已跟踪与未忽略文件，排除 generated 与 AGENTS.md/CLAUDE.md，非 git 工作区报错退出",
    "digest-inputs": "sourceDigest 随源码清单任一类文件与 buildInputs 变化，protocolDigest 随 protocolInputs 变化，只改 AGENTS.md 或被忽略文件时不变",
    "environments-by-manifest": "用例运行环境在运行时按清单校验，默认报告由清单测试项目派生，perFile 项目取其目录下的全部报告文件",
    "scripts-by-manifest": "根 build、typecheck、test:unit、test:integration、test:e2e:<name> 的值为 tsx scripts/run-by-manifest.ts <命令名>，按清单组装（build 中 protocol 先于 product）；根 vitest.config.ts 的 projects 由 testProjects[].config 组装",
    "no-hardcoded-topology": "门禁脚本的非测试文件、依赖与 lint 及测试配置的内容、根 package.json scripts 的值中不含产品包与协议包的目录名和包名、与类别不同名的测试项目名和 registry 字面量；scripts 键名不在扫描范围"
  },
  "cases": [
    {"key": "manifest-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["manifest-schema", "projects-by-manifest", "obligation-environments", "source-roots-by-manifest", "digest-inputs", "environments-by-manifest", "scripts-by-manifest"]},
    {"key": "rename-by-manifest-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["rename-by-manifest", "scripts-by-manifest"]},
    {"key": "architecture-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["architecture-violations"]},
    {"key": "unregistered-project-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["projects-by-manifest"]},
    {"key": "digest-inputs-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-roots-by-manifest", "digest-inputs"]},
    {"key": "no-hardcoded-topology", "kind": "engineering", "requiredIn": ["integration"], "checks": ["no-hardcoded-topology"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-06 使用指南与替换点地图

模板 MUST 提供使用指南 `docs/template-guide.md`，作为使用方（含 Agent）基于模板演进的入口。指南 SHALL 包含以下章节：

- **能力地图**：每项能力的承载文件与验证方式，与技术架构文档的章节一一对应；
- **从方案到验收**：Task 期间运行 `pnpm test:affected`，Apply 交回前与 Verify 前运行 `pnpm verify`；验收结论以 Change 内的 verify 记录为准，`artifacts/` 只作为本地运行产物目录，指南与根 AGENTS.md MUST NOT 再要求把验收索引写入 `artifacts/<run-id>/tasks/`；
- **初始化方式**：先做只读模板的适配评估，再复制；使用方在自己仓库中以第一个 Change 完成删改增，并以同一套门禁验收；
- **移除模板示例**：给出下文"删除白名单"；时机为项目自己的第一个 Scenario 通过完整门禁之后；方式为直接提交删除，不写 REMOVED delta、不走归档；只适用于白名单内容且只在初始化阶段使用，项目后期退役自己的能力仍走正常 Change；
- **归档已知限制**：整份能力退役时归档被拒绝的手工步骤；保留 ID 只改 Scenario 标题时先在主 Spec 同步标题再归档；
- **版本对齐**：接入官方脚手架时按 peer 依赖与 `engines` 统一版本，模板版本过旧时可以升级并在反馈日志中记录；
- **使用方约定**：反馈日志只记录实际遇到并已核实的问题，每条注明问题出在模板代码还是项目代码；
- **复刻验收**：隔离副本（在待验收提交上导出、重新初始化仓库并只做一次初始提交、按锁文件安装）；每个演练由全新无上下文的 Agent 执行，提示词只含副本路径、先读根 AGENTS.md 与指南、操作目标与规则，禁止读取 `openspec/changes/` 与 `artifacts/`；输入为写明范围的代表性子集；通过标准为确定性门禁全部通过、猜测记录按"指南已覆盖但未读到 / 指南缺失需修订 / 合理的自主判断"三类判定、纳入范围的历史问题不再复现；证据写入 Change 的 verify 记录；
- **替换点地图**：覆盖可替换的实现点"协议来源"与"运行平台"，以及可删除模块"包发布"；每项列出涉及的文件、清单中需要修改的项与验收所用门禁，并与当前清单字段一致。

根 AGENTS.md 与 README.md SHALL 链接该指南。架构检查 MUST 校验：指南存在；根 AGENTS.md 与 README.md 都链接它；规定章节齐全；指南中的相对链接都能解析。指南中可机械核对的事实 MUST 与仓库一致：出现的 Scenario ID 都已在有效 Spec 中登记；以行内代码书写的 `pnpm <命令>` 中，非 pnpm 内置命令都存在于根 `package.json` 的 scripts；以行内代码 `manifest.<字段路径>` 引用的清单字段都存在于 `project.manifest.schema.json`。描述是否准确、照着能否完成操作，由评审与复刻验收负责。

**删除白名单** MUST 恰好包含以下内容，指南与本要求一致：

- 整目录或整文件：`packages/sdk/src/example/`；`packages/protocol/testing/shadow/example/`；`packages/e2e/tests/example/`、`packages/e2e/tests/weapp/example/`；`packages/e2e/host/weapp/example-runner.ts`；`packages/e2e/tests/fixtures/` 下的 `SCN-TEMPLATE-EXAMPLE-*` 与 `FLOW-TEMPLATE-EXAMPLE-*`；`packages/e2e/tests/tooling/SCN-TEMPLATE-EXAMPLE-*`；`openspec/specs/template-example/`；示例删除验收自身的用例 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts` 与 Fixture `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`（见 template-example 的 EX-10）。
- 片段：全仓库所有 `template-example:begin` 与 `template-example:end` 标记之间的内容（连同标记本身），包括 `packages/sdk/src/index.ts` 的示例导出、`consumed-operations.ts` 的示例条目及其单测中的示例断言、`packages/e2e/host/weapp/` 下 `app.js`、`setup.ts`、`vite.config.ts` 与 `packages/e2e/src/drivers/weapp-host.test.ts` 中注册与配置示例运行器的片段、指南与各级 AGENTS.md 中指向示例文件或引用 `SCN-TEMPLATE-EXAMPLE-*` 的段落、包级 AGENTS.md"子模块"一节中列出的示例模块条目（例如 `sdk/src/example`、`e2e/tests/example`）、会创建副本的用例排除列表与测试配置中指向示例文件或示例删除验收的条目。
- JSON 中的示例键：`SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` 中示例接口的键（`CreateTrade`、`QueryTrade`），删除后执行 `pnpm fixtures:refresh SCN-PROTOCOL-CONTRACT-002`。
- 同步：`manifest.quality.coverageExclusions` 中指向已删除文件的条目。

**片段标记**：共享文件中只属于示例的片段 MUST 用成对注释包裹：代码文件写 `// template-example:begin` 与 `// template-example:end`，Markdown 写 `<!-- template-example:begin -->` 与 `<!-- template-example:end -->`。架构检查 MUST 校验标记成对出现、不嵌套，未闭合、多余的结束标记或嵌套时非零退出并指出文件与行号。共享文件中引用示例、但未被标记包裹的内容视为门禁依赖示例，会在下述删除验收中暴露。

按指南白名单删除模板示例后，确定性门禁 MUST 仍然通过：不得有门禁、用例或工程配置依赖白名单内的内容。共享文件中依赖示例的证据（例如 IDL 路由来源单测、Shadow 引擎单测）MUST 改为不依赖示例目录的输入。这一保证的自动化证据（SCN-TEMPLATE-ENGINEERING-008）属于模板自身的维护证据，登记在 template-example 能力的 EX-10 中，随示例一起删除：使用方删除示例后不再需要它，保留它会使删除后的仓库必然失败。仓库副本（供示例删除验收与门禁自测使用）SHALL 按以下方式构造：

- 用 `git ls-files -co --exclude-standard` 复制当前工作区，在副本中 `git init` 并做一次提交，然后在副本中执行 `pnpm install --offline --frozen-lockfile`，从本机 pnpm store 安装依赖。副本 MUST NOT 链接或复用原仓库的 `node_modules`：pnpm 的 workspace 链接会解析回原仓库，副本里测的就不是删除后的代码；副本中产品包（`@daqian/template-sdk`）的 realpath MUST 位于副本内。
- 为模拟"当前 Change 已交付"的模板状态，在副本中对作用域内的 active Change（`SCENARIO_GATE_CHANGES` 所列；未设置时为空）执行 `openspec archive <name> -y`，其余 active Change 的目录直接从副本中移除（它们是尚未交付的后续工作，与当前模板状态无关）；归档使用副本 `node_modules` 中以精确版本固定的 `@fission-ai/openspec`，不依赖全局安装。
- 归档完成后，副本内的运行环境 MUST 清除 `SCENARIO_GATE_CHANGES`：被归档的 Change 已不在 active 目录，变量继续生效会触发"Change 不存在"错误。
- 然后按白名单删除示例。

运行约定：仓库存在正在交付的 active Change 时，任何可能触发副本用例的运行（全量运行与 `pnpm test:affected`）SHALL 以该 Change 为作用域，即 `pnpm verify --change <name>`，单独运行 `check:fast` 或 `test:affected` 时设置 `SCENARIO_GATE_CHANGES=<name>`，副本据此归档该 Change；没有 active Change 时（作用域为空），副本无需归档。该约定同样适用于复刻验收的演练副本：演练 Agent 的工作仍在 active Change 中时，演练副本的验收命令为 `pnpm verify --change <该 Change>`，只有副本中没有 active Change 时才不带作用域。

防止递归：副本中 SHALL 设置环境变量 `TEMPLATE_COPY=1`：根 `vitest.config.ts` 在该变量存在时排除所有会创建副本的用例（示例删除验收、SCN-TEMPLATE-ENGINEERING-001 的临时构建、SCN-SCENARIO-GATE-026 中运行副本的 case），创建副本的 helper 在该变量已设置时 MUST 拒绝创建，防止递归。

#### Scenario: SCN-TEMPLATE-ENGINEERING-006 使用指南缺失或不完整
- **WHEN** 在临时副本中分别删除指南、删除根 AGENTS.md 或 README.md 中指向指南的链接、删除某个规定章节（含移除模板示例、归档已知限制、版本对齐、使用方约定、复刻验收）、在指南中加入无法解析的相对链接、引用未登记的 Scenario ID、引用不存在的 `pnpm` 命令、引用不存在的清单字段（例如已删除的 `manifest.fingerprints.hostRoots`）、让指南的删除白名单缺少本要求列出的某一项；另分别在代码文件与 Markdown 文件中放入只有 `template-example:begin` 没有结束标记、多余的 `template-example:end`、两对嵌套的标记
- **THEN** 架构检查逐项指出缺失、断链或不一致的事实并非零退出；标记未闭合、多余或嵌套时指出文件与行号并非零退出；恢复后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "guide-present-and-linked": "指南存在，且根 AGENTS.md 与 README.md 都链接它",
    "guide-sections": "指南包含能力地图、从方案到验收、初始化方式、移除模板示例（含完整删除白名单）、归档已知限制、版本对齐、使用方约定、复刻验收、替换点地图（协议来源、运行平台、包发布）全部章节",
    "guide-links-resolve": "指南中的相对链接都能解析",
    "guide-facts-consistent": "指南引用的 Scenario ID 已登记、pnpm 命令存在于根 package.json、清单字段存在于清单 schema",
    "guide-restorable": "恢复合法输入后检查通过",
    "example-markers-paired": "代码与 Markdown 中的 template-example:begin/end 标记成对出现且不嵌套，未闭合、多余或嵌套时架构检查指出文件与行号并非零退出"
  },
  "cases": [
    {"key": "guide-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["guide-present-and-linked", "guide-sections", "guide-links-resolve", "guide-facts-consistent"]},
    {"key": "guide-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["guide-present-and-linked", "guide-sections", "guide-links-resolve", "guide-facts-consistent", "guide-restorable"]},
    {"key": "example-marker-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["example-markers-paired"]},
    {"key": "example-marker-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["example-markers-paired", "guide-restorable"]}
  ],
  "blockedBy": []
}
```

