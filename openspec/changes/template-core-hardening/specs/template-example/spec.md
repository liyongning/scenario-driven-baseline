## ADDED Requirements

### Requirement: EX-09 示例的消费接口声明

示例 SHALL 把自己实际消费的协议接口登记在产品包的消费接口声明模块中：项目清单中 SDK 包（product 角色）的 `packages[].consumedOperations` MUST 指向 `packages/sdk/src/consumed-operations.ts`，该模块导出的 `consumedOperations` 数组 MUST 恰好包含示例使用的 `CreateTrade` 与 `QueryTrade` 两个元素，每个元素为 `{ method, requestFields }`（结构见 protocol-contract PC-01）：`method` MUST 直接引用 generated 中由 `createMethod` 产出的方法常量，SHALL NOT 手写接口名、HTTP 方法、路径或请求/响应类型；`requestFields` 登记示例请求字段的映射策略，内容与原门禁脚本中这两个方法的请求字段策略一致，迁入后门禁脚本不再保留该策略表。声明与示例适配器中的实际调用 MUST 一一对应：示例不得调用未声明的方法，也不得声明未调用的方法。

协议义务派生（protocol-contract PC-01）对示例接口的义务 SHALL 只来自这份声明：派生出的接口集合恰好为 `CreateTrade`、`QueryTrade`，请求字段映射义务取自声明的 `requestFields`，义务 ID 前缀为这两个方法描述在 generated 中的声明文件（`idl/infra/trade/v1/trade.ts`）推导出的 IDL 包名 `infra.trade.v1`，不再读取 `testing/shadow/example/` 下的示例路由或示例 Fixture。

声明模块中的示例条目属于模板示例删除白名单，MUST 用 `// template-example:begin` 与 `// template-example:end` 标记包裹。声明模块的单测同样分两部分：标记外只断言"每个元素的 `method` 都是 generated 中的方法描述"，与示例无关、删除示例后仍然成立；"恰好是 `CreateTrade`、`QueryTrade`"的示例断言及其对本 Scenario 的证据绑定 MUST 位于标记内。按白名单删除示例后，该模块保留且 `consumedOperations` 为空数组是合法状态。

#### Scenario: SCN-TEMPLATE-EXAMPLE-012 示例接口由消费接口声明派生义务
- **WHEN** 读取项目清单中 SDK 包的 `consumedOperations` 指向的模块，并对当前仓库运行协议义务派生及其声明与实际调用的双向检查
- **THEN** 声明恰好为两个 `{ method, requestFields }` 元素，`method` 分别是 generated 中的 `CreateTrade`、`QueryTrade` 方法常量（引用同一常量，而非手写副本），`requestFields` 登记了示例请求字段策略；示例条目及单测中的示例断言都位于 `template-example:begin/end` 标记内，标记外的单测只断言每个元素的 `method` 都是 generated 方法描述；双向检查报出的"未声明的调用"与"未使用的声明"均为 0；派生出的接口义务恰好覆盖这两个方法，请求字段义务取自声明的 `requestFields`，义务 ID 以 `infra.trade.v1` 为前缀，且派生过程不读取示例 Shadow 路由。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "declaration-registered": "清单中 SDK 包的 consumedOperations 指向 packages/sdk/src/consumed-operations.ts，模块导出的数组恰好是两个 { method, requestFields } 元素，method 为 generated 的 CreateTrade、QueryTrade 方法常量，requestFields 登记示例请求字段策略",
    "declaration-matches-calls": "声明与示例实际调用的双向检查中，未声明的调用与未使用的声明均为 0",
    "obligations-from-declaration": "派生出的接口义务恰好覆盖 CreateTrade、QueryTrade，请求字段义务取自声明的 requestFields，义务 ID 以由其 generated 声明文件推导的 infra.trade.v1 为前缀，不读取示例 Shadow 路由",
    "example-entries-marked": "声明模块的示例条目与单测中的示例断言位于 template-example:begin/end 标记内，标记外的单测只断言每个元素的 method 都是 generated 方法描述"
  },
  "cases": [
    {"key": "declaration-module", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["declaration-registered", "example-entries-marked"]},
    {"key": "declared-obligations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["declaration-registered", "declaration-matches-calls", "obligations-from-declaration"]}
  ],
  "blockedBy": []
}
```

## MODIFIED Requirements

### Requirement: EX-05 示例分层与隔离

示例 SHALL 按"工厂 → 核心 → 内部端口 → 适配器"分层，在 SDK、协议 testing 与 E2E 中各自使用独立的目录和命名空间。示例就是产品包业务模块的标准结构：产品包 `src/` 下除 `runtime/` 外的每个一级目录都是一个业务模块。示例与其他业务模块一样受按目录模式覆盖全部业务模块的依赖与平台规则约束（template-engineering ENG-02）；这些通用规则的反例证据（合成业务模块、模块间互相导入、新增模块无需改配置即受约束）由 ENG-02 在受控临时根中承担，SHALL NOT 由示例承担，删除示例后这些证据仍然有效。

示例自身 MUST 满足：示例 `core/`、`ports/` 不得导入 generated 代码，不得使用 `wx` 等平台全局对象，也不得依赖 Node 内置模块；示例目录不得导入产品包内其他业务模块目录。示例可以共用的只有协议包的公开能力，以及 SDK 的运行辅助工具和平台网络装配。

#### Scenario: SCN-TEMPLATE-EXAMPLE-008 示例依赖越界被阻断
- **WHEN** 在仓库的受控临时副本中，分别让示例核心导入 generated、使用 `wx` 全局对象、导入 Node 内置模块（不修改任何门禁配置）
- **THEN** 架构或 lint 门禁逐项非零退出，并指出违规位置与命中的规则；恢复后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "example-core-isolated": "示例核心导入 generated、使用平台全局对象或导入 Node 内置模块时被逐项阻断，并指出违规位置与规则",
    "restored-passes": "恢复合法依赖后门禁通过"
  },
  "cases": [
    {"key": "dependency-violations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["example-core-isolated", "restored-passes"]}
  ],
  "blockedBy": []
}
```
