## ADDED Requirements

### Requirement: PC-07 协议适配器

协议义务派生、Shadow 响应校验与 Fixture 的协议相关检查 MUST 按协议适配器插拔，门禁 MUST NOT 按协议种类写分支：新增一种协议只需新增协议包及其适配器（并在清单 schema 的 `protocolKind` 取值中登记），不修改门禁逻辑。

每个协议包 SHALL 在 `testing/adapter.ts` 导出一个协议适配器，包含以下五个方法：

| 方法 | 作用 |
|---|---|
| `resolveDeclaration(element)` | 把消费接口声明中的一个元素解析为 `{ key, prefix, meta }`；非法元素报错 |
| `deriveObligations(op, requestFields)` | 派生该接口的协议义务 |
| `responseValidator(op, options?)` | 返回 `(body, status) => issues`，由协议侧路由构造器注入 Shadow 路由（见 PC-04）；可选的 `options.manifest` 为调用方所校验的 Fixture 或预览数据集的 manifest，由适配器自行解释其中与本协议相关的字段（例如 OpenAPI 的 `contractCarrier`，见 OAS-04），不需要的适配器忽略它 |
| `checkFixture(manifest, files)` | 协议相关的 Fixture 检查，供 `check:fixtures` 对声明了该协议包的 Fixture 与预览数据集调用（见 GATE-16） |
| `scanCalls(sourceFiles)` | 静态扫描产品源码中的实际调用，用于声明与调用的双向检查 |

- **加载**：声明解析、义务派生与调用扫描 SHALL 对每个产品包经清单组合绑定找到其协议包；Fixture 与预览数据集的协议检查 SHALL 按其 manifest 声明的 `protocol` 找到协议包（见 GATE-16）；两者都按该包的 `packages[].protocolKind` 加载它的 `testing/adapter.ts`。协议包缺少该文件、或导出的适配器缺少上述任一方法时，门禁 MUST 报错并非零退出，指出协议包目录与缺少的方法。
- **IDL 适配器**：核心 Change 中只适配 IDL 的逻辑 MUST 整体迁入 IDL 协议包的适配器，行为不变：`resolveDeclaration` 接受 `createMethod` 常量并由其 generated 声明位置推导包名前缀（PC-01）；`deriveObligations` 为字段级派生（PC-01）；`responseValidator` 为 `deriveFields` 结构校验并忽略 `status`（PC-04）；`checkFixture` 不做额外检查，对任何输入返回空问题列表；`scanCalls` 识别 `request(<X>.meta, …)` 与导入的方法描述作为参数两种形式（PC-01）。迁移的回归证据为 PC-01、PC-04 现有 Scenario。
- **OpenAPI 适配器**：各方法的规则见 OAS-04、OAS-05、OAS-06。
- **位置与产物边界**：适配器放在协议包 `testing/`，供 Shadow 路由构造器与 `scripts/` 门禁共同导入；它 MUST NOT 进入协议包生产产物，生产代码导入适配器由依赖规则 `production-no-test` 拒绝。Shadow 引擎位于测试包 `packages/e2e/src/shadow/`（见 PC-03），MUST NOT 导入任何协议包的生成物与 `testing/` 模块（`shadow-engine-no-generated` 的路径随引擎迁移改为新引擎目录），只调用注入的校验函数；适配器与路由构造器也 MUST NOT 导入引擎。

#### Scenario: SCN-PROTOCOL-CONTRACT-014 门禁经清单与绑定加载协议适配器
- **WHEN** 在受控临时根中登记两条绑定，分别指向 `protocolKind` 为 `idl` 与 `openapi` 的两个协议包，两个包的 `testing/adapter.ts` 为记录调用的桩适配器；运行协议义务清单生成与场景门禁的双向检查；随后分别删除其中一个协议包的 `testing/adapter.ts`、让桩适配器缺少 `scanCalls`；另检查门禁脚本的非测试文件
- **THEN** 每个产品包的声明解析、义务派生与调用扫描都只调用其绑定协议包的适配器，调用次数与入参与绑定一致；缺少适配器文件或缺少方法时门禁报错并非零退出，指出协议包目录与缺少的方法；门禁脚本中不存在按 `protocolKind` 取值的分支。Fixture 与预览数据集按声明协议调用 `checkFixture` 的证据由 GATE-16 承担。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "adapter-by-binding": "门禁对每个产品包经绑定找到协议包，按 protocolKind 加载该包 testing/adapter.ts，声明解析、义务派生与调用扫描只调用该适配器",
    "adapter-interface-required": "缺少 testing/adapter.ts 或缺少 resolveDeclaration、deriveObligations、responseValidator、checkFixture、scanCalls 任一方法时报错并指出协议包与方法",
    "no-kind-branching": "门禁脚本的非测试文件中不存在按 protocolKind 取值的分支，协议相关逻辑全部经适配器调用"
  },
  "cases": [
    {"key": "adapter-loading-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["adapter-by-binding", "adapter-interface-required"]},
    {"key": "adapter-loading-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["adapter-by-binding", "adapter-interface-required"]},
    {"key": "no-kind-branching", "kind": "engineering", "requiredIn": ["integration"], "checks": ["no-kind-branching"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-015 IDL 适配器迁移后行为不变
- **WHEN** 在迁移前以核心 Change 的派生器对模板消费接口声明生成义务清单并保存为对照；迁移后经 IDL 适配器对同一声明依次调用 `resolveDeclaration`、`deriveObligations`、`scanCalls`，以 `responseValidator(op)` 校验 PC-04 的同一组输入，并以任意 Fixture 调用 `checkFixture`
- **THEN** 迁移后的义务 ID、case 与运行环境集合与对照完全一致；声明解析的前缀与非法元素报错与 PC-01 一致；两种调用形式都被识别；结构校验结论与 PC-04 一致且与 `status` 无关；`checkFixture` 返回空问题列表。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "obligations-unchanged": "经 IDL 适配器派生的义务 ID、case 与运行环境集合与迁移前对照一致",
    "declaration-unchanged": "resolveDeclaration 的前缀推导与非法元素报错与 PC-01 一致",
    "scan-unchanged": "scanCalls 识别 request(X.meta, ...) 与导入方法描述作为参数两种调用形式",
    "validator-unchanged": "responseValidator 的结论与 PC-04 一致且忽略 status",
    "idl-fixture-noop": "IDL 适配器的 checkFixture 不做额外检查，返回空问题列表"
  },
  "cases": [
    {"key": "idl-adapter-regression", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["obligations-unchanged", "declaration-unchanged", "scan-unchanged", "idl-fixture-noop"]},
    {"key": "idl-adapter-validator", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["validator-unchanged"]},
    {"key": "idl-adapter-inventory-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["obligations-unchanged"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-016 协议适配器不进入生产产物
- **WHEN** 构建清单中的每个协议包并检查产物；在受控临时根中让协议包 `src/` 下的生产代码导入 `testing/adapter.ts`，运行依赖检查，随后恢复
- **THEN** 每个协议包的产物中都不包含适配器或其依赖的完整契约与测试设施；生产代码导入适配器被 `production-no-test` 规则拒绝并指出文件；恢复后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "adapter-not-in-dist": "每个协议包的产物中不包含 testing/adapter.ts 及其依赖的测试设施",
    "production-import-blocked": "生产代码导入适配器被 production-no-test 规则拒绝并指出文件",
    "adapter-boundary-restorable": "恢复后依赖检查通过"
  },
  "cases": [
    {"key": "adapter-artifact-boundary", "kind": "engineering", "requiredIn": ["integration"], "checks": ["adapter-not-in-dist", "production-import-blocked", "adapter-boundary-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-08 IDL 协议包的浏览器网络适配器

IDL 协议包 SHALL 提供基于 `fetch` 的 `HttpPort` 实现 `packages/protocol/src/adapters/network/fetch.ts`，使"Web 应用 + IDL + 浏览器"组合可用。协议包根入口 MUST 具名导出平台网络工厂 `createFetchHttp`，写法与 `createWechatMiniappHttp` 一致；复用现有根入口、双格式声明与 dist 清单，不新增平台子路径或测试出口；`sdk` 形态产品包根入口 MUST NOT 转导出它。

行为义务与小程序网络适配器一致：

- 模块导入或调用 `createFetchHttp()` 时 MUST NOT 读取平台全局，发送时才读取 `globalThis.fetch`；
- 发送前已停止（取消）或超时预算已耗尽时，直接交付 `CANCELLED` 或 `TIMEOUT`，MUST NOT 访问平台；
- 结果只交付一次：先锁定结果再清理计时器与取消订阅，迟到或重复的结果无效；
- 超时与取消以适配器自有计时器加 `AbortController` 区分，分别交付 `TIMEOUT` 与 `CANCELLED`，平台层失败交付 `NETWORK_ERROR`；
- 读取响应体同样计入超时预算；HTTP 非 2xx 仍是有效的 HTTP 响应，交给协议执行器处理；
- 适配器 MUST NOT 自动重放请求；
- 请求选项固定 `credentials: 'same-origin'`、`cache: 'no-store'`。

**集成测试使用生产实现**：`packages/e2e/src/drivers/node.ts` MUST 删除，integration 用例 SHALL 使用协议包根入口的 `createFetchHttp`（Node 22 全局 `fetch`）发出请求，使"SDK 工厂与测试消费同一生产实现"（根 AGENTS 执行规则 7）对 integration 同样成立。

**浏览器步骤执行器**：IDL 协议包 SHALL 在 `testing/browser-runner.ts` 提供协议宿主页面内的步骤执行器（协议宿主机制见 BRW-02）。执行器 MUST 只经协议包根入口（包名，在宿主中解析到 `dist`）导入公共客户端与 `createFetchHttp`，按计划步骤指定的方法描述与请求数据经公共客户端执行，并把结果以可序列化的形式回传；执行器 MUST NOT 写死具体接口，计划步骤引用的方法无法解析时回传错误结果并指出方法名。执行器位于 `testing/`，MUST NOT 进入协议包生产产物（`production-no-test`），由 protocol-unit 单测覆盖（SCN-PROTOCOL-CONTRACT-021）。IDL 义务的浏览器证据只在交叉复刻演练（Web 应用 + IDL + 浏览器）中经协议宿主加载该执行器取得，模板门禁不要求（见 PC-01）。

**浏览器传输层重发**：Chromium 在复用连接被零字节断开时会自动重发 POST，SDK 无法控制。"不自动重放"只约束 SDK 与协议包自身，幂等由服务端依 `X-Request-Id` 保证。这一点 SHALL 写入协议包 AGENTS.md 与使用指南；浏览器网络错误因此设两道防线：用例使用 `partial-then-disconnect` 故障（见 PC-06），共用代理中间件在上游零字节断开时返回不完整响应兜底（见 BRW-03）。

#### Scenario: SCN-PROTOCOL-CONTRACT-017 fetch 适配器遵守网络适配器行为义务
- **WHEN** 以可控的假 `fetch` 与假计时器驱动 `createFetchHttp()`：在导入与创建时不提供 `globalThis.fetch`；发送前已停止、预算为 0；正常响应、HTTP 500 响应；在 `fetch` 返回前与读取响应体期间分别触发超时与取消；`fetch` 拒绝；超时后再到达迟到的响应；检查传给 `fetch` 的选项与调用次数
- **THEN** 导入与创建不读取平台全局，发送时才读取；发送前已停止或预算耗尽时交付 `CANCELLED` 或 `TIMEOUT` 且 `fetch` 未被调用；正常与 HTTP 500 响应都作为 HTTP 响应交付；`fetch` 返回前与读取响应体期间的超时交付 `TIMEOUT`、取消交付 `CANCELLED` 且请求被中止；`fetch` 拒绝交付 `NETWORK_ERROR`；每次发送只交付一个结果，迟到结果无效；`fetch` 每次发送只被调用一次，选项含 `credentials: 'same-origin'` 与 `cache: 'no-store'`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "lazy-global": "导入与创建时不读取平台全局，发送时才读取 globalThis.fetch",
    "pre-send-short-circuit": "发送前已停止或预算耗尽时交付 CANCELLED 或 TIMEOUT 且不访问平台",
    "single-delivery": "结果只交付一次，先锁定再清理，迟到或重复结果无效",
    "timeout-cancel-distinct": "超时与取消由自有计时器与 AbortController 区分，读取响应体也计入预算",
    "http-and-network-results": "非 2xx 作为 HTTP 响应交付，fetch 拒绝交付 NETWORK_ERROR",
    "no-replay-and-options": "每次发送只调用一次 fetch，不自动重放，选项含 credentials same-origin 与 cache no-store"
  },
  "cases": [
    {"key": "fetch-adapter-rules", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["lazy-global", "pre-send-short-circuit", "single-delivery", "timeout-cancel-distinct", "http-and-network-results", "no-replay-and-options"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-018 integration 经生产 fetch 实现访问 Shadow
- **WHEN** integration 用例以协议包根入口的 `createFetchHttp()` 创建协议客户端，经 Shadow 分别请求返回成功响应、HTTP 错误状态、超过超时的延迟、请求中途取消与零字节断开的路由；另检查测试包驱动目录与 integration 用例的导入，以及协议包与 `sdk` 产品包根入口的导出
- **THEN** 五类请求分别得到成功响应、HTTP 状态结果、`TIMEOUT`、`CANCELLED` 与 `NETWORK_ERROR`，Shadow 对每类请求都只记录一次；`packages/e2e/src/drivers/node.ts` 不存在，integration 用例不使用测试专用的网络驱动；协议包根入口具名导出 `createFetchHttp`，`sdk` 产品包根入口不导出它。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "production-fetch-results": "经 createFetchHttp 与 Shadow 的成功、HTTP 状态、超时、取消、零字节断开分别得到对应结果，每类请求只被记录一次",
    "node-driver-removed": "packages/e2e/src/drivers/node.ts 已删除，integration 用例使用协议包根入口的生产实现而非测试专用驱动",
    "root-export": "协议包根入口具名导出 createFetchHttp，sdk 产品包根入口不转导出"
  },
  "cases": [
    {"key": "fetch-through-shadow", "kind": "behavior", "requiredIn": ["integration"], "checks": ["production-fetch-results"]},
    {"key": "production-network-wiring", "kind": "engineering", "requiredIn": ["integration"], "checks": ["node-driver-removed", "root-export"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-021 IDL 浏览器步骤执行器按计划步骤执行并回传结果
- **WHEN** 在 protocol-unit 单测中以可控的假 `fetch` 加载 IDL 协议包 `testing/browser-runner.ts`，依次下发：以 generated 中 `CreateTrade` 方法描述发起、假 `fetch` 返回成功响应的计划步骤；返回 HTTP 500 的步骤；`fetch` 拒绝的步骤；引用无法解析的方法的步骤；另检查执行器源码的导入
- **THEN** 前三个步骤分别回传成功响应、HTTP 状态结果与 `NETWORK_ERROR`，每个步骤只调用一次 `fetch`，回传结果可序列化（结构化克隆后与原结果相等）；无法解析方法的步骤回传错误结果并指出方法名，执行器不抛出未处理异常；执行器源码中不写死接口名，只经协议包根入口（包名）导入公共客户端与 `createFetchHttp`，不以相对路径导入协议包 `src/`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "plan-step-executed": "计划步骤经公共客户端与 createFetchHttp 执行，成功、HTTP 状态与网络错误分别回传对应结果，每个步骤只调用一次 fetch",
    "result-serializable": "回传结果可序列化，结构化克隆后与原结果相等",
    "unresolved-step-reported": "引用无法解析的方法的步骤回传错误结果并指出方法名，不抛出未处理异常",
    "runner-generic-and-root-import": "执行器不写死接口名，只经协议包根入口导入公共客户端与 createFetchHttp，不以相对路径导入 src/"
  },
  "cases": [
    {"key": "idl-browser-runner", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["plan-step-executed", "result-serializable", "unresolved-step-reported", "runner-generic-and-root-import"]}
  ],
  "blockedBy": []
}
```

## MODIFIED Requirements

### Requirement: PC-01 基于 IDL 的协议义务派生

本要求规定 `protocolKind` 为 `idl` 的协议包的义务派生。下文的声明解析、义务派生与调用扫描 SHALL 由 IDL 协议适配器（协议包 `testing/adapter.ts`，见 PC-07）的 `resolveDeclaration`、`deriveObligations` 与 `scanCalls` 实现；核心 Change 中的 IDL 专用逻辑整体迁入该适配器，行为不变，本要求的 Scenario 作为迁移回归。

工程 MUST 从 ProtoGen 生成的协议描述，为产品包声明的消费接口自动派生协议义务清单。消费接口由清单中每个绑定到 IDL 协议包的 product 角色包的 `packages[].consumedOperations` 登记的模块确定，每个产品包分别派生：该模块 SHALL 导出名为 `consumedOperations` 的数组，每个元素 MUST 是 `{ method, requestFields }`：

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

义务的运行环境 SHALL 按组合绑定取值（见 GATE-07）：路由、字段与共享方法义务取全部 integration 类项目加产品所在绑定的 `platforms`，错误码义务取全部 integration 类项目。模板中 IDL 协议包只被 `sdk-idl-weapp` 绑定引用，其平台项目为 `weapp`；"Web 应用 + IDL + 浏览器"组合只在交叉复刻演练的隔离副本中验证，不进入模板门禁，模板门禁 MUST NOT 要求 IDL 义务的浏览器证据。integration 用例 SHALL 使用协议包根入口的 `createFetchHttp` 生产实现发出请求（见 PC-08）。

义务包括：HTTP 路由；请求与响应每个可达字段的映射与编码边界；公共请求上下文（Header 与 BaseReq）；响应处理；通信错误处理；业务错误码处理；超时。业务错误码义务的来源 SHALL 是协议包手写的 `businessErrors` 目录（PC-02 的事实源），不取示例 Fixture。每条义务的必需 case 与运行环境由派生规则给出，覆盖分母以派生结果为准（见 GATE-07），不从已有测试反推。无法判定映射方式的字段 SHALL 标为待定并报告，不得静默忽略。派生不得包含未声明的接口。

声明与实际调用 MUST 双向一致：工程经 IDL 适配器的 `scanCalls` 以 TS AST 静态扫描产品包源码，收集实际调用集合，包括 `<协议客户端>.request(<X>.meta, ...)` 形式的调用，以及从 generated 模块导入、并作为参数传给 `request` 的方法描述。声明了但没有调用的方法报"未使用的声明"；调用了但没有声明的方法报"未声明的调用"；两类问题都 SHALL 计入场景门禁的问题并指出方法名与位置。

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
- **THEN** 每条义务在 integration（经协议包根入口的 `createFetchHttp` 生产实现）与 IDL 协议包所在绑定的平台项目 weapp（真实 `wx.request`）中都有通过的证据，不要求其他绑定平台（如 browser）的证据；矩阵路由与声明一一对应，不取自示例路由；矩阵用例（integration 版、weapp 版与宿主协议运行器）不写死接口名，声明的每个接口都从矩阵 Fixture 中以接口名取到数据，缺少键时失败并指出接口名；空声明时不产生路由，矩阵用例断言按消费接口派生的义务为空并结束（业务错误码义务不在矩阵范围内）；场景门禁中与协议义务相关的问题数为 0。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "obligations-covered": "每条派生义务在要求的环境中都有真实执行且通过的证据",
    "real-client-path": "证据来自公共协议客户端与平台网络适配，而不是绕过执行器的替身；integration 使用协议包根入口的 createFetchHttp 生产实现，weapp 使用真实 wx.request",
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

Shadow 网关是外部交互替身的通用引擎，SHALL 只接收中立的路由描述：方法名、HTTP 方法与路径，以及可选的响应校验函数 `validateResponse`（见 PC-04）。Shadow 引擎（服务器、故障注入、请求比对）MUST NOT 导入 ProtoGen 生成的代码，该约束由依赖规则强制；响应校验函数由协议侧的路由来源注入，引擎只调用它，不感知协议种类。协议来源以"路由来源"的形式接入：IDL 路由来源把 ProtoGen 生成的方法描述转换为中立路由，并为每条路由注入 IDL 协议适配器 `responseValidator(op)` 返回的响应结构校验器（见 PC-07）；生成描述缺少所需方法、路径或 HTTP 方法时 SHALL 报错，不得静默跳过。IDL 路由来源的单测 SHALL 直接以 generated 方法常量构造输入，MUST NOT 依赖模板示例目录（例如 `testing/shadow/example/`），删除模板示例后该证据仍然成立。IDL 协议义务派生直接读取生成的方法描述，不依赖 Shadow 路由类型。换用其他协议来源（例如 OpenAPI）时，只需新增一种路由来源，响应校验器由该协议适配器的 `responseValidator(op)` 提供，Shadow 引擎不变；OpenAPI 路由来源的具体规则见 OAS-06。

**引擎归属**：Shadow 引擎（`server.ts`、`faults.ts`、`routes.ts`、`requests.ts` 及预览构造模块，见 PC-06）SHALL 位于测试包 `packages/e2e/src/shadow/`，属于测试基础设施，不属于任何协议选项，删除某个协议包时引擎及其单测 MUST 保留且不受影响。各协议包的 `testing/` SHALL 只保留协议相关部分：路由构造器（IDL 的 `idl-routes.ts`、OpenAPI 的 `shadow-routes.ts`）产出中立路由描述（含注入的 `validateResponse`），以及协议适配器（`adapter.ts`，见 PC-07）与浏览器步骤执行器（`browser-runner.ts`，见 PC-08、OAS-03）；它们 MUST NOT 导入引擎，由 ENG-05 的"协议包不得依赖测试包"规则强制；协议包的测试文件同样 MUST NOT 导入引擎。验证引擎自身行为的证据（构造时校验失败的位置信息、`validateResponse` 的入参、`malformed` 认领跳过校验、`headerPatterns` 与 `verify()` 等）SHALL 在 test-tools-unit 中以中立路由加注入的校验函数验证，不导入任何协议包；验证 IDL 校验器本身（字段结构、编码、oneof、动态类型待定）的证据 SHALL 留在 protocol-unit，只调用 IDL 路由构造器与校验器，不构造引擎。依赖规则 `shadow-engine-no-generated` SHALL 作用于 `packages/e2e/src/shadow/` 下的非测试文件：引擎导入任何协议包的 `src/generated/` 或 `testing/` 模块时被拒绝。测试别名 `@template-test/protocol` SHALL 拆分：引擎从 `packages/e2e/src/shadow/` 的入口导入；各协议包 testing 入口只导出路由构造器、适配器与执行器。

#### Scenario: SCN-PROTOCOL-CONTRACT-004 Shadow 引擎与协议来源解耦
- **WHEN** 用一条只有方法名、HTTP 方法与路径、不带响应校验函数的中立路由启动位于 `packages/e2e/src/shadow/` 的 Shadow 引擎并发起请求；用 IDL 路由来源转换直接取自 generated 的方法常量（不经示例目录），并分别提供缺少方法与缺少路径的描述；在临时副本中分别让引擎目录下的非测试文件导入协议包 generated 代码、导入协议包 `testing/` 下的路由构造器，让协议包 `testing/` 下的路由构造器导入引擎，并运行依赖检查；检查协议包 testing 入口的导出
- **THEN** 中立路由按场景返回编排的响应并记录请求；IDL 路由来源产出与生成描述一致的方法名、HTTP 方法与路径，并为每条路由带上响应校验函数，缺失时报错；引擎导入 generated 代码或协议包 testing 模块都被 `shadow-engine-no-generated` 拒绝并指出文件；协议包 testing 模块导入引擎被"协议包不得依赖测试包"规则拒绝；协议包 testing 入口只导出路由构造器、适配器与执行器，不导出 `createShadowServer` 等引擎接口。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "neutral-route-served": "只含方法名、HTTP 方法与路径、不带响应校验函数的中立路由可被 packages/e2e/src/shadow/ 下的 Shadow 引擎注册、按场景响应并记录请求",
    "idl-route-source": "IDL 路由来源从直接取自 generated 的方法常量产出一致的中立路由并注入响应校验函数，缺少方法、路径或 HTTP 方法时报错；单测输入不依赖模板示例目录",
    "engine-no-generated": "packages/e2e/src/shadow/ 下的引擎文件导入协议包 generated 代码或 testing 模块时被 shadow-engine-no-generated 拒绝并指出文件",
    "engine-in-test-infra": "Shadow 引擎位于测试包 packages/e2e/src/shadow/；协议包 testing/ 只含路由构造器、适配器与浏览器执行器，其入口不导出引擎接口，导入引擎被协议包不得依赖测试包的规则拒绝"
  },
  "cases": [
    {"key": "neutral-route", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["neutral-route-served"]},
    {"key": "idl-route-source", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["idl-route-source"]},
    {"key": "engine-no-generated-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["engine-no-generated", "engine-in-test-infra"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-04 Fixture 响应与协议同形

Shadow 返回给被测客户端的每个响应体 MUST 与协议来源描述的响应结构同形，无论响应来自 Fixture JSON 还是测试代码中的内联配置。校验 SHALL 在 Shadow 构造场景时（`createShadowServer`）进行，不在 `check:fixtures` 中进行，以同时覆盖两种来源。

- Shadow 路由描述 SHALL 支持可选的响应校验函数 `validateResponse(body, status)`，入参为 step 的响应体与 HTTP 状态码，返回问题列表（空列表表示同形）。签名由 `(body)` 扩为 `(body, status)`，以便按状态码区分响应结构的协议（如 OpenAPI）使用；IDL 结构校验器 MUST 忽略 `status`，对同一响应体在任意状态码下给出相同结论。校验函数 MUST 由协议侧的路由构造器注入，来源为对应协议适配器的 `responseValidator(op)`（见 PC-07）：IDL 路由来源为每条路由注入由 generated 描述派生的结构校验器；Shadow 引擎本身 MUST NOT 依赖 generated 代码（见 PC-03），未携带校验函数的中立路由不做结构校验。
- IDL 结构校验器 SHALL 复用协议义务派生的字段解析（可达字段、可选性、oneof 与编码），并在以下情况判定失败：出现响应类型中不存在的字段；字段的编码或类型不符（例如 int64 必须是十进制字符串、枚举必须是合法的枚举名称）；同一 oneof 出现多个分支。缺少非 presence 字段 MUST NOT 判错（符合 proto3 默认值语义）。
- 遇到无法判定的字段类型（例如 `Any`、`Struct` 等动态类型）时，校验器 SHALL 报告"待定"并判定失败，不得放行。
- 任一路由的任一 step 响应体校验失败时，`createShadowServer` MUST 立即抛错，错误信息 SHALL 包含路由方法名、step 序号与字段路径。
- 用例需要故意返回非法响应时（例如解码错误义务），step MUST 显式声明 `malformed: { reason }`（`reason` 为非空说明）才跳过该 step 的结构校验；未声明的 step 一律校验，不存在"不声明即不校验"的路径。

#### Scenario: SCN-PROTOCOL-CONTRACT-006 同形响应被接受、不同形响应在构造时被拒绝
- **WHEN** 在 protocol-unit 中只调用 IDL 路由来源与其注入的结构校验器（不构造 Shadow 引擎），对 `CreateTrade`、`QueryTrade` 依次校验：合法响应、缺少非 presence 字段、含未知字段、int64 以数字表示、枚举为非法名称、同一 oneof 出现两个分支，并以不同状态码校验同一响应体；另在 test-tools-unit 中以中立路由加注入的校验函数（不导入任何协议包）构造 Shadow：校验函数记录入参并对指定 step 返回带字段路径的问题，step 分别来自 Fixture JSON 与测试代码内联 body，其中一条 step 带非 200 状态码
- **THEN** IDL 结构校验器对合法响应与缺少非 presence 字段的响应返回空问题列表，对其余输入返回带字段路径的问题，在不同状态码下结论相同；注入的校验函数返回问题时 Shadow 引擎在 `createShadowServer` 立即抛错，错误信息指出路由方法名、step 序号与字段路径，返回空列表时构造成功；两种来源的判定结果一致；校验函数收到该 step 的响应体与状态码。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "conforming-accepted": "IDL 结构校验器对与 generated 描述同形的响应返回空问题列表",
    "absent-default-accepted": "IDL 结构校验器对缺少非 presence 字段不判错",
    "unknown-field-rejected": "IDL 结构校验器对响应类型中不存在的字段报出问题",
    "encoding-rejected": "IDL 结构校验器对 int64 非十进制字符串、枚举非合法名称等编码或类型不符报出问题",
    "oneof-conflict-rejected": "IDL 结构校验器对同一 oneof 出现多个分支报出问题",
    "idl-issue-path": "IDL 结构校验器报出的每个问题都带字段路径",
    "issues-reject-construction": "注入的校验函数对任一 step 返回非空问题时 createShadowServer 立即抛错，返回空列表时构造成功；以中立路由加注入校验函数验证，不导入协议包",
    "error-location": "失败信息包含路由方法名、step 序号与字段路径",
    "both-sources": "Fixture JSON 与内联 body 两种来源走同一校验且结果一致",
    "status-passed": "Shadow 调用 validateResponse 时传入 step 的响应体与 HTTP 状态码",
    "idl-ignores-status": "IDL 结构校验器忽略 status，同一响应体在不同状态码下结论相同"
  },
  "cases": [
    {"key": "idl-validator-rules", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["conforming-accepted", "absent-default-accepted", "unknown-field-rejected", "encoding-rejected", "oneof-conflict-rejected", "idl-issue-path", "idl-ignores-status"]},
    {"key": "shadow-construction", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["issues-reject-construction", "error-location", "both-sources", "status-passed"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-007 非法响应必须显式认领，动态类型报待定
- **WHEN** 在 test-tools-unit 中以中立路由加注入的校验函数（对该响应体返回问题，不导入任何协议包）构造 Shadow：一个 step 声明 `malformed: { reason }` 并返回不同形的响应体，另一个 step 返回同样的响应体但不声明 `malformed`；另在 protocol-unit 中以含动态类型字段（如 `Any` 或 `Struct`）的描述生成 IDL 结构校验器并直接校验响应（不构造引擎）
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
    {"key": "malformed-claim-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["claimed-skipped", "unclaimed-rejected"]},
    {"key": "idl-dynamic-pending", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["dynamic-pending"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-05 X-Request-Id 按公司规范生成

请求 ID 的头名、格式与生成规则以公司规范为准，规范来源为 dq-tech-ai-plugin 中 `dq-be-core/skills/dq-be-libs/references/common-sdk.md` 第 92–97 行，以及 `dq-be-idl-convention`、`dq-fe-troubleshooting` 中的相关条目。

- **头名**：协议包发出的每个请求 MUST 在请求头 `X-Request-Id` 中携带请求 ID，MUST NOT 再发送 `request_id` 头。同一个值 SHALL 同时写入 `BaseReq.requestId`。
- **格式**：请求 ID MUST 为 `yyyyMMdd_HHmmss_SSS_abcdef`，共 26 个字符（匹配 `^\d{8}_\d{6}_\d{3}_[a-z]{6}$`）。时间部分 SHALL 按北京时间（UTC+8）计算，不依赖宿主时区；末尾 6 位为随机小写字母，标准生成器默认 SHALL 用 `Math.random` 生成，小程序、浏览器与 Node 使用同一实现，不设平台点位。请求 ID 只用于链路追踪，不是凭据，不要求密码学安全。
- **生成方**：请求 ID MUST 由协议包 `transport/` 中的标准生成器生成，每次请求都生成新值。模板没有自动重试，重试时是否复用请求 ID 不在本 Requirement 范围内。
- **不可覆盖（公共 API 破坏性变更）**：协议包公共选项 `ProtocolClientOptions` MUST 删除 `runtime.nextRequestId`，SDK 运行时端口 MUST 删除同名能力；宿主无论经 SDK 还是直接使用协议客户端，都无法覆盖或注入请求 ID。SDK 内不得保留其他请求 ID 生成器（删除带 `pay-` 前缀的旧实现）。这是协议包与产品包公共 API 的破坏性变更，双格式类型声明随之变化，SHALL 在 Change 说明与指南能力地图中注明。
- **测试确定性**：用例 MUST NOT 依赖可预测的请求 ID：Shadow 以 `headerPatterns` 校验格式，并比对同一请求中 `X-Request-Id` 头与 `BaseReq.requestId` 相等。标准生成器的时钟与随机源只能通过内部参数注入供单测使用，这些参数 MUST NOT 出现在协议包与产品包的任何公共导出中。
- **校验**：Shadow 的期望请求 SHALL 支持 `headerPatterns`（请求头名到正则的映射），用于校验每次变化的请求头；不匹配或缺失时由 `verify()` 报出头名与期望模式。协议义务中的公共请求上下文义务 SHALL 校验 `X-Request-Id` 的头名与格式。
- 标准生成器的单测 MUST 在显式设置的非 +8 时区（`TZ`）下运行，以证明不依赖宿主时区。

**适用范围**：本要求适用于清单中的全部协议包。每个协议包在自己的 `transport/` 中各有一份标准生成器（不为此新建共享包），头名、格式、北京时间与随机后缀、每次请求生成新值、宿主不可覆盖、时钟与随机源不进入公共导出、非 +8 时区单测这些条款对每个协议包都成立，并由 SCN-PROTOCOL-CONTRACT-009 这同一组格式 Scenario 约束两份实现。"同一个值写入 `BaseReq.requestId`"与"头与 `BaseReq.requestId` 相等"只适用于 IDL 协议包；OpenAPI 协议没有 BaseReq，不适用这两条。删除 `runtime.nextRequestId` 与 SDK 运行时端口同名能力是针对 IDL 协议包与 `sdk` 产品包的历史变更；OpenAPI 协议包的请求 ID 线上证据由 OAS-03 承担。

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
- **WHEN** 对清单中每个协议包的标准生成器，在显式设置的非 +8 时区（例如 `TZ=UTC` 与 `TZ=America/Los_Angeles`）下，以固定时刻与可控随机源调用，时刻包含跨越北京日期边界的情况（UTC 当日 16:00 之后）
- **THEN** 时间部分等于该时刻的北京时间（含毫秒）；末尾 6 位为小写字母且由注入的随机源映射得到；未注入随机源时默认使用 `Math.random`；结果长度为 26；不同宿主时区下结果相同。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "beijing-time": "时间部分按 UTC+8 计算，跨北京日期边界时日期正确",
    "tz-independent": "在非 +8 时区下运行结果与宿主时区无关",
    "random-suffix": "末尾 6 位为小写字母且由注入的随机源映射得到，未注入时默认随机源为 Math.random",
    "fixed-length": "生成结果恰为 26 个字符"
  },
  "cases": [
    {"key": "generator-non-beijing-tz", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["beijing-time", "tz-independent", "random-suffix", "fixed-length"]},
    {"key": "openapi-generator-non-beijing-tz", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["beijing-time", "tz-independent", "random-suffix", "fixed-length"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-010 Shadow 与协议义务按头名和格式校验请求 ID
- **WHEN** 在 test-tools-unit 中以中立路由（不导入任何协议包）启动 Shadow，期望请求以 `headerPatterns` 声明 `X-Request-Id` 的格式正则，分别发送符合格式、缺少该头、只带旧 `request_id` 头、格式错误的请求；另运行协议义务派生
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
    {"key": "shadow-header-patterns", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["pattern-match", "pattern-mismatch-reported"]},
    {"key": "context-obligation", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["obligation-header"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-06 Shadow 请求记录、路径转换与有界轮询

Shadow 网关 MUST 让被测客户端发出的每个请求都可见，SHALL 正确注册带路径参数的路由，并只在平台类测试项目中允许有界轮询。Shadow 服务测试与本地预览两种用途，均不进入生产产物；引擎位于测试包 `packages/e2e/src/shadow/`（见 PC-03），本要求各条的单测随引擎在 test-tools-unit 中运行；以下各条除"预览模式"一条另有规定外，均指测试模式。

- **请求记录**：已注册路由在当前场景未编排时，Shadow SHALL 返回 404，并 MUST 将该请求写入 `records()`，`verify()` 报"未编排的请求"。未注册路径的请求 SHALL 由兜底处理器接住，返回 404，写入记录，`verify()` 报"未注册的请求"。无论客户端对 404 是否容错，多发的请求都 MUST 在 `verify()` 中可见。
- **路径转换**：注册路由前，Shadow SHALL 把路径中的 `{name}` 转换为 `:name`；转换后路径仍含 `{` 或 `}` 时，构造 MUST 报错。
- **有界轮询**：路由编排 SHALL 支持 `poll: { maxRequests: K }`。`steps` 用完后，后续请求重复最后一个 step，直到总请求数达到 K；每次超出 `steps` 的请求 MUST 仍按最后一个期望请求校验参数与请求头；超过 K 次的请求返回 409 并计入 `verify()` 的问题。使用 `poll` 而 `steps` 为空时，构造 MUST 报错。
- **使用范围**：用例构造 Shadow 时 MUST 传入运行环境类别 `environmentClass`（由 `defineCase` 上下文按清单测试项目类别提供）；任一路由使用 `poll`、而 `environmentClass` 不是 `platform` 时，构造 MUST 立即抛错，使集成用例的次数证据始终是精确的。
- **部分响应后断开**：step SHALL 支持故障 `partial-then-disconnect`：Shadow 先发出响应头与部分响应体，再销毁连接，使客户端得到"响应不完整"的网络错误。浏览器平台的网络错误用例 SHALL 使用该故障（主防线）；零字节断开（现有 `disconnect`）只用于 integration，因为浏览器会对复用连接上的零字节断开静默重发请求（见 PC-08）；共用代理中间件的兜底与对照证据见 BRW-03。
- **预览模式**：Shadow SHALL 支持服务器级模式 `mode: 'test' | 'preview'`，默认 `test`。`preview` 只服务本地预览，只做序列状态：
  - 预览数据由显式条目 `[{ operationId, pathParams?, responses: [{ status?, body }] }]` 提供（数据集结构与校验见 GATE-16）：`status` 缺省为 200；声明了 `pathParams` 的条目只匹配路径参数完全相同的请求，未声明 `pathParams` 的条目匹配该接口任意路径参数的请求；两者都能匹配时，声明了 `pathParams` 的条目优先；每个条目按"条目 + 实际路径参数"分别维护序列游标。
  - 每条路由按"接口 + 路径参数"匹配响应序列，同一接口不同路径参数各自维护序列；按顺序返回，序列用完后无限重复最后一条，没有次数上限；不模拟写操作后的业务状态推进。
  - 未编排与未注册的请求照常返回 404、写入 `records()` 并在控制台打印，但 MUST NOT 判为问题。
  - 响应仍按 PC-04 在构造时做同形校验。
  - **构造入口受限**：preview 模式的 Shadow MUST 只能经预览构造函数 `createPreviewShadowServer` 创建，测试模式的构造入口（`createShadowServer`）MUST 拒绝 `mode: 'preview'`。`createPreviewShadowServer` SHALL 位于引擎目录 `packages/e2e/src/shadow/` 下的独立模块，MUST NOT 被引擎入口转导出；依赖规则 SHALL 按模块限定只有预览启动器目录 `packages/e2e/src/preview/` 可以导入该模块，用例、harness 与其他位置直接导入该模块被依赖检查拒绝并指出文件，且无法经引擎入口绕过。用例 MAY 经预览启动器 API 取得预览证据（见 BRW-07），但 MUST NOT 以预览模式产生请求次数证据，次数证据只来自测试模式。测试模式仍 MUST 传入 `environmentClass`。

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
    {"key": "request-recording", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["unscripted-recorded", "unregistered-recorded", "scripted-clean"]}
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
    {"key": "path-template", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["template-converted", "residual-brace-rejected"]}
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
    {"key": "bounded-poll", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["repeat-last-step", "overflow-still-validated", "over-limit-reported", "empty-steps-rejected", "platform-only"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-019 预览模式按序列返回响应且不判问题
- **WHEN** 经 `createPreviewShadowServer` 构造 Shadow，为带路径参数的同一接口编排两组声明了 `pathParams` 的条目，各含 2 条响应，对第一组路径参数依次发送 4 次请求、对第二组发送 1 次请求；为另一个带路径参数的接口编排一个不声明 `pathParams` 的条目，其响应中一条不写 `status`、一条写非 200 的 `status`，以任意路径参数请求两次；再请求一条已注册但未编排的路由与一个未注册路径，并调用 `verify()`；另以含不同形响应体的序列构造预览模式 Shadow；另分别以测试模式的构造入口传入 `mode: 'preview'`、以测试模式不传 `environmentClass` 构造；另检查引擎入口的导出；另在受控临时根中分别让 `packages/e2e/src/preview/` 下的模块、`packages/e2e/tests/` 下的用例文件与 harness 导入 `createPreviewShadowServer` 所在模块，并让引擎入口转导出该函数后由用例经入口导入，运行依赖检查
- **THEN** 第一组路径参数的第 1、2 次请求依次得到两条响应，第 3、4 次重复最后一条且没有次数上限导致的 409；第二组路径参数独立从其第一条开始；不声明 `pathParams` 的条目匹配任意路径参数，未写 `status` 的响应以 200 返回，写了 `status` 的以该状态码返回；未编排与未注册的请求返回 404、出现在 `records()` 中并打印到控制台，`verify()` 不报问题；不同形的响应体在构造时被拒绝；测试模式的构造入口拒绝 `mode: 'preview'`，测试模式缺少 `environmentClass` 在构造时抛错；`createPreviewShadowServer` 位于引擎目录下的独立模块，引擎入口不导出它；预览启动器目录导入该模块通过依赖检查，用例文件与 harness 导入被拒绝并指出文件，引擎入口转导出后经入口导入同样被拒绝。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "sequence-by-operation-and-params": "预览模式按接口加路径参数匹配响应序列并按顺序返回，不同路径参数各自独立",
    "dataset-entry-matching": "声明 pathParams 的条目精确匹配，未声明的条目匹配该接口任意路径参数；status 缺省为 200",
    "repeat-last-unbounded": "序列用完后无限重复最后一条，没有次数上限",
    "unmatched-not-problems": "未编排与未注册的请求返回 404、写入记录并在控制台打印，verify 不判为问题",
    "preview-validated": "预览模式的响应同样在构造时做同形校验",
    "preview-entry-separate": "preview 模式只能经 createPreviewShadowServer 创建，测试模式的构造入口拒绝 mode: 'preview'，测试模式仍要求 environmentClass",
    "preview-construction-restricted": "createPreviewShadowServer 位于 packages/e2e/src/shadow/ 下的独立模块且不被引擎入口转导出；依赖规则按模块只允许 packages/e2e/src/preview/ 导入该模块，用例、harness 等其他位置导入或经引擎入口转导出绕过时被拒绝并指出文件"
  },
  "cases": [
    {"key": "preview-mode", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["sequence-by-operation-and-params", "dataset-entry-matching", "repeat-last-unbounded", "unmatched-not-problems", "preview-validated", "preview-entry-separate"]},
    {"key": "preview-entry-boundary", "kind": "engineering", "requiredIn": ["integration"], "checks": ["preview-construction-restricted"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-020 部分响应后断开故障
- **WHEN** 测试模式 Shadow 的某个 step 声明 `partial-then-disconnect` 故障，客户端以 Node 原生 HTTP 请求该路由并读取响应；另一个 step 声明零字节 `disconnect` 作对照
- **THEN** `partial-then-disconnect` 的客户端先收到响应头与部分响应体，随后连接被销毁，读取以"响应不完整"类错误结束而不是得到完整响应；零字节 `disconnect` 的客户端没有收到任何响应字节；两次请求都写入 `records()`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "partial-then-destroyed": "partial-then-disconnect 先发出响应头与部分响应体再销毁连接，客户端读取以响应不完整结束",
    "zero-byte-contrast": "零字节 disconnect 不发出任何响应字节，与部分响应故障可区分",
    "fault-recorded": "两类故障的请求都写入 records"
  },
  "cases": [
    {"key": "partial-disconnect-fault", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["partial-then-destroyed", "zero-byte-contrast", "fault-recorded"]}
  ],
  "blockedBy": []
}
```
