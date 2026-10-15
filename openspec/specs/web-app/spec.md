# web-app Specification

## Purpose
TBD - created by archiving change template-web-absorption. Update Purpose after archive.
## Requirements
### Requirement: WEB-01 Web 应用产品包的初始化与对齐

清单中 `form` 为 `web-app` 的 product 包（下称"应用包"；模板中为 `packages/web`，包名 `@daqian/template-web`，私有）SHALL 以官方脚手架 `pnpm create vue@3.24.0 packages/<dir> --ts --pinia --vitest --eslint --prettier --bare` 生成，技术栈为 Vue 3 + Vite + Pinia，然后按以下方式对齐模板：

- 删除脚手架自带的 oxlint、包内 ESLint 与 Prettier 配置、`.vscode`，统一使用仓库根配置；
- 删除脚手架残留（英文 README、Cypress 段等）；
- 依赖全部使用精确版本，版本以 design"依赖版本"一节为准；pinia 的 peer `@vue/devtools-api` MUST 显式声明，不依赖 pnpm 自动安装 peer；create-vue 只用于初始化，不进入依赖；
- 应用包对其绑定协议包的依赖 MUST 以 workspace 依赖声明，不得只靠路径别名；
- 应用包不发布，不进入发布计划（发布范围由 ENG-12 规定并承担证据）。

应用包的类型检查（`vue-tsc --build`）、中文注释的源码模式发现与产物检查的形态选择由 ENG-12 与 ENG-03 规定并承担证据，本能力不重复。

#### Scenario: SCN-WEB-APP-001 应用包与模板对齐
- **WHEN** 读取模板自身的应用包 `packages/web` 的目录、`package.json` 与清单条目；另在受控临时根中分别：在应用包内放入包级 ESLint 或 Prettier 配置、oxlint 配置或 `.vscode`；把一个依赖改为范围版本；删除 `@vue/devtools-api` 的显式声明；去掉对绑定协议包的 workspace 依赖而只保留路径别名；随后恢复合法输入
- **THEN** 模板自身应用包的包名为 `@daqian/template-web`、私有，不含包级 lint/格式配置、oxlint、`.vscode` 与脚手架残留，依赖均为精确版本且显式声明 `@vue/devtools-api`，以 workspace 依赖声明绑定协议包 `@daqian/template-openapi`；每个反例都使架构或包检查非零退出并指出文件与原因；恢复后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "root-config-only": "应用包不含包级 ESLint、Prettier、oxlint 配置与 .vscode，也不含脚手架残留，统一使用根配置",
    "exact-dependencies": "应用包依赖均为精确版本，并显式声明 pinia 的 peer @vue/devtools-api",
    "workspace-protocol-dependency": "应用包以 workspace 依赖声明其绑定协议包，不只靠路径别名",
    "template-app-package": "模板应用包位于 packages/web，包名 @daqian/template-web，私有",
    "alignment-violation-rejected": "每个对齐反例都被检查拒绝并指出文件与原因",
    "alignment-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "alignment-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["root-config-only", "exact-dependencies", "workspace-protocol-dependency", "alignment-violation-rejected"]},
    {"key": "template-alignment-fact", "kind": "engineering", "requiredIn": ["integration"], "checks": ["root-config-only", "exact-dependencies", "workspace-protocol-dependency", "template-app-package"]},
    {"key": "alignment-violation-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["alignment-violation-rejected", "alignment-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEB-03 应用包目录结构与组件树

应用包 `src/` SHALL 采用以下结构：

- `main.ts`：装配入口；
- `app/`：装配层，组装 store、端口实现与模块根组件；`app/platform/` 放跨模块共用的平台适配器（时钟、可见性、取消），在装配点注入；`app/consumed-operations.ts` 为消费接口声明；
- `runtime/`：不依赖 Vue/DOM 的纯逻辑运行辅助（轮询器、代际），其端口放 `runtime/ports/`，不得引用业务模块的 `ports/`；
- `shared/{components,composables,utils}`：跨模块共享代码（目录，不是 package）；
- `<module>/`：按界面块划分的业务模块，含 `ui/<Root>/`（模块根组件，组件树起点）、`core/`（纯逻辑）、`ports/`（外部能力抽象）、`adapters/`（外部能力实现，调用协议包）；
- `store/`：全局 store，清单 `packages[].globalStore` 指向其入口。

组件目录 SHALL 采用树形加就近结构：`<Name>/` 下有入口 `<Name>.vue`（样式以 `<style scoped src="./<Name>.css"></style>` 引入）、可选 hook `use<Name>.ts`、可选样式 `<Name>.css`、可选 `utils/`、子组件 `components/<Child>/`（结构相同，可继续嵌套）与 `__tests__/`。

新增命令 `pnpm check:component-tree`，基于 dependency-cruiser 的 JSON 输出判定以下五条规则，任一违反 SHALL 非零退出并指出文件与规则。该命令只处理 `web-app` 形态的包，加入 `check:fast` 与 `requiredCommands`（见 ENG-12）：

1. 每个组件目录恰好一个 `.vue`，文件名等于目录名；
2. 子组件不得引用父级组件；
3. CSS 只能被同目录的 `.vue` 引用，全局样式只允许从 `main.ts` 引入；
4. 组件目录内的非入口文件（hook、样式、`utils/`、`components/*` 的内部文件）只能被本子树引用，子树外只能引用 `components/X/X.vue`；
5. 未被任何文件引用的孤儿组件报错（depcruise `orphan` 规则）。

子组件在语义上是否属于父组件、何时上提到 `shared/`、hook 与 `core/` 纯函数如何分工，写入应用包 AGENTS.md，由评审判断，不做机械检查。

#### Scenario: SCN-WEB-APP-004 组件树五条规则被机械执行
- **WHEN** 对模板自身应用包运行 `check:component-tree`；另在受控临时根中分别：在一个组件目录放入两个 `.vue`；让 `.vue` 文件名与目录名不一致；让子组件引用父级组件；让另一目录的 `.vue` 引用某组件的 CSS；在 `main.ts` 之外引入全局样式；让子树外的文件引用某组件的 hook、`utils/` 文件或 `components/X/` 下的非入口文件；放入一个未被任何文件引用的组件；随后恢复合法输入
- **THEN** 模板自身应用包通过；每个反例都使 `check:component-tree` 非零退出并指出文件与违反的规则编号；子树外引用 `components/X/X.vue` 不被拒绝；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "single-vue-named": "组件目录恰好一个 .vue 且文件名等于目录名，否则被拒绝",
    "no-parent-import": "子组件引用父级组件被拒绝",
    "css-locality": "CSS 只能被同目录 .vue 引用，全局样式只允许从 main.ts 引入",
    "subtree-privacy": "组件目录内的非入口文件只能被本子树引用，子树外只能引用 components/X/X.vue",
    "orphan-rejected": "未被任何文件引用的孤儿组件被拒绝",
    "tree-violation-located": "违反时非零退出并指出文件与规则编号",
    "tree-restorable": "模板自身应用包通过，恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "component-tree-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["single-vue-named", "no-parent-import", "css-locality", "subtree-privacy", "orphan-rejected", "tree-violation-located"]},
    {"key": "component-tree-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["single-vue-named", "no-parent-import", "css-locality", "subtree-privacy", "orphan-rejected", "tree-violation-located", "tree-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEB-04 状态分层与全局 store 约束

应用包的状态 SHALL 按"谁读、谁写"（不看谁触发）分为三层，并写入应用包 AGENTS.md：组件状态（只有一个组件读写，放组件自身）、模块状态（同模块多个组件读写、其他模块不读，放模块根组件，经 props/emit 或 provide/inject 下传）、全局状态（两个及以上模块读，或由全局流程处理，放 `store/` 中唯一的全局 store）。一份响应中有任何字段需跨模块使用时，整份快照进全局 store。

全局 store MUST 满足：

- 唯一一个 setup store；规模超过行数上限时拆成多个切片函数，在同一个 `defineStore` 中组合，不拆成多个 store；
- 对外只暴露 `readonly()` 状态与 action，组件对 store 状态的写入在类型层面报错；
- lint 兜底：禁止组件中对 `*Store` 的属性赋值、调用 `$patch`、访问 `$state`、给 store 起别名、`Object.assign(<store>…)`；store 变量名以 `Store` 结尾，组合式函数命名为 `use<X>Store`；
- 异步结果带代际号，过期结果丢弃；导航时以 AbortSignal 取消旧请求；
- 协调逻辑拆到 `core/` 纯函数，store 只负责组合并持有状态；
- 每个 action SHALL 有"写入审计测试"：调用前后对全局状态取快照，断言变化的键恰好等于该 action 的写入清单。

写入审计、代际丢弃与导航取消的行为证据由 Web 示例承担（见 WEX-03），本要求只约束机械可查的类型与 lint 兜底，使删除示例后证据仍然成立。

#### Scenario: SCN-WEB-APP-005 组件写入全局 store 在类型与 lint 两层被拦截
- **WHEN** 在受控临时根中的组件内分别：直接给 store 的状态属性赋值；调用 `$patch`；读写 `$state`；把 store 赋给另一个变量后再赋值；`Object.assign(<store>, …)`；以不以 `Store` 结尾的变量名持有 store；以不符合 `use<X>Store` 的名称定义组合式函数；随后恢复合法输入。另读取模板自身全局 store 模块
- **THEN** 直接赋值与别名赋值因 `readonly()` 暴露使 `typecheck` 非零退出；赋值、`$patch`、`$state`、别名、`Object.assign` 与命名违规都使 lint 非零退出并指出文件与规则；模板自身的全局 store 是唯一的 setup store，对外只暴露 `readonly()` 状态与 action；恢复后两项检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "readonly-type-rejects": "组件对 store 状态的直接赋值与经别名赋值在 typecheck 中报错",
    "lint-backstop": "赋值、$patch、$state、别名、Object.assign 被 lint 拒绝并指出文件与规则",
    "store-naming": "store 变量名以 Store 结尾、组合式函数命名 use<X>Store，违反被 lint 拒绝",
    "single-readonly-store": "模板自身全局 store 是唯一的 setup store，对外只暴露 readonly 状态与 action",
    "store-guard-restorable": "恢复合法输入后 typecheck 与 lint 通过"
  },
  "cases": [
    {"key": "store-lint-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["lint-backstop", "store-naming"]},
    {"key": "store-exposure-fact", "kind": "engineering", "requiredIn": ["integration"], "checks": ["single-readonly-store"]},
    {"key": "store-guard-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["readonly-type-rejects", "lint-backstop", "store-naming", "store-guard-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEB-05 应用包依赖方向

应用包的依赖方向 SHALL 由 dependency-cruiser 规则执行，规则中的路径 MUST 由清单与组合绑定生成（应用包目录、绑定的协议包、全局 store 入口），不在配置中写死：

- `ui-no-adapters-no-protocol`：`ui/` 不得引用 `adapters/` 与协议包；
- `core-no-ui-no-framework`：`core/`、`ports/`、`runtime/` 不得引用 `ui/`、Vue、Pinia 与 `.vue`；
- `domain-isolation`：业务模块之间不得互相引用；`app/` 作为装配层豁免；各模块可共同引用 `runtime/`、`shared/`、`store/` 与消费接口声明；
- `shared-no-store-no-adapters`：`shared/` 不得引用 `store/` 与 `adapters/`。

测试文件模式 MUST 统一为 `[.](test|spec)[.]ts$`。

#### Scenario: SCN-WEB-APP-006 依赖方向违规被拒绝
- **WHEN** 对模板自身应用包运行架构检查；另在受控临时根中分别：让 `ui/` 引用 `adapters/` 或协议包；让 `core/`、`ports/`、`runtime/` 引用 `ui/`、`vue`、`pinia` 或 `.vue`；让一个业务模块引用另一业务模块；让 `app/` 同时引用两个业务模块；让两个模块共同引用 `runtime/`、`shared/`、`store/` 与消费接口声明；让 `shared/` 引用 `store/` 或 `adapters/`；放入 `*.spec.ts` 与 `*.test.ts` 测试文件引用被限制的目标；修改清单中的应用包目录或绑定的协议包后重新生成规则；随后恢复合法输入
- **THEN** 模板自身应用包通过；每个违规都使架构检查非零退出并指出规则名与依赖边；`app/` 的引用与对共享目录的共同引用不被拒绝；两种测试文件后缀被同样排除；规则路径随清单变化；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "ui-boundary": "ui/ 引用 adapters/ 或协议包被拒绝",
    "core-framework-free": "core/、ports/、runtime/ 引用 ui/、Vue、Pinia 或 .vue 被拒绝",
    "domain-isolation": "业务模块互相引用被拒绝，app/ 豁免，共享目录与消费接口声明可共同引用",
    "shared-boundary": "shared/ 引用 store/ 或 adapters/ 被拒绝",
    "test-pattern-unified": "测试文件模式统一为 [.](test|spec)[.]ts$",
    "rules-from-manifest": "规则路径由清单与绑定生成，随清单变化",
    "dependency-restorable": "模板自身应用包通过，恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "dependency-rule-generation", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["rules-from-manifest", "test-pattern-unified", "domain-isolation"]},
    {"key": "dependency-direction-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["ui-boundary", "core-framework-free", "domain-isolation", "shared-boundary", "test-pattern-unified", "rules-from-manifest", "dependency-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEB-06 核心层 DOM 禁令与部署配置读取

- `tsconfig.core.json` SHALL 设 `lib: ["ES2022"]`、`types: []`，其 `include` 由清单生成，范围为 `runtime/`、各模块 `core/` 与 `ports/`、全局 store；在该范围内引用 DOM 类型或全局 MUST 在类型检查中报错。ESLint 对同一范围 SHALL 以 `no-restricted-globals` 禁止 DOM 全局。
- `import.meta.env` MUST 只出现在 `src/main.ts`，并且只能以"整体传给纯函数"的形式出现（例如 `apiBaseUrl(import.meta.env)`）；该约束由 ESLint 选择器实现。产品代码 SHALL NOT 含 Mock 分支。

#### Scenario: SCN-WEB-APP-007 核心层使用 DOM 被类型与 lint 拒绝
- **WHEN** 读取模板自身 `tsconfig.core.json` 与其生成来源；另在受控临时根中分别在 `runtime/`、某模块 `core/` 与 `ports/`、全局 store 中引用 `document`、`window` 或 DOM 类型；在模块 `ui/` 中引用同样的 DOM 全局；在清单中修改全局 store 路径后重新生成；随后恢复合法输入
- **THEN** `tsconfig.core.json` 的 `lib` 为 `["ES2022"]`、`types` 为空，`include` 与清单生成结果一致并随清单变化；核心范围内的 DOM 引用同时使 `typecheck` 与 lint 非零退出并指出文件；`ui/` 中的引用不被拒绝；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "core-tsconfig-derived": "tsconfig.core.json 的 lib 为 ES2022、types 为空，include 由清单生成并随清单变化",
    "core-dom-type-rejected": "核心范围内引用 DOM 类型或全局使 typecheck 非零退出",
    "core-dom-lint-rejected": "核心范围内引用 DOM 全局被 no-restricted-globals 拒绝，ui/ 不受限",
    "core-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "core-scope-generation", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["core-tsconfig-derived"]},
    {"key": "core-dom-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["core-tsconfig-derived", "core-dom-type-rejected", "core-dom-lint-rejected", "core-restorable"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-APP-008 部署配置只在装配入口整体读取
- **WHEN** 在受控临时根中分别：在 `main.ts` 中以 `apiBaseUrl(import.meta.env)` 形式读取；在 `main.ts` 中读取 `import.meta.env.VITE_API_BASE` 单个属性；在 `app/`、模块或 `shared/` 文件中出现 `import.meta.env`；随后恢复合法输入
- **THEN** 只有 `main.ts` 中整体传给函数的形式通过；读取单个属性与在其他文件中出现 `import.meta.env` 都使 lint 非零退出并指出文件与位置；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "env-whole-in-main": "main.ts 中把 import.meta.env 整体传给纯函数的形式通过",
    "env-elsewhere-rejected": "读取单个属性或在 main.ts 之外出现 import.meta.env 被 lint 拒绝并指出位置",
    "env-restorable": "恢复合法输入后 lint 通过"
  },
  "cases": [
    {"key": "env-selector-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["env-whole-in-main", "env-elsewhere-rejected"]},
    {"key": "env-lint-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["env-whole-in-main", "env-elsewhere-rejected", "env-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEB-07 应用包的 lint 配置与覆盖率纪律

- ESLint SHALL 沿用模板根配置的 `defineConfig` 加 typescript-eslint，并加入 `eslint-plugin-vue` 的 flat 配置；MUST NOT 引入 `@vue/eslint-config-typescript`。
- `vue/multi-word-component-names` 的例外 MUST 登记在清单 `manifest.quality.componentNameExemptions` 中（与 `manifest.quality.maxLinesExemptions` 同一机制，每项给出路径与非空理由），ESLint 配置从清单读取，不得在配置中写死文件名。
- 应用包 `src/` 下 MUST NOT 出现覆盖率忽略注释（`v8 ignore`、`istanbul ignore`、`c8 ignore`），由 lint 拒绝；Vue 结构上不可达的分支 SHALL 改写结构（如可辨识联合收窄）或抽成纯函数，保持 100% 覆盖率；唯一合法的排除通道是 `manifest.quality.coverageExclusions`。

#### Scenario: SCN-WEB-APP-009 覆盖率忽略注释与未登记的组件命名例外被拒绝
- **WHEN** 读取模板自身 ESLint 配置与根 `package.json` 依赖；另在受控临时根中分别：在应用包 `src/` 的 `.ts` 与 `.vue` 文件中各放入 `v8 ignore`、`istanbul ignore`、`c8 ignore` 注释；放入一个单词名组件且不登记例外；在清单中登记该组件例外；登记一项缺少理由的例外；在 ESLint 配置中直接写死例外文件名；随后恢复合法输入
- **THEN** ESLint 配置包含 `eslint-plugin-vue` 的 flat 配置，依赖中没有 `@vue/eslint-config-typescript`，multi-word 例外来自清单；每种覆盖率忽略注释都使 lint 非零退出并指出文件；未登记的单词名组件被拒绝，登记后通过，缺少理由的例外被清单 schema 拒绝；配置中写死的例外被检查指出；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "vue-flat-config": "ESLint 使用 defineConfig、typescript-eslint 与 eslint-plugin-vue 的 flat 配置，不引入 @vue/eslint-config-typescript",
    "coverage-ignore-banned": "应用包 src/ 下 .ts 与 .vue 中的 v8、istanbul、c8 忽略注释被 lint 拒绝并指出文件",
    "multi-word-by-manifest": "multi-word 例外只来自清单登记且必须带理由，配置中写死的例外被指出",
    "lint-discipline-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "lint-config-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["vue-flat-config", "coverage-ignore-banned", "multi-word-by-manifest"]},
    {"key": "lint-discipline-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["vue-flat-config", "coverage-ignore-banned", "multi-word-by-manifest", "lint-discipline-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEB-08 应用包测试环境与覆盖完整性

- 应用包单测项目 `app-unit` 的默认环境 SHALL 为 jsdom；store 与 `core/` 的单测以 `// @vitest-environment node` 运行。
- Vitest 项目的 `root` MUST 固定在仓库根，`.vue` 文件计入覆盖率统计（手写源码清单的 `code` 类加入 `.vue`）。一个未被任何测试导入的 `.vue` MUST 拉低覆盖率，并被 `check:coverage` 报出。
- 装配入口 `src/main.ts` SHALL 计入覆盖率：测试中以动态 `import('../main.ts')` 执行入口。

#### Scenario: SCN-WEB-APP-010 未被测试导入的 .vue 被覆盖率门禁报出
- **WHEN** 读取 `app-unit` 的 Vitest 项目配置；另在受控临时根中放入一个未被任何测试导入的 `.vue` 组件，运行单测与 `check:coverage`；随后删除该组件
- **THEN** 项目 `root` 为仓库根、默认环境为 jsdom；未被导入的 `.vue` 出现在覆盖率统计中并使覆盖率低于阈值，`check:coverage` 非零退出并指出该文件；删除后两项检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "vitest-root-fixed": "app-unit 的 root 为仓库根，默认环境为 jsdom",
    "untested-vue-reported": "未被测试导入的 .vue 拉低覆盖率并被 check:coverage 指出",
    "coverage-restorable": "删除反例后单测与 check:coverage 通过"
  },
  "cases": [
    {"key": "vitest-project-config", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["vitest-root-fixed"]},
    {"key": "untested-vue-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["vitest-root-fixed", "untested-vue-reported", "coverage-restorable"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-APP-011 装配入口计入覆盖率
- **WHEN** 在 `app-unit` 中以动态 `import('../main.ts')` 执行装配入口，挂载点存在
- **THEN** 应用挂载完成，入口把 `import.meta.env` 整体交给纯函数得到的配置用于装配；`main.ts` 出现在覆盖率报告中且达到覆盖率阈值。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "entry-mounts": "动态导入 main.ts 后应用完成挂载，部署配置经纯函数整体解析后用于装配",
    "entry-covered": "main.ts 出现在覆盖率报告中并达到阈值"
  },
  "cases": [
    {"key": "main-entry", "kind": "module", "requiredIn": ["app-unit"], "checks": ["entry-mounts", "entry-covered"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEB-09 Web 产物边界检查

`web-app` 形态的产物检查 SHALL 为 `pnpm check:bundle`（`sdk` 形态仍为 `check:package`；两者按形态选择、无对应形态时通过，见 ENG-12），规则如下：

- **模块清单**：构建时由放在 `scripts/lib/vite-plugins/` 的 Vite 插件写出模块清单（模块来源路径、产物文件及其 sha256、产品摘要），位置为 `artifacts/build/<产品目录>/bundle-manifest.json`，MUST 位于 `dist/` 之外，部署无需删除文件，源码路径不随产物公开；插件不放在产品包内。
- **测试设施不得进入产物**：按模块来源路径判定，范围由清单生成（test 角色包、协议包 `testing/`、Fixture 根），MUST NOT 使用子串匹配。
- **协议 bundle 不得进入产物**：协议包的契约文件与 bundle 后的契约 JSON 不得出现在模块清单中。
- **模块与摘要对账**：产物模块 MUST 全部来自手写源码清单或依赖；模块清单为空即失败。
- **入口与资源**：入口模块必须在模块清单中；资源路径必须是相对路径（`base: './'`）。
- **样式残留**：编译后的 CSS 不得残留 `:deep(`、`:slotted(`、`:global(`。
- **产物新鲜度**：模块清单记录"产品摘要"，范围是产品包源码、其绑定协议包源码与 `buildInputs`，不含测试与门禁脚本，只修改用例、Fixture 或门禁脚本不使产物过期；`buildInputs` 的通配 MUST NOT 匹配被 `.gitignore` 忽略的文件（如 `.env.local`）。浏览器宿主启动时按同一口径校验（见 BRW-04）。

任一规则违反 SHALL 使 `check:bundle` 非零退出并指出规则与模块或文件。

#### Scenario: SCN-WEB-APP-012 模块清单写在部署目录之外并与源码对账
- **WHEN** 构建模板自身应用包并运行 `check:bundle`；另在受控临时根中分别：让模块清单为空；让产物包含一个既不在手写源码清单也不是依赖的模块；从模块清单中移除入口模块；把 `base` 改为绝对路径；随后恢复合法输入
- **THEN** 模块清单位于 `artifacts/build/<产品目录>/bundle-manifest.json`，`dist/` 中没有模块清单或源码路径；模板自身通过；每个反例都使 `check:bundle` 非零退出并指出规则与模块；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "manifest-outside-dist": "模块清单写到 artifacts/build/<产品目录>/ 下，dist/ 中不含模块清单与源码路径",
    "modules-reconciled": "产物模块全部来自手写源码清单或依赖，模块清单为空即失败",
    "entry-and-relative-assets": "入口模块在清单中，资源路径为相对路径",
    "bundle-violation-located": "违反时非零退出并指出规则与模块或文件",
    "bundle-restorable": "模板自身通过，恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "bundle-reconcile-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["modules-reconciled", "entry-and-relative-assets", "bundle-violation-located"]},
    {"key": "bundle-manifest-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["manifest-outside-dist", "modules-reconciled", "entry-and-relative-assets", "bundle-violation-located", "bundle-restorable"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-APP-013 测试设施、契约与样式残留不得进入产物
- **WHEN** 在受控临时根中分别：让应用包导入 test 角色包中的模块、协议包 `testing/` 下的模块、Fixture 根下的文件；导入协议包契约文件或 bundle 后的契约 JSON；放入一个来源路径不属于测试设施、但路径或名称含 `shadow` 等字样的产品模块；在组件样式中写出未被编译掉的 `:deep(`、`:slotted(`、`:global(`；随后恢复合法输入
- **THEN** 测试设施、契约文件与契约 JSON 的进入都使 `check:bundle` 非零退出并指出模块来源路径；名称含 `shadow` 的产品模块不被误判；编译后 CSS 中残留的每种伪选择器都被拒绝并指出产物文件；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "test-infra-by-source": "按清单生成的范围以模块来源路径判定测试设施进入产物，不使用子串匹配，名称含 shadow 的产品模块不被误判",
    "contract-excluded": "协议包契约文件与 bundle 后的契约 JSON 进入产物被拒绝",
    "css-residue-rejected": "编译后 CSS 残留 :deep(、:slotted(、:global( 被拒绝并指出产物文件",
    "boundary-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "bundle-boundary-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["test-infra-by-source", "contract-excluded", "css-residue-rejected"]},
    {"key": "bundle-boundary-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["test-infra-by-source", "contract-excluded", "css-residue-rejected", "boundary-restorable"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-APP-014 产品摘要只随产物输入变化
- **WHEN** 构建应用包后分别：修改一个测试文件或门禁脚本；修改应用包源码；修改绑定协议包源码；修改一个 `buildInputs` 登记的文件；新增一个被 `.gitignore` 忽略、但匹配 `buildInputs` 通配的文件（如 `.env.local`）；每次修改后重新计算产品摘要并与模块清单比对
- **THEN** 修改测试文件、门禁脚本或新增被忽略的文件不改变产品摘要；修改应用包源码、协议包源码或 `buildInputs` 文件使摘要与模块清单不一致，`check:bundle` 报产物过期。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "digest-scope": "产品摘要只覆盖产品包源码、绑定协议包源码与 buildInputs，不含测试与门禁脚本",
    "ignored-inputs-excluded": "buildInputs 通配不匹配被 .gitignore 忽略的文件",
    "stale-bundle-reported": "产物输入变化后摘要与模块清单不一致并被报出过期"
  },
  "cases": [
    {"key": "digest-scope-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["digest-scope", "ignored-inputs-excluded"]},
    {"key": "bundle-freshness-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["digest-scope", "ignored-inputs-excluded", "stale-bundle-reported"]}
  ],
  "blockedBy": []
}
```

