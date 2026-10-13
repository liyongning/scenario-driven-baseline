# `@daqian/template-web` Agent 入口

## 模板通用规则

### 必读

- [根 AGENTS](../../AGENTS.md)、[有效能力 Spec](../../openspec/specs/)、[仓库与跨仓库参考](../../README.md)、[模板使用指南](../../docs/template-guide.md)。

### Web 应用分层

`src/` 按职责分层，依赖方向由根 `.dependency-cruiser.cjs` 与 `scripts/check-component-tree.ts` 复核。

- `main.ts` 是唯一装配入口，也是唯一读取 `import.meta.env` 的位置；配置必须整体交给纯函数解析，产品代码不得保留 Mock 分支。
- `app/` 负责组装 store、端口实现与模块根组件；`app/platform/` 放跨模块平台适配器，业务模块不得自行读取宿主全局。
- `runtime/` 只放不依赖 Vue/DOM 的纯逻辑与运行辅助，其端口放在 `runtime/ports/`，不得引用业务模块端口。
- 业务模块采用 `ui/<Root>/`、`core/`、`ports/`、`adapters/`；UI 不引用协议包或适配器，核心与端口不引用 Vue、Pinia、DOM 或 UI，模块之间不得互相引用。
- `shared/` 只放跨模块共享代码，不引用全局 store 或业务适配器；`store/` 是由清单 `globalStore` 指向的唯一全局 setup store。

### 状态与组件树

状态按“谁读、谁写”分层：组件状态留在组件自身，模块状态留在模块根并由 props/emit 或 provide/inject 下传，跨模块状态放入全局 store。响应快照只要跨模块使用，整份快照进入全局 store。

- 全局 store 对外只暴露 `readonly()` 状态与 action；组件不得写状态、调用 `$patch`、访问 `$state`、给 store 起别名或用 `Object.assign` 绕过只读类型。
- 组件目录以 `<Name>/<Name>.vue` 为入口，样式用 `<style scoped src="./<Name>.css"></style>` 就近引入；子组件放在 `components/<Child>/`，子树外只能引用入口组件。
- `check:component-tree` 机械检查入口唯一性、父组件反向引用、CSS 就近性、子树私有性和孤儿组件；语义归属由评审判断。

### 测试与不可达分支

- `app-unit` 默认使用 jsdom，`store/` 与 `core/` 测试使用 node 环境；`main.ts` 通过动态导入计入覆盖率。
- 产品 `src/` 禁止 `v8 ignore`、`istanbul ignore`、`c8 ignore`；不可达分支应按可辨识联合收窄或抽成纯函数，而不是添加覆盖率忽略。
- 新增手写类型、字段、状态值和关键映射必须带中文 JSDoc，并同步相关 Spec 与测试。

### 子模块

- `packages/web/src/app`：应用装配与跨模块平台适配器。
- `packages/web/src/runtime`：不依赖 Vue/DOM 的运行辅助与端口。
- `packages/web/src/shared`：跨模块共享组件、组合式函数与纯工具。
- `packages/web/src/store`：唯一全局 setup store。

<!-- web-example:begin -->

- `packages/web/src/__tests__`：Web 包内测试支撑。
- `packages/web/src/trade-create`：创建交易的示例模块。
- `packages/web/src/trade-list`：交易列表的示例模块。
- `packages/web/src/trade-status`：交易状态的示例模块。

<!-- web-example:end -->
