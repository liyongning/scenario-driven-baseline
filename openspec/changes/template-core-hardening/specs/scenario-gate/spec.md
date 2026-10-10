## ADDED Requirements

### Requirement: GATE-10 Fixture 来源绑定以 owner ID 与 Requirement 块摘要为准

Fixture `manifest.json` 的 Spec 来源 MUST 只记录 `sources.spec.requirementDigest`（所属 Requirement 块规范化文本的 sha256），SHALL NOT 记录 Spec 文件路径；`fixture.schema.json` SHALL 删除 `path` 字段，仍带 `path` 或缺少 `requirementDigest` 的 manifest 按 schema 不合规报错。`sources` 中的其他来源条目（例如协议来源）不受本条影响。

Fixture 的 owner MUST 由其目录名（Scenario 或 FLOW ID）确定。`check:fixtures` SHALL 使用与场景门禁相同的来源合并逻辑（遵守 GATE-12 的 `--change` 作用域），按 owner ID 找到当前生效的 Requirement 块：Scenario 取其标题所在的 Requirement，FLOW 取其登记行所在的 Requirement。Requirement 块的范围从 `### Requirement:` 标题起，到下一个 Requirement 标题、更高级标题或文件结束为止；计算摘要前 SHALL 先规范化：换行统一为 LF、去掉行尾空白、去掉空行。只改动换行风格、行尾空白或空行时，摘要 MUST 不变。

检查结果 SHALL 按以下规则判定，并逐项列出 owner 与原因、非零退出：

- owner 在有效 Spec 中不存在：报"在有效 Spec 中不存在"，即使归档目录或其他文件中仍有同名 Scenario 也不放行；
- 摘要与当前生效 Requirement 块不一致：报过期，并提示 `pnpm fixtures:refresh <owner>`；
- 未指定 `--change` 时，有多个 active Change 修改了 owner 所在的同一 Requirement：报歧义，列出相关 Change，要求用 `--change` 指定作用域，不得任选其一。

`pnpm fixtures:refresh <owner...>` MUST 为每个指定 owner 重算 `requirementDigest` 与各 case 文件的 `sha256` 并写回 manifest；owner 不存在或存在歧义时按上述规则报错且不写入。以 Requirement 为单位意味着同一 Requirement 下任何改动都会让其下全部 Fixture 过期，这是有意接受的粒度。

由于 OpenSpec 归档后主 Spec 中合并后的 Requirement 块与 Change 中的 delta 块规范化后相同，归档 Change MUST NOT 要求改动任何 Fixture：归档前后同一 Fixture 的检查结论一致。

#### Scenario: SCN-SCENARIO-GATE-012 按 owner ID 解析当前生效 Requirement 并校验摘要
- **WHEN** 受控临时根中有一个以 Scenario ID 命名和一个以 FLOW ID 命名的 Fixture，其 `requirementDigest` 与当前生效 Requirement 块一致；随后分别做以下变化：仅在该 Requirement 中改换行风格、加行尾空白或空行；修改该 Requirement 的正文、某个 Scenario 或 FLOW 行；删除该 Scenario 而归档目录中仍保留含它的旧 Spec；manifest 仍写有 `sources.spec.path`
- **THEN** 初始状态 `check:fixtures` 通过；仅空白类变化后仍通过；正文变化后报过期并提示 `pnpm fixtures:refresh <owner>`；删除后报"在有效 Spec 中不存在"；带 `path` 的 manifest 按 schema 不合规报错；各失败情形均非零退出并指出 owner。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "owner-from-directory": "owner 由 Fixture 目录名确定，Scenario 取其所属 Requirement，FLOW 取其登记行所在 Requirement",
    "digest-normalized": "摘要按 LF、去行尾空白、去空行规范化后计算，只改空白类内容时摘要不变",
    "stale-with-refresh-hint": "Requirement 块内容变化后报过期并提示 pnpm fixtures:refresh <owner>",
    "missing-owner-rejected": "owner 不在有效 Spec 中时报不存在并阻断，归档中残留的同名 Scenario 不能放行",
    "path-field-rejected": "manifest 仍带 sources.spec.path 或缺 requirementDigest 时按 schema 不合规报错"
  },
  "cases": [
    {"key": "fixture-source-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["owner-from-directory", "digest-normalized", "stale-with-refresh-hint", "missing-owner-rejected", "path-field-rejected"]},
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

### Requirement: GATE-11 checkpoint 双向对账

场景门禁 MUST 双向核对 checkpoint：除 GATE-08 规定的"已登记的 checkpoint 必须被执行"外，还 SHALL 做反向检查，确认实际执行的 checkpoint 都已登记。

反向检查的对账单位 MUST 是**绑定**（一个 `defineCase` 调用或一处 module 类手写注解 `annotate`），而不是单个 cover：报告 `scenario-evidence` 注解中记录的执行集合是整个绑定的扁平集合，一个绑定可以同时 cover 多个 Scenario、FLOW 与协议义务（例如协议矩阵用例同时 cover SCN-PROTOCOL-CONTRACT-002 与上百条协议义务）。

- 绑定的登记集合 SHALL 为该绑定全部 cover 的 checks 并集：Scenario 与 FLOW 的 cover 以有效 Spec 中 verification 块（FLOW 为其登记行）声明、并列入所 cover case `checks` 的 checkpoint 为准；协议义务的 cover 以派生出的义务清单为准，义务 checkpoint 的形式为 `<义务 ID>/<case>`。
- 执行集合中出现、但不在该绑定登记集合中的 checkpoint，门禁 SHALL 按"未登记的 checkpoint"逐项列出绑定所在的测试文件与绑定、checkpoint 名并非零退出，即使各 cover 的全部必需 checkpoint 都已通过。
- 执行集合中的 checkpoint 只要属于该绑定任一 cover 的登记集合即 MUST NOT 被报为未登记；同一绑定 cover 多个 Scenario、FLOW 或大量协议义务时不得误报。
- 绑定中某个 cover 自己声明的 checks 引用了不属于该 Scenario 的 checkpoint，沿用现有正向检查报错，不在本规则内重复报告。

`defineCase` 写入的证据与 module 类测试手写注解（`annotate`）的证据适用同一规则。

#### Scenario: SCN-SCENARIO-GATE-016 执行了未登记的 checkpoint
- **WHEN** 在受控临时根中分别构造：某个绑定 cover 的 Scenario 必需 checkpoint 全部执行并通过，但执行集合中还有一个任何 cover 都未登记的 checkpoint；一个绑定同时 cover 两个 Scenario 与一个 FLOW，执行集合恰为三者 checks 的并集；一个模拟协议矩阵的绑定同时 cover 一个 Scenario 与多条派生协议义务，执行集合含形如 `<义务 ID>/<case>` 的 checkpoint，另含一个不在义务清单中的 `<义务 ID>/<case>`；以上分别以 `defineCase` 证据与 module 类手写注解证据构造
- **THEN** 未登记的 checkpoint（含不在义务清单中的义务 checkpoint）被报为"未登记的 checkpoint"，列出测试文件、绑定与 checkpoint 名并非零退出；多 cover 绑定与协议矩阵绑定中属于并集的 checkpoint 不被误报；在 verification 块中登记该 checkpoint（或删除多余的执行）后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "undeclared-checkpoint-rejected": "执行集合中不属于该绑定任何 cover 登记集合的 checkpoint 被报为未登记并阻断，输出包含测试文件、绑定与 checkpoint 名",
    "binding-union-ledger": "登记集合按绑定计算，为全部 cover 的 checks 并集：Scenario 与 FLOW 取有效 Spec 中的声明，协议义务取派生义务清单，义务 checkpoint 形如 <义务 ID>/<case>",
    "multi-cover-no-false-positive": "同时 cover 多个 Scenario 与 FLOW 的绑定、以及同时 cover Scenario 与大量协议义务的协议矩阵绑定，执行并集内的 checkpoint 时不被误报",
    "unknown-obligation-checkpoint-rejected": "不在派生义务清单中的 <义务 ID>/<case> checkpoint 被报为未登记",
    "full-pass-not-exempt": "各 cover 的必需 checkpoint 全部通过也不能抵消未登记的 checkpoint",
    "module-annotation-covered": "module 类手写注解证据适用同一反向检查",
    "registered-passes": "登记后或删除多余执行后门禁通过"
  },
  "cases": [
    {"key": "reverse-checkpoint-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["undeclared-checkpoint-rejected", "binding-union-ledger", "multi-cover-no-false-positive", "unknown-obligation-checkpoint-rejected", "full-pass-not-exempt", "module-annotation-covered", "registered-passes"]},
    {"key": "undeclared-checkpoint-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["undeclared-checkpoint-rejected", "full-pass-not-exempt", "registered-passes"]},
    {"key": "multi-cover-binding-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["binding-union-ledger", "multi-cover-no-false-positive", "unknown-obligation-checkpoint-rejected"]},
    {"key": "module-annotation-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["module-annotation-covered", "undeclared-checkpoint-rejected"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-12 场景门禁的 Change 作用域

`check:scenarios` 与 `check:fixtures` MUST 支持 `--change <name>` 参数：可重复出现，也可在一个值中以逗号分隔多个 Change。指定后，覆盖清单与 Fixture 来源只合并主 Spec 与所列 Change 的 delta，其他 active Change 不参与。不带 `--change` 时语义保持不变：合并主 Spec 与全部 active Change；两条命令的帮助文本 SHALL 写明这一默认语义。

作用域也 MAY 由环境变量 `SCENARIO_GATE_CHANGES`（与 `--change` 相同的逗号分隔格式）传入：两条命令在命令行没有任何 `--change` 时 SHALL 读取该变量作为作用域；命令行给出 `--change` 时以命令行为准，忽略该变量；变量未设置时按不带参数处理。`pnpm verify` 借此把同一作用域传给 `check:fast` 内的 `check:fixtures` 与最终的 `check:scenarios`（见 GATE-14）。

`--change` 后没有值或值为空、或所列 Change 不存在于 active 目录（包括只存在于 `archive/` 中）时，命令 SHALL 指出该参数并非零退出，不得退化为不带作用域运行；`SCENARIO_GATE_CHANGES` 已设置但为空值或含不存在的 Change 时按同一规则报错，并指出来源是该环境变量。

格式前置检查（GATE-01、GATE-02、GATE-05、GATE-06）MUST 始终覆盖全部 active Change，不受 `--change` 作用域影响：作用域外 Change 中的格式问题仍使命令失败。

#### Scenario: SCN-SCENARIO-GATE-017 --change 限定合并范围
- **WHEN** 受控临时根有两个 active Change A、B，各自新增一个 Scenario；分别以不带参数、`--change A`、`--change A --change B`、`--change A,B` 运行 `check:scenarios` 与 `check:fixtures`；再在命令行不带 `--change` 时设置 `SCENARIO_GATE_CHANGES=A` 运行两条命令，以及同时设置 `SCENARIO_GATE_CHANGES=A` 与命令行 `--change B` 运行；并查看两条命令的帮助文本
- **THEN** 不带参数且未设置环境变量时清单包含主 Spec 与 A、B 的场景；`--change A` 时只包含主 Spec 与 A 的场景，B 的缺口不出现在结论中；两种多值写法结果相同且包含 A、B；只设置 `SCENARIO_GATE_CHANGES=A` 时两条命令的结论与 `--change A` 相同；命令行 `--change B` 与环境变量同时存在时按 B 计算；帮助文本写明"不带参数 = 主 Spec + 全部 active Change"以及环境变量的读取规则。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "default-all-active": "不带参数且未设置 SCENARIO_GATE_CHANGES 时合并主 Spec 与全部 active Change",
    "scoped-merge": "指定 --change 时只合并主 Spec 与所列 Change，其他 Change 不进入清单与 Fixture 来源",
    "multi-value-forms": "重复参数与逗号分隔两种多值写法等价",
    "env-scope-fallback": "命令行没有 --change 时两条命令都读取 SCENARIO_GATE_CHANGES 作为作用域，命令行给出 --change 时以命令行为准",
    "help-states-default": "两条命令的帮助文本写明不带参数的默认语义与环境变量的读取规则"
  },
  "cases": [
    {"key": "change-scope-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["default-all-active", "scoped-merge", "multi-value-forms", "env-scope-fallback"]},
    {"key": "change-scope-scenarios-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["default-all-active", "scoped-merge", "multi-value-forms", "env-scope-fallback", "help-states-default"]},
    {"key": "change-scope-fixtures-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["scoped-merge", "env-scope-fallback", "help-states-default"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-018 --change 参数非法
- **WHEN** 以 `--change` 不带值、带空值、或指定一个不存在于 active 目录（含只存在于 `archive/`）的 Change 名运行 `check:scenarios` 或 `check:fixtures`；另在命令行不带 `--change` 时把 `SCENARIO_GATE_CHANGES` 设为空值或不存在的 Change 名运行
- **THEN** 命令指出非法参数或不存在的 Change 并非零退出，不输出覆盖结论，也不退化为全部 active Change 运行；来自环境变量的非法值同样报错，并指出来源是 `SCENARIO_GATE_CHANGES`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "empty-value-rejected": "--change 无值或空值、或 SCENARIO_GATE_CHANGES 已设置但为空值时报错并非零退出",
    "unknown-change-rejected": "经 --change 或 SCENARIO_GATE_CHANGES 指定不在 active 目录的 Change（含仅存在于 archive 的）时报错并非零退出，并指出值的来源",
    "no-fallback": "参数非法时不输出覆盖结论，不退化为不带作用域运行"
  },
  "cases": [
    {"key": "change-arg-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["empty-value-rejected", "unknown-change-rejected", "no-fallback"]},
    {"key": "change-arg-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["empty-value-rejected", "unknown-change-rejected", "no-fallback"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-019 格式前置检查不受作用域影响
- **WHEN** active Change B 中有一个缺少 verification 块或 ID 格式不符的 Scenario，以 `--change A` 运行 `check:scenarios`
- **THEN** 门禁仍报告 B 中的格式问题并非零退出；修正 B 后，`--change A` 的运行只按主 Spec 与 A 给出覆盖结论。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "format-checks-unscoped": "GATE-01/02/05/06 的格式前置检查覆盖全部 active Change，作用域外的格式问题仍阻断",
    "coverage-scoped-after-fix": "格式问题修正后覆盖结论只按主 Spec 与所列 Change 计算"
  },
  "cases": [
    {"key": "unscoped-format-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["format-checks-unscoped", "coverage-scoped-after-fix"]},
    {"key": "unscoped-format-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["format-checks-unscoped", "coverage-scoped-after-fix"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-13 按需测试入口与 partial 报告拒收

模板 MUST 提供 `pnpm test:affected`，供 Apply 期间按需运行受影响的用例。参数：`--base <ref>`（默认 `HEAD`，比较工作区与该引用的差异）、`--scenario <ID...>`（直接指定场景）、`--dry-run`（只打印计划不运行）。选择规则按以下顺序生效：

1. 全量触发：改动命中清单文件、`fingerprints.buildInputs`、`fingerprints.protocolInputs`、Vitest/ESLint/depcruise 配置、根 `package.json`、平台适配目录（`*/adapters/network/`）、`packages/e2e/host/` 或 `packages/e2e/src/drivers/` 时，SHALL 直接退化为全量 `check:fast` 并打印触发原因；
2. Spec 改动：比较改动前后的有效清单，Requirement 块摘要（与 GATE-10 相同的规范化算法）变化的 Requirement，其下全部 Scenario 与 FLOW 计入；
3. Fixture 改动：Fixture 目录名即 owner ID，直接计入；
4. 代码改动：
   - integration 与 platform 类用例经产品包、协议包的 package exports 导入构建产物（`dist`），Vite 模块图在 `dist` 处断开，因此 MUST NOT 用 `vitest related` 推导这些用例。SHALL 改用 dependency-cruiser 的 `--reaches`：分析时使用一份只供分析的 tsconfig 路径映射，把清单中各包的包名映射到其 `src` 入口，求出"能到达改动文件"的测试文件，再静态提取这些文件中 `defineCase` 绑定的全部 Scenario/FLOW ID 计入。该路径映射只用于依赖分析，MUST NOT 改变构建与测试实际的模块解析；
   - 改动落在产品包或协议包的 `src` 时，计划 SHALL 在运行任何用例前先执行 `pnpm build`，保证用例测的是新产物；
   - unit 类项目直接导入源码，SHALL 对改动文件执行 `vitest related <改动文件>`，并关闭覆盖率阈值；
5. 扩展到所有环境：对计入的 ID，选出绑定这些 ID 的全部测试文件，覆盖其登记的全部环境（包括 platform 类项目）；
6. 门禁自身代码：改动 `scripts/` 时，运行 test-tools-unit 中的相关单测，以及 tooling 用例中引用这些模块的用例。

每次运行 SHALL 打印选中的 ID、各自的选中原因与将运行的测试文件。按需运行的 run id MUST 取 `affected-<YYYYMMDDTHHmmssZ>`（UTC 时间戳）；报告写入 `artifacts/<run-id>/reports/` 并 MUST 带 `partial: true` 标记。场景门禁遇到任何带 `partial: true` 的报告 SHALL 拒收：指出报告文件并非零退出，不输出覆盖结论，因此按需结果不能作为验收证据；全量运行产生的报告不带该标记。

#### Scenario: SCN-SCENARIO-GATE-020 全量触发条件退化为全量运行
- **WHEN** 在受控临时根中，改动分别命中清单文件、一个 `buildInputs` 条目、一个 `protocolInputs` 条目、Vitest 配置、根 `package.json`、某包的 `adapters/network/` 目录、`packages/e2e/host/` 或 `packages/e2e/src/drivers/`，以 `--dry-run` 运行 `test:affected`
- **THEN** 每种情形的计划都是全量 `check:fast`，并打印命中的文件与触发原因。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "full-run-triggers": "命中清单、buildInputs、protocolInputs、工具配置、根 package.json、平台适配、host 或 drivers 目录时计划为全量 check:fast",
    "trigger-reason-printed": "打印命中的文件与全量触发原因"
  },
  "cases": [
    {"key": "full-trigger-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["full-run-triggers", "trigger-reason-printed"]},
    {"key": "full-trigger-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["full-run-triggers", "trigger-reason-printed"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-021 按 Spec、Fixture、代码与指定 ID 选择受影响场景
- **WHEN** 在受控临时根中分别：修改某 Requirement 的正文；只调整另一 Requirement 的空白；修改某个 Fixture 目录下的文件；修改产品包 `src` 中一个只被某个 integration 用例经包名（package exports 指向 `dist`）间接导入的源文件；修改一个被 unit 测试直接导入的源文件；修改 `scripts/` 下的一个模块；以 `--scenario <ID>` 直接指定；并以 `--dry-run` 运行 `test:affected`
- **THEN** 正文变化的 Requirement 下全部 Scenario 与 FLOW 被选中，只改空白的 Requirement 不被选中；Fixture 目录名对应的 owner 被选中；产品包源文件改动经分析专用路径映射与 dependency-cruiser `--reaches` 找到经包名导入它的 integration 用例，该用例绑定的 ID 被选中，且计划在运行用例前先执行 `pnpm build`；unit 源文件改动以 `vitest related <改动文件>` 选择 unit 测试并关闭覆盖率阈值；对每个选中 ID，绑定它的全部测试文件（含平台用例）进入计划；`scripts/` 改动只选中相关 test-tools-unit 单测与引用该模块的 tooling 用例；计划逐项打印 ID、选中原因与测试文件。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "spec-digest-selection": "Requirement 块规范化摘要变化时其下全部 Scenario 与 FLOW 被选中，只改空白不选中",
    "fixture-owner-selection": "Fixture 改动按目录名选中 owner",
    "code-import-selection": "integration 与平台用例的代码改动经 dependency-cruiser --reaches 与只供分析的包名到 src 入口路径映射求出能到达改动文件的测试文件，即使用例经 package exports 导入 dist 也能选中，并静态提取其 defineCase 绑定的 ID；不使用 vitest related 推导这些用例",
    "build-before-run": "改动落在产品包或协议包 src 时，计划在运行用例前先执行 pnpm build；改动不在这些目录时不加入构建步骤",
    "unit-related-selection": "unit 类项目以 vitest related <改动文件> 选择测试，并关闭覆盖率阈值",
    "all-environments-expanded": "选中 ID 的全部绑定测试文件覆盖其全部登记环境，包括平台用例",
    "tooling-selection": "scripts 改动选中相关 test-tools-unit 单测与引用该模块的 tooling 用例",
    "explicit-scenario": "--scenario 直接指定的 ID 进入计划",
    "plan-printed": "打印选中 ID、原因与测试文件"
  },
  "cases": [
    {"key": "affected-selection-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["spec-digest-selection", "fixture-owner-selection", "code-import-selection", "build-before-run", "unit-related-selection", "all-environments-expanded", "tooling-selection", "explicit-scenario", "plan-printed"]},
    {"key": "affected-spec-fixture-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["spec-digest-selection", "fixture-owner-selection", "explicit-scenario", "plan-printed"]},
    {"key": "affected-code-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["code-import-selection", "build-before-run", "unit-related-selection", "all-environments-expanded", "tooling-selection", "plan-printed"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-022 partial 报告被场景门禁拒收
- **WHEN** `test:affected` 运行后，检查其 run id 与 `artifacts/<run-id>/reports/` 中的报告，以该 run id 运行 `check:scenarios`；即使其中只有一份报告带标记、其余为全量报告
- **THEN** run id 形如 `affected-<YYYYMMDDTHHmmssZ>`，报告带 `partial: true`；门禁指出带 partial 标记的报告文件并非零退出，不输出覆盖结论；同一 run id 下全量重跑生成不带标记的报告后，门禁按常规对账。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "partial-marked": "按需运行的 run id 形如 affected-<YYYYMMDDTHHmmssZ>，写出的报告带 partial: true；全量运行的报告不带该标记",
    "partial-rejected": "任一报告带 partial 标记时门禁指出该文件、非零退出且不输出覆盖结论",
    "full-rerun-accepted": "全量重跑后门禁按常规对账"
  },
  "cases": [
    {"key": "partial-report-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["partial-marked", "partial-rejected", "full-rerun-accepted"]},
    {"key": "partial-report-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["partial-marked", "partial-rejected", "full-rerun-accepted"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-14 统一验收入口与过期说明

模板 MUST 提供 `pnpm verify [--run-id <id>] [--from <step>] [--change <name>...]` 作为唯一验收入口。不传 `--run-id` 时 SHALL 生成 `<分支名>-<YYYYMMDDTHHmmssZ>` 形式的 run id：分支名中的 `/` 替换为 `-`，detached HEAD 时分支名部分为 `detached`。`verify` 依次执行三个步骤，全部通过同一个 `VERIFY_RUN_ID` 共用该 run id：

1. `check:fast`；
2. 清单中每个 platform 类测试项目对应的 `test:e2e:<name>`（由清单派生，不写死项目名）。项目在清单中登记 `testProjects[].perFile: true` 时，SHALL 按文件逐个运行该项目：每个文件运行前执行该项目登记的 `testProjects[].prepare` 命令；每个文件写一份报告到 `artifacts/<run-id>/reports/<项目名>/<文件名>.json`；某个文件失败时，先执行 `prepare` 再整文件重跑一次，仍失败才停止。未登记 `perFile` 的项目整体运行，写一份 `<项目名>.json`；
3. `check:scenarios`。

`--change` MUST 通过环境变量 `SCENARIO_GATE_CHANGES`（逗号分隔）传给全部步骤，使 `check:fast` 内的 `check:fixtures` 与第 3 步的 `check:scenarios` 使用同一作用域（两条命令的读取规则见 GATE-12）；未传 `--change` 时 `verify` SHALL NOT 设置该变量。

场景门禁的默认报告集合 SHALL 为：`unit.json`、每个非 perFile 测试项目的 `<name>.json`，以及每个 perFile 项目目录 `reports/<name>/` 下的全部报告文件。

任一步失败即停止后续步骤、非零退出，并打印可直接执行的续跑提示 `--from <step> --run-id <id>`。`--from` 的取值是步骤对应的命令名：`check:fast`、`test:e2e:<平台项目名>`、`check:scenarios`。以 `--from` 续跑时 SHALL 跳过此前的步骤、沿用给定 run id，并重新生成该步骤及之后各步骤的报告；perFile 项目续跑时，已有通过报告的文件 SHALL 跳过，只运行失败文件及其后的文件。运行结束时 SHALL 打印各步耗时与结论。根 `check` 脚本 SHALL 调用 `verify`。

场景门禁判定报告过期时，MUST 输出以下三类信息，而不是只给出"过期"结论：

- run id 不一致时，期望值与实际值；
- 哪一类摘要不同：source、spec、protocol、fixture；
- 本次与报告之间变化了哪些文件：依据报告记录的摘要文件明细计算，最多列出 20 个，超出时给出总数。

#### Scenario: SCN-SCENARIO-GATE-023 verify 以同一 run id 依序执行全部验收步骤
- **WHEN** 在受控临时根中（清单登记两个 platform 类项目，其中一个登记 `perFile: true` 与 `prepare` 命令且含 2 个测试文件，各步骤命令与 `prepare` 以可观测的替身实现）不带 `--run-id` 运行 `pnpm verify --change A`；另以 `--run-id x` 且不带 `--change` 运行一次；随后不带报告参数运行 `check:scenarios`；并检查根 `check` 脚本
- **THEN** 生成的 run id 形如 `<分支名>-<YYYYMMDDTHHmmssZ>`，分支名中的 `/` 被替换为 `-`；三个步骤按顺序执行，每个步骤收到同一个 `VERIFY_RUN_ID`；第 2 步按清单为每个 platform 类项目执行 `test:e2e:<name>`，perFile 项目逐文件运行、每个文件前执行一次 `prepare`、每个文件写一份 `reports/<项目名>/<文件名>.json`；带 `--change A` 时全部步骤都收到 `SCENARIO_GATE_CHANGES=A`，`check:fast` 内的 `check:fixtures` 与 `check:scenarios` 按 A 限定作用域，不带 `--change` 时不设置该变量；默认报告集合包含 `unit.json`、非 perFile 项目的 `<name>.json` 与 perFile 项目目录下的全部文件；结束时打印各步耗时与结论；指定 `--run-id x` 时各步使用 `x`；根 `check` 脚本调用 `verify`。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "default-run-id": "不传 --run-id 时生成 <分支名>-<YYYYMMDDTHHmmssZ>，分支名中的 / 替换为 -，detached HEAD 时为 detached",
    "shared-run-id": "三个步骤共用同一个 VERIFY_RUN_ID，指定 --run-id 时使用该值",
    "ordered-steps": "按 check:fast、platform 项目 test:e2e:<name>、check:scenarios 顺序执行",
    "platform-from-manifest": "第 2 步的平台项目由清单 platform 类项目派生，不写死",
    "per-file-run": "登记 perFile 的项目逐文件运行，每个文件前执行登记的 prepare 命令，每个文件写一份 reports/<项目名>/<文件名>.json",
    "change-env-propagated": "--change 经 SCENARIO_GATE_CHANGES 传给全部步骤，check:fast 内的 check:fixtures 与 check:scenarios 使用同一作用域；未传 --change 时不设置该变量",
    "default-report-set": "场景门禁默认报告集合为 unit.json、各非 perFile 项目的 <name>.json 与各 perFile 项目目录下的全部文件",
    "summary-printed": "结束时打印各步耗时与结论",
    "check-calls-verify": "根 check 脚本调用 verify"
  },
  "cases": [
    {"key": "verify-plan-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["default-run-id", "shared-run-id", "ordered-steps", "platform-from-manifest", "per-file-run", "change-env-propagated", "default-report-set", "summary-printed"]},
    {"key": "verify-run-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["default-run-id", "shared-run-id", "ordered-steps", "platform-from-manifest", "per-file-run", "change-env-propagated", "default-report-set", "summary-printed", "check-calls-verify"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-024 步骤失败后停止并可续跑
- **WHEN** 在受控临时根中运行 `pnpm verify --run-id x`，分别构造：第 2 步非 perFile 平台项目失败；perFile 项目的第 2 个文件首次失败、执行 `prepare` 后整文件重跑成功；perFile 项目的第 2 个文件首次与重跑都失败。失败后按打印的提示以 `--from <命令名> --run-id x` 续跑且该步成功
- **THEN** 首次失败、重跑成功的文件不使命令失败，`prepare` 在重跑前再次执行；重跑仍失败或非 perFile 项目失败时，第 3 步不执行，命令非零退出并打印可直接执行的 `--from test:e2e:<项目名> --run-id x` 续跑提示；续跑时跳过第 1 步，从该步起执行，perFile 项目跳过已有通过报告的文件、只运行失败文件及其后的文件，报告写入同一 run id，门禁按常规对账。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "stop-on-failure": "任一步失败即停止后续步骤并非零退出",
    "per-file-retry": "perFile 项目中某个文件失败时先执行 prepare 再整文件重跑一次，重跑通过则继续，仍失败才停止",
    "resume-hint": "失败时打印包含步骤命令名与 run id 的 --from 续跑提示",
    "resume-from-step": "--from 以命令名续跑，跳过此前步骤、沿用给定 run id 并重新生成该步及之后的报告",
    "per-file-resume": "perFile 项目续跑时跳过已有通过报告的文件，只运行失败文件及其后的文件"
  },
  "cases": [
    {"key": "verify-resume-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["stop-on-failure", "per-file-retry", "resume-hint", "resume-from-step", "per-file-resume"]},
    {"key": "verify-resume-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["stop-on-failure", "per-file-retry", "resume-hint", "resume-from-step", "per-file-resume"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-025 过期报告给出原因
- **WHEN** 场景门禁读取的报告分别出现：run id 与期望值不同；source、spec、protocol、fixture 中某一类摘要与当前不同；报告生成后有 3 个文件变化；报告生成后有 25 个文件变化
- **THEN** 门禁判定过期并非零退出，输出中依次包含期望与实际 run id、不同的摘要类别、变化文件列表；3 个文件时全部列出，25 个文件时只列 20 个并给出总数 25。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "run-id-mismatch-detail": "run id 不一致时输出期望值与实际值",
    "digest-category-detail": "指出 source、spec、protocol、fixture 中哪一类摘要不同",
    "changed-files-detail": "依据报告记录的文件明细列出变化文件，最多 20 个，超出时给出总数"
  },
  "cases": [
    {"key": "stale-explanation-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["run-id-mismatch-detail", "digest-category-detail", "changed-files-detail"]},
    {"key": "stale-explanation-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["run-id-mismatch-detail", "digest-category-detail", "changed-files-detail"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-15 门禁自测隔离

门禁相关测试分为两类，适用不同规则：

- **门禁逻辑自测**：验证门禁本身对给定输入的判定是否正确（例如 GATE 系列反例、`check-scenarios.test.ts` 中对清单的判定）。这类测试 MUST NOT 对仓库实时状态运行门禁，SHALL 在受控临时根上运行并断言具体结果，SHALL NOT 使用 `expect.any(...)` 一类恒真断言代替对结果的断言。
- **模板自身事实核验**：验证模板当前代码与 Spec 是否满足某项要求（例如 SCN-TEMPLATE-EXAMPLE-012 的声明核对、SCN-PROTOCOL-CONTRACT-001 的 `inventory-cli`、SCN-TEMPLATE-ENGINEERING-005 的写死扫描、SCN-TEMPLATE-ENGINEERING-003 的注释检查）。这类测试 MAY 只读真实仓库，但结论 MUST NOT 受与该事实无关的 active Change 影响：涉及 Spec 来源时 SHALL 以 `--change` 限定作用域，或只读主 Spec 与该事实所属的 Change。

受控临时根 SHALL 由统一 helper 构造：在临时目录执行 `git init`，写入最小 OpenSpec 结构、清单与所需 Fixture，并做一次初始提交（源码清单要求 git 工作区）。`openspec` CLI 默认使用替身；需要真实 CLI 的用例（例如 SCN-SCENARIO-GATE-015 的真实归档）SHALL 使用仓库 `node_modules` 中以精确版本固定的 `@fission-ai/openspec`（在仓库副本中运行时为副本内按锁文件安装的同一版本），MUST NOT 依赖全局安装。

门禁对 FLOW 等分支的覆盖 MUST 由测试输入自行提供（例如测试输入自带 FLOW），不依赖仓库中存在示例 Scenario、FLOW 或 Fixture。仓库中没有任何 FLOW、或按删除白名单移除模板示例后，门禁逻辑自测与覆盖率阈值 SHALL 仍然通过；在仓库中新增或删除 Spec、Change 或 Fixture SHALL NOT 改变门禁逻辑自测的结论。

#### Scenario: SCN-SCENARIO-GATE-026 门禁自测不依赖仓库实时状态
- **WHEN** 在模板的隔离副本（构造方式按 template-engineering ENG-06 的仓库副本规定：按 git 跟踪与未忽略文件复制、`git init` 并提交、在副本中 `pnpm install --offline --frozen-lockfile` 安装依赖而不链接原仓库 `node_modules`、设置 `TEMPLATE_COPY=1`）中分别：删除全部 FLOW 登记与 FLOW Fixture；新增一个与任何事实核验无关、含缺陷 Scenario 的 active Change；然后运行 test-tools-unit 项目（含覆盖率阈值）、tooling 用例中的门禁逻辑自测，以及模板自身事实核验用例（SCN-TEMPLATE-EXAMPLE-012、SCN-PROTOCOL-CONTRACT-001 的 `inventory-cli`、SCN-TEMPLATE-ENGINEERING-005 的写死扫描、SCN-TEMPLATE-ENGINEERING-003 的注释检查）；另检查门禁逻辑自测的源码与临时根 helper
- **THEN** 门禁逻辑自测结论与改动前一致，覆盖率阈值仍然满足，FLOW 分支由测试输入覆盖；事实核验用例的结论不受新增的无关缺陷 Change 影响；门禁逻辑自测不对仓库根运行门禁，也不以 `expect.any(...)` 作为门禁结果断言；临时根 helper 构造的目录是已提交的 git 工作区，需要真实 OpenSpec CLI 时解析到仓库 `node_modules` 中的固定版本。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "controlled-temp-root": "门禁逻辑自测在统一 helper 构造的受控临时根（已 git init 并提交、含最小 OpenSpec 结构、清单与 Fixture）上运行，不读取仓库实时 Spec、Change、Fixture 或报告",
    "concrete-assertions": "门禁逻辑自测对门禁结果断言具体内容，不使用 expect.any 一类恒真断言",
    "flow-branch-self-provided": "FLOW 分支覆盖由测试输入提供，仓库无 FLOW 时覆盖率阈值仍满足",
    "repo-state-independent": "删除 FLOW 或新增缺陷 Change 后门禁逻辑自测结论不变",
    "fact-checks-scoped": "模板自身事实核验只读真实仓库，涉及 Spec 来源时以 --change 限定或只读主 Spec 与所属 Change，结论不受无关 active Change 影响",
    "pinned-openspec-cli": "需要真实 OpenSpec CLI 的用例使用仓库 node_modules 中精确版本的 @fission-ai/openspec，其余使用替身，不依赖全局安装"
  },
  "cases": [
    {"key": "self-test-isolation-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["controlled-temp-root", "flow-branch-self-provided", "pinned-openspec-cli"]},
    {"key": "self-test-isolation-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["controlled-temp-root", "concrete-assertions", "flow-branch-self-provided", "repo-state-independent", "fact-checks-scoped"]}
  ],
  "blockedBy": []
}
```

## MODIFIED Requirements

### Requirement: GATE-03 场景来源发现与生命周期合并

场景与 FLOW 清单 MUST 由有效 Spec 全集构建：以 `openspec/specs/**/spec.md` 为基础，再按 active change（`openspec/changes/*`，不含 `archive`）中 spec delta 的 ADDED、MODIFIED、REMOVED、RENAMED 合并。归档目录不作为来源；门禁代码 SHALL NOT 写死具体的 change 名、capability 名或 Spec 路径。FLOW 登记 SHALL 与 Scenario 一样放在有效 Spec 中，并且 MUST 写在某个 Requirement 的正文里：OpenSpec 归档时以 Requirement 为单位合并，Requirement 之外的章节会被丢弃，写在外面的 FLOW 表归档后就会从主 Spec 中消失。表头第一列为 `FLOW ID` 的表格若位于 Requirement 之外，门禁 SHALL 报错。FLOW 表的每一行由门禁解析为对象，并按 `scripts/flow.schema.json` 校验，列数、必填列或取值不合规时 SHALL 报错。"关联 Scenario"一列 MUST 以 `、` 分隔列出完整的 Scenario ID，每个 ID 都必须在有效 Spec 中已登记；出现简写、未登记或格式不符的 ID 时，门禁 SHALL 报错。FLOW 的登记方式是本项目在 OpenSpec 之上的扩展，Change Skill 不会提醒；根 AGENTS.md SHALL 把它写成硬规则。测试绑定引用了清单中不存在的 Scenario 或 FLOW 时，门禁 SHALL 失败。不带作用域参数时，参与合并的 active change 为 `openspec/changes/*` 下的全部 active change（主 Spec 加全部 active Change），这一默认语义保持不变；指定 `--change` 时，只合并主 Spec 与所列 Change 的 delta，作用域规则见 GATE-12。

#### Scenario: SCN-SCENARIO-GATE-003 active change 的增、改、删生效
- **WHEN** active change 新增一个带场景的 Requirement，修改一个已有 Requirement（替换其下的场景），并删除一个已有 Requirement；archive 下另有同名 Spec
- **THEN** 清单包含新增场景；被修改的 Requirement 以修改后的场景替换原场景；被删除的 Requirement 其场景移出清单；archive 下的内容不影响清单。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "main-specs-baseline": "清单以 openspec/specs 已沉淀内容为基础",
    "delta-merge": "ADDED、MODIFIED、REMOVED、RENAMED 按 OpenSpec 语义合并",
    "archive-ignored": "archive 目录不作为来源",
    "no-hardcoded-path": "来源通过目录发现，不写死 change、capability 或 Spec 路径"
  },
  "cases": [
    {"key": "lifecycle-merge", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["main-specs-baseline", "delta-merge", "archive-ignored", "no-hardcoded-path"]},
    {"key": "active-change-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["main-specs-baseline", "delta-merge", "archive-ignored"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-007 FLOW 表写在 Requirement 之外
- **WHEN** 某个有效 Spec 中，表头第一列为 `FLOW ID` 的表格位于 Requirement 之外，例如写在独立的 `## 必需集成流程` 章节中；或 FLOW 表中某一行列数不对、必填列为空、环境取值不合法，或"关联 Scenario"列含有简写、未登记的 ID
- **THEN** 门禁指出文件和表格位置（或具体的行与原因）并非零退出，位置问题会提示归档将丢失该表；把表挪进某个 Requirement 正文后，门禁通过，表中的 FLOW 正常进入清单。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "outside-table-rejected": "Requirement 之外的 FLOW 表被指出并阻断，并说明归档会丢失",
    "inside-table-accepted": "写在 Requirement 正文中的 FLOW 表正常进入清单",
    "flow-row-schema": "FLOW 行按 scripts/flow.schema.json 校验，列数、必填列或取值不合规时被列出并阻断",
    "related-scenarios-registered": "关联 Scenario 列中的每个 ID 都是已登记的完整 Scenario ID，简写或未登记时被列出并阻断"
  },
  "cases": [
    {"key": "flow-placement-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["outside-table-rejected", "inside-table-accepted", "flow-row-schema", "related-scenarios-registered"]},
    {"key": "invalid-flow-row-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["flow-row-schema"]},
    {"key": "unregistered-related-scenario-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["related-scenarios-registered"]},
    {"key": "outside-flow-table-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["outside-table-rejected", "inside-table-accepted"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-SCENARIO-GATE-004 FLOW 登记丢失能被发现
- **WHEN** 已有测试绑定引用某个 Scenario 或 FLOW，但有效 Spec 中已不再登记它，例如归档同步时丢失了 FLOW 表
- **THEN** 门禁报告未知引用并非零退出，不会因为清单变少就显示覆盖率上升或保持不变。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "unknown-flow-reference": "绑定引用未登记的 FLOW 时报告并阻断",
    "unknown-scenario-reference": "绑定引用未登记的 Scenario 时报告并阻断"
  },
  "cases": [
    {"key": "unknown-reference-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["unknown-flow-reference", "unknown-scenario-reference"]},
    {"key": "lost-flow-table-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["unknown-flow-reference"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-07 覆盖清单由事实源生成且缺绑定被阻断

场景门禁的覆盖分母 MUST 从有效 Spec 与协议义务（由产品包声明的消费接口派生，见 `protocol-contract`）这两类事实源生成，不得从已有测试反推。任何必需 case 缺少对应环境的绑定，或测试只标注了 ID 却没有绑定具体检查点时，门禁 SHALL 列出缺项并非零退出，不能以现有测试全部通过或缩小统计范围来宣称覆盖完整。

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
