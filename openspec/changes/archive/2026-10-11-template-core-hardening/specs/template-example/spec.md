## ADDED Requirements

### Requirement: EX-09 示例的消费接口声明

示例 SHALL 把自己实际消费的协议接口登记在产品包的消费接口声明模块中：项目清单中 SDK 包（product 角色）的 `packages[].consumedOperations` MUST 指向 `packages/sdk/src/consumed-operations.ts`，该模块导出的 `consumedOperations` 数组中，标记内的示例条目 MUST 恰好是示例使用的 `CreateTrade` 与 `QueryTrade` 两个元素；数组 MAY 同时包含使用方自己的条目（写在标记外），以便使用方按"先加后删"在示例仍存在时新增自己的消费接口。每个元素为 `{ method, requestFields }`（结构见 protocol-contract PC-01）：`method` MUST 直接引用 generated 中由 `createMethod` 产出的方法常量，SHALL NOT 手写接口名、HTTP 方法、路径或请求/响应类型；`requestFields` 登记示例请求字段的映射策略，内容与原门禁脚本中这两个方法的请求字段策略一致，迁入后门禁脚本不再保留该策略表。声明与产品包中的实际调用 MUST 一一对应：不得调用未声明的方法，也不得声明未调用的方法。

协议义务派生（protocol-contract PC-01）对示例接口的义务 SHALL 只来自这份声明：派生出的接口集合包含 `CreateTrade`、`QueryTrade`（其余接口来自使用方条目），请求字段映射义务取自声明的 `requestFields`，义务 ID 前缀为这两个方法描述在 generated 中的声明文件（`idl/infra/trade/v1/trade.ts`）推导出的 IDL 包名 `infra.trade.v1`，不再读取 `testing/shadow/example/` 下的示例路由或示例 Fixture。

声明模块中的示例条目属于模板示例删除白名单，MUST 用 `// template-example:begin` 与 `// template-example:end` 标记包裹。声明模块的单测同样分两部分：标记外只断言"每个元素的 `method` 都是 generated 中的方法描述"，与示例无关、删除示例后仍然成立；"标记内的示例条目恰好是 `CreateTrade`、`QueryTrade`"的示例断言及其对本 Scenario 的证据绑定 MUST 位于标记内。按白名单删除示例后，该模块保留且 `consumedOperations` 为空数组是合法状态。

#### Scenario: SCN-TEMPLATE-EXAMPLE-012 示例接口由消费接口声明派生义务
- **WHEN** 读取项目清单中 SDK 包的 `consumedOperations` 指向的模块，并对当前仓库运行协议义务派生及其声明与实际调用的双向检查
- **THEN** 声明中标记内的示例条目恰好为两个 `{ method, requestFields }` 元素（标记外的使用方条目不影响该判定），`method` 分别是 generated 中的 `CreateTrade`、`QueryTrade` 方法常量（引用同一常量，而非手写副本），`requestFields` 登记了示例请求字段策略；示例条目及单测中的示例断言都位于 `template-example:begin/end` 标记内，标记外的单测只断言每个元素的 `method` 都是 generated 方法描述；双向检查报出的"未声明的调用"与"未使用的声明"均为 0；派生出的接口义务包含这两个方法，请求字段义务取自声明的 `requestFields`，义务 ID 以 `infra.trade.v1` 为前缀，且派生过程不读取示例 Shadow 路由。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "declaration-registered": "清单中 SDK 包的 consumedOperations 指向 packages/sdk/src/consumed-operations.ts，模块导出的数组中标记内的示例条目恰好是两个 { method, requestFields } 元素（允许标记外的使用方条目），method 为 generated 的 CreateTrade、QueryTrade 方法常量，requestFields 登记示例请求字段策略",
    "declaration-matches-calls": "声明与示例实际调用的双向检查中，未声明的调用与未使用的声明均为 0",
    "obligations-from-declaration": "派生出的接口义务包含 CreateTrade、QueryTrade，请求字段义务取自声明的 requestFields，义务 ID 以由其 generated 声明文件推导的 infra.trade.v1 为前缀，不读取示例 Shadow 路由",
    "example-entries-marked": "声明模块的示例条目与单测中的示例断言位于 template-example:begin/end 标记内，标记外的单测只断言每个元素的 method 都是 generated 方法描述"
  },
  "cases": [
    {"key": "declaration-module", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["declaration-registered", "example-entries-marked"]},
    {"key": "declared-obligations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["declaration-registered", "declaration-matches-calls", "obligations-from-declaration"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-10 示例删除的自动化验收

模板 SHALL 以 SCN-TEMPLATE-ENGINEERING-008 自动证明 ENG-06 的保证：按白名单删除示例后确定性门禁仍然通过。这条证据只在示例存在时有意义，属于模板自身的维护证据，因此登记在本能力中：它的用例 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`、Fixture `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`，以及会创建副本的用例排除列表中的对应条目，MUST 属于删除白名单（排除列表条目以 `template-example` 标记包裹），随示例一起删除。删除示例后的仓库 MUST NOT 残留这条用例或指向它的配置。Scenario ID 沿用原编号。

#### Scenario: SCN-TEMPLATE-ENGINEERING-008 按白名单删除模板示例后门禁仍全绿
- **WHEN** 以当前交付的 Change 为作用域（经 `SCENARIO_GATE_CHANGES` 传入），按 ENG-06 规定的方式构造隔离副本（`git ls-files -co --exclude-standard` 复制、`git init` 并提交、在副本中 `pnpm install --offline --frozen-lockfile`、以副本中固定版本的 OpenSpec CLI 归档作用域内的 active Change、移除其余 active Change、归档后清除 `SCENARIO_GATE_CHANGES`、设置 `TEMPLATE_COPY=1`），再按白名单删除全部示例内容（整目录与整文件、全部 `template-example:begin/end` 标记之间的片段、协议矩阵 Fixture 中的示例键并刷新摘要、`coverageExclusions` 中指向已删除文件的条目），不修改任何门禁代码、门禁配置或其他能力的 Spec，然后运行 `pnpm check:fast` 与场景门禁的清单模式（`--inventory`，只核对格式、绑定、Fixture 与协议义务等静态部分，不要求平台报告）；另在副本中尝试再次创建副本
- **THEN** 副本中 `@daqian/template-sdk` 的 realpath 位于副本内，不指向原仓库；归档全部成功，没有因本 Change 的 `template-example` delta 产生悬空修改；归档后副本内运行环境中不再有 `SCENARIO_GATE_CHANGES`，场景门禁不因"Change 不存在"报错；`check:fast` 退出码为 0，其中协议矩阵用例在消费接口声明为空时断言按消费接口派生的义务为空并结束；场景门禁清单模式的问题集合恰好等于"副本中不可能产生绑定的用例所对应的缺失绑定或缺失证据"，即被 `TEMPLATE_COPY=1` 排除的会创建副本的用例（从根 `vitest.config.ts` 的排除列表推导），加上 `requiredIn` 中清单 `class` 为 `platform` 的测试项目（清单模式不要求平台报告）。该集合由排除列表与清单推导，不手写；多一条或少一条均为失败，除此之外问题数为 0，没有指向已删除示例的悬空 Scenario、FLOW、Fixture 或用例绑定，协议义务派生、注释门禁与覆盖率完整性检查不因缺少示例而失败；副本中会创建副本的用例被排除，创建副本的 helper 在 `TEMPLATE_COPY=1` 下拒绝执行。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "copy-construction": "副本由 git ls-files -co --exclude-standard 复制、git init 并提交、在副本中 pnpm install --offline --frozen-lockfile 安装依赖（不链接原仓库 node_modules），副本中 @daqian/template-sdk 的 realpath 位于副本内；以副本 node_modules 中精确版本的 OpenSpec CLI 归档作用域内的 active Change、移除其余 active Change，归档后清除 SCENARIO_GATE_CHANGES，再删除示例",
    "whitelist-only-removal": "删除只涉及白名单内的整目录、整文件、template-example 标记片段与对应 coverageExclusions 条目，门禁代码、门禁配置与其他能力的 Spec 不被修改",
    "fast-gates-green": "删除示例后 check:fast 退出码为 0",
    "empty-declaration-matrix": "消费接口声明为空时协议矩阵用例断言按消费接口派生的义务为空并结束，不因缺少示例路由失败；业务错误码义务仍存在且由 SCN-PROTOCOL-CONTRACT-003 承担证据",
    "scenario-gate-green": "删除示例后场景门禁清单模式的问题集合恰好等于由 vitest.config.ts 排除列表推导出的、被 TEMPLATE_COPY 排除用例的缺失绑定或证据，加上由清单 class=platform 测试项目派生的缺失绑定，除此之外问题数为 0，没有指向示例的悬空引用；含平台报告的完整 pnpm verify 由复刻验收演练承担",
    "no-recursive-copy": "副本中设置 TEMPLATE_COPY=1，根 vitest.config.ts 排除会创建副本的用例，创建副本的 helper 在该变量已设置时拒绝执行"
  },
  "cases": [
    {"key": "example-removal-fast", "kind": "engineering", "requiredIn": ["integration"], "checks": ["copy-construction", "whitelist-only-removal", "fast-gates-green", "empty-declaration-matrix", "no-recursive-copy"]},
    {"key": "example-removal-scenarios", "kind": "engineering", "requiredIn": ["integration"], "checks": ["copy-construction", "whitelist-only-removal", "scenario-gate-green"]}
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
