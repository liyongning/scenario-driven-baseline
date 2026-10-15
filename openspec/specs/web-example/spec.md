# web-example Specification

## Purpose
TBD - created by archiving change template-web-absorption. Update Purpose after archive.
## Requirements
### Requirement: WEX-01 示例页面的交易功能

Web 示例 SHALL 在应用包 `packages/web`（`@daqian/template-web`）中提供一个页面，使用模板初始产品契约 `packages/openapi/contracts/trade-v1.yaml` 中的 createTrade、getTrade、listTrades 三个接口（不消费 `x-implemented: false` 的 cancelTrade），经绑定的 OpenAPI 协议包执行器（`client.request(<描述常量>, input, ctx)`）发出请求，页面包含：

- **创建交易表单**：提交时调用 `createTrade`（`POST /api/v1/trades`），成功后把返回的交易作为当前交易；
- **交易状态**：以当前交易的 `trade_no` 调用 `getTrade`（`GET /api/v1/trades/{trade_no}`）轮询，直到状态为终态后停止轮询，并展示终态；
- **交易列表**：调用匿名接口 `listTrades`（`GET /api/v1/merchants/{merchant_id}/trades`）展示交易。

结果呈现规则：

- 业务失败按业务码映射为示例的结果类别并在页面上呈现，映射表以 `satisfies Record<OperationCodes<'x'>, Outcome>` 在编译期穷尽每个接口的业务码；
- 传输失败以 `shared/components/` 中的加载失败组件呈现，请求进行中以加载中组件呈现；
- 示例不自动重放失败的请求。

页面所需的身份 token 与 `merchant_id` SHALL 由装配层的平台适配器（`src/app/platform/`）从页面 URL 查询参数 `?token=…&merchant=…` 读取，经端口注入模块；用例与本地预览通过 URL 传入，产品代码不读取环境变量以外的部署配置（`import.meta.env` 的约束见 WEB-06）。

产品代码统一请求同源 `/api`，不感知测试、本地预览或开发代理模式，不含 Mock 分支。浏览器证据由 `browser` 项目经应用宿主（`vite preview` 托管产品 `dist`，同源 `/api` 代理到当次 Shadow，见 BRW-02）取得。请求的路径参数编码、身份头名映射、`X-Request-Id` 格式等协议义务的证据由 OAS-05 的协议矩阵承担，本能力的 Scenario 只验证页面行为。

#### Scenario: SCN-WEB-EXAMPLE-001 提交创建表单后展示当前交易
- **WHEN** 以带 `?token=<t>&merchant=<m>` 的地址在浏览器中打开示例页面，填写合法表单并提交，Shadow 对 `createTrade` 返回成功；另在 `app-unit` 中以不同查询参数驱动装配层平台适配器
- **THEN** 页面打开时不发出 `createTrade`；提交后恰好发出一次 `POST /api/v1/trades`，请求体与表单输入一致，身份头的值为 URL 中的 token；页面以返回的交易作为当前交易并展示其交易号与初始状态；平台适配器从 URL 查询参数读出 token 与 `merchant_id` 并经端口注入。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "single-create": "提交前不发请求，提交后恰好发出一次 POST /api/v1/trades，请求体与表单输入一致",
    "token-from-url": "身份 token 由装配层平台适配器从 URL 查询参数 token 读取并经端口注入，请求身份头的值等于该 token",
    "current-trade-shown": "页面以创建返回的交易作为当前交易并展示交易号与初始状态"
  },
  "cases": [
    {"key": "create-form", "kind": "module", "requiredIn": ["app-unit"], "checks": ["single-create", "token-from-url", "current-trade-shown"]},
    {"key": "create-in-browser", "kind": "behavior", "requiredIn": ["browser"], "checks": ["single-create", "token-from-url", "current-trade-shown"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-EXAMPLE-002 交易状态轮询到终态后停止
- **WHEN** 当前交易已存在，Shadow 对 `getTrade` 以有界轮询先返回非终态、再返回终态
- **THEN** 页面以当前交易的 `trade_no` 请求 `GET /api/v1/trades/{trade_no}`；非终态期间展示进行中状态；收到终态后展示终态并停止轮询，此后不再发出 `getTrade`；`verify()` 无问题。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "poll-uses-trade-no": "轮询请求使用当前交易的 trade_no 作为路径参数",
    "pending-shown": "非终态期间页面展示进行中状态",
    "terminal-stops": "收到终态后展示终态并停止轮询，之后不再发出 getTrade，verify 无问题"
  },
  "cases": [
    {"key": "status-view", "kind": "module", "requiredIn": ["app-unit"], "checks": ["pending-shown", "terminal-stops"]},
    {"key": "poll-in-browser", "kind": "behavior", "requiredIn": ["browser"], "checks": ["poll-uses-trade-no", "pending-shown", "terminal-stops"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-EXAMPLE-003 交易列表按 URL 中的商户加载
- **WHEN** 以带 `?token=<t>&merchant=<m>` 的地址打开交易列表，Shadow 对 `listTrades` 返回包含若干交易的列表
- **THEN** 页面以 URL 中的 `merchant` 作为 `merchant_id` 请求 `GET /api/v1/merchants/{merchant_id}/trades`；列表展示返回的每一条交易；加载期间展示共享的加载中组件。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "merchant-from-url": "列表请求的 merchant_id 来自 URL 查询参数 merchant，经装配层平台适配器注入",
    "list-rendered": "列表展示返回的每条交易，加载期间展示共享加载中组件"
  },
  "cases": [
    {"key": "list-view", "kind": "module", "requiredIn": ["app-unit"], "checks": ["merchant-from-url", "list-rendered"]},
    {"key": "list-in-browser", "kind": "behavior", "requiredIn": ["browser"], "checks": ["merchant-from-url", "list-rendered"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-EXAMPLE-004 业务失败按业务码呈现
- **WHEN** 提交创建表单，Shadow 对 `createTrade` 分别返回该接口的特有业务码、冲突码（其 data 为 oneOf 的另一分支）与一个通用业务码
- **THEN** 每次恰好发出一次创建请求，不自动重放；页面按业务码映射表呈现对应的结果类别；不把失败的结果设为当前交易，也不发出 `getTrade`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "code-outcome-shown": "特有码、冲突码与通用码分别按业务码映射表呈现对应结果类别",
    "failure-no-follow-up": "业务失败时恰好一次创建请求、不重放，不设当前交易、不发出 getTrade"
  },
  "cases": [
    {"key": "code-outcomes", "kind": "module", "requiredIn": ["app-unit"], "checks": ["code-outcome-shown", "failure-no-follow-up"]},
    {"key": "business-failure-in-browser", "kind": "behavior", "requiredIn": ["browser"], "checks": ["code-outcome-shown", "failure-no-follow-up"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-EXAMPLE-005 传输失败以共享加载失败组件呈现
- **WHEN** 加载交易列表时，Shadow 对 `listTrades` 使用 `partial-then-disconnect` 故障
- **THEN** 页面展示 `shared/components/` 中的加载失败组件；Shadow 恰好记录一次 `listTrades` 请求，示例没有自动重放。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "failure-component-shown": "传输失败时页面展示共享的加载失败组件",
    "no-replay": "Shadow 恰好记录一次请求，示例没有自动重放"
  },
  "cases": [
    {"key": "transport-failure-view", "kind": "module", "requiredIn": ["app-unit"], "checks": ["failure-component-shown"]},
    {"key": "transport-failure-in-browser", "kind": "behavior", "requiredIn": ["browser"], "checks": ["failure-component-shown", "no-replay"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-02 示例的必需浏览器流程

示例 SHALL 登记下表中的必需流程。FLOW case 要在所列环境中，从打开页面开始在同一次运行里连续执行完规定阶段，并验证调用顺序、跨阶段的数据关联和最终结果。单个 Scenario 全部通过，不能代替流程贯通；不同测试的阶段证据不能拼成一个 FLOW case。

| FLOW ID | 关联 Scenario | 公共入口与连续阶段/检查点 | 必需 case key | 必需环境 | 输入及验证说明 |
| --- | --- | --- | --- | --- | --- |
| FLOW-WEB-EXAMPLE-001 | SCN-WEB-EXAMPLE-001、SCN-WEB-EXAMPLE-002、SCN-WEB-EXAMPLE-003、SCN-WEB-EXAMPLE-006 | 打开页面 → 提交创建表单 → createTrade → getTrade 轮询（非终态 → 终态）→ 停止轮询 → listTrades → 列表中可见新交易；trade_no 贯通各阶段，调用顺序和次数一致 | normal | browser | 同一次连续运行完成全部阶段，不拼接不同测试的证据；Fixture 编排状态推进与列表内容；页面经应用宿主同源 /api 访问 Shadow |

#### Scenario: SCN-WEB-EXAMPLE-006 创建到列表可见的连续流程
- **WHEN** 在同一次浏览器运行中打开页面、提交创建表单，Shadow 对 `createTrade` 返回成功，对 `getTrade` 先返回非终态再返回终态，对 `listTrades` 返回包含该交易的列表
- **THEN** 打开页面时不发出写请求；依次发出 `createTrade`、若干次 `getTrade`、`listTrades`，顺序与次数与 Fixture 编排一致；`getTrade` 使用创建返回的 `trade_no`；终态后停止轮询；列表中可见该交易及其终态；整个过程由同一个 FLOW case 连续证明。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "stage-order": "先创建、再轮询、后列表，调用顺序与次数与 Fixture 编排一致，打开页面不发写请求",
    "trade-no-continuity": "getTrade 使用创建返回的 trade_no，列表中可见同一交易",
    "terminal-visible": "终态后停止轮询，页面与列表展示该交易的终态"
  },
  "cases": [
    {"key": "normal", "kind": "behavior", "requiredIn": ["browser"], "checks": ["stage-order", "trade-no-continuity", "terminal-visible"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-03 示例的状态分层示范

示例 SHALL 各示范一处三层状态，并遵守 WEB-04 的全局 store 约束：

- **全局状态**：当前交易及其状态，放在唯一的全局 store 中，由交易状态与交易列表两个模块共读；
- **模块状态**：创建表单的草稿，放在创建模块的根组件，经 props/emit 或 provide/inject 下传；
- **组件状态**：输入框焦点，只在输入组件内部。

全局 store 的每个 action SHALL 有写入审计测试：调用前后对全局状态取快照，断言变化的键恰好等于该 action 的写入清单。异步 action 的结果带代际号，过期结果丢弃；导航时旧请求的 AbortSignal 被触发。store 与 `core/` 的单测以 `// @vitest-environment node` 运行。

#### Scenario: SCN-WEB-EXAMPLE-007 三层状态各在其位且 store 写入可审计
- **WHEN** 在 `app-unit` 中：对全局 store 的每个 action 运行写入审计；让一个 action 写入清单之外的键；对同一异步 action 先后发起两次调用并让第一次结果晚到；在第一次调用进行中发生导航；挂载创建模块并修改表单草稿与输入焦点后，读取全局 store 快照；挂载交易状态与交易列表两个模块，读取当前交易
- **THEN** 每个 action 前后变化的键恰好等于其写入清单，写入清单之外的键使审计失败并指出 action 与键；晚到的旧代际结果被丢弃；导航时旧请求的 AbortSignal 被触发；表单草稿与输入焦点不出现在全局 store 中，草稿由模块根组件持有；两个模块读到同一份当前交易。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "write-audit-exact": "每个 action 前后变化的键恰好等于其写入清单",
    "write-audit-catches-extra": "写入清单之外的键使审计失败并指出 action 与键",
    "stale-generation-dropped": "旧代际的异步结果被丢弃，状态只反映最新调用",
    "navigation-aborts": "导航时旧请求的 AbortSignal 被触发",
    "layers-placed": "表单草稿由模块根组件持有、输入焦点留在组件内，两者都不进入全局 store",
    "global-shared-read": "交易状态与交易列表两个模块读到同一份当前交易"
  },
  "cases": [
    {"key": "store-write-audit", "kind": "module", "requiredIn": ["app-unit"], "checks": ["write-audit-exact", "write-audit-catches-extra"]},
    {"key": "store-generation", "kind": "module", "requiredIn": ["app-unit"], "checks": ["stale-generation-dropped", "navigation-aborts"]},
    {"key": "state-layers", "kind": "module", "requiredIn": ["app-unit"], "checks": ["layers-placed", "global-shared-read"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-04 示例的组件树与共享区

示例 SHALL 示范两级 `components/` 嵌套（模块根组件 → 子组件 → 孙组件），组件样式以 `<style scoped src>` 引入独立 CSS，hook 命名为 `use<Name>.ts`；`shared/components/` SHALL 提供加载中与加载失败两个共享组件，内部同样使用组件树结构，被至少两个模块使用。示例 MUST 通过 `check:component-tree`（WEB-03）与依赖方向检查（WEB-05）。

#### Scenario: SCN-WEB-EXAMPLE-008 示例组件树与共享组件
- **WHEN** 对示例运行 `check:component-tree` 与架构检查，读取示例组件目录；在 `app-unit` 中挂载加载中与加载失败组件，并挂载一个使用 `<style scoped src>` 的组件
- **THEN** 两项检查通过；示例中存在两级 `components/` 嵌套；加载中与加载失败组件位于 `shared/components/` 并被至少两个模块引用；组件渲染出各自的状态内容，scoped 样式生效。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "two-level-tree": "示例存在模块根组件到孙组件的两级 components/ 嵌套，并通过 check:component-tree 与架构检查",
    "shared-components-used": "加载中与加载失败组件位于 shared/components/ 并被至少两个模块引用",
    "components-render": "共享组件渲染各自状态内容，<style scoped src> 引入的样式生效"
  },
  "cases": [
    {"key": "component-tree-fact", "kind": "engineering", "requiredIn": ["integration"], "checks": ["two-level-tree", "shared-components-used"]},
    {"key": "shared-components", "kind": "module", "requiredIn": ["app-unit"], "checks": ["components-render"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-05 示例的运行辅助

示例 SHALL 在 `runtime/` 提供不依赖 Vue/DOM 的轮询器与代际，所需端口（时钟、可见性、取消）放在 `runtime/ports/`，实现放在 `app/platform/` 并在装配点注入；`runtime/` 不得引用业务模块的 `ports/`。轮询器的测试 MUST 用假时钟驱动，不依赖真实时间。

#### Scenario: SCN-WEB-EXAMPLE-009 假时钟驱动的轮询与取消
- **WHEN** 在 `app-unit` 中以假时钟驱动轮询器：依次推进时钟使查询返回非终态、终态；另在轮询进行中触发取消；另让旧代际的查询结果在新代际开始后才返回
- **THEN** 每次推进恰好触发一次查询；终态后不再调度查询；取消后不再查询且不再交付结果；旧代际结果被丢弃；轮询器与代际只通过 `runtime/ports/` 的端口访问时钟、可见性与取消。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "fake-clock-driven": "每次推进假时钟恰好触发一次查询，终态后不再调度",
    "cancel-stops": "取消后不再查询且不再交付结果",
    "generation-discards": "旧代际结果在新代际开始后被丢弃",
    "runtime-ports-only": "轮询器与代际只通过 runtime/ports/ 的端口访问外部能力"
  },
  "cases": [
    {"key": "poller-fake-clock", "kind": "module", "requiredIn": ["app-unit"], "checks": ["fake-clock-driven", "cancel-stops", "generation-discards", "runtime-ports-only"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-06 示例的消费接口、业务码完备性与不可达分支写法

- 示例 SHALL 在 `src/app/consumed-operations.ts` 中声明消费的 createTrade、getTrade、listTrades 三个接口（元素为 `{ method: <描述常量>, requestFields }`，规则见 OAS-05），示例条目以 `// web-example:begin` 与 `// web-example:end` 包裹；cancelTrade 不在声明中。
- 业务码映射表 SHALL 用 `satisfies Record<OperationCodes<'x'>, Outcome>` 在编译期穷尽每个消费接口的业务码（`OperationCodes` 的类型证据见 OAS-05），并有单测与契约对账：映射表的键集合等于契约中该接口 `x-business-codes` 与通用码的并集。
- 示例 SHALL 包含一个"不可达分支改写"的正例：原本只能用覆盖率忽略注释跳过的分支，改写为可辨识联合收窄或抽成纯函数，在不使用忽略注释的前提下达到 100% 覆盖。

#### Scenario: SCN-WEB-EXAMPLE-010 业务码映射与契约对账
- **WHEN** 在 `app-unit` 中对每个消费接口比对映射表键集合与契约业务码；另由工程检查读取示例源码中每个消费接口的业务码映射表
- **THEN** 每个消费接口映射表的键集合与契约中该接口业务码和通用码的并集一致；每个映射表都以 `satisfies Record<OperationCodes<'<接口 id>'>, Outcome>` 书写，没有遗漏的消费接口。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "codes-reconciled": "每个消费接口映射表的键集合等于契约中该接口业务码与通用码的并集",
    "satisfies-applied": "每个消费接口的映射表都以 satisfies Record<OperationCodes<接口 id>, Outcome> 书写，没有遗漏"
  },
  "cases": [
    {"key": "code-table-reconcile", "kind": "module", "requiredIn": ["app-unit"], "checks": ["codes-reconciled"]},
    {"key": "code-table-satisfies-fact", "kind": "engineering", "requiredIn": ["integration"], "checks": ["satisfies-applied"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-WEB-EXAMPLE-011 不可达分支改写后完整覆盖
- **WHEN** 运行 `app-unit` 覆盖率并检查示例的不可达分支改写正例
- **THEN** 正例所在文件不含覆盖率忽略注释，分支以可辨识联合收窄或纯函数表达，覆盖率达到 100%；示例未在 `manifest.quality.coverageExclusions` 中登记任何条目。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "rewrite-covered": "不可达分支改写正例不含忽略注释并达到 100% 覆盖",
    "no-exclusion-used": "示例未登记任何覆盖率排除"
  },
  "cases": [
    {"key": "unreachable-rewrite", "kind": "module", "requiredIn": ["app-unit"], "checks": ["rewrite-covered"]},
    {"key": "example-exclusion-fact", "kind": "engineering", "requiredIn": ["integration"], "checks": ["no-exclusion-used"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-07 示例的预览数据集

示例 SHALL 在 `packages/e2e/tests/fixtures/_datasets/<name>/` 提供至少两个预览数据集：交易进行中、交易已完成。数据集结构为显式的 `[{ operationId, pathParams?, responses: [{ status?, body }] }]`，数据集 manifest 声明 `protocol` 为 OpenAPI 协议包目录 `openapi`（结构与校验规则见 GATE-16）。示例数据集 MUST 通过 `check:fixtures` 的契约严格同形与业务码校验。示例只要求数据集通过校验；以数据集启动 `preview:local` 并打开页面的证据由 BRW-07 承担，本能力不重复启动 dev server。

#### Scenario: SCN-WEB-EXAMPLE-013 两个示例数据集通过契约校验
- **WHEN** 读取示例数据集目录并运行 `check:fixtures`
- **THEN** 至少存在"进行中"与"已完成"两个数据集，manifest 声明 `protocol` 为 `openapi`，条目为显式的 `operationId`、`pathParams`、`responses` 列表；两个数据集全部通过 `check:fixtures` 的严格同形与业务码校验；"进行中"数据集中 `getTrade` 的响应序列以非终态开始，"已完成"数据集中 `getTrade` 的响应为终态。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "datasets-present": "至少存在进行中与已完成两个数据集，manifest 声明 protocol 为 openapi，条目为显式 operationId、pathParams、responses 列表",
    "datasets-validated": "示例数据集全部通过 check:fixtures 的严格同形与业务码校验",
    "datasets-represent-states": "进行中数据集的 getTrade 序列以非终态开始，已完成数据集的 getTrade 响应为终态"
  },
  "cases": [
    {"key": "datasets-fact", "kind": "engineering", "requiredIn": ["integration"], "checks": ["datasets-present", "datasets-validated", "datasets-represent-states"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-08 Web 示例的删除白名单

Web 示例 SHALL 与 `template-example` 一样可按白名单删除：示例独有的整目录与整文件列入白名单；共享文件中只属于 Web 示例的片段 MUST 用成对注释包裹，代码文件写 `// web-example:begin` 与 `// web-example:end`，Markdown 写 `<!-- web-example:begin -->` 与 `<!-- web-example:end -->`。架构检查 MUST 校验 `web-example` 标记成对出现、不嵌套，未闭合、多余结束标记或嵌套时非零退出并指出文件与行号。

白名单 SHALL 包括：Web 应用包中的示例业务模块、全局 store 中的示例状态、示例的预览数据集、示例的浏览器用例与 Fixture、`openspec/specs/web-example/`、全部 `web-example:begin/end` 标记之间的片段（含消费接口声明中的示例条目、指南能力地图与架构文档中的"Web 示例"一项），以及 `manifest.quality.coverageExclusions` 中指向已删除文件的条目。产品契约（`packages/openapi/contracts/` 下的契约、lock 与约定模块）MUST NOT 列入白名单：它是替换点，由使用方按 OAS-01 原地替换，替换产品契约时须在同一次提交中删除 Web 示例（示例依赖初始契约的生成常量）；OpenAPI 引擎测试契约（`packages/openapi/testing/engine/`）属于协议包的引擎证据，同样 MUST NOT 列入白名单。应用包与 OpenAPI 协议包的骨架（装配入口、空的消费接口声明、门禁规则）保留。

同时删除 `template-example` 与 `web-example` 后确定性门禁仍全绿的证据由 template-example EX-10 的 SCN-TEMPLATE-ENGINEERING-008 统一承担；本要求只以 SCN-WEB-EXAMPLE-014 校验 `web-example` 标记成对。WEX-09 的用例与其中立替换契约 Fixture 属于本白名单。

#### Scenario: SCN-WEB-EXAMPLE-014 web-example 标记成对校验
- **WHEN** 在受控临时根中分别在代码文件与 Markdown 文件中放入只有 `web-example:begin` 没有结束标记、多余的 `web-example:end`、两对嵌套的 `web-example` 标记；随后恢复合法输入
- **THEN** 每个反例都使架构检查非零退出并指出文件与行号；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "marker-pairing": "web-example 标记未闭合、多余结束标记或嵌套时被拒绝并指出文件与行号",
    "marker-restorable": "恢复合法输入后架构检查通过"
  },
  "cases": [
    {"key": "marker-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["marker-pairing"]},
    {"key": "marker-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["marker-pairing", "marker-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: WEX-09 示例替换演示：产品契约与协议约定可替换

模板 SHALL 以一个随 Web 示例删除的维护用例证明 OAS-01 所述"产品契约与协议约定是替换点"：使用方把产品契约换成结构与约定都不同的契约并删除 Web 示例后，通用基线仍全绿，且无需修改引擎测试契约、`openapi-contract` 引擎用例、`scripts/` 门禁代码与门禁配置。该用例、它使用的中立替换契约 Fixture（契约、约定模块及其同目录单测）与 Web 示例删除清单都属于 WEX-08 白名单，随 Web 示例一起删除（与 SCN-TEMPLATE-ENGINEERING-008 随 `template-example` 删除同理）；中立替换契约 MUST NOT 使用 xueshan 契约。该用例 MUST NOT 依赖 `template-example` 白名单内的任何文件：按白名单删除的通用逻辑（标记剥离、整目录与整文件删除、JSON 键删除）放在不属于任何白名单的测试辅助模块中，Web 示例的删除清单放在 Web 示例自己的 Fixture 中；SCN-TEMPLATE-ENGINEERING-008 同样经该辅助模块与两份删除清单工作，Web 示例的删除清单不存在时（Web 示例已删除）只删除 `template-example`。这样两份白名单可以按任意顺序分别删除，任一用例都不因另一份白名单已删除而失败。

#### Scenario: SCN-WEB-EXAMPLE-015 替换产品契约与约定后通用基线仍全绿
- **WHEN** 在按 ENG-06 构造的仓库副本中（复用核心 Change 的副本 helper 与不属于任何白名单的删除辅助模块、期望集合推导与 008 同口径；本用例登记在 `TEMPLATE_COPY=1` 排除列表，登记条目以 `web-example` 标记包裹）：把产品契约换成作为 Fixture 提交的一份中立契约（文件名、接口与示例都不同，码表为 `{code, meaning, message}` 数组，只有一个身份方案且写在顶层 `security`、接口不逐个声明，至少一个路径参数只在 path item 级 `parameters` 中定义，并含一处由产品侧约定模块 `schemaNormalizers` 钩子修正的组件 schema 写法——契约把某字段声明为非空，产品侧 Fixture 中该字段为 `null`，钩子把它规范化为可空），按该约定改写 `contracts/conventions.ts` 及其同目录单测，更新清单中该契约的 `packages[].contract` 与 `fingerprints.protocolInputs` 路径，把 `defaultDataset` 改指一个产品侧数据集，以本地路径来源运行 `api:sync`；按 WEX-08 白名单删除 Web 示例；在 Web 应用的消费接口声明中登记新契约的一个接口，补一处 `client.request` 调用及其单测，按指南补齐矩阵 Fixture 键并刷新摘要；依次运行 `api:validate`、`api:status`、`check:fast` 与 `check:scenarios --inventory`，并以产品契约运行预览启动器的启动前校验（按产品契约发现路由，校验 `defaultDataset` 指向的产品侧数据集）；比较副本相对初始状态的改动文件
- **THEN** 各命令通过；预览启动前校验通过（路由取自产品契约）；新接口经顶层安全要求发送身份头，path item 级路径参数命中路由；钩子修正的字段为 `null` 的 Fixture 被认领且校验通过；清单模式的问题集合恰好等于 008 同口径推导的集合（被 `TEMPLATE_COPY=1` 排除的用例对应的缺失绑定，加上 `requiredIn` 中 `class` 为 `platform` 的测试项目），多一条或少一条均为失败；对新接口派生的协议义务有 integration 运行证据；改动文件只落在：`contracts/` 下的文件、`src/generated/`、`testing/` 下的产品 bundle、清单中该契约的 `packages[].contract` 与 `fingerprints.protocolInputs` 两项、`web.config.json` 的 `defaultDataset` 及其指向的产品侧预览数据集、WEX-08 白名单内容、`packages/web/src` 下新增的调用、装配代码及其单测、矩阵 Fixture 及其 manifest；引擎测试契约目录、`contractCarrier: "engine"` 的 Fixture 与平台数据集、`openapi-contract` 引擎用例、`scripts/` 与门禁配置均未改动。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "replace-contract-and-conventions": "产品契约换成文件名、接口与约定都不同的中立契约（顶层 security、path item 级参数、数组形码表、由产品侧钩子修正的组件 schema）并改写约定模块后，api:validate 与 api:status 通过",
    "preview-from-product": "以产品契约运行预览启动前校验通过，路由取自产品契约",
    "product-hook-applied": "产品侧约定模块登记的钩子生效，钩子修正字段为 null 的 Fixture 被认领且校验通过",
    "baseline-green-after-replace": "删除 Web 示例并登记新契约接口后，副本内 check:fast 通过，清单模式问题集合恰为 008 同口径推导的集合，新接口的协议义务有 integration 证据（含经顶层安全要求发送身份头、path item 级路径参数命中路由）",
    "engine-untouched": "改动只落在 WEX-09 列出的范围内，引擎测试契约、engine 载体的 Fixture 与平台数据集、引擎用例、scripts 与门禁配置未改动"
  },
  "cases": [
    {"key": "product-contract-replacement", "kind": "engineering", "requiredIn": ["integration"], "checks": ["replace-contract-and-conventions", "preview-from-product", "product-hook-applied", "baseline-green-after-replace", "engine-untouched"]}
  ],
  "blockedBy": []
}
```

