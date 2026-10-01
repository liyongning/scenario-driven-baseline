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

### Requirement: CONTRACT-03 三类结果分开表达

SDK MUST 分别返回交易快照、渠道信号、本地结束原因。PAID/CLOSED SHALL 只来自服务端交易查询；未知状态 MUST 映射为 UNKNOWN，不能默认为失败。

#### Scenario: TC-PAYSDK-CONTRACT-003 渠道成功但交易仍支付中
- **WHEN** 渠道 success_hint，查询返回 PAYING
- **THEN** 快照仍为 PAYING；SDK 不报告 PAID 或权益到账。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "server-state-authoritative": "渠道 success_hint 后 QueryTrade=PAYING 时快照保持 PAYING",
    "no-paid-or-entitlement-inference": "SDK 不由渠道提示报告 PAID 或权益到账"
  },
  "cases": [
    {"key": "success-hint-paying", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["server-state-authoritative", "no-paid-or-entitlement-inference"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-004 交易过期但未关单
- **WHEN** expire_time 已过而服务端仍返回 PAYING
- **THEN** 保留 PAYING 和到期时间，按结果确认预算继续查询；不因 expire_time 到期结束观察或合成 CLOSED，后续查询到 PAID 时正常确认支付。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "expiry-not-terminal": "expire_time 已过且服务端仍 PAYING 时不结束或合成 CLOSED",
    "continue-with-budget": "在确认预算内继续查询并保留到期时间",
    "later-paid-accepted": "后续 PAID 可正常确认"
  },
  "cases": [
    {"key": "expired-but-paying", "kind": "behavior", "requiredIn": ["integration"], "checks": ["expiry-not-terminal", "continue-with-budget", "later-paid-accepted"]}
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

### Requirement: CONTRACT-08 SDK-owned 请求及动态凭据

SDK MUST 使用自带平台网络实现。宿主 SHALL 提供契约定义的数据；Header、BaseReq、URL、协议编码和错误解析由 SDK 决定。SDK MUST 每次请求通过 provider 读取当前 Token，公共配置范围以 PaymentClientOptions 为准。

#### Scenario: TC-PAYSDK-CONTRACT-011 SDK 自带网络发送支付请求
- **WHEN** 调用方只提供规定配置与 getAccessToken，SDK 平台替身记录发送
- **THEN** SDK 按协议构造支付请求并调用自带网络适配器，发送记录与规定请求一致，运行依赖由 SDK 提供；网络工厂来自协议包正式根导出，业务不注入 HttpPort。协议层 weapp 验证须使用同一生产工厂和通信客户端，经真实 wx.request 到 Shadow，不能用测试宿主自写请求端口替代。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "sdk-owned-network": "调用方只给规定配置/getAccessToken，业务不注入 HttpPort，SDK 装配自带网络适配器",
    "protocol-root-source": "网络工厂由协议包正式根导出，SDK 不深层导入或自行实现",
    "lazy-platform-access": "导入根入口及创建网络端口不读取 wx",
    "sdk-export-boundary": "SDK 根不转导出 createWechatMiniappHttp，业务只消费 SDK 公共支付入口",
    "request-contract": "发送记录符合协议请求、Header/BaseReq 规定",
    "real-weapp-path": "已构建协议根的 createProtocolClient/createWechatMiniappHttp 经真实 wx.request 到 Shadow"
  },
  "cases": [
    {"key": "sdk-network-request", "kind": "behavior", "requiredIn": ["integration"], "checks": ["sdk-owned-network", "request-contract"]},
    {"key": "protocol-root-load-create", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-root-source", "lazy-platform-access"]},
    {"key": "weapp-real-wx-request", "kind": "behavior", "requiredIn": ["weapp"], "checks": ["request-contract", "real-weapp-path"]},
    {"key": "sdk-network-dependency-boundary", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-root-source", "sdk-export-boundary"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-012 Token 在两次查询间更新
- **WHEN** 同客户端连续 query，两次 provider 返回不同有效 Token
- **THEN** 各次请求使用当次 Token；SDK 不缓存旧值，不把 Token 写入 body 或诊断。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "fresh-token-each-request": "同客户端两次查询分别读取当次 provider Token",
    "no-token-cache-or-body": "第二次不复用旧 Token，Token 不进入 body 或诊断"
  },
  "cases": [
    {"key": "token-rotates-between-queries", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["fresh-token-each-request", "no-token-cache-or-body"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-016 数据 provider 失败或不返回
- **WHEN** Token provider 抛错或在单次操作预算内未返回
- **THEN** 分别归为 HOST_CONTEXT_ERROR 或 timed_out，不调用平台网络，不伪造服务端 Unauthorized，迟到 provider 结果无效。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "provider-throw": "provider 抛错归为 HOST_CONTEXT_ERROR，网络计数为零",
    "provider-timeout": "provider 在操作预算内不返回时为 timed_out，网络计数为零",
    "no-fake-unauthorized": "两类宿主问题均不伪造成服务端 Unauthorized",
    "late-provider-isolated": "迟到 provider 结果无效"
  },
  "cases": [
    {"key": "provider-throws", "kind": "behavior", "requiredIn": ["integration"], "checks": ["provider-throw", "no-fake-unauthorized"]},
    {"key": "provider-hangs", "kind": "behavior", "requiredIn": ["integration"], "checks": ["provider-timeout", "no-fake-unauthorized", "late-provider-isolated"]}
  ],
  "blockedBy": []
}
```

### Requirement: CONTRACT-10 HTTP 与泳道行为受显式契约控制

网络适配 SHALL 保留 HTTP status 和响应内容供基建适配器归一，不自动重放请求或强制 baseline。SDK MUST 不读取业务全局泳道配置、不自动跨测试/生产环境。Cookie 及其他鉴权方式只有服务端和运行平台契约支持后才能作为能力声明。

#### Scenario: TC-PAYSDK-CONTRACT-015 显式泳道与环境
- **WHEN** 宿主指定测试支付网关及开发 lane
- **THEN** SDK 使用指定环境并按本文请求字段表携带上下文，不改为生产或 baseline；测试不据此断言真实路由或异步权益消费成功。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "explicit-gateway-and-lane": "宿主指定测试网关和开发 lane 后 SDK 按字段表使用该值",
    "no-environment-rewrite": "SDK 不改写为 production 或 baseline",
    "evidence-boundary": "测试结果不宣称真实路由或异步权益成功"
  },
  "cases": [
    {"key": "test-gateway-development-lane", "kind": "behavior", "requiredIn": ["integration"], "checks": ["explicit-gateway-and-lane", "no-environment-rewrite", "evidence-boundary"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-017 HTTP 失败与重放控制
- **WHEN** 平台 success 回调包含非 2xx 响应、HTTP 200 + BaseResp 业务错误、缺失/冲突的响应信封，或网络请求失败
- **THEN** SDK 按本文响应判定顺序归一：合法信封以 status_code 为业务权威；success/error 冲突只记录脱敏诊断，不覆盖状态码；缺少有效 status_code 的 2xx 响应为 PROTOCOL_ERROR。非 2xx 不进入支付成功分支，平台传输失败为 NETWORK_ERROR；不当渠道取消，不刷新 Token 后重发 prepare。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "status-code-authority": "合法信封的 BaseResp.status_code 是业务权威，非零码按 IDL 目录归一",
    "inconsistent-details-diagnostic": "success 缺失/矛盾，或 error/status_msg 与状态码返回条件矛盾时，只记录脱敏诊断，不覆盖有效 status_code；不按文案内容识别业务错误",
    "invalid-2xx-envelope": "2xx 根非对象、baseResp 缺失/null、statusCode 缺失/null/非法/不可无损解码或内容不可解码时为 PROTOCOL_ERROR",
    "non-2xx-order": "HTTP 401 优先 AUTH_REQUIRED；其他非 2xx 有有效非零业务码时按该码归一，否则 SERVER_ERROR，绝不进入成功分支",
    "transport-failure": "无 HTTP 响应的平台传输失败为 NETWORK_ERROR",
    "no-replay-or-channel-cancel": "上述错误不当作渠道取消，也不刷新 Token 后重发 prepare"
  },
  "cases": [
    {"key": "http-200-business-error", "kind": "behavior", "requiredIn": ["integration"], "checks": ["status-code-authority", "no-replay-or-channel-cancel"]},
    {"key": "success-error-conflict-with-nonzero-status", "kind": "behavior", "requiredIn": ["integration"], "checks": ["status-code-authority", "inconsistent-details-diagnostic"]},
    {"key": "success-error-conflict-with-zero-status", "kind": "behavior", "requiredIn": ["integration"], "checks": ["status-code-authority", "inconsistent-details-diagnostic"]},
    {"key": "missing-base-resp", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "null-base-resp", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "non-object-root", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "undecodable-content", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "missing-status-code", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "null-status-code", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "invalid-status-code", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "lossy-status-code", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-2xx-envelope"]},
    {"key": "http-401", "kind": "behavior", "requiredIn": ["integration"], "checks": ["non-2xx-order", "no-replay-or-channel-cancel"]},
    {"key": "non-2xx-with-business-code", "kind": "behavior", "requiredIn": ["integration"], "checks": ["status-code-authority", "non-2xx-order", "no-replay-or-channel-cancel"]},
    {"key": "non-2xx-without-business-code", "kind": "behavior", "requiredIn": ["integration"], "checks": ["non-2xx-order", "no-replay-or-channel-cancel"]},
    {"key": "network-failure", "kind": "behavior", "requiredIn": ["integration"], "checks": ["transport-failure", "no-replay-or-channel-cancel"]}
  ],
  "blockedBy": []
}
```

### Requirement: CONTRACT-11 时间策略默认值与覆盖

SDK SHALL 在初始化提供可选 policy，按字段覆盖内置 requestTimeoutMs=60000、observation.intervalMs=3000、observation.maxWaitMs=60000。单次 pay/observe 的 policy SHALL 覆盖初始化结果且不修改其他运行。maxWaitMs 只约束结果确认阶段，原生收银台等待没有 SDK 本地上限。

#### Scenario: TC-PAYSDK-CONTRACT-019 默认时间与覆盖隔离
- **WHEN** 调用方不传 policy，或初始化只覆盖 intervalMs 后单次调用只覆盖 maxWaitMs
- **THEN** 分别使用默认值或逐字段合并值；requestTimeoutMs 保留默认，单次覆盖不影响后续调用；非法值在发送前拒绝，正常收银台等待不消耗查询预算。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "defaults": "无 policy 时使用 request=60000、interval=3000、maxWait=60000",
    "fieldwise-merge": "初始化与单次 policy 逐字段合并，未覆盖字段保留默认",
    "override-isolation": "单次覆盖不影响后续调用",
    "invalid-before-send": "本 case 的非法时间值分别用于初始化/单次可覆盖字段，在任何请求前拒绝；各字段/层级按公共契约和 Task 1/4 的参数化单测完整核对",
    "channel-wait-excluded": "正常收银台等待不消耗查询预算"
  },
  "cases": [
    {"key": "default-policy", "kind": "behavior", "requiredIn": ["integration"], "checks": ["defaults"]},
    {"key": "fieldwise-overrides", "kind": "behavior", "requiredIn": ["integration"], "checks": ["fieldwise-merge"]},
    {"key": "per-call-override-isolation", "kind": "behavior", "requiredIn": ["integration"], "checks": ["override-isolation"]},
    {"key": "invalid-policy-zero", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-before-send"]},
    {"key": "invalid-policy-negative", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-before-send"]},
    {"key": "invalid-policy-nan", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-before-send"]},
    {"key": "invalid-policy-infinity", "kind": "behavior", "requiredIn": ["integration"], "checks": ["invalid-before-send"]},
    {"key": "channel-wait-budget", "kind": "behavior", "requiredIn": ["integration"], "checks": ["channel-wait-excluded"]}
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
