# template-example Specification

## Purpose
示例能力展示模板的分层扩展方式：公共入口装配、核心编排端口、适配器映射外部协议，并提供可复制的行为与协议证据。
## Requirements
### Requirement: EX-01 示例公共入口与装配

SDK 包根入口 SHALL 导出 `createExampleClient(options)`，返回提供 `create` 与 `observe` 的示例客户端。装配方式：`runtime` 选择宿主环境（首期 `wechat-miniapp`），`gatewayBaseUrl` 由宿主显式给出，`getAccessToken` 在每次请求前读取，`catalog` 提供创建资源所需的中立目录配置（类别、条目标识、条目名称、单位值），可选 `requestContext` 与时间策略覆盖。工厂 MUST 在任何外部动作之前校验配置，不合法时抛出配置错误。导入入口 SHALL NOT 依赖平台全局对象。示例的公共类型 SHALL 保留中文 JSDoc，并进入 ESM、CommonJS 双格式及类型声明产物。

示例的中文语义：示例演示"创建资源、再在有界窗口内观察其状态"的通用流程，不代表任何业务含义。协议层借用的交易接口只是传输样例，交易字段名与状态值不得出现在示例公共类型中。

#### Scenario: SCN-TEMPLATE-EXAMPLE-001 无平台环境导入与配置校验
- **WHEN** 在没有 `wx` 等平台全局对象的 Node 环境导入 SDK 根入口，并分别以合法配置和缺失或非法字段的配置调用 `createExampleClient`
- **THEN** 导入成功；合法配置返回客户端且不发出请求；非法配置在任何外部动作之前抛出配置错误；打包产物能以 ESM、CommonJS 两种方式导入，并提供示例类型声明。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "platform-free-import": "无平台全局对象时可以导入根入口",
    "config-validated-first": "非法配置在任何外部动作前抛出配置错误，合法配置不发请求",
    "package-consumable": "打包产物的 ESM、CJS 导入与示例类型声明可用",
    "public-type-contract": "公共类型的编译期契约成立：非法用法以 @ts-expect-error 反例证明被类型系统拒绝，联合类型可穷尽，只读字段不可写"
  },
  "cases": [
    {"key": "factory-validation", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["config-validated-first"]},
    {"key": "node-import", "kind": "behavior", "requiredIn": ["integration"], "checks": ["platform-free-import", "config-validated-first"]},
    {"key": "package-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["package-consumable"]},
    {"key": "public-type-contract", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["public-type-contract"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-02 创建资源

`create(input)` MUST 在外部动作之前校验输入。输入只包含中立字段：`ownerId`（资源所有者标识）、`externalRef`（宿主侧引用，用于识别重复提交）、`units`（正整数数量）。校验通过后，示例适配器 SHALL 把输入映射为 generated `CreateTradeRequest`，映射规则由 Design 固定；请求经协议包实例执行器发送，由执行器负责公共 Header/BaseReq 与编解码。成功时返回中立的资源引用。失败时返回示例错误，错误类别为 `invalid_input`、`unauthorized`、`network`、`timeout`、`server`、`protocol`（响应无法解码，或与请求不一致）、`host`（宿主提供的 `getAccessToken` 抛错或返回非字符串）。非 401 的 HTTP 错误归入 `server`，不带服务端错误码。`server` 错误 SHALL 保留十进制字符串形式的服务端错误码，并在协议包错误码目录能识别该码时附带其描述。示例不自动重试创建请求。

#### Scenario: SCN-TEMPLATE-EXAMPLE-002 创建成功返回资源引用
- **WHEN** 宿主以合法输入调用 `create`，服务端返回成功
- **THEN** 恰好发出一次 `POST /api/base/trade/create`；请求体由 generated codec 编码，公共 Header/BaseReq 由执行器组装，Token 在本次请求前读取；结果是只包含中立字段的资源引用。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "single-create-request": "恰好发出一次创建请求，路径和方法来自 generated metadata",
    "executor-owned-context": "Header、BaseReq 和编解码由协议执行器负责，Token 逐次读取",
    "neutral-reference": "返回的资源引用只含中立字段，不暴露交易字段名"
  },
  "cases": [
    {"key": "create-mapping", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["neutral-reference"]},
    {"key": "create-success", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["single-create-request", "executor-owned-context", "neutral-reference"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-TEMPLATE-EXAMPLE-003 创建失败的归类
- **WHEN** 输入不合法；或服务端返回非零业务码；或网络失败、请求超时、鉴权失败、宿主 Token getter 异常、非 401 的 HTTP 错误
- **THEN** 输入不合法时不发出请求，返回 `invalid_input`；其余情况各归入对应类别，只返回一次结果且不重试；`server` 错误保留十进制字符串错误码，对错误码目录中已知的码附带描述。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "input-before-request": "输入不合法时不发请求，返回 invalid_input",
    "error-category": "业务码、网络、超时、鉴权、宿主上下文异常、非 401 HTTP 错误分别归入 server、network、timeout、unauthorized、host、server",
    "server-code-preserved": "server 错误保留十进制字符串错误码，已知码附带目录中的描述",
    "no-auto-retry": "创建失败不自动重试，只返回一次结果"
  },
  "cases": [
    {"key": "create-error-mapping", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["error-category", "server-code-preserved"]},
    {"key": "invalid-input", "kind": "behavior", "requiredIn": ["integration"], "checks": ["input-before-request"]},
    {"key": "create-failures", "kind": "behavior", "requiredIn": ["integration"], "checks": ["error-category", "server-code-preserved", "no-auto-retry"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-03 有界观察

`observe(reference, options?)` SHALL 在观察窗口内按固定间隔调用 `QueryTrade` 查询资源状态，并只交付一次最终结果 `ExampleOutcome`。观察窗口、查询间隔和单次请求超时有默认值（由 Design 给出），可在初始化时或单次调用时覆盖。单次查询超时或网络失败只结束这一次请求；窗口内还有剩余时间时继续下一次查询。窗口结束后 SHALL NOT 再发出请求。

`ExampleOutcome.end` 的中文语义：

| 值 | 含义 |
| --- | --- |
| `completed` | 观察到资源已完成 |
| `closed` | 观察到资源已关闭 |
| `window_elapsed` | 窗口结束时资源仍未到终态，附带最后一次观察到的状态 |
| `failed` | 遇到不可继续的错误，例如鉴权失败、引用不一致或非可重查的业务错误；附带示例错误 |
| `cancelled` | 宿主通过停止信号结束了本次观察 |

#### Scenario: SCN-TEMPLATE-EXAMPLE-004 观察到终态
- **WHEN** 服务端依次返回 CREATED、PAYING、PAID；或返回 CLOSED
- **THEN** 分别以 `completed`、`closed` 结束；查询次数与服务端推进一致，到达终态后不再查询。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "terminal-mapped": "终态分别映射为 completed 或 closed",
    "stop-after-terminal": "到达终态后不再查询，查询次数与服务端推进一致",
    "single-outcome": "只交付一次最终结果"
  },
  "cases": [
    {"key": "observe-completed", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["terminal-mapped", "stop-after-terminal", "single-outcome"]},
    {"key": "observe-closed", "kind": "behavior", "requiredIn": ["integration"], "checks": ["terminal-mapped", "stop-after-terminal", "single-outcome"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-TEMPLATE-EXAMPLE-005 窗口结束与单次查询超时
- **WHEN** 某次查询超时或网络失败，之后服务端始终返回非终态，直到窗口结束
- **THEN** 失败的那次查询只结束该次请求，窗口内继续查询；窗口结束时以 `window_elapsed` 结束，并附带最后观察到的状态；之后不再发出任何请求。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "request-timeout-local": "单次查询超时或网络失败只结束该次请求，窗口内继续查询",
    "window-elapsed": "窗口结束时以 window_elapsed 结束，附带最后状态",
    "no-request-after-end": "结束后不再发出请求"
  },
  "cases": [
    {"key": "observation-budget", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["request-timeout-local", "window-elapsed", "no-request-after-end"]},
    {"key": "window-and-timeout", "kind": "behavior", "requiredIn": ["integration"], "checks": ["request-timeout-local", "window-elapsed", "no-request-after-end"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-TEMPLATE-EXAMPLE-006 宿主取消观察
- **WHEN** 宿主在等待下一次查询期间，或在某次查询请求进行中，发出停止信号
- **THEN** 本次观察以 `cancelled` 结束，结果只交付一次；进行中的请求被取消，之后不再发出请求；取消不被当作超时处理。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "cancel-while-waiting": "等待期间停止，立即以 cancelled 结束",
    "cancel-in-flight": "请求进行中停止，请求被取消，不被当作 timeout",
    "no-request-after-cancel": "取消后不再发出请求，结果只交付一次"
  },
  "cases": [
    {"key": "cancellation-rules", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["cancel-while-waiting", "cancel-in-flight", "no-request-after-cancel"]},
    {"key": "host-cancel", "kind": "behavior", "requiredIn": ["integration"], "checks": ["cancel-while-waiting", "cancel-in-flight", "no-request-after-cancel"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-04 状态映射与引用校验

示例适配器 MUST 独自维护交易状态到示例状态的映射：CREATED、PAYING 映射为 `pending`，PAID 映射为 `completed`，CLOSED 映射为 `closed`；UNSPECIFIED 或无法识别的值映射为 `unknown`，按未到终态继续观察。查询响应中的资源引用与请求不一致时，SHALL 以 `failed` 结束，错误类别为 `protocol`。示例核心 SHALL NOT 使用交易状态或错误码的原始数值。

#### Scenario: SCN-TEMPLATE-EXAMPLE-007 状态映射与引用不一致
- **WHEN** 查询响应分别带有 CREATED、PAYING、PAID、CLOSED、UNSPECIFIED、无法识别的状态值，或带有与请求不一致的资源引用
- **THEN** 前几种状态按映射表转换，无法识别的值为 `unknown` 并继续观察；引用不一致时以 `failed` 结束，错误类别为 `protocol`；示例核心代码不引用任何交易枚举。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "status-mapping": "按映射表转换状态，无法识别的值为 unknown 并继续观察",
    "reference-mismatch": "响应引用与请求不一致时以 failed 结束",
    "core-neutral": "示例核心不引用交易枚举或原始错误数值"
  },
  "cases": [
    {"key": "status-mapping-table", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["status-mapping", "reference-mismatch"]},
    {"key": "core-neutrality", "kind": "engineering", "requiredIn": ["integration"], "checks": ["core-neutral"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-05 示例分层与隔离

示例 SHALL 按"工厂 → 核心 → 内部端口 → 适配器"分层，在 SDK、协议 testing 与 E2E 中各自使用独立的目录和命名空间。依赖方向与 lint 门禁 MUST 覆盖示例：示例核心不得导入 generated 代码，也不得使用 `wx` 等平台全局对象；产品包内各业务模块目录（本模板目前只有 `src/example/`）不得互相导入。可以共用的只有协议包的公开能力，以及 SDK 的运行辅助工具和平台网络装配。

#### Scenario: SCN-TEMPLATE-EXAMPLE-008 示例依赖越界被阻断
- **WHEN** 分别引入以下违规：示例核心导入 generated 或使用 `wx` 全局对象；在临时新增的另一个业务模块目录与示例之间互相导入
- **THEN** 架构或 lint 门禁逐项非零退出并指出违规位置；恢复后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "example-core-isolated": "示例核心导入 generated 或使用平台全局对象时被阻断",
    "no-cross-domain-import": "产品包内不同业务模块目录互相导入时被阻断",
    "restored-passes": "恢复合法依赖后门禁通过"
  },
  "cases": [
    {"key": "dependency-violations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["example-core-isolated", "no-cross-domain-import", "restored-passes"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-06 示例的 Shadow 支持

协议包 testing 中的 Shadow SHALL 新增 `CreateTrade` 路由。该路由与已有的 `QueryTrade` 路由一样，由 generated 协议描述驱动，支持按 Fixture 编排状态推进，并支持注入延迟、网络失败与业务错误码。Shadow 仍只能用于测试，不得进入产品产物。weapp 运行环境 SHALL 通过真实 `wx.request` 访问 Shadow 执行示例用例。

#### Scenario: SCN-TEMPLATE-EXAMPLE-009 Shadow 创建路由与故障注入
- **WHEN** 用 generated codec 编码的 CreateTrade 请求访问 Shadow，Fixture 分别编排成功、业务错误码、延迟和网络失败
- **THEN** Shadow 按 Fixture 返回可被 generated codec 解码的响应，或按编排注入故障；路由和编解码不在 Shadow 中另写一份；产品产物中不包含 Shadow。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "generated-route": "CreateTrade 路由由 generated 描述驱动，不另写路径或编解码",
    "fixture-driven": "响应和故障按 Fixture 编排",
    "not-in-product": "产品产物中不包含 Shadow"
  },
  "cases": [
    {"key": "shadow-create-route", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["generated-route", "fixture-driven"]},
    {"key": "shadow-excluded", "kind": "engineering", "requiredIn": ["integration"], "checks": ["not-in-product"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-08 示例的必需集成流程

示例 SHALL 登记下表中的必需集成流程。每条 FLOW 的必需 case，都要在所列环境中，从公共入口开始在同一次运行里连续执行完规定阶段，并验证调用顺序、跨阶段的数据关联和最终结果。单个 Scenario 全部通过，不能代替流程贯通；不同测试的阶段证据不能拼成一个 FLOW case。按项目规则，FLOW 表写在 Requirement 正文中，这样归档后仍会保留在主 Spec 里。

| FLOW ID | 关联 Scenario | 公共入口与连续阶段/检查点 | 必需 case key | 必需环境 | 输入及验证说明 |
| --- | --- | --- | --- | --- | --- |
| FLOW-TEMPLATE-EXAMPLE-001 | SCN-TEMPLATE-EXAMPLE-002、SCN-TEMPLATE-EXAMPLE-004、SCN-TEMPLATE-EXAMPLE-011 | createExampleClient → create → CreateTrade → observe → QueryTrade(CREATED → PAID) → 一次最终结果；资源引用贯通各阶段，调用顺序和次数一致，初始化时不发请求 | normal | integration、weapp | 同一次连续运行完成全部阶段，不拼接不同测试的证据；Fixture 编排状态推进；weapp 通过真实 wx.request 访问 Shadow |

#### Scenario: SCN-TEMPLATE-EXAMPLE-011 创建到观察的连续流程
- **WHEN** 在同一次运行中依次执行 `createExampleClient`、`create`、`observe`，服务端先返回 CREATED，再返回 PAID
- **THEN** 初始化时不发请求；先创建、后查询，顺序正确；查询使用的是创建返回的资源引用；最终以 `completed` 结束，只交付一次；整个过程由同一个 FLOW case 连续证明。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "stage-order": "初始化不发请求，先创建后查询，顺序和次数与 Fixture 编排一致",
    "reference-continuity": "查询使用创建返回的资源引用",
    "single-final-outcome": "最终以 completed 结束，只交付一次"
  },
  "cases": [
    {"key": "normal", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["stage-order", "reference-continuity", "single-final-outcome"]}
  ],
  "blockedBy": []
}
```

