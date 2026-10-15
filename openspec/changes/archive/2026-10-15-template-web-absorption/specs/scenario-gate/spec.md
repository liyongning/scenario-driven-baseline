## ADDED Requirements

### Requirement: GATE-16 Fixture 与预览数据集按声明的协议委托协议适配器检查

Fixture `manifest.json` 与预览数据集 manifest SHALL 新增可选字段 `protocol`（清单中某个 protocol 角色包的目录，例如 `protocol`、`openapi`），声明其中的协议响应属于哪个协议包；`fixture.schema.json` 与数据集 manifest 的 schema 为该字段带非空中文说明。`check:fixtures` 的协议相关检查 MUST 只委托给 `protocol` 指向的协议包的适配器（见 PC-07），`check:fixtures` 自身 MUST NOT 按协议种类写分支：

- **协议声明**：`protocol` MUST 是清单中 protocol 角色包的目录，否则报错。包含协议响应的 Fixture MUST 声明 `protocol`；未声明 `protocol` 的 Fixture 不调用任何适配器的 `checkFixture`。
- **Fixture 检查**：对每个以 owner ID 命名且声明了 `protocol` 的 Fixture 目录，在 GATE-10 的来源检查之外，SHALL 以其 `manifest.json` 与 case 文件只调用该协议包适配器的 `checkFixture(manifest, files)`，MUST NOT 调用其他协议包的适配器。IDL 适配器不做额外检查；OpenAPI 适配器的信封认领与业务码核对见 OAS-06。
- **owner 协议一致性**：门禁 SHALL 按用例归属绑定（见 GATE-17）找出绑定某个 owner 的用例所属的绑定，取这些绑定的协议包。该集合非空时，owner 的 Fixture MUST 声明 `protocol` 且等于该协议包：未声明（漏声明会绕过信封认领）、声明了其他协议包、或绑定该 owner 的用例分属协议不同的绑定时，均报错并指出 owner、声明值与期望值。只被不属于任何绑定的用例绑定的 owner 不做此项核对。
- **预览数据集**：`packages/e2e/tests/fixtures/_datasets/<name>/` 下的每个数据集 MUST 在 manifest 中声明 `protocol`，条目 MUST 是显式结构 `[{ operationId, pathParams?, responses: [{ status?, body }] }]`：`responses` 非空；`status` 缺省为 200；`pathParams` 缺省时匹配该接口的任意路径参数，声明时精确匹配（匹配语义见 PC-06）；MUST NOT 使用 `op:后缀` 一类的复合键。每个条目的 `operationId` MUST 能被 `protocol` 指向的协议包适配器识别（以 `operationId` 与 `{ manifest: 数据集 manifest }` 调用 `responseValidator` 能取得校验函数；manifest 原样传入，由适配器解释，门禁不读取其中的协议专有字段），否则报错并指出数据集、条目与 `operationId`；每条响应 SHALL 经该校验函数按其 `status` 做与 Fixture 相同的严格同形校验，并以数据集文件调用同一适配器的 `checkFixture` 做业务码等协议检查。数据集不参与 GATE-10 的 owner 解析与来源摘要。

问题 SHALL 逐项列出 Fixture owner 或数据集名、文件与原因，非零退出。

#### Scenario: SCN-SCENARIO-GATE-028 check:fixtures 按声明的协议委托适配器检查 Fixture 与预览数据集
- **WHEN** 在受控临时根中登记两个协议包 A、B，其 `testing/adapter.ts` 为记录调用、可配置返回问题的桩适配器；放入一个声明 `protocol: A` 的合法 Fixture、一个不声明 `protocol` 的 Fixture 与一个声明 `protocol: A` 的合法数据集（含不带 `status` 与不带 `pathParams` 的条目），运行 `check:fixtures`；随后分别：让 A 的 `checkFixture` 对该 Fixture 返回一个问题；让 Fixture 声明清单中不存在的协议包目录；放入不声明 `protocol` 的数据集；放入使用 `op:后缀` 复合键或 `responses` 为空的数据集；放入 `operationId` 不被 A 识别的数据集；放入某条响应不同形的数据集；让 A 的 `checkFixture` 对数据集文件返回一个问题；检查 `check:fixtures` 的非测试源码
- **THEN** 合法输入通过；声明 `protocol: A` 的 Fixture 只调用了 A 的 `checkFixture`，B 的适配器未被调用；未声明 `protocol` 的 Fixture 不调用任何 `checkFixture`；合法数据集的每条响应都经 A 的校验函数按其状态码（缺省 200）校验，且 A 的 `responseValidator` 收到的 `options.manifest` 与数据集 manifest 相同；其余输入逐项报出 owner 或数据集名、文件与原因并非零退出；`check:fixtures` 源码中不存在按 `protocolKind` 取值的分支。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "fixture-delegated-by-protocol": "声明 protocol 的 Fixture 只调用该协议包适配器的 checkFixture，其他适配器不被调用，未声明的 Fixture 不调用任何 checkFixture，问题被汇总报出并非零退出",
    "protocol-must-exist": "protocol 不是清单中 protocol 角色包目录时报错",
    "dataset-structure": "数据集 manifest 必须声明 protocol，条目必须是 [{ operationId, pathParams?, responses: [{ status?, body }] }] 显式结构且 responses 非空，status 缺省 200，复合键或空 responses 被拒绝",
    "dataset-operation-resolved": "数据集条目的 operationId 必须能被声明协议的适配器识别，否则报错",
    "dataset-strict-shape": "数据集的每条响应经声明协议的适配器按其状态码做严格同形校验，并经同一适配器的 checkFixture 做协议检查",
    "no-kind-branching": "check:fixtures 源码中不按 protocolKind 取值分支"
  },
  "cases": [
    {"key": "fixture-adapter-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["fixture-delegated-by-protocol", "protocol-must-exist", "dataset-structure", "dataset-operation-resolved", "dataset-strict-shape"]},
    {"key": "fixture-adapter-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["fixture-delegated-by-protocol", "protocol-must-exist", "dataset-structure", "dataset-operation-resolved", "dataset-strict-shape", "no-kind-branching"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-030 owner 的 Fixture 协议必须与绑定该 owner 的用例所属绑定一致
- **WHEN** 在受控临时根中登记绑定 `b1`（协议包 A）与 `b2`（协议包 B），分别构造：`tests/b1/` 下的用例绑定 owner X，X 的 Fixture 声明 `protocol: A`；同样的用例但 X 的 Fixture 未声明 `protocol`；X 的 Fixture 声明 `protocol: B`；`b1` 与 `b2` 的用例同时绑定 owner Y；只被 `tests/tooling/` 下不属于任何绑定的用例绑定的 owner Z，其 Fixture 未声明 `protocol`；另读取模板自身的 Fixture
- **THEN** 第一种与 Z 通过；X 未声明、X 声明与绑定不一致、Y 分属协议不同的绑定都报错并指出 owner、声明值与期望值，非零退出；模板自身绑定到 `sdk-idl-weapp` 用例的 Fixture 声明 `protocol` 为 `protocol`，绑定到 `web-openapi-browser` 用例的 Fixture 声明 `protocol` 为 `openapi`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "owner-protocol-consistent": "被属于绑定的用例绑定的 owner，其 Fixture 必须声明 protocol 且等于该绑定的协议包",
    "missing-declaration-rejected": "应声明而未声明 protocol 的 Fixture 被报出，不能绕过信封认领",
    "conflicting-bindings-rejected": "绑定同一 owner 的用例分属协议不同的绑定时报错并指出 owner",
    "unbound-owner-exempt": "只被不属于任何绑定的用例绑定的 owner 不做协议一致性核对",
    "template-fixtures-declared": "模板自身 Fixture 的 protocol 声明与其 owner 所在绑定的协议包一致"
  },
  "cases": [
    {"key": "owner-protocol-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["owner-protocol-consistent", "missing-declaration-rejected", "conflicting-bindings-rejected", "unbound-owner-exempt"]},
    {"key": "owner-protocol-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["owner-protocol-consistent", "missing-declaration-rejected", "conflicting-bindings-rejected", "template-fixtures-declared"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-17 用例运行环境按组合绑定校验

`defineCase` 声明的运行环境 MUST 按用例所属的组合绑定校验，替代"属于清单中 integration 或 platform 类项目即可"的取法：

- **用例归属绑定**按以下顺序确定：`defineCase` 的 `binding` 字段优先；未声明时取用例文件所在目录 `packages/e2e/tests/<绑定名>/`（只有目录名等于清单 `bindings[]` 中某条绑定名时才视为绑定目录）；两者都没有的用例（如 `tests/tooling/` 下的用例）不属于任何绑定。`binding` 字段的值不在清单 `bindings[]` 中时 MUST 拒绝并指出用例与绑定名。
- 属于某条绑定的用例，其声明的环境 MUST 是清单中的 integration 类项目，或该绑定 `platforms` 中的平台项目；声明其他绑定的平台项目时 MUST 拒绝。
- 不属于任何绑定的用例只能声明 integration 类环境，声明 platform 类环境时 MUST 拒绝。
- 拒绝 SHALL 在 `defineCase` 运行时发生，错误信息指出用例、声明的环境与所属绑定，与清单未登记环境的拒绝采用同一机制。
- 用例归属绑定同时是 GATE-16 中 owner 协议一致性核对的依据。
- **模板事实**：现有 IDL 用例不搬目录，SHALL 在 `defineCase` 中补 `binding: 'sdk-idl-weapp'`；新增的 Web 用例放在 `packages/e2e/tests/web-openapi-browser/`。

#### Scenario: SCN-SCENARIO-GATE-029 defineCase 的环境必须属于所属绑定
- **WHEN** 在受控临时根中登记两条绑定 `b1`（平台 P1）与 `b2`（平台 P2），分别构造以下 `defineCase`：位于 `tests/b1/` 下、无 `binding` 字段，声明 integration 与 P1；位于 `tests/b1/` 下、无 `binding` 字段，声明 P2；不在任何绑定目录且没有 `binding` 字段、声明 P1；不在绑定目录、以 `binding: 'b2'` 声明 P2；位于 `tests/b1/` 下却以 `binding: 'b2'` 声明 P2；位于 `tests/b1/` 下以 `binding: 'b2'` 声明 P1；声明清单中不存在的 `binding: 'b3'`；另读取模板自身的用例
- **THEN** 第一种、以 `binding: 'b2'` 声明 P2 的两种（`binding` 字段优先于目录）被接受；在 `b1` 目录下无字段声明 P2、不属于任何绑定却声明平台环境、以 `binding: 'b2'` 声明 P1、绑定名未登记都在运行时被拒绝，错误信息指出用例、环境与绑定；模板自身不在绑定目录下的 IDL 用例都声明了 `binding: 'sdk-idl-weapp'`，Web 用例位于 `tests/web-openapi-browser/`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "binding-precedence": "用例所属绑定先取 binding 字段，其次取 tests/<绑定名>/ 目录，两者都没有则不属于任何绑定；binding 字段的绑定名未登记时拒绝",
    "environment-within-binding": "属于绑定的用例只能声明 integration 类项目或该绑定 platforms 中的平台项目，声明其他绑定的平台被拒绝",
    "unbound-integration-only": "不属于任何绑定的用例只能声明 integration 类环境",
    "runtime-rejection": "拒绝在 defineCase 运行时发生并指出用例、环境与绑定",
    "template-case-bindings": "模板自身的 IDL 用例声明 binding: sdk-idl-weapp，Web 用例位于 tests/web-openapi-browser/"
  },
  "cases": [
    {"key": "case-binding-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["binding-precedence", "environment-within-binding", "unbound-integration-only", "runtime-rejection"]},
    {"key": "case-binding-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["environment-within-binding", "runtime-rejection", "template-case-bindings"]}
  ],
  "blockedBy": []
}
```

## MODIFIED Requirements

### Requirement: GATE-07 覆盖清单由事实源生成且缺绑定被阻断

场景门禁的覆盖分母 MUST 从有效 Spec 与协议义务（由每个产品包声明的消费接口，经其所在组合绑定的协议包适配器派生，见 PC-01、PC-07、OAS-05）这两类事实源生成，不得从已有测试反推。任何必需 case 缺少对应环境的绑定，或测试只标注了 ID 却没有绑定具体检查点时，门禁 SHALL 列出缺项并非零退出，不能以现有测试全部通过或缩小统计范围来宣称覆盖完整。

协议义务的运行环境 MUST 按清单组合绑定取值，替代"全部 integration 与 platform 类项目"的取法：

- 每个产品包的路由、字段与共享方法义务，运行环境为清单中全部 integration 类项目加该产品所在绑定的 `platforms`；
- 错误码义务的运行环境为清单中全部 integration 类项目；
- 门禁 MUST NOT 要求某个产品的协议义务在其他绑定的平台项目中有证据：在模板中，IDL 义务不要求 browser 证据，OpenAPI 义务不要求 weapp 证据；一个绑定的平台报告缺失只使该绑定产品的义务出现缺口；
- 绑定的 `platforms` 为空时，该产品的协议义务只要求 integration 类环境。

#### Scenario: SCN-SCENARIO-GATE-009 新增场景或协议义务未绑定测试
- **WHEN** 有效 Spec 或协议义务中新增一项必需验证，但没有测试绑定它；或测试只标注了 owner ID 而没有绑定检查点
- **THEN** 清单由事实源生成并列出缺项，门禁非零退出；不能以测试通过或缩小统计范围宣称覆盖完整。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "fact-derived-inventory": "清单从有效 Spec 与协议义务生成，不从已有测试反推分母",
    "missing-binding-rejected": "新增义务缺 case，或只标 owner ID 而无检查点时，列明缺项并非零退出",
    "scope-cannot-shrink": "不能以测试通过或缩小统计范围宣称覆盖完整"
  },
  "cases": [
    {"key": "missing-scenario-case", "kind": "engineering", "requiredIn": ["integration"], "checks": ["fact-derived-inventory", "missing-binding-rejected", "scope-cannot-shrink"]},
    {"key": "missing-idl-field-case", "kind": "engineering", "requiredIn": ["integration"], "checks": ["fact-derived-inventory", "missing-binding-rejected", "scope-cannot-shrink"]},
    {"key": "owner-id-without-checkpoint", "kind": "engineering", "requiredIn": ["integration"], "checks": ["missing-binding-rejected"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-027 协议义务的运行环境按组合绑定取值
- **WHEN** 在受控临时根中登记两条绑定：产品 A 绑定 IDL 协议包与平台项目 P1，产品 B 绑定 OpenAPI 协议包与平台项目 P2，两个产品各声明一个消费接口；生成协议义务清单；随后分别只提供 integration 与 P1 的报告、只提供 integration 与 P2 的报告；再把产品 B 绑定的 `platforms` 改为空
- **THEN** 产品 A 的路由、字段与共享方法义务要求 integration 与 P1，产品 B 的要求 integration 与 P2，错误码义务只要求 integration；任一产品的义务都不要求另一绑定的平台；只提供 P1 报告时只有产品 B 的义务报出缺少 P2 环境，反之亦然；`platforms` 为空后产品 B 的义务只要求 integration。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "environments-by-binding": "每个产品的路由、字段与共享方法义务的运行环境等于全部 integration 类项目加该产品绑定的 platforms，错误码义务等于全部 integration 类项目",
    "no-cross-binding-requirement": "任一产品的协议义务不要求其他绑定平台的证据",
    "gap-scoped-to-binding": "某个绑定的平台报告缺失时只有该绑定产品的义务出现环境缺口",
    "empty-platforms": "绑定的 platforms 为空时该产品的协议义务只要求 integration 类环境"
  },
  "cases": [
    {"key": "binding-environment-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["environments-by-binding", "no-cross-binding-requirement", "empty-platforms"]},
    {"key": "binding-environment-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["environments-by-binding", "no-cross-binding-requirement", "gap-scoped-to-binding"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-10 Fixture 来源绑定以 owner ID 与 Requirement 块摘要为准

Fixture `manifest.json` 的 Spec 来源 MUST 只记录 `sources.spec.requirementDigest`（所属 Requirement 块规范化文本的 sha256），SHALL NOT 记录 Spec 文件路径；`fixture.schema.json` SHALL 删除 `path` 字段，仍带 `path` 或缺少 `requirementDigest` 的 manifest 按 schema 不合规报错。`sources` 中的其他来源条目（例如协议来源）不受本条影响。

Fixture 的 owner MUST 由其目录名（Scenario 或 FLOW ID）确定。`check:fixtures` SHALL 使用与场景门禁相同的来源合并逻辑（遵守 GATE-12 的 `--change` 作用域），按 owner ID 找到当前生效的 Requirement 块：Scenario 取其标题所在的 Requirement，FLOW 取其登记行所在的 Requirement。Requirement 块的范围从 `### Requirement:` 标题起，到下一个 Requirement 标题、更高级标题或文件结束为止；计算摘要前 SHALL 先规范化：换行统一为 LF、去掉行尾空白、去掉空行。只改动换行风格、行尾空白或空行时，摘要 MUST 不变。

检查结果 SHALL 按以下规则判定，并逐项列出 owner 与原因、非零退出：

- owner 在有效 Spec 中不存在：报"在有效 Spec 中不存在"，即使归档目录或其他文件中仍有同名 Scenario 也不放行；
- 摘要与当前生效 Requirement 块不一致：报过期，并提示 `pnpm fixtures:refresh <owner>`；
- 未指定 `--change` 时，有多个 active Change 修改了 owner 所在的同一 Requirement：报歧义，列出相关 Change，要求用 `--change` 指定作用域，不得任选其一。

`pnpm fixtures:refresh <owner...>` MUST 为每个指定 owner 重算 `requirementDigest` 与各 case 文件的 `sha256` 并写回 manifest；owner 不存在或存在歧义时按上述规则报错且不写入。以 Requirement 为单位意味着同一 Requirement 下任何改动都会让其下全部 Fixture 过期，这是有意接受的粒度。

由于 OpenSpec 归档后主 Spec 中合并后的 Requirement 块与 Change 中的 delta 块规范化后相同，归档 Change MUST NOT 要求改动任何 Fixture：归档前后同一 Fixture 的检查结论一致。

`packages/e2e/tests/fixtures/_datasets/` 下是本地预览数据集，不是以 owner ID 命名的 Fixture：它们不适用本要求的 owner 解析与来源摘要规则，MUST NOT 被报为"在有效 Spec 中不存在"，其结构、`protocol` 声明与协议检查见 GATE-16。

#### Scenario: SCN-SCENARIO-GATE-012 按 owner ID 解析当前生效 Requirement 并校验摘要
- **WHEN** 受控临时根中有一个以 Scenario ID 命名和一个以 FLOW ID 命名的 Fixture，其 `requirementDigest` 与当前生效 Requirement 块一致；随后分别做以下变化：仅在该 Requirement 中改换行风格、加行尾空白或空行；修改该 Requirement 的正文、某个 Scenario 或 FLOW 行；删除该 Scenario 而归档目录中仍保留含它的旧 Spec；manifest 仍写有 `sources.spec.path`；Fixture 根下另有一个 `_datasets/<name>/` 预览数据集目录
- **THEN** 初始状态 `check:fixtures` 通过；仅空白类变化后仍通过；正文变化后报过期并提示 `pnpm fixtures:refresh <owner>`；删除后报"在有效 Spec 中不存在"；带 `path` 的 manifest 按 schema 不合规报错；各失败情形均非零退出并指出 owner；`_datasets` 不被当作 owner，不报不存在也不要求来源摘要。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "owner-from-directory": "owner 由 Fixture 目录名确定，Scenario 取其所属 Requirement，FLOW 取其登记行所在 Requirement",
    "digest-normalized": "摘要按 LF、去行尾空白、去空行规范化后计算，只改空白类内容时摘要不变",
    "stale-with-refresh-hint": "Requirement 块内容变化后报过期并提示 pnpm fixtures:refresh <owner>",
    "missing-owner-rejected": "owner 不在有效 Spec 中时报不存在并阻断，归档中残留的同名 Scenario 不能放行",
    "path-field-rejected": "manifest 仍带 sources.spec.path 或缺 requirementDigest 时按 schema 不合规报错",
    "datasets-not-owners": "_datasets 下的预览数据集不按 owner 解析，不报不存在，也不要求来源摘要"
  },
  "cases": [
    {"key": "fixture-source-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["owner-from-directory", "digest-normalized", "stale-with-refresh-hint", "missing-owner-rejected", "path-field-rejected", "datasets-not-owners"]},
    {"key": "fixture-source-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["owner-from-directory", "digest-normalized", "stale-with-refresh-hint"]},
    {"key": "fixture-missing-owner-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["missing-owner-rejected", "path-field-rejected"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-013 fixtures:refresh 重算来源摘要
- **WHEN** 某个 Fixture 因 Requirement 块变化与 case 文件内容变化而被报过期，执行 `pnpm fixtures:refresh <owner>`；另以不存在的 owner 执行一次
- **THEN** 前者把 `requirementDigest` 与各 case 文件的 `sha256` 更新为当前值，随后 `check:fixtures` 通过，其他 Fixture 的 manifest 不被改动；后者报 owner 不存在、非零退出且不写入任何文件。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "refresh-recomputes": "refresh 重算 requirementDigest 与 case 文件 sha256 并写回 manifest，之后检查通过",
    "refresh-scoped": "只改动指定 owner 的 manifest，不影响其他 Fixture",
    "refresh-rejects-invalid": "owner 不存在或存在歧义时报错、非零退出且不写入"
  },
  "cases": [
    {"key": "fixture-refresh-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["refresh-recomputes", "refresh-scoped", "refresh-rejects-invalid"]},
    {"key": "fixture-refresh-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["refresh-recomputes", "refresh-scoped", "refresh-rejects-invalid"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-014 多个 active Change 修改同一 Requirement 时报歧义
- **WHEN** 两个 active Change 都以 MODIFIED 修改了某个 Fixture owner 所在的 Requirement，不带 `--change` 运行 `check:fixtures`；随后带 `--change` 指定其中一个 Change 运行
- **THEN** 不带作用域时报歧义并列出两个 Change，要求指定作用域，非零退出；指定作用域后按该 Change 的 Requirement 块计算摘要并给出确定结论。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "ambiguity-reported": "未指定作用域且多个 active Change 修改同一 Requirement 时报歧义、列出相关 Change 并阻断，不任选其一",
    "scope-resolves": "指定 --change 后按所选 Change 的 Requirement 块计算摘要并给出确定结论"
  },
  "cases": [
    {"key": "fixture-ambiguity-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["ambiguity-reported", "scope-resolves"]},
    {"key": "fixture-ambiguity-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["ambiguity-reported", "scope-resolves"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-015 归档 Change 不需要改动 Fixture
- **WHEN** 在受控临时副本中，一个 active Change 以 MODIFIED 修改一个已有 Requirement、以 ADDED 新增一个 Requirement，两者下各有 Fixture 且 `check:fixtures` 通过；随后执行真实的 `openspec archive` 归档该 Change
- **THEN** 不改动任何 Fixture，归档后 `check:fixtures` 仍通过；两个 Requirement 在归档前（delta 中）与归档后（主 Spec 中）的规范化摘要相同。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "modified-digest-stable": "MODIFIED Requirement 归档前后规范化摘要相同",
    "added-digest-stable": "ADDED Requirement 归档前后规范化摘要相同",
    "archive-no-fixture-edit": "归档后不改动任何 Fixture，check:fixtures 仍通过"
  },
  "cases": [
    {"key": "archive-digest-stability", "kind": "engineering", "requiredIn": ["integration"], "checks": ["modified-digest-stable", "added-digest-stable", "archive-no-fixture-edit"]}
  ],
  "blockedBy": []
}
```
