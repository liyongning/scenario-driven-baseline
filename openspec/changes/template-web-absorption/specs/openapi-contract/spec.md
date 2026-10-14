## ADDED Requirements

### Requirement: OAS-01 契约登记与同步命令

OpenAPI 协议包的契约文件与 lock MUST 登记在该协议包的清单条目 `packages[].contract: { file, lock }` 中，并 SHALL 写入 `fingerprints.protocolInputs`。模板中 OpenAPI 协议包为 `packages/openapi`（`@daqian/template-openapi`，`protocolKind: openapi`），产品契约、lock 与协议约定模块（`conventions.ts`）放在该包的 `contracts/` 下（模板初始的产品契约为 `packages/openapi/contracts/trade-v1.yaml`，内容与 OAS-08 的引擎测试契约相同），其 `allowedDirectories` 含 `contracts`。产品契约、lock、约定模块与 `redocly.yaml` 是替换点：使用方把产品契约换成结构与约定都不同的契约时，只需替换 `contracts/` 下的文件、改写约定模块（必要时在 `redocly.yaml` 写明理由后调整规则）、运行 `api:sync`，并更新清单中该契约的 `packages[].contract` 与 `fingerprints.protocolInputs` 路径、产品消费接口声明、OpenAPI 协议矩阵 Fixture 的键与 Web 应用本地预览的默认数据集（`packages/e2e/host/web.config.json` 的 `defaultDataset`）；引擎测试契约目录、本能力的引擎用例、`scripts/` 门禁代码与门禁配置 MUST NOT 需要修改。Web 示例依赖模板初始产品契约的生成常量，因此替换产品契约 SHALL 在同一次提交中删除 Web 示例（见 WEX-08，是"第一个 Scenario 通过完整门禁后再删示例"的例外）；`defaultDataset` 的模板初始值指向引擎载体的平台数据集，替换产品契约时 SHALL 改指使用方自己的产品侧数据集；不改指时 `preview:local` 启动失败并报出数据集中产品契约不存在的 operationId（预览路由取自产品契约），门禁不对此做检查，由指南写明这一步；这一可替换性的回归证据由 WEX-09 承担。门禁与同步命令 MUST 只从清单读取契约与 lock 路径，不在脚本中写死。根 `package.json` SHALL 提供 `api:validate`、`api:sync`、`api:status` 三个命令：

- **`api:validate`**：`redocly lint` 无 error（通用基线）；再经契约同目录的**协议约定模块**做约定自洽检查。约定模块 SHALL 把契约中的业务码约定规范化为固定输出：码表（码名 → 码值）、通用码列表与各接口码列表（元素都是码表中的码名）、自洽问题列表；契约中没有码名时（例如码表为 `{code, meaning, message}` 数组），码名由约定模块决定（例如 `CODE_40001`），生成物、`meta.codes`、`OperationCodes<Id>` 与 `business-code#<码>` 义务 ID 只使用这些码名。约定模块 SHALL 具名导出 `normalizeContractConventions(document)`：入参为 bundle 后的契约对象，返回 `{ codeTable: Record<码名, 码值>, commonCodes: 码名[], operationCodes: Record<operationId, 码名[]>, issues: string[] }`。两个约定模块（产品侧 `contracts/conventions.ts`、引擎侧 `testing/engine/conventions.ts`）是手写代码，各自的单测与模块同目录（`contracts/conventions.test.ts`、`testing/engine/conventions.test.ts`），由 `openapi-unit` 收集并计入手写代码覆盖率（`packages/openapi/contracts` 登记在 `fingerprints.sourceRoots`），使用方改写产品侧约定模块时连同其同目录单测一起改写；两个模块并 SHALL 登记在 `fingerprints.protocolInputs`（变化时验收报告的协议摘要过期并触发全量）；`api:validate`、生成器（OAS-02）与 OpenAPI 适配器（OAS-05、OAS-06）MUST 只经约定模块读取业务码约定，`scripts/` 门禁代码与适配器中 MUST NOT 直接读取 `x-business-code-table` 等约定扩展。模板默认约定：信封 `code` 的枚举 MUST 等于 `x-business-code-table` 登记的码集合；顶层 `x-common-business-codes` 与各接口的 `x-business-codes` MUST 都是 `x-business-code-table` 的子集。任一不满足时非零退出，并指出不一致的码与位置。
- **`api:sync <契约来源>`**：契约来源（本地路径，或仓库、分支、commit 信息）MUST 由命令参数传入并原样写进 lock，脚本中 MUST NOT 写死任何来源；未传来源时非零退出。模板初始产品契约的来源记为"本仓库"。同步 SHALL 重新生成全部生成物（见 OAS-02），并把契约版本、契约 sha256，以及全部生成物的路径与 sha256 写进 lock。
- **`api:status`**：lock 中的契约版本与 sha256 MUST 与当前契约一致；lock 中登记的生成物路径集合 MUST 与重新生成结果的路径集合完全相同（不得漏登，例如漏登 `codes.ts`；也不得多登），每个生成物的 sha256 MUST 与重新生成结果逐一一致。任一不一致时非零退出，并指出不一致的项。
- `redocly.yaml` SHALL 只保留有理由的规则调整，每条调整 MUST 带说明理由的注释（例如"HTTP 恒 200"约定下关闭 `operation-4xx-response`）；`api:validate` 对产品契约同样要求 lint 零告警、零 error。根 `redocly.yaml` 属于协议约定替换点（只作用于产品契约），不属于门禁配置，使用方可在写明理由后调整规则。引擎测试契约 SHALL 使用固定的引擎侧配置 `packages/openapi/testing/engine/redocly.yaml`（只含有理由的调整，模板中与根配置的初始内容相同），在该配置下 MUST 零告警、零 error，不得为容纳契约缺陷而降级规则；使用方调整根 `redocly.yaml` 不影响引擎证据。

#### Scenario: SCN-OPENAPI-CONTRACT-001 api:validate 校验 lint 与契约自洽
- **WHEN** 对清单登记的产品契约运行 `api:validate`，并以引擎测试契约及其约定模块运行同一校验；再在受控临时根中分别构造：信封 `code` 枚举比码表多一个码、码表比信封枚举多一个码、`x-common-business-codes` 含码表之外的码、某接口 `x-business-codes` 含码表之外的码、存在 redocly error 的契约；另在受控临时根中把约定模块替换为一份读取数组形式码表（`{code, meaning, message}`）的实现，分别校验符合与违反该约定的契约，并检查 `scripts/` 门禁代码与适配器源码
- **THEN** 产品契约与引擎测试契约都通过且退出码为 0；每个反例都非零退出，并指出不一致的码与所在位置（顶层或接口 id）；lint error 的反例报出 redocly 的规则名与位置；替换约定模块后按新约定判定，符合者通过、违反者报出问题；门禁代码与适配器中不存在对码表扩展的直接读取。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "example-passes": "清单登记的产品契约与引擎测试契约都经校验通过且退出码为 0",
    "convention-from-module": "约定自洽检查与业务码读取只经契约同目录的约定模块；替换约定模块后按新约定判定，门禁代码与适配器不直接读取码表扩展",
    "envelope-enum-equals-table": "信封 code 枚举与 x-business-code-table 不相等时失败并指出差异码",
    "codes-subset-of-table": "x-common-business-codes 与接口 x-business-codes 含码表之外的码时失败并指出码与位置",
    "lint-error-fails": "redocly lint 存在 error 时 api:validate 非零退出并报出规则名与位置"
  },
  "cases": [
    {"key": "contract-consistency-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["envelope-enum-equals-table", "codes-subset-of-table", "convention-from-module"]},
    {"key": "api-validate-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["example-passes", "envelope-enum-equals-table", "codes-subset-of-table", "lint-error-fails"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-002 api:sync 由参数传入来源，lock 覆盖全部生成物
- **WHEN** 在受控临时根中以本地路径来源运行 `api:sync`，再以"仓库、分支、commit"形式的来源运行一次；另不带来源参数运行；检查同步脚本源码
- **THEN** 两次同步后 lock 中的来源与传入参数原样一致；lock 登记的生成物路径集合恰为 `src/generated/` 下的 `schema.d.ts`、`operations.ts`、`codes.ts`，sha256 与磁盘文件一致；不带来源时非零退出且不改写 lock；脚本中不存在写死的契约来源；契约与 lock 路径取自清单 `packages[].contract`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "source-from-argument": "契约来源由命令参数传入并原样写进 lock，脚本中不写死来源",
    "missing-source-rejected": "未传来源时 api:sync 非零退出且不改写 lock",
    "lock-covers-all-generated": "lock 登记全部生成物（schema.d.ts、operations.ts、codes.ts）的路径与 sha256",
    "paths-from-manifest": "契约与 lock 路径取自清单 packages[].contract，并写入 fingerprints.protocolInputs"
  },
  "cases": [
    {"key": "sync-lock-writer", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["source-from-argument", "lock-covers-all-generated", "paths-from-manifest"]},
    {"key": "api-sync-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-from-argument", "missing-source-rejected", "lock-covers-all-generated"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-003 api:status 检出契约与生成物漂移
- **WHEN** 在当前仓库运行 `api:status`；再在受控临时根中分别构造：契约内容被修改但 lock 未更新、某生成物被手工修改、lock 漏登 `codes.ts`、lock 多登一个不存在的生成物、契约版本与 lock 不一致
- **THEN** 当前仓库通过；每个反例都非零退出，分别指出 sha256 不一致的契约、sha256 不一致的生成物、漏登的路径、多登的路径与版本差异。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "in-sync-passes": "契约、lock 与生成物一致时 api:status 通过",
    "contract-drift-detected": "契约版本或 sha256 与 lock 不一致时失败并指出差异",
    "generated-drift-detected": "生成物 sha256 与重新生成结果不一致时失败并指出文件",
    "generated-set-checked": "lock 漏登或多登生成物路径时失败并指出路径"
  },
  "cases": [
    {"key": "status-comparator", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["contract-drift-detected", "generated-drift-detected", "generated-set-checked"]},
    {"key": "api-status-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["in-sync-passes", "contract-drift-detected", "generated-drift-detected", "generated-set-checked"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-004 redocly 规则只保留有理由的调整，引擎测试契约零告警
- **WHEN** 读取根 `redocly.yaml` 与引擎侧 `testing/engine/redocly.yaml` 中相对推荐规则集的每条调整，并以引擎侧配置对引擎测试契约运行 `redocly lint`
- **THEN** 两份配置中的每条调整的上一行都有说明理由的注释（通用断言，不写死调整清单）；引擎测试契约的 warning 与 error 数都为 0；引擎侧配置中不存在为容纳契约缺陷而降级的规则。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "rule-adjustments-justified": "根 redocly.yaml 与引擎侧配置中每条规则调整的上一行都有说明理由的注释，断言不写死调整清单",
    "example-zero-warnings": "引擎测试契约在引擎侧配置下 redocly lint 的 warning 与 error 数都为 0，引擎侧配置不含降级规则"
  },
  "cases": [
    {"key": "redocly-config-and-lint", "kind": "engineering", "requiredIn": ["integration"], "checks": ["rule-adjustments-justified", "example-zero-warnings"]}
  ],
  "blockedBy": []
}
```

### Requirement: OAS-02 生成物与生产导入图

OpenAPI 协议包中产品契约的生成物 MUST 统一放在协议包 `src/generated/` 下（与 ENG-07 手写源码清单的 `generated/` 排除规则对齐），由生成器从契约产出，MUST NOT 手工编辑：

| 文件 | 内容 |
|---|---|
| `schema.d.ts` | openapi-typescript 生成的类型，零运行时代码 |
| `operations.ts` | 每个接口一个精简描述常量 `{ meta: { id, method, path, security, codes, implemented } }`；MUST NOT 含描述文字、示例与 `x-fixture` |
| `codes.ts` | `businessCodeTable`、`BusinessCode` 类型与 `OperationCodes<Id>` 类型 |

`meta.codes` SHALL 等于约定模块给出的该接口码与通用码的并集（模板默认约定下即 `x-business-codes` 与 `x-common-business-codes` 的并集）；`meta.implemented` SHALL 取接口的 `x-implemented`（缺省为 `true`）；`meta.security` SHALL 保留契约中该接口的安全要求（`security: []` 表示匿名）。

`codes.ts` 与 `meta.codes` SHALL 取自约定模块的规范化输出（见 OAS-01）。引擎测试契约（OAS-08）的生成物与 bundle 由同一生成器产出，放在 `testing/engine/` 下，不进入 `src/generated/`。

bundle 后的完整契约 SHALL 只放在协议包 `testing/`，只供门禁、Shadow 与协议适配器使用；完整契约（原始契约文件或 bundle 后的 JSON）MUST NOT 出现在协议包生产入口的导入图与生产产物中。

#### Scenario: SCN-OPENAPI-CONTRACT-005 生成物精简且由契约决定
- **WHEN** 对引擎测试契约运行生成器，读取产出的三个文件；另在受控临时根中构造一个含描述文字、示例、`x-fixture`、`x-implemented: false` 与 `security: []` 接口的契约并生成
- **THEN** 只产出 `schema.d.ts`、`operations.ts`、`codes.ts`；`schema.d.ts` 不含运行时代码；`operations.ts` 中每个接口恰有一个描述常量，`meta` 只含 `id`、`method`、`path`、`security`、`codes`、`implemented`，不含描述文字、示例与 `x-fixture` 的内容；`meta.codes` 等于接口码与通用码的并集；`x-implemented: false` 的接口 `implemented` 为 `false`，未标注的为 `true`；匿名接口的 `security` 为空数组；`codes.ts` 的码表与约定模块规范化后的码表一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "generated-location": "生成物只有 schema.d.ts、operations.ts、codes.ts 三个文件（产品契约在 src/generated，引擎测试契约在 testing/engine）",
    "types-zero-runtime": "schema.d.ts 只含类型声明，没有运行时代码",
    "operations-minimal": "operations.ts 每个接口一个描述常量，meta 只含 id、method、path、security、codes、implemented，不含描述、示例与 x-fixture",
    "meta-from-contract": "meta.codes 为接口码与通用码并集，implemented 取 x-implemented（缺省 true），security 保留契约安全要求",
    "codes-table-matches": "codes.ts 的 businessCodeTable 与约定模块规范化后的码表一致"
  },
  "cases": [
    {"key": "generator-output", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["generated-location", "types-zero-runtime", "operations-minimal", "meta-from-contract", "codes-table-matches"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-006 完整契约不进入生产导入图与产物
- **WHEN** 构建 OpenAPI 协议包，从其生产入口（根入口与双格式产物）解析导入图并检查产物文件；另在受控临时根中让生产源码导入 `testing/` 下的 bundle 契约
- **THEN** 当前仓库的生产导入图与产物中不含契约文件、bundle 后的契约 JSON 及其中的描述文字与示例；bundle 契约只位于 `testing/`；受控反例被依赖规则拦截并指出导入位置。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "contract-not-in-import-graph": "生产入口的导入图中没有契约文件与 bundle 后的契约 JSON",
    "contract-not-in-dist": "协议包双格式产物中不含完整契约内容",
    "bundle-in-testing-only": "bundle 后的完整契约只位于协议包 testing/",
    "violation-blocked": "生产源码导入 testing/ 下的 bundle 契约时被依赖规则拦截并指出位置"
  },
  "cases": [
    {"key": "production-graph-check", "kind": "engineering", "requiredIn": ["integration"], "checks": ["contract-not-in-import-graph", "contract-not-in-dist", "bundle-in-testing-only", "violation-blocked"]}
  ],
  "blockedBy": []
}
```

### Requirement: OAS-03 REST 执行器

OpenAPI 协议包 SHALL 提供 REST 执行器，调用形式为 `client.request(<描述常量>, input, ctx)`，描述常量 MUST 与消费接口声明使用同一个 `operations.ts` 常量，供双向检查的静态扫描识别。

- **结果**：MUST 为判别联合：`success`（`data`）、`business-failure`（`code`、`message`、`data`）、`transport-failure`（`reason` 取 `HTTP_STATUS`、`INVALID_ENVELOPE`、`NETWORK_ERROR`、`TIMEOUT`、`CANCELLED`、`CODEC_ERROR`、`EMPTY_ACCESS_TOKEN`、`HOST_CONTEXT_ERROR` 之一）。执行器 MUST NOT 以抛异常代替上述结果。
- **信封约定**：作为协议包配置，默认值为"HTTP 状态 200 且 `code === 0` 表示成功，信封为 `{ code, message, data }`"，项目 SHALL 能修改该配置，执行器中 MUST NOT 写死该约定。按默认约定：HTTP 状态非 200 得到 `HTTP_STATUS`；响应体不符合信封形状得到 `INVALID_ENVELOPE`；信封 `code` 非 0 得到 `business-failure`。
- **路径参数**：路径中的每个 `{x}` MUST 以 `encodeURIComponent` 编码后替换；缺少任一路径参数时 MUST 得到 `CODEC_ERROR` 且不发出请求。路径参数的类型 SHALL 从生成类型推导。
- **身份头**：头名 MUST 按契约 `components.securitySchemes`（`apiKey`，`in: header`）映射，执行器中 MUST NOT 写死头名；接口 `security: []` 时 MUST NOT 发送任何身份头；所需 token 缺失或为空时 MUST 得到 `EMPTY_ACCESS_TOKEN` 且不发出请求；宿主上下文提供的身份与接口要求的方案不匹配时 MUST 得到 `HOST_CONTEXT_ERROR` 且不发出请求。
- **HTTP 方法**：MUST 按描述常量中的方法发送，支持契约中实际出现的方法，不限制为 GET/POST/PUT。
- **X-Request-Id**：MUST 遵守 PC-05 中头名、格式、生成规则与"不可覆盖"的要求：由本包 `transport/` 内的标准生成器生成，每次请求一个新值，公共选项与公共导出中不存在覆盖或注入请求 ID 的途径，生成器的时钟与随机源只能经内部参数注入供单测使用。OpenAPI 没有 BaseReq，PC-05 中"头与 `BaseReq.requestId` 相等"的要求不适用于本包。本包与 IDL 包各有一份生成器实现，SHALL 由同一组格式 Scenario（PC-05 的 SCN-PROTOCOL-CONTRACT-009）约束。
- **未知字段**：成功响应中契约之外的字段 MUST 在运行时忽略，不导致失败；这与测试数据的严格同形（OAS-06）不矛盾。

#### Scenario: SCN-OPENAPI-CONTRACT-007 结果为判别联合，信封按默认约定解析
- **WHEN** 经 OpenAPI 协议包产物的公共客户端与 `createFetchHttp`（真实 `fetch`）请求 Shadow，Shadow 依次返回：HTTP 200 且 `code` 为 0 的信封、HTTP 200 且 `code` 为该接口业务码的信封、HTTP 500、HTTP 200 但响应体不是信封；integration 中直接访问 Shadow，browser 中经同源代理访问
- **THEN** 依次得到 `success`（含 `data`）、`business-failure`（含 `code`、`message`、`data`）、`transport-failure`/`HTTP_STATUS`、`transport-failure`/`INVALID_ENVELOPE`；执行器不抛异常；两个环境结果一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "success-result": "HTTP 200 且 code 为 0 时得到 success 并携带 data",
    "business-failure-result": "HTTP 200 且 code 非 0 时得到 business-failure 并携带 code、message、data",
    "http-status-result": "HTTP 状态非 200 时得到 transport-failure/HTTP_STATUS",
    "invalid-envelope-result": "响应体不符合信封形状时得到 transport-failure/INVALID_ENVELOPE",
    "no-throw": "各种结果都以判别联合返回，执行器不抛异常"
  },
  "cases": [
    {"key": "envelope-results-wire", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["success-result", "business-failure-result", "http-status-result", "invalid-envelope-result", "no-throw"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-008 信封约定可由项目配置
- **WHEN** 在单测中以默认配置与一份自定义信封约定（不同的成功码与字段名）分别创建客户端，对同一组响应解析
- **THEN** 默认配置按"HTTP 200 且 `code === 0` 成功、信封 `{ code, message, data }`"判定；自定义配置按其约定判定；执行器源码中不存在写死的成功码与信封字段名。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "default-envelope": "默认配置为 HTTP 200 且 code === 0 表示成功、信封为 { code, message, data }",
    "custom-envelope": "自定义信封约定生效，结果按自定义约定判定",
    "not-hardcoded": "执行器中不存在写死的成功码与信封字段名"
  },
  "cases": [
    {"key": "envelope-config", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["default-envelope", "custom-envelope", "not-hardcoded"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-009 路径参数编码替换，缺参不发请求
- **WHEN** 经公共客户端与真实 `fetch` 调用含单个路径参数与多个路径参数（含整数参数）的接口，参数值包含 `/`、空格、`#`、中文等需编码字符，Shadow 记录收到的路径；另调用时缺少一个路径参数
- **THEN** Shadow 收到的路径中每个参数都经 `encodeURIComponent` 编码、整数参数按十进制呈现，且路由匹配到对应接口；缺参时得到 `transport-failure`/`CODEC_ERROR`，Shadow 未收到请求；integration 与 browser 结果一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "path-encoded": "路径参数经 encodeURIComponent 编码后替换，含特殊字符时 Shadow 收到的路径正确",
    "multi-params": "多路径参数与整数参数都被正确替换并匹配到路由",
    "missing-param-codec-error": "缺少路径参数时得到 CODEC_ERROR 且不发出请求"
  },
  "cases": [
    {"key": "path-params-wire", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["path-encoded", "multi-params", "missing-param-codec-error"]},
    {"key": "path-params-unit", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["path-encoded", "missing-param-codec-error"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-010 身份头按 securitySchemes 映射，匿名接口不发身份头
- **WHEN** 引擎测试契约声明两个 `apiKey`（`in: header`）方案且头名不同，按 OAS-08 分配（createTrade、getTrade 用方案一，cancelTrade 用方案二，listTrades 匿名）；经公共客户端与真实 `fetch` 分别调用：使用方案一的 getTrade、使用方案二的 cancelTrade（Shadow 按契约为其注册路由，`x-implemented: false` 不影响执行器）、`security: []` 的 listTrades；再分别以缺失 token、空字符串 token、宿主上下文提供的身份与接口方案不匹配的方式调用 getTrade
- **THEN** Shadow 在 getTrade 上收到方案一的头名与 token，在 cancelTrade 上收到方案二的头名与 token；匿名接口的请求不含任何身份头；缺失或空 token 得到 `EMPTY_ACCESS_TOKEN`，方案不匹配得到 `HOST_CONTEXT_ERROR`，这三种情况 Shadow 都未收到请求；执行器源码中不存在写死的身份头名；integration 与 browser 结果一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "header-name-from-scheme": "身份头名取自 components.securitySchemes：getTrade 发送方案一的头名，cancelTrade 发送方案二的头名",
    "anonymous-no-identity": "security: [] 的 listTrades 不发送任何身份头",
    "empty-token-rejected": "token 缺失或为空时得到 EMPTY_ACCESS_TOKEN 且不发出请求",
    "scheme-mismatch-rejected": "身份与接口方案不匹配时得到 HOST_CONTEXT_ERROR 且不发出请求",
    "no-hardcoded-header": "执行器中不存在写死的身份头名"
  },
  "cases": [
    {"key": "identity-wire", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["header-name-from-scheme", "anonymous-no-identity", "empty-token-rejected", "scheme-mismatch-rejected"]},
    {"key": "identity-unit", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["header-name-from-scheme", "anonymous-no-identity", "empty-token-rejected", "scheme-mismatch-rejected", "no-hardcoded-header"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-011 HTTP 方法按契约发送
- **WHEN** 经公共客户端与真实 `fetch` 调用引擎测试契约中的 POST 与 GET 接口；另在单测中以 PATCH、DELETE、HEAD 等契约中可能出现的方法构造描述常量并调用
- **THEN** Shadow 收到的方法与描述常量的 `meta.method` 一致；单测中这些方法都按描述常量发送，执行器不限制为 GET/POST/PUT。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "method-from-meta": "请求方法与描述常量的 meta.method 一致",
    "no-method-whitelist": "执行器支持契约中出现的任意方法，不限制为 GET/POST/PUT"
  },
  "cases": [
    {"key": "method-wire", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["method-from-meta"]},
    {"key": "method-unit", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["method-from-meta", "no-method-whitelist"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-012 X-Request-Id 遵守 PC-05 且不可覆盖
- **WHEN** 经 OpenAPI 协议包公共客户端与真实 `fetch` 连续发起两次请求，Shadow 以 `headerPatterns` 校验 `X-Request-Id`；另检查本包公共选项、公共类型与根入口导出
- **THEN** 每次请求都带符合 PC-05 格式的 `X-Request-Id`，两次的值不同，不发送 `request_id` 头；本包不要求也不校验与 BaseReq 相等；公共选项与导出中不存在覆盖或注入请求 ID 的途径，生成器的时钟与随机源注入参数不出现在公共导出中。本包标准生成器的北京时间、时区无关与长度证据由 PC-05 的 SCN-PROTOCOL-CONTRACT-009 承担。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "header-format": "每次请求携带符合 PC-05 格式的 X-Request-Id，不发送 request_id 头",
    "fresh-per-request": "每次请求生成新的请求 ID",
    "no-basereq-requirement": "OpenAPI 包不存在 BaseReq，不要求头与 BaseReq 相等",
    "not-overridable": "公共选项、公共类型与根入口导出中不存在覆盖或注入请求 ID 的途径，生成器的时钟与随机源注入参数不在公共导出中"
  },
  "cases": [
    {"key": "request-id-wire", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["header-format", "fresh-per-request", "no-basereq-requirement"]},
    {"key": "request-id-unit", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["not-overridable"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-013 运行时忽略成功响应中的未知字段
- **WHEN** 在单测中以假的网络端口返回 `code` 为 0、`data` 含契约之外字段的信封，经执行器解析；另以同样的信封调用该接口的 `responseValidator`
- **THEN** 执行器得到 `success`，契约内字段正常可用，未知字段不导致失败；`responseValidator` 按 OAS-06 的严格同形报出问题，说明运行时容忍与测试数据严格同形各自成立。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "runtime-ignores-unknown": "成功响应含契约外字段时执行器仍得到 success，不报错",
    "test-data-still-strict": "同样的信封经 responseValidator 校验时因严格同形报出问题"
  },
  "cases": [
    {"key": "unknown-field-tolerance", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["runtime-ignores-unknown", "test-data-still-strict"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-014 传输失败按原因区分
- **WHEN** 经公共客户端与真实 `fetch` 请求 Shadow，Shadow 依次注入：网络断开（integration 用零字节 `disconnect`，browser 用 `partial-then-disconnect`）、超过预算的延迟；另在请求进行中由调用方取消
- **THEN** 依次得到 `transport-failure` 的 `NETWORK_ERROR`、`TIMEOUT`、`CANCELLED`；超时与取消可区分；每次调用只交付一个结果；integration 与 browser 结果一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "network-error": "连接被断开时得到 NETWORK_ERROR",
    "timeout": "超过预算时得到 TIMEOUT",
    "cancelled": "调用方取消时得到 CANCELLED，与超时可区分",
    "single-delivery": "每次调用只交付一个结果"
  },
  "cases": [
    {"key": "transport-failure-wire", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["network-error", "timeout", "cancelled", "single-delivery"]}
  ],
  "blockedBy": []
}
```

### Requirement: OAS-04 OpenAPI 协议适配器

OpenAPI 协议包 MUST 在 `testing/adapter.ts` 导出协议适配器，实现 PC-07 定义的协议适配器接口的五个方法；门禁按清单 `packages[].protocolKind: 'openapi'` 定位并加载它。适配器位于 `testing/`，MUST NOT 进入协议包生产产物。

| 方法 | OpenAPI 实现 |
|---|---|
| `resolveDeclaration(element)` | 把消费接口声明元素解析为 `{ key, prefix, meta }`：元素的 `method` MUST 是 `operations.ts` 中生成的描述常量，`prefix` 取契约名（模板初始为 `trade.v1`）；非法元素 MUST 报错并指出元素 |
| `deriveObligations(op, requestFields)` | 接口粒度派生（见 OAS-05） |
| `responseValidator(op)` | 返回 `(body, status) => issues`：规范化后的 Ajv 校验（按状态码取响应 schema）加按接口核对业务码（见 OAS-06） |
| `checkFixture(manifest, files)` | 多信封认领与业务码核对（见 OAS-06）；只对声明 `protocol` 为本协议包的 Fixture 与预览数据集调用（见 GATE-16） |
| `scanCalls(sourceFiles)` | 静态扫描产品源码中 `request(<描述常量>, …)` 形式的调用，供双向检查 |

适配器按清单 `packages[].contract` 加载产品契约。Fixture 与预览数据集的 manifest MAY 声明 `contractCarrier: "engine"`（缺省为 `"product"`），表示其信封按引擎测试契约校验；该字段由 OpenAPI 适配器在 `checkFixture(manifest, files)` 与 `responseValidator(op, { manifest })`（PC-07）中解释：`check:fixtures` 的 Fixture 检查与数据集逐条校验、预览启动器的启动前校验都原样传入 manifest，MUST NOT 按协议种类分支；取值只能是 `product` 或 `engine`，其他取值由适配器报错。`fixture.schema.json` 与数据集 schema 都 SHALL 声明该字段（枚举 `product`、`engine`，带中文说明）。本能力与浏览器平台中以引擎测试契约为载体的 Fixture 与平台数据集 MUST 声明 `contractCarrier: "engine"`。`testing/` 下的契约加载、OpenAPI 路由构造器、响应校验与浏览器步骤执行器 MUST 以参数接收契约来源（产品契约或引擎测试契约）与描述常量，MUST NOT 以模块位置绑死某一份契约；浏览器步骤执行器的计划步骤 SHALL 能直接携带描述常量。

声明与实际调用的双向检查沿用 PC-01 的机制：声明了但没有调用报"未使用的声明"，调用了但没有声明报"未声明的调用"，并指出接口与位置。

#### Scenario: SCN-OPENAPI-CONTRACT-015 resolveDeclaration 以契约名为前缀并拒绝非法元素
- **WHEN** 门禁按清单 `protocolKind: 'openapi'` 加载适配器，对产品消费接口声明（模板中为 Web 应用的声明；声明为空时改用受控临时根中的声明）调用 `resolveDeclaration`；另在受控临时根中构造：`method` 为手写对象（不是 `operations.ts` 生成的常量）、`method` 为 IDL 方法常量、`method` 缺失的元素
- **THEN** 示例元素解析为 `{ key, prefix, meta }`，`prefix` 等于清单登记的产品契约的契约名（模板初始为 `trade.v1`，用例从契约读取，不写死），`meta` 与描述常量一致；三种非法元素都报错并指出元素，派生非零退出；适配器文件位于 `testing/` 且不出现在协议包生产产物中。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "loaded-by-protocol-kind": "门禁按清单 protocolKind 定位并加载 OpenAPI 适配器",
    "prefix-from-contract-name": "解析结果的 prefix 取契约名，meta 与生成的描述常量一致",
    "illegal-element-rejected": "非生成描述常量的元素报错并指出元素，派生非零退出",
    "adapter-not-in-dist": "适配器位于 testing/，不进入协议包生产产物"
  },
  "cases": [
    {"key": "resolve-declaration-unit", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["prefix-from-contract-name", "illegal-element-rejected"]},
    {"key": "adapter-loading", "kind": "engineering", "requiredIn": ["integration"], "checks": ["loaded-by-protocol-kind", "illegal-element-rejected", "adapter-not-in-dist"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-016 scanCalls 支撑声明与调用双向对账
- **WHEN** 在受控临时根的 Web 应用产品包中分别构造：声明与 `client.request(<描述常量>, …)` 调用一致；声明了但没有调用的接口；调用了但没有声明的接口；再经真实场景门禁 CLI 运行
- **THEN** 一致时没有问题；未使用的声明与未声明的调用分别报出并指出接口与位置；存在任一问题时场景门禁失败。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "calls-recognized": "scanCalls 识别 request(<描述常量>, …) 形式的调用",
    "unused-declaration": "声明了但没有调用的接口被报为未使用的声明并指出位置",
    "undeclared-call": "调用了但没有声明的接口被报为未声明的调用并指出位置",
    "gate-fails": "存在任一问题时场景门禁失败"
  },
  "cases": [
    {"key": "scan-calls-unit", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["calls-recognized", "unused-declaration", "undeclared-call"]},
    {"key": "bidirectional-gate", "kind": "engineering", "requiredIn": ["integration"], "checks": ["unused-declaration", "undeclared-call", "gate-fails"]}
  ],
  "blockedBy": []
}
```

### Requirement: OAS-05 接口粒度的协议义务派生

OpenAPI 适配器 SHALL 为产品声明的消费接口按接口粒度派生协议义务，MUST NOT 派生叶子字段义务。

**消费接口声明**：元素为 `{ method: <描述常量>, requestFields }`。`requestFields` 的键 MUST 属于以下键空间：`path.<参数名>`、`body.<一级字段>`、`header.<名称>`；取值沿用 PC-01 的请求字段策略枚举（`mapped-value`、`fixed-value`、`omitted`、`generated-value`、`configured-value`）。键不属于该键空间，或指向契约中该接口不存在的路径参数、请求体一级字段或请求头时，派生器 MUST 报错并指出元素与键。

**义务 ID** 格式为 `<契约名>.<operationId>#<义务类>#<键>`，例如 `trade.v1.getTrade#route#path.trade_no`。`business-code#<码>` 的码集合取自约定模块（OAS-01）；约定模块返回空码表时不派生业务码义务。

**义务清单**（每个声明的接口）：

- `route`：方法、路径与每个路径参数；
- `identity`：身份头或匿名；
- `request-headers`：content-type、身份头、`X-Request-Id`（校验头名与格式）；
- `request-fields`：`requestFields` 中登记的每一项；
- `envelope`：`code`、`message`、`data`；
- `business-code#<码>`：该接口可能返回的每个业务码（接口码与通用码的并集）都有处理；
- `transport-failure`：network-error、timeout、cancelled；
- `presence`：`data` 本身及其一级属性的出现性，取值为 `present`、`present-or-null`、`optional`。

每条义务的运行环境为 integration 类项目加该产品所在绑定的 `platforms`（模板中为 `browser`，见 GATE-07）。

**presence 派生**：遇到联合类型（`oneOf`/`anyOf`）时，若存在一个分支包含其余全部分支，则 `required` 取各分支交集、`properties` 取并集；否则该位置 MUST 报"待定"，派生器 MUST NOT 抛出运行时异常（例如 TypeError），也 MUST NOT 静默忽略。待定项计入场景门禁的问题。

**未实现接口**：描述常量 `meta.implemented` 为 `false` 的接口出现在消费集合中时，派生器 SHALL 输出提示（指出接口），MUST NOT 阻断；指南 SHALL 写明开发代理连接真实服务端时这类接口会返回未实现错误，应改用本地预览查看。

**业务码完备性**：产品侧 SHALL 用 `satisfies Record<OperationCodes<'<接口 id>'>, Outcome>` 在编译期穷尽每个接口的业务码，并用单测与契约对账；`OperationCodes<Id>` MUST 等于该接口 `meta.codes` 的码集合。

#### Scenario: SCN-OPENAPI-CONTRACT-017 按接口粒度派生完整义务清单
- **WHEN** 基于清单登记的产品契约与模板 Web 应用的消费接口声明运行派生（用例从契约与声明派生期望，不写死接口名）；另在受控临时根中构造：声明为空、`requestFields` 含 `path.`、`body.`、`header.` 三类键、`requestFields` 含键空间之外的键（如 `query.x` 或 `body.a.b`）、`requestFields` 含指向契约中不存在的路径参数或请求体字段的键（如 `path.unknown`）
- **THEN** 每个声明接口都派生出 `route`、`identity`、`request-headers`、`request-fields`、`envelope`、每个业务码一条 `business-code#<码>`、`transport-failure`、`presence` 义务，义务 ID 符合 `<契约名>.<operationId>#<义务类>#<键>`（例如 `trade.v1.getTrade#route#path.trade_no`）；不存在叶子字段义务；`request-fields` 义务与声明的每一项一一对应，case 取自声明的策略；`request-headers` 义务校验 `X-Request-Id` 的头名与格式；义务运行环境为 integration 与 browser，不含 weapp；声明为空时按接口派生的义务为空且不报错；键空间之外的键与指向不存在参数或字段的键都报错并指出元素与键。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "obligation-kinds": "每个声明接口派生 route、identity、request-headers、request-fields、envelope、business-code、transport-failure、presence 义务",
    "obligation-id-format": "义务 ID 格式为 <契约名>.<operationId>#<义务类>#<键>",
    "no-leaf-obligations": "不派生叶子字段义务",
    "business-code-per-code": "接口码与通用码并集中的每个码各有一条 business-code 义务",
    "request-fields-keyspace": "requestFields 键只允许 path.、body.<一级字段>、header. 三类且必须指向契约中存在的参数或字段，否则报错并指出元素与键",
    "request-id-obligation": "request-headers 义务校验 X-Request-Id 的头名与格式",
    "environments-by-binding": "义务运行环境为 integration 与所在绑定的 browser，不含 weapp",
    "empty-declaration": "声明为空时按接口派生的义务为空且不报错"
  },
  "cases": [
    {"key": "derive-obligations-unit", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["obligation-kinds", "obligation-id-format", "no-leaf-obligations", "business-code-per-code", "request-fields-keyspace", "request-id-obligation", "empty-declaration"]},
    {"key": "derive-obligations-gate", "kind": "engineering", "requiredIn": ["integration"], "checks": ["obligation-kinds", "obligation-id-format", "environments-by-binding"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-018 presence 派生对联合类型做包含判定，否则报待定
- **WHEN** 对以下 `data` schema 运行 presence 派生：普通对象（含 required 与可选属性）、带同级 type 的 nullable 字段、一个分支包含其余全部分支的 `oneOf`（引擎测试契约中 createTrade 冲突码的 data 形状）、没有分支包含其余分支的 `oneOf`、分支为 `$ref` 与内联混合的 `oneOf`
- **THEN** 普通对象与 nullable 字段分别得到 `present`、`present-or-null`、`optional`；可包含判定的 `oneOf` 中 `required` 取交集、`properties` 取并集；不可判定的 `oneOf` 被报为待定并计入问题；任何输入都不抛出运行时异常。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "presence-values": "data 及其一级属性得到 present、present-or-null、optional 之一",
    "nullable-handled": "带同级 type 的 nullable 字段判为 present-or-null",
    "union-containment": "存在包含其余全部分支的分支时 required 取交集、properties 取并集",
    "union-pending": "无包含关系的联合类型报待定并计入问题",
    "no-runtime-exception": "任何联合形状输入都不抛出 TypeError 等运行时异常"
  },
  "cases": [
    {"key": "presence-derivation", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["presence-values", "nullable-handled", "union-containment", "union-pending", "no-runtime-exception"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-019 未实现接口进入消费集合时提示不阻断
- **WHEN** 在受控临时根中把引擎测试契约登记为该临时根的产品契约，再把其中 `x-implemented: false` 的 `cancelTrade` 加入 Web 应用的消费接口声明，运行派生与场景门禁的清单模式；检查指南；随后恢复合法输入
- **THEN** 派生器输出指出 `cancelTrade` 未实现的提示，派生与门禁不因此失败；恢复后提示消失；指南写明开发代理连接真实服务端时这类接口返回未实现错误，应改用本地预览查看。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "hint-emitted": "x-implemented: false 的接口被消费时派生器输出提示并指出接口",
    "not-blocking": "提示不导致派生或门禁失败",
    "guide-documented": "指南写明这类接口在开发代理下返回未实现错误，应改用本地预览"
  },
  "cases": [
    {"key": "unimplemented-hint-unit", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["hint-emitted", "not-blocking"]},
    {"key": "unimplemented-hint-gate", "kind": "engineering", "requiredIn": ["integration"], "checks": ["not-blocking", "guide-documented"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-020 业务码完备性在编译期穷尽并与契约对账
- **WHEN** 在 `openapi-unit` 的类型测试中检查引擎测试契约生成的 `codes.ts` 中每个接口的 `OperationCodes<Id>`；在类型测试中以 `satisfies Record<OperationCodes<'createTrade'>, Outcome>` 分别写出覆盖全部码的映射、缺少一个码的映射、多出契约之外码的映射，并运行 typecheck
- **THEN** `OperationCodes<Id>` 等于该接口 `meta.codes`；覆盖全部码的映射通过；缺少或多出码的映射在编译期报错。示例产品映射表与契约的对账由 WEX-06 承担。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "operation-codes-match": "OperationCodes<Id> 与该接口 meta.codes 的码集合相等",
    "exhaustive-compiles": "覆盖全部业务码的 satisfies 映射通过编译",
    "missing-or-extra-fails": "缺少或多出业务码的映射在编译期报错"
  },
  "cases": [
    {"key": "code-completeness-types", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["operation-codes-match", "exhaustive-compiles", "missing-or-extra-fails"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-021 声明接口的协议义务都有运行证据
- **WHEN** 由 Web 应用（`packages/web`）的消费接口声明生成 OpenAPI Shadow 路由，矩阵用例遍历声明中的接口，经 OpenAPI 协议包产物的公共客户端与 `createFetchHttp` 逐项执行派生义务：integration 中直接访问 Shadow，browser 中在协议宿主页面内经同源代理访问；另以空声明运行矩阵用例
- **THEN** 每条派生义务在 integration 与 browser 中都有真实执行且通过的证据，不要求 weapp 证据；矩阵用例不写死接口名；空声明时不产生路由，矩阵用例断言按接口派生的义务为空并结束；场景门禁中与该绑定协议义务相关的问题数为 0。本场景是 OpenAPI 协议义务运行证据的唯一承担者，Web 示例页面行为不重复这些证据。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "obligations-covered": "每条派生义务在 integration 与 browser 中都有通过的证据",
    "real-client-path": "证据来自协议包产物的公共客户端与真实 fetch，browser 经同源代理",
    "matrix-iterates-declaration": "矩阵用例按声明遍历接口，不写死接口名",
    "empty-declaration-matrix": "声明为空时不产生路由，矩阵用例断言按接口派生的义务为空并结束"
  },
  "cases": [
    {"key": "openapi-matrix", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["obligations-covered", "real-client-path", "matrix-iterates-declaration"]},
    {"key": "openapi-matrix-empty", "kind": "behavior", "requiredIn": ["integration"], "checks": ["empty-declaration-matrix"]}
  ],
  "blockedBy": []
}
```

### Requirement: OAS-06 响应校验与 Fixture 认领

OpenAPI 适配器的 `responseValidator(op)` 与 `checkFixture(manifest, files)` SHALL 实现以下规则；Shadow 引擎仍 MUST NOT 导入协议生成物，校验函数由 OpenAPI 路由构造器注入（见 PC-03、PC-04）。`check:fixtures` 只对 manifest 声明 `protocol` 为 OpenAPI 协议包的 Fixture 与预览数据集调用本适配器（见 GATE-16）。

- **规范化钩子**：Ajv 校验前 SHALL 把 OAS 3.0 的 `nullable` 转为 2020 写法，并把布尔形式的 `exclusiveMinimum`/`exclusiveMaximum` 换算为数值形式。钩子 SHALL 作为协议包配置可扩展，用于契约存在已知缺陷时的规范化；引擎测试契约本身 MUST NOT 依赖额外钩子。
- **严格同形**：Shadow 响应与 Fixture 中的信封 MUST 与契约（按接口与 HTTP 状态码取响应 schema）严格同形，契约之外的字段一律失败。MUST NOT 提供"只放过多出字段"的宽松认领或同类配置。服务端新增字段时，先更新契约再写测试数据。
- **信封认领**：Fixture 文件中每个形似信封的对象（`code` 为数字，且有 `message` 或 `data`）MUST 被认领，否则失败并指出文件与 JSON 路径。认领方式：
  - `envelopes`：按 JSON 路径逐个登记所属接口；
  - `contract`：整个文件属于一个接口；
  - 故意的非法信封：使用 PC-04 的 `malformed: { reason }`，门禁 MUST 反证该信封确实不符合任何接口的响应 schema；若它符合某个接口，则判定失败，防止 `malformed` 被当作放行口子。
- **业务码核对**：每个被认领信封的 `code` MUST 属于约定模块给出的该接口码与通用码的并集，否则失败并指出接口、码与位置。

#### Scenario: SCN-OPENAPI-CONTRACT-022 规范化钩子在校验前转换 3.0 写法
- **WHEN** 以含 OAS 3.0 `nullable: true` 与布尔形式 `exclusiveMinimum` 的 schema 构造响应校验器，分别校验 `null` 值、边界值与合法值；另注册一个自定义规范化钩子并校验；对引擎测试契约不注册额外钩子构造校验器
- **THEN** `nullable` 字段接受 `null`；布尔 `exclusive*` 按数值形式生效，边界值被拒绝；自定义钩子在校验前被调用并生效；引擎测试契约无需额外钩子即可校验。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "nullable-normalized": "OAS 3.0 nullable 转为 2020 写法后 null 值被接受",
    "exclusive-normalized": "布尔形式 exclusive* 换算为数值形式，边界值被拒绝",
    "hook-extensible": "自定义规范化钩子可经协议包配置注册并在校验前生效",
    "example-needs-no-hook": "引擎测试契约不依赖额外钩子"
  },
  "cases": [
    {"key": "normalization-hooks", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["nullable-normalized", "exclusive-normalized", "hook-extensible", "example-needs-no-hook"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-023 Shadow 响应严格同形，不提供宽松认领
- **WHEN** 在 openapi-unit 中只调用 OpenAPI 路由构造器注入的校验函数（不构造引擎，协议包测试文件不导入引擎），在 integration 中以声明 `web-openapi-browser` 绑定的用例用该路由构造 Shadow；输入以 Fixture JSON 与内联 body 两种来源给出，响应依次为：同形信封、`data` 含契约之外字段、信封顶层含契约之外字段、字段类型不符；另以契约为某个非 200 状态码定义的响应 schema 构造一个该状态码的同形响应与一个按 200 schema 书写的响应；检查适配器与协议包配置项
- **THEN** 同形信封与按其状态码 schema 同形的非 200 响应校验无问题、构造成功；其余不同形输入由校验函数报出问题并指出接口与字段路径，在 integration 中 `createShadowServer` 构造时抛错并附 step 序号；校验按状态码选取响应 schema；不存在任何放过多出字段的认领方式或配置项；Shadow 引擎不导入协议生成物。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "conforming-accepted": "与契约严格同形的信封校验无问题",
    "extra-field-rejected": "data 或信封顶层含契约之外字段时校验函数报出问题",
    "type-mismatch-rejected": "字段类型不符时校验函数报出问题并指出接口与字段路径",
    "status-aware": "响应 schema 按 HTTP 状态码选取",
    "no-loose-claim": "不存在放过多出字段的认领方式或配置项",
    "engine-no-generated": "Shadow 引擎不导入协议生成物，校验函数由路由构造器注入，不同形响应在引擎构造时被拒绝并附 step 序号"
  },
  "cases": [
    {"key": "strict-shape-validator", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["conforming-accepted", "extra-field-rejected", "type-mismatch-rejected", "status-aware", "no-loose-claim"]},
    {"key": "shadow-injection", "kind": "engineering", "requiredIn": ["integration"], "checks": ["engine-no-generated", "no-loose-claim"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-024 Fixture 中每个信封必须被认领
- **WHEN** 在受控临时根中构造 Fixture：以 `envelopes` 按路径登记多个信封、以 `contract` 声明整个文件属于一个接口、含一个未被任何方式认领的形似信封对象、`envelopes` 登记的路径不存在、一个 `code` 为数字但既无 `message` 也无 `data` 的对象；运行 `check:fixtures`
- **THEN** 两种认领方式下已认领信封按所属接口严格同形校验；未认领的信封导致失败并指出文件与 JSON 路径；登记路径不存在时失败；不形似信封的对象不要求认领。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "envelopes-claim": "envelopes 按 JSON 路径逐个登记的信封按所属接口校验",
    "contract-claim": "contract 声明的文件按该接口校验",
    "unclaimed-rejected": "未被认领的形似信封对象导致失败并指出文件与 JSON 路径",
    "dangling-claim-rejected": "envelopes 登记的路径不存在时失败",
    "envelope-detection": "只有 code 为数字且有 message 或 data 的对象被视为信封"
  },
  "cases": [
    {"key": "claim-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["envelopes-claim", "contract-claim", "unclaimed-rejected", "dangling-claim-rejected", "envelope-detection"]},
    {"key": "check-fixtures-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["unclaimed-rejected", "dangling-claim-rejected"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-025 malformed 认领必须经反证
- **WHEN** 在受控临时根中构造两个声明 `malformed: { reason }` 的信封：一个确实不符合任何接口的响应 schema，另一个实际与某个接口同形；再构造一个 `reason` 为空的 `malformed`；运行 `check:fixtures`
- **THEN** 确实非法的信封通过；与某接口同形的信封被判失败并指出它符合的接口；`reason` 为空时失败。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "malformed-accepted": "确实不符合任何接口的 malformed 信封通过",
    "malformed-counter-proof": "实际与某接口同形的 malformed 信封被判失败并指出该接口",
    "reason-required": "malformed 的 reason 为空时失败"
  },
  "cases": [
    {"key": "malformed-counter-proof", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["malformed-accepted", "malformed-counter-proof", "reason-required"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-026 被认领信封的业务码必须属于该接口
- **WHEN** 分别以 Fixture 与 Shadow 内联 body 构造被认领到引擎测试契约 createTrade 的信封：`code` 为该接口特有码、通用码、其他接口特有码、码表之外的码
- **THEN** 前两者通过；后两者失败并指出接口、码与位置；Fixture 检查与 Shadow 响应校验判定一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "own-and-common-accepted": "接口特有码与通用码通过",
    "foreign-code-rejected": "其他接口的特有码或码表之外的码失败并指出接口、码与位置",
    "fixture-and-shadow-consistent": "check:fixtures 与 Shadow 响应校验对业务码的判定一致"
  },
  "cases": [
    {"key": "business-code-check", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["own-and-common-accepted", "foreign-code-rejected", "fixture-and-shadow-consistent"]}
  ],
  "blockedBy": []
}
```

### Requirement: OAS-07 OpenAPI 协议包形态与浏览器网络适配器

OpenAPI 协议包 MUST 与 IDL 协议包一致，构建 ESM、CommonJS 双格式产物与类型声明；集成用例与浏览器宿主 MUST 消费产物而不是源码。模板中 OpenAPI 协议包只被 `web-openapi-browser` 绑定引用，不进入发布计划（发布范围见 ENG-12），但仍构建双格式产物；其双格式产物与根入口导出的证据由本要求承担，ENG-01 的 npm 包消费检查只覆盖 `sdk` 形态产品包及其绑定的协议包。根入口 MUST 具名导出平台网络工厂 `createFetchHttp`（实现位于 `src/adapters/network/fetch.ts`），符合根 AGENTS 执行规则 7：复用现有根 entry、双格式声明与 dist 清单，不新增平台子路径或测试出口；产品与测试消费同一生产实现。

OpenAPI 协议包 SHALL 在 `testing/browser-runner.ts` 提供协议宿主页面内的步骤执行器（协议宿主机制见 BRW-02），只经本包根入口（在宿主中解析到 `dist`）导入公共客户端与 `createFetchHttp` 执行计划步骤，不写死接口名；它位于 `testing/`，MUST NOT 进入生产产物。其浏览器证据由 SCN-BROWSER-PLATFORM-003 与本能力各 browser case 承担。

`createFetchHttp` 的行为义务 MUST 与 IDL 协议包的 `fetch` 适配器一致（见 PC-08）：导入或创建时不读平台全局，发送时才读 `globalThis.fetch`；发送前已停止或预算耗尽时不访问平台；结果只交付一次，先锁定再清理；超时与取消用自有计时器加 `AbortController` 区分；读取响应体计入预算；不重放请求；请求使用 `credentials: 'same-origin'`、`cache: 'no-store'`。

#### Scenario: SCN-OPENAPI-CONTRACT-027 双格式产物与根入口具名导出 createFetchHttp
- **WHEN** 构建 OpenAPI 协议包（`@daqian/template-openapi`）并检查 `package.json` 的导出、dist 清单与类型声明；分别以 ESM 与 CommonJS 方式导入根入口；检查集成用例与浏览器宿主的导入来源；生成发布计划
- **THEN** 产出 ESM、CommonJS 与类型声明；两种格式的根入口都具名导出 `createFetchHttp` 与公共客户端；不存在平台子路径或测试出口；`testing/` 与适配器不在产物中；集成用例与宿主从产物导入；发布计划中不含 OpenAPI 协议包。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "dual-format": "构建产出 ESM、CommonJS 双格式产物与类型声明",
    "root-named-export": "两种格式的根入口具名导出 createFetchHttp",
    "no-extra-entry": "不存在平台子路径或测试出口，testing/ 不在产物中",
    "consumers-use-dist": "集成用例与宿主从协议包产物导入",
    "not-in-release-plan": "OpenAPI 协议包只被 web-app 形态产品绑定，不进入发布计划"
  },
  "cases": [
    {"key": "openapi-package-shape", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dual-format", "root-named-export", "no-extra-entry", "consumers-use-dist", "not-in-release-plan"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-OPENAPI-CONTRACT-028 createFetchHttp 行为义务与 IDL fetch 适配器一致
- **WHEN** 在单测中以可控的 `globalThis.fetch` 与假计时器驱动 `createFetchHttp`：导入与创建后检查是否读取平台全局；发送前已停止或预算耗尽时发送；超时与取消先后触发；响应体读取耗尽预算；同一请求的多次完成回调；检查请求选项；另经 Shadow 在 integration 与 browser 中发送请求
- **THEN** 导入与创建时不读平台全局，发送时才读 `globalThis.fetch`；已停止或预算耗尽时不访问平台；超时与取消可区分；读取响应体计入预算；结果只交付一次；不重放请求；请求选项含 `credentials: 'same-origin'` 与 `cache: 'no-store'`；Shadow 对每次调用只记录一次请求。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "lazy-global": "导入或创建时不读平台全局，发送时才读 globalThis.fetch",
    "no-access-when-stopped": "发送前已停止或预算耗尽时不访问平台",
    "timeout-vs-cancel": "超时与取消用自有计时器与 AbortController 区分",
    "body-in-budget": "读取响应体计入预算",
    "single-delivery": "结果只交付一次，先锁定再清理",
    "no-replay": "适配器不重放请求，Shadow 对每次调用只记录一次请求",
    "request-options": "请求使用 credentials: same-origin 与 cache: no-store"
  },
  "cases": [
    {"key": "fetch-adapter-unit", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["lazy-global", "no-access-when-stopped", "timeout-vs-cancel", "body-in-budget", "single-delivery", "no-replay", "request-options"]},
    {"key": "fetch-adapter-wire", "kind": "behavior", "requiredIn": ["integration", "browser"], "checks": ["no-replay", "request-options"]}
  ],
  "blockedBy": []
}
```

### Requirement: OAS-08 引擎测试契约与证据载体

OpenAPI 协议包 SHALL 在 `packages/openapi/testing/engine/` 提供引擎测试契约：契约 `trade-v1.yaml`、约定模块 `conventions.ts`，以及由 OAS-02 同一生成器产出并提交的生成物与 bundle。它中立化重写，与 IDL 示例同为"交易"领域，约 200–300 行，契约名为 `trade.v1`；xueshan 契约 MUST NOT 提交进模板。引擎测试契约不登记清单 `packages[].contract`、不参与 `api:sync`，其目录 SHALL 以通配形式（`packages/openapi/testing/engine/**`）纳入 `fingerprints.protocolInputs`；`openapi-unit` SHALL 在临时目录重新生成其生成物与 bundle 并逐文件比对，不一致即失败。模板初始的产品契约（`contracts/trade-v1.yaml`）内容与引擎测试契约相同，供 Web 示例消费；两者此后各自演进。

**证据载体**：本能力中验证引擎行为的 Scenario（OAS-01 与 OAS-03 的反例与行为、OAS-02 的生成器、OAS-03 的线上行为、OAS-04 的非法声明元素、OAS-05 的 presence 派生、未实现提示与业务码类型工具、OAS-06 的响应校验与 Fixture 认领、本要求的契约结构）MUST 以引擎测试契约为载体，MUST NOT 依赖产品契约中的具体接口；只有把通用基线作用在产品契约上的证据以产品契约为载体：命令对清单契约的运行（OAS-01）、门禁按清单加载适配器并解析产品声明（SCN-OPENAPI-CONTRACT-015 的模板事实）、对产品声明的义务派生（SCN-OPENAPI-CONTRACT-017 的门禁部分）与 OpenAPI 协议矩阵（SCN-OPENAPI-CONTRACT-021）。以产品契约为载体的用例 MUST NOT 写死产品契约中的接口名、契约名与码值。集成用例与浏览器宿主仍只消费协议包产物中的公共客户端与 `createFetchHttp`，引擎用例把引擎测试契约的描述常量与身份方案作为数据传入，Shadow 路由由引擎测试契约的 bundle 构造。

引擎测试契约 MUST 包含以下四个接口：

| 接口 | 用途 | 必须覆盖的特性 |
|---|---|---|
| `POST /api/v1/trades`（createTrade） | 创建交易 | 请求体与示例；该接口特有业务码；冲突码的 `data` 走 `oneOf` 另一分支（覆盖 presence 联合判定）；身份方案一 |
| `GET /api/v1/trades/{trade_no}`（getTrade） | 轮询直到终态 | 路径参数；带同级 type 的 nullable 字段；状态枚举；身份方案一 |
| `GET /api/v1/merchants/{merchant_id}/trades`（listTrades） | 列表 | 多路径参数、整数参数；匿名接口（`security: []`） |
| `POST /api/v1/trades/{trade_no}/cancel`（cancelTrade） | 取消交易 | `x-implemented: false`；身份方案二；只用于验证契约命令、未实现提示（OAS-05）与第二个身份方案的头名映射（OAS-03） |

顶层 MUST 包含：信封（`allOf` 加 nullable `data`）、`x-common-business-codes`、`x-business-code-table`、至少一个 `x-implemented: false` 的接口（即 cancelTrade）、两个 `apiKey`（`in: header`）且头名不同的 `securitySchemes`（证明身份头名不写死）、`X-Request-Id` 请求参数与响应头。身份方案的分配 MUST 为：createTrade 与 getTrade 使用方案一，cancelTrade 使用方案二，listTrades 匿名（`security: []`）。

#### Scenario: SCN-OPENAPI-CONTRACT-029 引擎测试契约包含四个接口与必需的顶层结构
- **WHEN** 解析 `packages/openapi/testing/engine/trade-v1.yaml`，以其约定模块运行校验；在临时目录重新生成其生成物与 bundle 并与提交的文件比对；检查清单 `fingerprints.protocolInputs`
- **THEN** 契约名为 `trade.v1`，行数在 200–300 行范围内；包含 createTrade、getTrade、listTrades、cancelTrade 四个接口，各自具备上表列出的特性，cancelTrade 标注 `x-implemented: false`；createTrade 与 getTrade 使用方案一、cancelTrade 使用方案二、listTrades 为 `security: []`；顶层包含 `allOf` 加 nullable `data` 的信封、`x-common-business-codes`、`x-business-code-table`、两个头名不同的 `apiKey` 头方案、`X-Request-Id` 请求参数与响应头；校验通过且 lint 零告警；引擎测试契约目录中不含 xueshan 契约；重新生成的生成物与 bundle 与提交的文件逐一一致；该目录以通配形式登记在 `fingerprints.protocolInputs` 中。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "four-operations": "包含 createTrade、getTrade、listTrades、cancelTrade 四个接口及其路径与方法",
    "operation-features": "createTrade 含请求体、示例、特有码与 oneOf 冲突 data；getTrade 含路径参数、带同级 type 的 nullable 字段与状态枚举；listTrades 含多路径参数、整数参数与 security: []；cancelTrade 标注 x-implemented: false；createTrade 与 getTrade 使用方案一，cancelTrade 使用方案二",
    "top-level-extensions": "顶层含 allOf 加 nullable data 的信封、x-common-business-codes、x-business-code-table",
    "two-api-key-schemes": "含两个头名不同的 apiKey 头方案",
    "request-id-declared": "声明 X-Request-Id 请求参数与响应头",
    "neutral-and-valid": "契约为中立交易领域、约 200–300 行，校验通过且 lint 零告警，引擎测试契约目录中不含 xueshan 契约",
    "engine-artifacts-fresh": "引擎测试契约的生成物与 bundle 与重新生成结果逐一一致，目录以通配形式登记在 fingerprints.protocolInputs"
  },
  "cases": [
    {"key": "example-contract-structure", "kind": "engineering", "requiredIn": ["integration"], "checks": ["four-operations", "operation-features", "top-level-extensions", "two-api-key-schemes", "request-id-declared", "neutral-and-valid"]},
    {"key": "engine-artifacts-fresh", "kind": "module", "requiredIn": ["openapi-unit"], "checks": ["engine-artifacts-fresh"]}
  ],
  "blockedBy": []
}
```
