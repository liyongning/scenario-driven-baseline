## ADDED Requirements

### Requirement: PC-03 Shadow 路由使用中立描述

Shadow 网关是外部交互替身的通用引擎，SHALL 只接收中立的路由描述：方法名、HTTP 方法与路径。Shadow 引擎（服务器、故障注入、请求比对）MUST NOT 导入 ProtoGen 生成的代码，该约束由依赖规则强制。协议来源以"路由来源"的形式接入：IDL 路由来源把 ProtoGen 生成的方法描述转换为中立路由，生成描述缺少所需方法、路径或 HTTP 方法时 SHALL 报错，不得静默跳过；示例通过 IDL 路由来源取得 `CreateTrade` 与 `QueryTrade` 的路由。IDL 协议义务派生直接读取生成的方法描述，不依赖 Shadow 路由类型。换用其他协议来源（例如 OpenAPI）时，只需新增一种路由来源，Shadow 引擎不变。

#### Scenario: SCN-PROTOCOL-CONTRACT-004 Shadow 引擎与协议来源解耦
- **WHEN** 用一条只有方法名、HTTP 方法与路径的中立路由启动 Shadow 并发起请求；用 IDL 路由来源转换示例的生成描述，并分别提供缺少方法与缺少路径的描述；在临时副本中让 Shadow 引擎文件导入 generated 代码并运行依赖检查
- **THEN** 中立路由按场景返回编排的响应并记录请求；IDL 路由来源产出与生成描述一致的方法名、HTTP 方法与路径，缺失时报错；Shadow 引擎导入 generated 代码被依赖检查拒绝。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "neutral-route-served": "只含方法名、HTTP 方法与路径的中立路由可被 Shadow 注册、按场景响应并记录请求",
    "idl-route-source": "IDL 路由来源从生成描述产出一致的中立路由，缺少方法、路径或 HTTP 方法时报错",
    "engine-no-generated": "Shadow 引擎导入 generated 代码时被依赖检查拒绝"
  },
  "cases": [
    {"key": "neutral-route", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["neutral-route-served"]},
    {"key": "idl-route-source", "kind": "module", "requiredIn": ["protocol-unit"], "checks": ["idl-route-source"]},
    {"key": "engine-no-generated-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["engine-no-generated"]}
  ],
  "blockedBy": []
}
```
