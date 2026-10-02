## MODIFIED Requirements

### Requirement: EX-05 示例分层与隔离

示例 SHALL 按"工厂 → 核心 → 内部端口 → 适配器"分层，在 SDK、协议 testing 与 E2E 中各自使用独立的目录和命名空间。示例就是产品包业务模块的标准结构：产品包 `src/` 下除 `runtime/` 外的每个一级目录都是一个业务模块。依赖方向与 lint 门禁 MUST 按目录模式覆盖**全部**业务模块，而不是只覆盖示例：任一业务模块的 `core/`、`ports/` 不得导入 generated 代码，不得使用 `wx` 等平台全局对象，也不得依赖 Node 内置模块；产品包内各业务模块目录不得互相导入。新增业务模块时无需修改任何门禁配置即受这些规则约束。可以共用的只有协议包的公开能力，以及 SDK 的运行辅助工具和平台网络装配。

#### Scenario: SCN-TEMPLATE-EXAMPLE-008 示例依赖越界被阻断
- **WHEN** 分别引入以下违规：示例核心导入 generated 或使用 `wx` 全局对象；在临时新增的另一个业务模块目录与示例之间互相导入；在该临时业务模块的 `core/` 中导入 generated、使用 `wx` 全局对象或导入 Node 内置模块（不修改任何门禁配置）
- **THEN** 架构或 lint 门禁逐项非零退出并指出违规位置；恢复后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "example-core-isolated": "示例核心导入 generated 或使用平台全局对象时被阻断",
    "no-cross-domain-import": "产品包内不同业务模块目录互相导入时被阻断",
    "new-domain-guarded": "不修改门禁配置，临时新增业务模块的 core 导入 generated、使用 wx 或导入 Node 内置模块时同样被阻断",
    "restored-passes": "恢复合法依赖后门禁通过"
  },
  "cases": [
    {"key": "dependency-violations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["example-core-isolated", "no-cross-domain-import", "new-domain-guarded", "restored-passes"]}
  ],
  "blockedBy": []
}
```
