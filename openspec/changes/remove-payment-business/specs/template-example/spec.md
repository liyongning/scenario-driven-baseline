## MODIFIED Requirements

### Requirement: EX-01 示例公共入口与装配

SDK 包根入口 SHALL 导出 `createExampleClient(options)`，返回提供 `create` 与 `observe` 的示例客户端。装配方式：`runtime` 选择宿主环境（首期 `wechat-miniapp`），`gatewayBaseUrl` 由宿主显式给出，`getAccessToken` 在每次请求前读取，`catalog` 提供创建资源所需的中立目录配置（类别、条目标识、条目名称、单位值），可选 `requestContext` 与时间策略覆盖。工厂 MUST 在任何外部动作之前校验配置，不合法时抛出配置错误。导入入口 SHALL NOT 依赖平台全局对象。示例的公共类型 SHALL 保留中文 JSDoc，并进入 ESM、CommonJS 双格式及类型声明产物。

示例的中文语义：示例演示"创建资源、再在有界窗口内观察其状态"的通用流程，不代表任何业务含义。协议层借用的交易接口只是传输样例，交易字段名与状态值不得出现在示例公共类型中。

#### Scenario: SCN-TEMPLATE-EXAMPLE-001 无平台环境导入与配置校验
- **WHEN** 在没有 `wx` 等平台全局对象的 Node 环境导入 SDK 根入口，并分别以合法配置和缺失或非法字段的配置调用 `createExampleClient`
- **THEN** 导入成功；合法配置返回客户端且不发出请求；非法配置在任何外部动作之前抛出配置错误；打包产物能以 ESM、CommonJS 两种方式导入，并提供示例类型声明。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "platform-free-import": "无平台全局对象时可以导入根入口",
    "config-validated-first": "非法配置在任何外部动作前抛出配置错误，合法配置不发请求",
    "package-consumable": "打包产物的 ESM、CJS 导入与示例类型声明可用"
  },
  "cases": [
    {"key": "factory-validation", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["config-validated-first"]},
    {"key": "node-import", "kind": "behavior", "requiredIn": ["integration"], "checks": ["platform-free-import", "config-validated-first"]},
    {"key": "package-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["package-consumable"]}
  ],
  "blockedBy": []
}
```

### Requirement: EX-05 示例分层与隔离

示例 SHALL 按"工厂 → 核心 → 内部端口 → 适配器"分层，在 SDK、协议 testing 与 E2E 中各自使用独立的目录和命名空间。依赖方向与 lint 门禁 MUST 覆盖示例：示例核心不得导入 generated 代码，也不得使用 `wx` 等平台全局对象；产品包内各业务模块目录（本模板目前只有 `src/example/`）不得互相导入。可以共用的只有协议包的公开能力，以及 SDK 的运行辅助工具和平台网络装配。

#### Scenario: SCN-TEMPLATE-EXAMPLE-008 示例依赖越界被阻断
- **WHEN** 分别引入以下违规：示例核心导入 generated 或使用 `wx` 全局对象；在临时新增的另一个业务模块目录与示例之间互相导入
- **THEN** 架构或 lint 门禁逐项非零退出并指出违规位置；恢复后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "example-core-isolated": "示例核心导入 generated 或使用平台全局对象时被阻断",
    "no-cross-domain-import": "产品包内不同业务模块目录互相导入时被阻断",
    "restored-passes": "恢复合法依赖后门禁通过"
  },
  "cases": [
    {"key": "dependency-violations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["example-core-isolated", "no-cross-domain-import", "restored-passes"]}
  ],
  "blockedBy": []
}
```

## REMOVED Requirements

### Requirement: EX-07 示例的 Live 页面
**Reason**: 用户决定 Live 模式整体移出模板。Shadow 与真实环境对 SDK 只是网关配置的差别；针对真实服务端与真实平台能力的验收，应由真实消费方（例如独立的轻量接入方项目）完成，放在 SDK 仓库内是不健康的耦合。
**Migration**: 无迁移；示例的行为证据全部来自 Shadow（EX-02、EX-03、EX-06、EX-08）。场景 SCN-TEMPLATE-EXAMPLE-010 随之删除，编号不再复用。
