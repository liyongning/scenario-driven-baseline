## ADDED Requirements

### Requirement: PC-04 Fixture 响应与协议同形

Shadow 返回给被测客户端的每个响应体 MUST 与协议来源描述的响应结构同形，无论响应来自 Fixture JSON 还是测试代码中的内联配置。校验 SHALL 在 Shadow 构造场景时（`createShadowServer`）进行，不在 `check:fixtures` 中进行，以同时覆盖两种来源。

- Shadow 路由描述 SHALL 支持可选的响应校验函数 `validateResponse(body)`，返回问题列表（空列表表示同形）。校验函数 MUST 由协议侧的路由构造器注入：IDL 路由来源为每条路由注入由 generated 描述派生的结构校验器；Shadow 引擎本身 MUST NOT 依赖 generated 代码（见 PC-03），未携带校验函数的中立路由不做结构校验。
- IDL 结构校验器 SHALL 复用协议义务派生的字段解析（可达字段、可选性、oneof 与编码），并在以下情况判定失败：出现响应类型中不存在的字段；字段的编码或类型不符（例如 int64 必须是十进制字符串、枚举必须是合法的枚举名称）；同一 oneof 出现多个分支。缺少非 presence 字段 MUST NOT 判错（符合 proto3 默认值语义）。
- 遇到无法判定的字段类型（例如 `Any`、`Struct` 等动态类型）时，校验器 SHALL 报告"待定"并判定失败，不得放行。
- 任一路由的任一 step 响应体校验失败时，`createShadowServer` MUST 立即抛错，错误信息 SHALL 包含路由方法名、step 序号与字段路径。
- 用例需要故意返回非法响应时（例如解码错误义务），step MUST 显式声明 `malformed: { reason }`（`reason` 为非空说明）才跳过该 step 的结构校验；未声明的 step 一律校验，不存在"不声明即不校验"的路径。

#### Scenario: SCN-PROTOCOL-CONTRACT-006 同形响应被接受、不同形响应在构造时被拒绝
- **WHEN** 用 IDL 路由来源产出的 `CreateTrade`、`QueryTrade` 路由，分别以 Fixture JSON 与测试代码内联 body 两种来源构造 Shadow，输入依次为：合法响应、缺少非 presence 字段、含未知字段、int64 以数字表示、枚举为非法名称、同一 oneof 出现两个分支
- **THEN** 合法响应与缺少非 presence 字段的响应构造成功；其余输入在 `createShadowServer` 时立即抛错，错误信息指出路由方法名、step 序号与字段路径；两种来源的判定结果一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "conforming-accepted": "与 generated 描述同形的响应构造成功",
    "absent-default-accepted": "缺少非 presence 字段不判错",
    "unknown-field-rejected": "响应类型中不存在的字段导致构造失败",
    "encoding-rejected": "int64 非十进制字符串、枚举非合法名称等编码或类型不符导致构造失败",
    "oneof-conflict-rejected": "同一 oneof 出现多个分支导致构造失败",
    "error-location": "失败信息包含路由方法名、step 序号与字段路径",
    "both-sources": "Fixture JSON 与内联 body 两种来源走同一校验且结果一致"
  },
  "cases": [
    {"key": "idl-validator-rules", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["conforming-accepted", "absent-default-accepted", "unknown-field-rejected", "encoding-rejected", "oneof-conflict-rejected"]},
    {"key": "shadow-construction", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["error-location", "both-sources"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-007 非法响应必须显式认领，动态类型报待定
- **WHEN** 一个 step 声明 `malformed: { reason }` 并返回不同形的响应体，另一个 step 返回同样的响应体但不声明 `malformed`；另以含动态类型字段（如 `Any` 或 `Struct`）的描述生成 IDL 结构校验器并校验响应
- **THEN** 已认领的 step 构造成功（经真实客户端得到解码错误的行为证据由 SCN-PROTOCOL-CONTRACT-002 的解码错误义务承担）；未认领的 step 在构造时抛错；动态类型字段被报告为"待定"并判定失败，不被放行。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "claimed-skipped": "显式声明 malformed 且 reason 非空的 step 跳过结构校验并构造成功",
    "unclaimed-rejected": "未声明 malformed 的非法响应在构造时被拒绝",
    "dynamic-pending": "无法判定的动态字段类型被报告为待定并判定失败"
  },
  "cases": [
    {"key": "malformed-claim-rules", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["claimed-skipped", "unclaimed-rejected", "dynamic-pending"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-05 X-Request-Id 按公司规范生成

请求 ID 的头名、格式与生成规则以公司规范为准，规范来源为 dq-tech-ai-plugin 中 `dq-be-core/skills/dq-be-libs/references/common-sdk.md` 第 92–97 行，以及 `dq-be-idl-convention`、`dq-fe-troubleshooting` 中的相关条目。

- **头名**：协议包发出的每个请求 MUST 在请求头 `X-Request-Id` 中携带请求 ID，MUST NOT 再发送 `request_id` 头。同一个值 SHALL 同时写入 `BaseReq.requestId`。
- **格式**：请求 ID MUST 为 `yyyyMMdd_HHmmss_SSS_abcdef`，共 26 个字符（匹配 `^\d{8}_\d{6}_\d{3}_[a-z]{6}$`）。时间部分 SHALL 按北京时间（UTC+8）计算，不依赖宿主时区；末尾 6 位为随机小写字母，SHALL 由 `crypto.getRandomValues` 生成。
- **生成方**：请求 ID MUST 由协议包 `transport/` 中的标准生成器生成，每次请求都生成新值。模板没有自动重试，重试时是否复用请求 ID 不在本 Requirement 范围内。
- **不可覆盖（公共 API 破坏性变更）**：协议包公共选项 `ProtocolClientOptions` MUST 删除 `runtime.nextRequestId`，SDK 运行时端口 MUST 删除同名能力；宿主无论经 SDK 还是直接使用协议客户端，都无法覆盖或注入请求 ID。SDK 内不得保留其他请求 ID 生成器（删除带 `pay-` 前缀的旧实现）。这是协议包与产品包公共 API 的破坏性变更，双格式类型声明随之变化，SHALL 在 Change 说明与指南能力地图中注明。
- **测试确定性**：用例 MUST NOT 依赖可预测的请求 ID：Shadow 以 `headerPatterns` 校验格式，并比对同一请求中 `X-Request-Id` 头与 `BaseReq.requestId` 相等。标准生成器的时钟与随机源只能通过内部参数注入供单测使用，这些参数 MUST NOT 出现在协议包与产品包的任何公共导出中。
- **校验**：Shadow 的期望请求 SHALL 支持 `headerPatterns`（请求头名到正则的映射），用于校验每次变化的请求头；不匹配或缺失时由 `verify()` 报出头名与期望模式。协议义务中的公共请求上下文义务 SHALL 校验 `X-Request-Id` 的头名与格式。
- 标准生成器的单测 MUST 在显式设置的非 +8 时区（`TZ`）下运行，以证明不依赖宿主时区。

#### Scenario: SCN-PROTOCOL-CONTRACT-008 每次请求携带规范格式的 X-Request-Id
- **WHEN** 经协议包公共入口 `createProtocolClient` 创建客户端（不依赖模板示例），连续发起两次请求到 Shadow，Shadow 以 `headerPatterns` 校验 `X-Request-Id` 并比对头与 `BaseReq.requestId`；另检查协议包公共选项 `ProtocolClientOptions` 的 `runtime`、SDK 运行时端口，以及两个包根入口的公共导出
- **THEN** 两次请求都带 `X-Request-Id`，值符合 26 字符格式且与对应请求的 `BaseReq.requestId` 相同；两次的值不同；请求中不存在 `request_id` 头；`ProtocolClientOptions` 的 `runtime` 不含 `nextRequestId`，SDK 运行时端口不含请求 ID 能力，宿主无法覆盖请求 ID；生成器的时钟与随机源注入参数不出现在协议包公共导出中，SDK 根入口不导出请求 ID 生成器。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "header-name": "请求头名为 X-Request-Id，且不再发送 request_id 头",
    "format": "请求 ID 为 yyyyMMdd_HHmmss_SSS_abcdef 格式的 26 个字符",
    "same-as-basereq": "请求头的值与 BaseReq.requestId 相同",
    "fresh-per-request": "每次请求生成新的请求 ID",
    "protocol-options-no-override": "协议包公共选项 ProtocolClientOptions 的 runtime 不含 nextRequestId，直接使用协议客户端的宿主无法覆盖请求 ID",
    "host-cannot-override": "SDK 运行时端口不提供请求 ID 能力，SDK 根入口不导出请求 ID 生成器，经 SDK 的宿主无法覆盖请求 ID",
    "generator-internal-only": "协议包根入口的公共导出与公共类型中不含生成器的时钟与随机源注入参数"
  },
  "cases": [
    {"key": "request-id-wire", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["header-name", "format", "same-as-basereq", "fresh-per-request"]},
    {"key": "client-options-shape", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["protocol-options-no-override", "generator-internal-only"]},
    {"key": "runtime-port-shape", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["host-cannot-override"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-009 标准生成器按北京时间生成且不依赖宿主时区
- **WHEN** 在显式设置的非 +8 时区（例如 `TZ=UTC` 与 `TZ=America/Los_Angeles`）下，以固定时刻与可控随机源调用标准生成器，时刻包含跨越北京日期边界的情况（UTC 当日 16:00 之后）
- **THEN** 时间部分等于该时刻的北京时间（含毫秒）；末尾 6 位为小写字母且来自 `crypto.getRandomValues`；结果长度为 26；不同宿主时区下结果相同。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "beijing-time": "时间部分按 UTC+8 计算，跨北京日期边界时日期正确",
    "tz-independent": "在非 +8 时区下运行结果与宿主时区无关",
    "random-suffix": "末尾 6 位为小写字母且由 crypto.getRandomValues 生成",
    "fixed-length": "生成结果恰为 26 个字符"
  },
  "cases": [
    {"key": "generator-non-beijing-tz", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["beijing-time", "tz-independent", "random-suffix", "fixed-length"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-010 Shadow 与协议义务按头名和格式校验请求 ID
- **WHEN** Shadow 的期望请求以 `headerPatterns` 声明 `X-Request-Id` 的格式正则，分别发送符合格式、缺少该头、只带旧 `request_id` 头、格式错误的请求；另运行协议义务派生
- **THEN** 符合格式的请求通过；其余情况由 `verify()` 报出头名与期望模式；派生出的公共请求上下文义务校验 `X-Request-Id` 头名与格式，不再引用 `request_id`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "pattern-match": "headerPatterns 按正则匹配请求头，符合格式的请求通过",
    "pattern-mismatch-reported": "缺失、旧头名或格式错误时 verify 报出头名与期望模式",
    "obligation-header": "公共请求上下文义务校验 X-Request-Id 的头名与格式"
  },
  "cases": [
    {"key": "shadow-header-patterns", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["pattern-match", "pattern-mismatch-reported"]},
    {"key": "context-obligation", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["obligation-header"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-06 Shadow 请求记录、路径转换与有界轮询

Shadow 网关 MUST 让被测客户端发出的每个请求都可见，SHALL 正确注册带路径参数的路由，并只在平台类测试项目中允许有界轮询。

- **请求记录**：已注册路由在当前场景未编排时，Shadow SHALL 返回 404，并 MUST 将该请求写入 `records()`，`verify()` 报"未编排的请求"。未注册路径的请求 SHALL 由兜底处理器接住，返回 404，写入记录，`verify()` 报"未注册的请求"。无论客户端对 404 是否容错，多发的请求都 MUST 在 `verify()` 中可见。
- **路径转换**：注册路由前，Shadow SHALL 把路径中的 `{name}` 转换为 `:name`；转换后路径仍含 `{` 或 `}` 时，构造 MUST 报错。
- **有界轮询**：路由编排 SHALL 支持 `poll: { maxRequests: K }`。`steps` 用完后，后续请求重复最后一个 step，直到总请求数达到 K；每次超出 `steps` 的请求 MUST 仍按最后一个期望请求校验参数与请求头；超过 K 次的请求返回 409 并计入 `verify()` 的问题。使用 `poll` 而 `steps` 为空时，构造 MUST 报错。
- **使用范围**：用例构造 Shadow 时 MUST 传入运行环境类别 `environmentClass`（由 `defineCase` 上下文按清单测试项目类别提供）；任一路由使用 `poll`、而 `environmentClass` 不是 `platform` 时，构造 MUST 立即抛错，使集成用例的次数证据始终是精确的。

#### Scenario: SCN-PROTOCOL-CONTRACT-011 未编排与未注册的请求被记录并报出
- **WHEN** Shadow 场景只编排一条路由，被测方分别请求该路由、另一条已注册但未编排的路由，以及一个未注册的路径
- **THEN** 后两个请求都收到 404 并出现在 `records()` 中；`verify()` 分别报出"未编排的请求"与"未注册的请求"，并指出方法或路径；只有编排内请求时 `verify()` 无问题。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "unscripted-recorded": "已注册但未编排的请求返回 404、写入记录并由 verify 报出未编排",
    "unregistered-recorded": "未注册路径的请求由兜底处理器返回 404、写入记录并由 verify 报出未注册",
    "scripted-clean": "只有编排内请求时 verify 无问题"
  },
  "cases": [
    {"key": "request-recording", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["unscripted-recorded", "unregistered-recorded", "scripted-clean"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-012 路径参数模板转换为路由参数
- **WHEN** 用路径为 `/trades/{tradeId}` 的中立路由构造 Shadow 并请求 `/trades/abc`；另分别以路径 `/trades/{tradeId` 与 `/trades/{}` 构造 Shadow
- **THEN** 第一个路由按 `/trades/:tradeId` 注册，请求命中编排的 step 并被记录，缺少该片段的路径不会命中；残留花括号的两个路径在构造时报错。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "template-converted": "{name} 被转换为 :name，带参数的请求命中路由，缺少片段的路径不命中",
    "residual-brace-rejected": "转换后仍含花括号的路径在构造时报错"
  },
  "cases": [
    {"key": "path-template", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["template-converted", "residual-brace-rejected"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-013 有界轮询只在平台环境可用且次数有界
- **WHEN** 以 `environmentClass` 为 `platform` 构造一条 `poll: { maxRequests: 4 }`、含 2 个 step 的路由，依次发送 5 次请求，其中第 3 次参数与最后一个期望请求不符；另分别以 `steps` 为空的 `poll` 路由、`environmentClass` 为 `integration` 的 `poll` 路由、未传 `environmentClass` 构造 Shadow
- **THEN** 第 3、4 次请求重复最后一个 step 的响应；第 3 次的参数不符被 `verify()` 报出；第 5 次返回 409 并计入 `verify()` 的问题；`steps` 为空、非 platform 环境使用 `poll`、未传 `environmentClass` 都在构造时报错。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "repeat-last-step": "steps 用完后重复最后一个 step，直到总数达到 maxRequests",
    "overflow-still-validated": "超出 steps 的请求仍按最后一个期望请求校验参数与请求头",
    "over-limit-reported": "超过 maxRequests 的请求返回 409 并计入 verify 问题",
    "empty-steps-rejected": "使用 poll 且 steps 为空时构造报错",
    "platform-only": "environmentClass 非 platform 时使用 poll 构造即抛错，未传 environmentClass 同样报错"
  },
  "cases": [
    {"key": "bounded-poll", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["repeat-last-step", "overflow-still-validated", "over-limit-reported", "empty-steps-rejected", "platform-only"]}
  ],
  "blockedBy": []
}
```

## MODIFIED Requirements

### Requirement: PC-01 基于 IDL 的协议义务派生

工程 MUST 从 ProtoGen 生成的协议描述，为产品包声明的消费接口自动派生协议义务清单。消费接口由清单中 product 角色包的 `packages[].consumedOperations` 登记的模块确定：该模块 SHALL 导出名为 `consumedOperations` 的数组，每个元素 MUST 是 `{ method, requestFields }`：

- `method`：generated 中由 `createMethod` 产出的方法常量（例如 `CreateTrade`）。元素的 `method` 不是 `createMethod` 常量时（例如只有 `defineMethodSpec`、没有 HTTP 元数据），派生器 MUST 报错并非零退出，指出该元素。
- `requestFields`：该接口请求字段的映射策略，键为字段路径，值为 `{ cases, authority }`；`cases` 的取值与原门禁脚本中的请求字段策略相同（`mapped-value`、`fixed-value`、`omitted`、`generated-value`、`configured-value`）。请求字段怎么映射是产品的事实，SHALL 只登记在该声明中；门禁脚本（含 `scripts/lib/contract-inventory.ts`）MUST NOT 再按方法名写死请求字段策略表。

模板示例在 `packages/sdk/src/consumed-operations.ts` 中登记 `CreateTrade` 与 `QueryTrade` 及其请求字段策略（示例条目用 `template-example:begin/end` 标记包裹）。清单未登记 `consumedOperations` 时按空声明处理；登记了但模块不存在、或模块未导出数组时，派生器 MUST 报错并非零退出。

派生器 SHALL 用 TS 编译器 API 解析声明模块，并按以下方式推导，MUST NOT 从示例路由、示例 Fixture 或其他写死列表取接口集合，也 MUST NOT 写死某个 generated 源文件（例如 `idl/infra/trade/v1/trade.ts`）：

- 产品包以协议包包名（例如 `@daqian/template-protocol/generated/...`）导入方法常量；派生器创建 TS program 时 SHALL 以路径映射把协议包名解析到协议包 `src/`，MUST NOT 解析到构建产物 `dist`；

- 数组中每个元素解析到它在 generated 目录中的声明位置，该声明所在文件即该方法请求/响应类型的源文件，字段派生从该文件解析类型；
- 该源文件相对 `generated/idl/` 的目录路径即 IDL 包名（例如 `idl/infra/trade/v1/trade.ts` → `infra.trade.v1`、`idl/infra/pay/v1/pay.ts` → `infra.pay.v1`），作为该方法义务 ID 的前缀；方法描述的 `meta`（`RpcMethodMeta`）不含包名，MUST NOT 从 `meta` 取包名；
- 接口名、HTTP 方法、路径与请求/响应类型名从元素 `method` 的 `meta` 读取；请求字段的映射义务按元素的 `requestFields` 生成。

不同元素可以来自不同的 generated 源文件，各自按自己的声明位置推导前缀与类型源文件。声明为空数组时，按消费接口派生的义务（路由、字段映射与编码、公共请求上下文、响应、通信错误、超时）为空，派生 MUST NOT 报错；业务错误码义务仍由协议包 `businessErrors` 派生，不受声明为空影响，其证据由 SCN-PROTOCOL-CONTRACT-003 承担。

协议矩阵用例（SCN-PROTOCOL-CONTRACT-002）的 Shadow 路由 SHALL 由同一份消费接口声明生成：通用的 `discoverDeclaredRoutes()` 把声明中的方法描述转换为中立路由，替代只服务示例的 `discoverExampleRoutes()`；声明为空时，矩阵用例 SHALL 断言按消费接口派生的义务（路由、字段映射与编码、公共请求上下文、响应、通信错误、超时）为空并结束，证明"没有消费接口就没有按接口派生的协议义务"。

协议矩阵用例的 integration 版、weapp 版及小程序宿主的协议运行器 MUST NOT 写死具体接口（例如 `CreateTrade`、`QueryTrade`）：用例 SHALL 遍历声明中的接口，用方法常量的 `meta`（请求/响应类型、codec、路径）构造请求、解码响应；每个接口的请求与响应数据 SHALL 放在 Fixture `SCN-PROTOCOL-CONTRACT-002/protocol-matrix.json` 中，以接口名为键（取代原 `create`/`query` 键）。声明的接口在矩阵 Fixture 中缺少对应键时，用例 MUST 失败并指出接口名。新增消费接口时，产品只需在声明中登记方法与请求字段策略、在矩阵 Fixture 中补该接口的数据，SHALL NOT 需要修改门禁脚本或矩阵用例代码；指南"能力地图"SHALL 写明这一操作。

义务包括：HTTP 路由；请求与响应每个可达字段的映射与编码边界；公共请求上下文（Header 与 BaseReq）；响应处理；通信错误处理；业务错误码处理；超时。业务错误码义务的来源 SHALL 是协议包手写的 `businessErrors` 目录（PC-02 的事实源），不取示例 Fixture。每条义务的必需 case 与运行环境由派生规则给出，覆盖分母以派生结果为准（见 `scenario-gate` 的 GATE-07），不从已有测试反推。无法判定映射方式的字段 SHALL 标为待定并报告，不得静默忽略。派生不得包含未声明的接口。

声明与实际调用 MUST 双向一致：工程以 TS AST 静态扫描产品包源码，收集实际调用集合，包括 `<协议客户端>.request(<X>.meta, ...)` 形式的调用，以及从 generated 模块导入、并作为参数传给 `request` 的方法描述。声明了但没有调用的方法报"未使用的声明"；调用了但没有声明的方法报"未声明的调用"；两类问题都 SHALL 计入场景门禁的问题并指出方法名与位置。

#### Scenario: SCN-PROTOCOL-CONTRACT-001 义务清单只针对产品声明的消费接口
- **WHEN** 基于当前 generated 描述与模板的消费接口声明运行派生；再在受控临时根中分别构造：声明为空的产品包；清单未登记 `consumedOperations` 的产品包；登记的声明模块不存在或未导出数组；在临时根的 generated 目录中合成一个非 `trade.ts` 的源文件（含 `createMethod` 产出的方法常量及其请求/响应类型），以 `{ method, requestFields }` 声明该方法并与 trade 方法同时声明；声明一个 `method` 只有 `defineMethodSpec`、没有 HTTP 元数据的元素；存在未判定字段的输入
- **THEN** 当前仓库的清单只包含声明中的 `CreateTrade` 与 `QueryTrade` 的义务，义务 ID 前缀为 `infra.trade.v1`，每条义务都有 case 与运行环境，请求字段义务的 case 取自声明元素的 `requestFields`；业务错误码义务与 `businessErrors` 目录逐项对应；声明为空或未登记时按消费接口派生的义务（路由、字段映射与编码、公共请求上下文、响应、通信错误、超时）为空且不报错，业务错误码义务仍与 `businessErrors` 逐项对应；声明模块不存在、未导出数组、或元素的 `method` 不是 `createMethod` 常量时报错并非零退出；合成文件中的方法从其自身的声明文件解析请求/响应类型并派生字段义务，义务 ID 前缀为该文件相对 `generated/idl/` 的目录推导出的 IDL 包名，与 trade 方法的前缀各自正确；派生解析方法常量时经路径映射到协议包 `src/`，不读 `dist`；反例中的未判定字段被报告为待定，不被忽略。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "consumed-methods-only": "义务只针对产品包 consumedOperations 声明的接口，不包含其他接口，也不取自示例路由或 Fixture",
    "package-prefix": "义务 ID 前缀由声明元素在 generated 中的声明文件相对 generated/idl/ 的目录推导，不写死、不取自 meta",
    "source-file-from-declaration": "请求/响应类型的源文件为声明元素在 generated 中的声明位置，不写死 trade.ts；解析时经路径映射把协议包名解析到协议包 src，不解析到 dist",
    "non-trade-method-derived": "在受控临时根中合成的非 trade.ts generated 文件（含 createMethod 常量）中的方法被声明时，派生器从该文件解析类型并以其相对 generated/idl/ 的目录推导的 IDL 包名为前缀派生义务，与同时声明的 trade 方法互不干扰",
    "request-fields-from-declaration": "请求字段映射义务的 case 取自声明元素的 requestFields，门禁脚本中不存在按方法名写死的请求字段策略表",
    "invalid-declaration-rejected": "清单未登记 consumedOperations 按空声明处理；登记的模块不存在、未导出数组、或元素的 method 不是 createMethod 常量（只有 defineMethodSpec）时派生器报错并非零退出",
    "complete-obligations": "路由、字段映射与编码、公共请求上下文、响应、通信错误、业务错误码、超时各类义务都有 case 与运行环境",
    "error-catalog-source": "业务错误码义务来自协议包 businessErrors 目录并与之逐项对应",
    "empty-declaration": "声明为空时按消费接口派生的义务为空且派生不报错，业务错误码义务仍由 businessErrors 派生",
    "pending-reported": "无法判定映射的字段被报告为待定，不被静默忽略"
  },
  "cases": [
    {"key": "derivation-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["consumed-methods-only", "package-prefix", "source-file-from-declaration", "non-trade-method-derived", "request-fields-from-declaration", "invalid-declaration-rejected", "complete-obligations", "error-catalog-source", "empty-declaration", "pending-reported"]},
    {"key": "inventory-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["consumed-methods-only", "complete-obligations", "empty-declaration"]},
    {"key": "non-trade-method-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["package-prefix", "source-file-from-declaration", "non-trade-method-derived", "invalid-declaration-rejected"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-002 声明接口的协议义务都有运行证据
- **WHEN** 由消费接口声明经 `discoverDeclaredRoutes()` 生成 Shadow 路由，矩阵用例遍历声明中的接口，用方法常量的 `meta` 构造请求、解码响应，请求与响应数据取自 `protocol-matrix.json` 中以接口名为键的条目，通过公共协议客户端与 Shadow 网关逐项执行为声明接口派生出的协议义务；另以空声明、多文件声明调用 `discoverDeclaredRoutes()`
- **THEN** 每条义务在 integration 与 weapp（真实 `wx.request`）中都有通过的证据；矩阵路由与声明一一对应，不取自示例路由；矩阵用例（integration 版、weapp 版与宿主协议运行器）不写死接口名，声明的每个接口都从矩阵 Fixture 中以接口名取到数据，缺少键时失败并指出接口名；空声明时不产生路由，矩阵用例断言按消费接口派生的义务为空并结束（业务错误码义务不在矩阵范围内）；场景门禁中与协议义务相关的问题数为 0。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "obligations-covered": "每条派生义务在要求的环境中都有真实执行且通过的证据",
    "real-client-path": "证据来自公共协议客户端与平台网络适配，而不是绕过执行器的替身",
    "routes-from-declaration": "矩阵的 Shadow 路由由消费接口声明经 discoverDeclaredRoutes() 生成，与声明一一对应，不取自示例路由",
    "empty-declaration-routes": "声明为空时 discoverDeclaredRoutes() 不产生路由，矩阵用例断言按消费接口派生的义务为空并结束",
    "matrix-iterates-declaration": "矩阵用例按声明遍历接口，以方法常量的 meta 构造请求、解码响应，数据取自 protocol-matrix.json 中以接口名为键的条目，缺少键时失败并指出接口名；用例代码不写死接口名，新增接口只改声明与矩阵 Fixture"
  },
  "cases": [
    {"key": "protocol-matrix", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["obligations-covered", "real-client-path", "routes-from-declaration", "matrix-iterates-declaration"]},
    {"key": "declared-routes", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["routes-from-declaration", "empty-declaration-routes"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-005 消费接口声明与实际调用双向对账
- **WHEN** 在受控临时根的产品包中分别构造：声明与调用一致；声明了但没有调用的方法；以 `request(X.meta, ...)` 形式调用但未声明的方法；从 generated 导入方法描述并作为参数传给 `request` 但未声明的方法（该方法来自 `idl/infra/trade/v1/trade.ts` 之外的 generated 文件）；再经真实场景门禁 CLI 运行
- **THEN** 一致时没有问题；未使用的声明与两种形式的未声明调用分别以"未使用的声明""未声明的调用"报出，并指出方法名与位置；存在任一问题时场景门禁失败。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "consistent-pass": "声明与实际调用一致时不报问题",
    "unused-declaration": "声明了但没有调用的方法被报为未使用的声明",
    "undeclared-call": "调用了但没有声明的方法被报为未声明的调用，并指出方法名与位置",
    "both-call-forms": "request(X.meta, ...) 与导入方法描述作为参数两种调用形式都被识别，识别不限于 trade.ts 中的方法",
    "gate-fails": "存在未使用的声明或未声明的调用时场景门禁失败"
  },
  "cases": [
    {"key": "call-scan-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["consistent-pass", "unused-declaration", "undeclared-call", "both-call-forms"]},
    {"key": "declaration-gate-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["unused-declaration", "undeclared-call", "gate-fails"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-03 Shadow 路由使用中立描述

Shadow 网关是外部交互替身的通用引擎，SHALL 只接收中立的路由描述：方法名、HTTP 方法与路径，以及可选的响应校验函数 `validateResponse`（见 PC-04）。Shadow 引擎（服务器、故障注入、请求比对）MUST NOT 导入 ProtoGen 生成的代码，该约束由依赖规则强制；响应校验函数由协议侧的路由来源注入，引擎只调用它，不感知协议种类。协议来源以"路由来源"的形式接入：IDL 路由来源把 ProtoGen 生成的方法描述转换为中立路由，并为每条路由注入由生成描述派生的响应结构校验器；生成描述缺少所需方法、路径或 HTTP 方法时 SHALL 报错，不得静默跳过。IDL 路由来源的单测 SHALL 直接以 generated 方法常量构造输入，MUST NOT 依赖模板示例目录（例如 `testing/shadow/example/`），删除模板示例后该证据仍然成立。IDL 协议义务派生直接读取生成的方法描述，不依赖 Shadow 路由类型。换用其他协议来源（例如 OpenAPI）时，只需新增一种路由来源（含其响应校验器），Shadow 引擎不变。

#### Scenario: SCN-PROTOCOL-CONTRACT-004 Shadow 引擎与协议来源解耦
- **WHEN** 用一条只有方法名、HTTP 方法与路径、不带响应校验函数的中立路由启动 Shadow 并发起请求；用 IDL 路由来源转换直接取自 generated 的方法常量（不经示例目录），并分别提供缺少方法与缺少路径的描述；在临时副本中让 Shadow 引擎文件导入 generated 代码并运行依赖检查
- **THEN** 中立路由按场景返回编排的响应并记录请求；IDL 路由来源产出与生成描述一致的方法名、HTTP 方法与路径，并为每条路由带上响应校验函数，缺失时报错；Shadow 引擎导入 generated 代码被依赖检查拒绝。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "neutral-route-served": "只含方法名、HTTP 方法与路径、不带响应校验函数的中立路由可被 Shadow 注册、按场景响应并记录请求",
    "idl-route-source": "IDL 路由来源从直接取自 generated 的方法常量产出一致的中立路由并注入响应校验函数，缺少方法、路径或 HTTP 方法时报错；单测输入不依赖模板示例目录",
    "engine-no-generated": "Shadow 引擎导入 generated 代码时被依赖检查拒绝"
  },
  "cases": [
    {"key": "neutral-route", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["neutral-route-served"]},
    {"key": "idl-route-source", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["idl-route-source"]},
    {"key": "engine-no-generated-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["engine-no-generated"]}
  ],
  "blockedBy": []
}
```
