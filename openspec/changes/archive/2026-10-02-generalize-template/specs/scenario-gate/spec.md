## MODIFIED Requirements

### Requirement: GATE-05 Scenario 验证元数据必填

有效 Spec 中每个 Scenario MUST 在其标题之下、下一个同级或更高级标题之前，包含恰好一个 `json verification` 代码块。代码块内容须通过 `scripts/verification.schema.json` 校验，格式为 formatVersion 2，包含 checkpoints、cases、blockedBy。每个 case 的 `checks` 只能引用本场景已声明的 checkpoint；`requiredIn` 只能引用项目清单 `project.manifest.json` 登记的测试项目；case 的 kind 与运行环境 SHALL 按清单中测试项目的类别匹配：behavior 只能在 integration 或 platform 类项目中运行，module 只能在 unit 类项目中运行，engineering 只能在 integration 类项目中运行。该代码块是本项目在 OpenSpec 之上的扩展，Change Skill 的模板不会生成它；根 AGENTS.md SHALL 把"每个 Scenario 必须带验证元数据"写成硬规则。

#### Scenario: SCN-SCENARIO-GATE-006 验证元数据缺失、重复或不合法
- **WHEN** 某个 Scenario 没有 `json verification` 块，或有多个，或 JSON 无法解析、不符合 schema、引用了未声明的 checkpoint、`requiredIn` 引用了清单未登记的测试项目、case 的 kind 与项目类别不匹配
- **THEN** 门禁逐项列出场景 ID 和原因并非零退出；该 Scenario 仍计入全部 Spec 的缺口，不从分母中排除；修正后门禁恢复通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "missing-block-rejected": "缺少 verification 块时被列出并阻断",
    "multiple-blocks-rejected": "存在多个 verification 块时被列出并阻断，不取其中任意一个",
    "schema-enforced": "JSON 无法解析、不符合 schema、引用未声明的 checkpoint、引用清单未登记的测试项目或 kind 与项目类别不匹配时被列出并阻断",
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
