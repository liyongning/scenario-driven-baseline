# protocol-contract Specification

## Purpose
协议契约能力描述如何从 IDL 派生协议义务、生成 codec 并校验手写错误码事实，使协议实现与来源保持一致。
## Requirements
### Requirement: PC-01 基于 IDL 的协议义务派生

工程 MUST 从 ProtoGen 生成的协议描述，为产品包实际消费的接口自动派生协议义务清单。本模板消费的接口是示例使用的 `CreateTrade` 与 `QueryTrade`。义务包括：HTTP 路由；请求与响应每个可达字段的映射与编码边界；公共请求上下文（Header 与 BaseReq）；响应处理；通信错误处理；超时。每条义务的必需 case 与运行环境由派生规则给出，覆盖分母以派生结果为准（见 `scenario-gate` 的 GATE-07），不从已有测试反推。无法判定映射方式的字段 SHALL 标为待定并报告，不得静默忽略。派生不得包含产品包未消费的接口。

#### Scenario: SCN-PROTOCOL-CONTRACT-001 义务清单只针对示例消费的接口
- **WHEN** 基于当前 generated 描述运行派生，再构造一个存在未判定字段的输入作为反例
- **THEN** 清单只包含 `CreateTrade` 与 `QueryTrade` 的义务，每条义务都有 case 与运行环境；反例中的未判定字段被报告为待定，不被忽略。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "consumed-methods-only": "义务只针对产品包实际消费的 CreateTrade 与 QueryTrade，不包含其他接口",
    "complete-obligations": "路由、字段映射与编码、公共请求上下文、响应、错误、超时各类义务都有 case 与运行环境",
    "pending-reported": "无法判定映射的字段被报告为待定，不被静默忽略"
  },
  "cases": [
    {"key": "derivation-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["consumed-methods-only", "complete-obligations", "pending-reported"]},
    {"key": "inventory-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["consumed-methods-only", "complete-obligations"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-PROTOCOL-CONTRACT-002 示例接口的协议义务都有运行证据
- **WHEN** 通过公共协议客户端与 Shadow 网关，逐项执行派生出的协议义务
- **THEN** 每条义务在 integration 与 weapp（真实 `wx.request`）中都有通过的证据；场景门禁中与协议义务相关的问题数为 0。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "obligations-covered": "每条派生义务在要求的环境中都有真实执行且通过的证据",
    "real-client-path": "证据来自公共协议客户端与平台网络适配，而不是绕过执行器的替身"
  },
  "cases": [
    {"key": "protocol-matrix", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["obligations-covered", "real-client-path"]}
  ],
  "blockedBy": []
}
```

### Requirement: PC-02 手写错误码事实与来源校验

ProtoGen 不生成的服务端错误码事实，MUST 在协议包的手写目录中以 bigint 维护，包括名称、数值、描述与来源版本。目录只收录产品包需要识别的错误码：本模板为示例在查询重试与鉴权判定中用到的错误码，具体清单由 Design 固定。目录 SHALL 用一份独立的 IDL Go 来源样例校验名称、数值与描述一致；出现数值、描述、缺项或来源版本不一致时，校验失败。generated 来源只做兼容刷新、错误事实未变时，允许只更新来源元数据；生成投影与错误事实不一致时，校验 SHALL 失败。

#### Scenario: SCN-PROTOCOL-CONTRACT-003 错误码副本与 IDL 来源一致
- **WHEN** 用当前目录与 Go 来源样例执行一致性校验；另分别构造错误数值、错误描述、缺少错误、来源不一致、只刷新元数据、投影不一致等输入
- **THEN** 正常情况下目录与来源完全一致；数值、描述、缺项、来源漂移与投影不一致都被拒绝；只刷新元数据的兼容情况被接受。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "catalog-parity": "目录中每一项的名称、数值、描述与 Go 来源样例一致",
    "source-alignment": "目录记录的来源版本与样例一致",
    "compatible-refresh": "错误事实不变时只刷新来源元数据被接受",
    "projection-drift": "生成投影与错误事实不一致时被拒绝",
    "drift-rejected": "数值、描述、缺项或来源不一致时被拒绝"
  },
  "cases": [
    {"key": "all-errors", "kind": "engineering", "requiredIn": ["integration"], "checks": ["catalog-parity", "source-alignment"]},
    {"key": "wrong-code", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "wrong-description", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "missing-error", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "source-mismatch", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "metadata-only-sync", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-alignment", "compatible-refresh"]},
    {"key": "projection-mismatch", "kind": "engineering", "requiredIn": ["integration"], "checks": ["projection-drift"]}
  ],
  "blockedBy": []
}
```

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

