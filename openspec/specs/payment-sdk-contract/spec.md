# payment-sdk-contract Specification

## Purpose
TBD - created by archiving change headless-payment-sdk. Update Purpose after archive.
## Requirements
### Requirement: CONTRACT-01 公共入口与依赖隔离

SDK MUST 提供显式客户端的 pay、query、observe。公共初始化 SHALL 接收 PaymentClientOptions 定义的配置、数据 provider 和可选诊断回调，由 SDK 工厂装配内部依赖。pay/observe SHALL 接受每次调用可选的 RunOptions.onPhase，并通过 Promise 各返回一次最终 PaymentOutcome；阶段通知与最终结果分别交付，内部状态机仍由 SDK 管理。SDK 核心 MUST 不依赖 ESM、Taro、Vue、DOM、wx；SDK 平台模块负责运行环境能力。

#### Scenario: TC-PAYSDK-CONTRACT-001 独立调用方
- **WHEN** 非 ESM 调用方按配置创建首期客户端，测试为 SDK 自带平台模块提供平台替身
- **THEN** SDK 根据配置完成依赖装配和公共调用；核心另可通过内部假端口在无平台全局环境运行，两种证据分别记录，真实渠道另行联调。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "public-assembly": "非 ESM 调用方只用规定配置即可创建并调用首期客户端",
    "substitute-evidence-boundary": "平台替身证据与内部核心证据分别记录，且不等于真实渠道联调",
    "headless-core-evidence": "核心在无平台全局的内部假端口测试中可运行；该单测证据与公共客户端及真实渠道证据分别记录"
  },
  "cases": [
    {"key": "public-client", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["public-assembly", "substitute-evidence-boundary"]},
    {"key": "headless-core-with-fake-ports", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["headless-core-evidence"]}
  ],
  "blockedBy": []
}
```

### Requirement: CONTRACT-02 交易引用与准备参数

业务 MUST 在 pay 前取得服务端交易引用。SDK SHALL 接收 tradeNo、method 及逐次可选的 xpayEnv，通过初始化配置提供 appId；微信身份由服务端按鉴权用户与 app_id 查询。SDK MUST 不接收或透传 OpenID，不提供其获取或兼容接口；金额、SKU、席位、AppKey/session_key 不进入公共请求。SDK MUST 保留 trade_no 和 payment_no 的不同含义。

#### Scenario: TC-PAYSDK-CONTRACT-002 下单与支付准备分离
- **WHEN** 业务传入已有交易引用并支付
- **THEN** SDK 对该 tradeNo 调用 CreateTradePay，校验响应中的原交易号、payment_no、channel、pay_params、expire_time 和 base_resp；业务订单及交易已由业务后端创建，SDK 不调用 CreateTrade、不按展示价格推算金额、不在客户端签名。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "existing-trade-only": "输入已有 tradeNo，SDK 首个支付 RPC 为 CreateTradePay，绝不调用 CreateTrade",
    "prepare-response-validation": "校验原交易号、payment_no、channel、pay_params、expire_time、base_resp",
    "no-client-order-or-signing": "SDK 不创建业务订单、不按展示价推金额、不在客户端签名"
  },
  "cases": [
    {"key": "existing-trade-pay", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["existing-trade-only", "prepare-response-validation", "no-client-order-or-signing"]}
  ],
  "blockedBy": []
}
```

### Requirement: CONTRACT-06 支付事实与业务权益分离

SDK MUST 仅映射公开协议可见事实；内部 QueryPayment、退款或交付事件不能因出现在服务端设计中就成为 SDK 可查询字段。业务权益 SHALL 由业务接口确认。

#### Scenario: TC-PAYSDK-CONTRACT-008 没有权益字段
- **WHEN** QueryTrade 返回 PAID 但没有权益信息
- **THEN** SDK 只报告交易已支付，不能合成 fulfilled；ESM 自行确认席位。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "paid-without-entitlement": "QueryTrade=PAID 且无权益字段时只报告交易已支付",
    "fulfillment-owned-by-consumer": "SDK 不合成 fulfilled，ESM 自行确认权益"
  },
  "cases": [
    {"key": "paid-without-entitlement", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["paid-without-entitlement", "fulfillment-owned-by-consumer"]}
  ],
  "blockedBy": []
}
```

### Requirement: CONTRACT-07 显式能力与重复调用

宿主 SHALL 初始化启用已发布 method，每笔 pay 显式选择方式。SDK MUST 对不支持的方式返回 unsupported，对同客户端同交易活动 pay 返回 busy，不静默替换渠道，不把 attemptId 当服务端幂等键。

#### Scenario: TC-PAYSDK-CONTRACT-009 不支持的 H5 方式
- **WHEN** 运行时输入未发布或未启用的 H5 method
- **THEN** unsupported，不 prepare，不调用虚拟支付，不创建支付记录。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "unsupported-before-effects": "未发布/未启用 H5 method 返回 unsupported",
    "no-payment-side-effects": "不 prepare、不调用虚拟支付、不创建支付记录"
  },
  "cases": [
    {"key": "unsupported-h5-method", "kind": "behavior", "requiredIn": ["integration"], "checks": ["unsupported-before-effects", "no-payment-side-effects"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-010 同交易重复调起
- **WHEN** 同客户端已有同交易活动 pay，再次 pay
- **THEN** 新调用 busy，只有一次 prepare/invoke；宿主显式停止后释放本地活动记录，旧回调不能推进后续调用；本地 ended 不证明原生界面关闭。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "busy-on-active-trade": "同客户端同交易已有活动 pay 时新调用返回 busy",
    "single-prepare-invoke": "并发期间只有一次 prepare 和 invoke",
    "stop-releases-local-record": "显式停止释放本地活动记录；ended 不证明原生界面关闭",
    "old-callback-isolated": "旧回调不能推进停止后的新调用"
  },
  "cases": [
    {"key": "duplicate-active-pay", "kind": "behavior", "requiredIn": ["integration"], "checks": ["busy-on-active-trade", "single-prepare-invoke"]},
    {"key": "repay-after-stop", "kind": "behavior", "requiredIn": ["integration"], "checks": ["stop-releases-local-record", "old-callback-isolated"]}
  ],
  "blockedBy": []
}
```

### Requirement: CONTRACT-13 状态语义与中文代码注释

SDK SHALL 以本文“状态字段的中文语义与触发场景”为状态说明权威，维护字段所属层次、中文含义、触发阶段、来源及不能推断的结论。手写公共类型/字段/联合值及对应映射、阶段迁移、取消/迟到分支 MUST 保留中文 JSDoc 或必要中文实现注释；声明构建 SHALL 保留公共 JSDoc，不能只保留英文标识。注释与 Spec 同步评审，不新增可供业务依赖的中文文案映射 API，不修改 ProtoGen 生成代码的注释。

#### Scenario: TC-PAYSDK-CONTRACT-021 状态说明随源码与声明交付
- **WHEN** 实施者新增/修改状态相关类型、结果映射或阶段迁移，并构建 SDK 双格式声明及实际 tarball
- **THEN** 评审按本文中文语义表逐项核对源码 JSDoc、关键分支说明和两类声明入口中的公共注释，能定位触发场景与判断边界；confirmed 不被注释成支付成功、stopped 不被注释成渠道取消、confirming 不被注释成已支付。缺漏/矛盾须修正后才满足任务验收；类型编译或覆盖率通过不能替代语义核对。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "source-comment-structure": "使用现有 TypeScript 解析能力检查手写源码的公共状态类型/字段/联合值具备中文 JSDoc及关键分支说明",
    "dual-declaration-structure": "实际 tarball 的 ESM/CJS 类型入口均保留相应公共注释",
    "semantic-review-record": "维护者按中文语义表核对 confirmed/stopped/confirming 等边界；机器只校验评审记录的结构、源码位置和 freshness"
  },
  "cases": [
    {"key": "source-and-dual-declarations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-comment-structure", "dual-declaration-structure"]},
    {"key": "missing-comment-rejected", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-comment-structure", "dual-declaration-structure"]},
    {"key": "semantic-review-evidence", "kind": "engineering", "requiredIn": ["integration"], "checks": ["semantic-review-record"]}
  ],
  "blockedBy": []
}
```
