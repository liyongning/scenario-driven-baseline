## ADDED Requirements

### Requirement: GATE-01 OpenSpec 驱动前置检查

场景门禁 MUST 在构建清单和对账之前，确认本仓库由 OpenSpec 驱动：仓库根存在 `openspec/specs` 目录，且 `openspec` CLI 可以调用。任一条件不满足时，门禁 SHALL 输出缺失项并非零退出，不得继续产生覆盖结论。模板不规定工作流 schema、CLI 的安装方式或版本；根 AGENTS.md SHALL 把这一前置条件写成硬规则。

#### Scenario: SCN-SCENARIO-GATE-001 缺少 OpenSpec 时前置检查失败
- **WHEN** 仓库缺少 `openspec/specs` 目录，或 `openspec` CLI 无法调用
- **THEN** 门禁在读取任何测试报告之前非零退出，并指出缺少哪一项；恢复后前置检查通过，门禁继续对账。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "precheck-before-coverage": "前置检查先于清单构建和报告读取，失败时不输出覆盖结论",
    "missing-specs-dir": "缺少 openspec/specs 目录时非零退出并指明该项",
    "missing-cli": "openspec CLI 无法调用时非零退出并指明该项",
    "restored-passes": "恢复后前置检查通过，继续后续对账"
  },
  "cases": [
    {"key": "precheck-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["precheck-before-coverage", "missing-specs-dir", "missing-cli", "restored-passes"]},
    {"key": "missing-specs-dir-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["precheck-before-coverage", "missing-specs-dir", "restored-passes"]},
    {"key": "missing-openspec-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["precheck-before-coverage", "missing-cli", "restored-passes"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-02 场景 ID 唯一前置检查

有效 Spec 中每个 `#### Scenario:` 标题 MUST 以场景 ID 开头，该 ID 须符合项目配置 `scenario-gate.config.json` 中登记的某一格式（配置本身按 `scenario-gate.config.schema.json` 校验，不合规时门禁直接失败），并在整个 OpenSpec 根内唯一。FLOW ID 适用同样规则。缺少 ID、格式不符合任何已配置格式或 ID 重复时，门禁 SHALL 列出所在文件和标题并非零退出。门禁不得因 ID 不匹配而跳过某个 Scenario，使其从统计中消失。根 AGENTS.md SHALL 把这一规则写成硬规则。

#### Scenario: SCN-SCENARIO-GATE-002 场景 ID 缺失、格式不符或重复
- **WHEN** 有效 Spec 中出现不带 ID 的 Scenario 标题，或 ID 不符合任何已配置格式，或同一个 Scenario/FLOW ID 出现在两处（包括已沉淀 Spec 与 active change 之间不属于 MODIFIED 的重复）
- **THEN** 门禁逐项列出文件与标题并非零退出；这些 Scenario 仍计入缺口，不从统计分母中排除。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "missing-id-rejected": "不带 ID 的 Scenario 标题被列出并阻断",
    "pattern-mismatch-rejected": "ID 不符合任何已配置格式时被列出并阻断，不被跳过",
    "duplicate-rejected": "Scenario 或 FLOW ID 在不同位置重复时被列出并阻断",
    "stays-in-denominator": "问题 Scenario 仍计入缺口，不从统计中消失"
  },
  "cases": [
    {"key": "id-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["missing-id-rejected", "pattern-mismatch-rejected", "duplicate-rejected", "stays-in-denominator"]},
    {"key": "missing-id-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["missing-id-rejected", "stays-in-denominator"]},
    {"key": "pattern-mismatch-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["pattern-mismatch-rejected", "stays-in-denominator"]},
    {"key": "duplicate-across-sources-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["duplicate-rejected"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-03 场景来源发现与生命周期合并

场景与 FLOW 清单 MUST 由有效 Spec 全集构建：以 `openspec/specs/**/spec.md` 为基础，再按 active change（`openspec/changes/*`，不含 `archive`）中 spec delta 的 ADDED、MODIFIED、REMOVED、RENAMED 合并。归档目录不作为来源；门禁代码 SHALL NOT 写死具体的 change 名、capability 名或 Spec 路径。FLOW 登记 SHALL 与 Scenario 一样放在有效 Spec 中，并且 MUST 写在某个 Requirement 的正文里：OpenSpec 归档时以 Requirement 为单位合并，Requirement 之外的章节会被丢弃，写在外面的 FLOW 表归档后就会从主 Spec 中消失。表头第一列为 `FLOW ID` 的表格若位于 Requirement 之外，门禁 SHALL 报错。FLOW 表的每一行由门禁解析为对象，并按 `scripts/flow.schema.json` 校验，列数、必填列或取值不合规时 SHALL 报错。"关联 Scenario"一列目前是说明性内容，门禁不校验其是否为已登记的完整 ID；这是已知缺口，在删除支付业务后收紧。FLOW 的登记方式是本项目在 OpenSpec 之上的扩展，Change Skill 不会提醒；根 AGENTS.md SHALL 把它写成硬规则。测试绑定引用了清单中不存在的 Scenario 或 FLOW 时，门禁 SHALL 失败。

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
- **WHEN** 某个有效 Spec 中，表头第一列为 `FLOW ID` 的表格位于 Requirement 之外，例如写在独立的 `## 必需集成流程` 章节中；或 FLOW 表中某一行列数不对、必填列为空、环境取值不合法
- **THEN** 门禁指出文件和表格位置（或具体的行与原因）并非零退出，位置问题会提示归档将丢失该表；把表挪进某个 Requirement 正文后，门禁通过，表中的 FLOW 正常进入清单。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "outside-table-rejected": "Requirement 之外的 FLOW 表被指出并阻断，并说明归档会丢失",
    "inside-table-accepted": "写在 Requirement 正文中的 FLOW 表正常进入清单",
    "flow-row-schema": "FLOW 行按 scripts/flow.schema.json 校验，列数、必填列或取值不合规时被列出并阻断"
  },
  "cases": [
    {"key": "flow-placement-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["outside-table-rejected", "inside-table-accepted", "flow-row-schema"]},
    {"key": "invalid-flow-row-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["flow-row-schema"]},
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

### Requirement: GATE-04 可配置的 ID 格式与迁移不变性

Scenario 与 FLOW 的 ID 格式 MUST 来自一份项目级配置，允许同时登记多个格式。Spec 清单、Fixture 检查和场景报告器 SHALL 使用同一份配置。门禁通用化 SHALL NOT 改变支付场景已登记的清单、case 义务和对账结论：用改造前后的门禁处理同一份运行报告，支付 TC 与 FLOW 的集合及 summaries 必须一致。

#### Scenario: SCN-SCENARIO-GATE-005 多格式并存且支付对账结果不变
- **WHEN** 配置同时登记支付格式（`TC-PAYSDK-*`、`FLOW-PAYSDK-*`）和通用格式（`SCN-<CAPABILITY>-<NNN>`、`FLOW-<CAPABILITY>-<NNN>`），并用同一份运行报告执行门禁
- **THEN** 两类场景都进入清单；支付的 Scenario/FLOW 集合、case 义务和 summaries 与改造前基线一致；从配置中移除某个格式后，使用该格式的 Scenario 按 GATE-02 报错，不会被跳过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "single-config": "清单、Fixture 检查和报告器读取同一份 ID 格式配置",
    "multi-pattern": "多个格式并存时各自进入清单",
    "payment-baseline-unchanged": "对同一份报告，支付 TC/FLOW 集合、义务和 summaries 与改造前基线一致",
    "removed-pattern-reported": "移除某个格式后，使用该格式的 Scenario 按 GATE-02 报错"
  },
  "cases": [
    {"key": "pattern-config", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["single-config", "multi-pattern", "removed-pattern-reported"]},
    {"key": "payment-baseline-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["single-config", "multi-pattern", "payment-baseline-unchanged"]},
    {"key": "removed-pattern-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["removed-pattern-reported"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-05 Scenario 验证元数据必填

有效 Spec 中每个 Scenario MUST 在其标题之下、下一个同级或更高级标题之前，包含恰好一个 `json verification` 代码块。代码块内容须通过 `scripts/verification.schema.json` 校验，格式为 formatVersion 2，包含 checkpoints、cases、blockedBy。每个 case 的 `checks` 只能引用本场景已声明的 checkpoint；case 的 kind 与运行环境 SHALL 匹配：behavior 只能在 integration 或 weapp 中运行，module 只能在就近单测项目中运行，engineering 按 schema 允许的项目运行。该代码块是本项目在 OpenSpec 之上的扩展，Change Skill 的模板不会生成它；根 AGENTS.md SHALL 把"每个 Scenario 必须带验证元数据"写成硬规则。

#### Scenario: SCN-SCENARIO-GATE-006 验证元数据缺失、重复或不合法
- **WHEN** 某个 Scenario 没有 `json verification` 块，或有多个，或 JSON 无法解析、不符合 schema、引用了未声明的 checkpoint、case 的 kind 与运行环境不匹配
- **THEN** 门禁逐项列出场景 ID 和原因并非零退出；该 Scenario 仍计入全部 Spec 的缺口，不从分母中排除；修正后门禁恢复通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "missing-block-rejected": "缺少 verification 块时被列出并阻断",
    "multiple-blocks-rejected": "存在多个 verification 块时被列出并阻断，不取其中任意一个",
    "schema-enforced": "JSON 无法解析、不符合 schema、引用未声明的 checkpoint 或 kind 与环境不匹配时被列出并阻断",
    "stays-in-denominator": "问题 Scenario 仍计入缺口，修正后门禁恢复通过"
  },
  "cases": [
    {"key": "metadata-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["missing-block-rejected", "multiple-blocks-rejected", "schema-enforced", "stays-in-denominator"]},
    {"key": "missing-metadata-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["missing-block-rejected", "stays-in-denominator"]},
    {"key": "multiple-metadata-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["multiple-blocks-rejected"]},
    {"key": "invalid-metadata-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["schema-enforced", "stays-in-denominator"]}
  ],
  "blockedBy": []
}
```

### Requirement: GATE-06 格式 schema 是唯一权威并自带字段说明

第 2、3、4 条硬规则各自对应一份格式 schema：场景 ID 配置 `scenario-gate.config.schema.json`、验证元数据 `scripts/verification.schema.json`、FLOW 行 `scripts/flow.schema.json`。这三份 schema MUST 是对应格式的唯一权威定义，门禁校验与文档说明都以它们为准，不在 Spec 或 Design 中另写一份字段定义。schema 中每个属性（包括嵌套属性）SHALL 带非空的中文 `description`，说明字段含义与约束。根 AGENTS.md 的硬规则 SHALL 引用这三份 schema 的路径，并各给一个最小示例。

#### Scenario: SCN-SCENARIO-GATE-008 schema 缺少字段说明或 AGENTS 未引用
- **WHEN** 三份格式 schema 中有属性缺少 `description` 或说明为空；或根 AGENTS.md 的硬规则没有引用某份 schema 的路径
- **THEN** 工程检查逐项列出缺失的属性路径或缺失的引用并非零退出；补齐后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "schema-descriptions": "三份 schema 的每个属性（含嵌套）都有非空 description，缺失时列出属性路径并阻断",
    "agents-references-schemas": "根 AGENTS.md 硬规则引用三份 schema 路径，缺失时阻断",
    "restored-passes": "补齐后检查通过"
  },
  "cases": [
    {"key": "schema-description-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["schema-descriptions", "agents-references-schemas"]},
    {"key": "schema-documentation-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["schema-descriptions", "agents-references-schemas", "restored-passes"]}
  ],
  "blockedBy": []
}
```
