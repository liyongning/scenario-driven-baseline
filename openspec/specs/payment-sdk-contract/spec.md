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

### Requirement: CONTRACT-04 鉴权、身份与会话错误区分

SDK MUST 用宿主提供的当前 Token，按网关契约写入 Authorization。业务鉴权失效、微信绑定缺失、微信 session 失效 SHALL 使用不同结果；SDK MUST 不登录、绑定身份、持久化业务 Token或自动刷新后重放支付。

#### Scenario: TC-PAYSDK-CONTRACT-005 支付准备鉴权失败
- **WHEN** Token provider 返回空值，或准备接口明确返回 Unauthorized
- **THEN** 识别为 auth_required，不调渠道；前者不发 HTTP，后者保留服务端错误码和交易引用。本次 pay 交付一次最终结果，interruptedPhase=prepare；业务恢复同账号 Token 后，以原 tradeNo/method 显式重新 pay。Token 更新不表示渠道签名失效，SDK 不要求强制换支付单，也不自行重放请求。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "empty-token-no-http": "Token provider 空值返回 auth_required，HTTP 和渠道计数为零",
    "unauthorized-preserved": "prepare Unauthorized 返回 auth_required，保留服务端错误码和交易引用，不调渠道",
    "prepare-interruption-once": "本次 pay 一次结束且 interruptedPhase=prepare",
    "explicit-pay-recovery": "恢复 Token 后业务显式用原 tradeNo/method 再 pay，SDK 不自动重放或强制换支付单"
  },
  "cases": [
    {"key": "empty-token", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["empty-token-no-http", "prepare-interruption-once", "explicit-pay-recovery"]},
    {"key": "prepare-unauthorized", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["unauthorized-preserved", "prepare-interruption-once", "explicit-pay-recovery"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-006 支付已调起后鉴权失效
- **WHEN** 已调用渠道，查询报告鉴权失效
- **THEN** 结束本次 pay/observe，返回 auth_required、interruptedPhase=query、原交易引用、已知 paymentNo、渠道信号和最后可信快照。业务恢复同账号 Token 后只对原 tradeNo 调用 query/observe；全流程不再 CreateTradePay 或 invoke，即使此前只有 success_hint、尚未查到 PAID 也适用。独立 query 失败返回 AUTH_REQUIRED，恢复后重调 query。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "query-auth-result": "渠道已调用后查询鉴权失效，一次结束为 auth_required/interruptedPhase=query",
    "context-preserved": "结果保留交易引用、已知 paymentNo、渠道信号和最后可信快照",
    "query-only-recovery": "恢复 Token 后只 query/observe 原交易，不再 prepare/invoke",
    "independent-query-recovery": "独立 query 失败为 AUTH_REQUIRED，恢复后由业务重调 query"
  },
  "cases": [
    {"key": "query-auth", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["query-auth-result", "context-preserved", "query-only-recovery"]},
    {"key": "independent-query-auth", "kind": "behavior", "requiredIn": ["integration"], "checks": ["independent-query-recovery", "query-only-recovery"]}
  ],
  "blockedBy": []
}
```

### Requirement: CONTRACT-05 停止观察不撤销交易

SDK MUST 支持有界结果查询与查询阶段的调用方停止。原生支付调用等待渠道回调，不设置 SDK 收银台等待上限；宿主可用 RunOptions.cancellation 显式结束仍存活的本地等待，结果为 stopped，清理本地活动记录并忽略旧回调，不关闭原生收银台。停止、超时、网络错误、能力失败 SHALL 不等价于未支付，不发退款或关单。query/observe MUST 不准备支付或拉起渠道。

#### Scenario: TC-PAYSDK-CONTRACT-007 页面离开后恢复
- **WHEN** 宿主停止观察后以同一引用再次 observe
- **THEN** 只恢复查询；旧运行迟到结果不再通知，新运行 not_invoked 不表示历史从未调用渠道。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "observe-recovery-only": "停止观察后以同一引用再次 observe 时只恢复查询",
    "old-run-isolated": "旧运行迟到结果不通知或改变新运行",
    "historical-signal-not-inferred": "新运行 not_invoked 不表示历史从未调用渠道"
  },
  "cases": [
    {"key": "observe-after-stop", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["observe-recovery-only", "old-run-isolated", "historical-signal-not-inferred"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-025 通信取消不混淆停止与超时
- **WHEN** pay 准备期间或 observe 查询期间宿主停止，或请求/观察预算耗尽后底层取消响应到达
- **THEN** backend 用内部 cancelled 结果保留取消信号，核心按已锁定原因一次结算：宿主停止为 stopped，prepare 或观察总预算耗尽为 timed_out；观察中的单次请求到期仅结束该请求，在剩余观察预算内按间隔重查。停止与到期的迟到事件均不能覆盖已结束结果，不误报渠道取消或再次发起支付。独立 query 的请求超时仍返回公共 PortResult 的 TIMEOUT，不泄漏 BackendResult。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "host-stop": "准备或查询中的宿主停止最终为 stopped，无伪造 TIMEOUT/渠道取消，保持快照与渠道信号",
    "timeout": "prepare 或观察总预算耗尽维持时间结束，独立 query 请求到期返回 TIMEOUT",
    "retry": "观察尚有预算时，单次查询到期只结束该请求，按 intervalMs 重查并接纳后续 PAID；旧请求取消与迟到结果不干扰新请求",
    "once": "底层取消、迟到响应及后续停止/计时不得二次交付或改变已锁定结果，无隐式重放"
  },
  "cases": [
    {"key": "prepare-stop", "kind": "behavior", "requiredIn": ["integration"], "checks": ["host-stop", "once"]},
    {"key": "observe-stop", "kind": "behavior", "requiredIn": ["integration"], "checks": ["host-stop", "once"]},
    {"key": "deadline-before-stop", "kind": "behavior", "requiredIn": ["integration"], "checks": ["timeout", "once"]},
    {"key": "stop-before-deadline", "kind": "behavior", "requiredIn": ["integration"], "checks": ["host-stop", "once"]},
    {"key": "query-deadline", "kind": "behavior", "requiredIn": ["integration"], "checks": ["timeout", "once"]},
    {"key": "query-timeout-continue", "kind": "behavior", "requiredIn": ["integration"], "checks": ["retry", "once"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-026 已确认的查单恢复语义与公开结果隔离
- **WHEN** 观察收到已确认可恢复的 QueryTradeUnavailable，或收到同样带 retryable=true 的未知/其他业务错误
- **THEN** 只有前者通过 backend 的内部 cause=query_unavailable 标识进入有界重查；未知码或其他方法的错误立即按既有规则结束，保留公开原码/重试提示。prepare 不自动重放，独立 query 只执行一次；公共结果的运行时对象及声明均不含内部标签。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "known-retry": "QueryTrade 精确命中已确认可恢复错误后按 intervalMs 重查并接纳 PAID，保持总预算，不再次 prepare/invoke",
    "unclassified-stops": "未知非零码或其他方法的业务错误即使 retryable=true 也不重查，保留原码/提示及最后可信快照",
    "no-replay": "prepare 错误不自动重放；独立 query 始终只请求一次",
    "public-shape": "公开 PortResult/PaymentOutcome 的实际对象只含公共字段，内部 cause 不泄漏且公共错误信息不丢失",
    "declarations-public-shape": "实际 SDK tarball 双格式声明不导出 BackendResult/cause 等内部字段，公共 PortResult/PaymentOutcome/PaymentError 保持契约"
  },
  "cases": [
    {"key": "known-unavailable-then-paid", "kind": "behavior", "requiredIn": ["integration"], "checks": ["known-retry", "public-shape"]},
    {"key": "unknown-retryable-ends", "kind": "behavior", "requiredIn": ["integration"], "checks": ["unclassified-stops", "public-shape"]},
    {"key": "other-method-error-ends", "kind": "behavior", "requiredIn": ["integration"], "checks": ["unclassified-stops", "public-shape"]},
    {"key": "prepare-no-replay", "kind": "behavior", "requiredIn": ["integration"], "checks": ["no-replay", "public-shape"]},
    {"key": "query-public-projection", "kind": "behavior", "requiredIn": ["integration"], "checks": ["no-replay", "public-shape"]},
    {"key": "public-declarations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["declarations-public-shape"]}
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

### Requirement: CONTRACT-09 身份与协议映射可追溯

SDK MUST 使用精确 IDL 版本及按本文“业务错误码的 TypeScript 副本”维护的错误定义，区分 Unauthorized、WxIdentityNotFound、SessionExpiredInvalidParameter 与 Unavailable。支付准备请求 SHALL 使用 trade_no、channel、app_id、SDK 内部采集的 client_platform、按 CONTRACT-14 选择性设置的 xpay_env 和公共 BaseReq；open_id 不赋值或透传，出站 ProtoJSON 省略该未使用字段。准备响应 MUST 按本文响应判定顺序处理，再核对 trade_no、payment_no、channel、结构化 PayParams oneof 及渠道必填参数，全部通过后才能调用渠道。

#### Scenario: TC-PAYSDK-CONTRACT-013 已登录但缺绑定或微信会话失效
- **WHEN** prepare 分别返回 WxIdentityNotFound、SessionExpiredInvalidParameter 或 Unavailable
- **THEN** 分别结束本次调用，返回 identity_required、channel_session_required 或服务暂不可用；不全部归为 auth_required，不调用 wx.login/bind/refresh。身份/会话结果携带 interruptedPhase=prepare；业务完成身份建立/渠道会话恢复后，以原 tradeNo/method、相同 appId 显式 pay。SDK 使用本次响应的完整有效参数，不重放旧 PreparedPayment，不要求 payment_no 或全部签名字段变化。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "distinct-error-classification": "三种 prepare 错误分别为 identity_required、channel_session_required、服务暂不可用",
    "no-login-or-binding": "SDK 不调用 wx.login/bind/refresh，且不全部归为 auth_required",
    "prepare-phase-context": "身份/会话错误带 interruptedPhase=prepare",
    "explicit-reprepare": "恢复后以原 tradeNo/method、同 appId 显式 pay，使用本次完整参数，不重放旧 PreparedPayment或要求 paymentNo 变化"
  },
  "cases": [
    {"key": "prepare-identity-not-found", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["distinct-error-classification", "no-login-or-binding", "prepare-phase-context", "explicit-reprepare"]},
    {"key": "prepare-session-expired", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["distinct-error-classification", "no-login-or-binding", "prepare-phase-context", "explicit-reprepare"]},
    {"key": "prepare-unavailable", "kind": "behavior", "requiredIn": ["integration"], "checks": ["distinct-error-classification", "no-login-or-binding"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-014 准备响应渠道不匹配
- **WHEN** 请求 VIRTUAL，但响应 channel 不符、交易引用不同、payment_no 为空，或 PayParams 未命中唯一 wechat_virtual 分支
- **THEN** PROTOCOL_ERROR，不调用端侧渠道，不选择返回的另一种支付方式补救。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "correlation-and-channel-validation": "VIRTUAL 响应的 channel、tradeNo、payment_no 与请求关联必须合法",
    "oneof-validation": "PayParams 必须且只命中 wechat_virtual 分支",
    "no-channel-fallback": "失败统一为 PROTOCOL_ERROR，渠道计数为零且不选择其他方式"
  },
  "cases": [
    {"key": "channel-mismatch", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["correlation-and-channel-validation", "no-channel-fallback"]},
    {"key": "trade-reference-mismatch", "kind": "behavior", "requiredIn": ["integration"], "checks": ["correlation-and-channel-validation", "no-channel-fallback"]},
    {"key": "empty-payment-no", "kind": "behavior", "requiredIn": ["integration"], "checks": ["correlation-and-channel-validation", "no-channel-fallback"]},
    {"key": "missing-wechat-virtual-oneof", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["oneof-validation", "no-channel-fallback"]},
    {"key": "multiple-pay-param-branches", "kind": "behavior", "requiredIn": ["integration"], "checks": ["oneof-validation", "no-channel-fallback"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-018 支付请求字段与服务端身份解析
- **WHEN** 调用方提供 reference/method，初始化配置提供 appId、Token provider 和已确认的公共上下文
- **THEN** SDK 按本文请求字段表映射公共字段，每次请求新建符合 `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$` 的 Request ID，request_id Header 与 baseReq.requestId 同值；同一毫秒内连续请求及同一运行环境的多个客户端请求仍使用不同 ID。出站请求没有 open_id 或 body user_id；client_platform 由 SDK 设备信息映射为 ios/android/harmony/unknown，采集失败填 unknown，不读取宿主同名扩展字段。微信身份由服务端按鉴权用户及 app_id 查询。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "public-field-mapping": "reference/method/appId/公共上下文按字段表映射，出站不含 open_id/body user_id",
    "request-id-contract": "每次请求产生符合正则的新 ID，Header 与 BaseReq 相同，同毫秒/跨客户端不重复",
    "client-platform-owned": "设备信息映射 ios/android/harmony/unknown，异常为 unknown，不读宿主同名扩展",
    "server-identity-boundary": "微信身份由服务端按鉴权用户和 app_id 解析"
  },
  "cases": [
    {"key": "request-field-mapping", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["public-field-mapping", "server-identity-boundary"]},
    {"key": "request-id-sequential", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["request-id-contract"]},
    {"key": "request-id-same-millisecond", "kind": "behavior", "requiredIn": ["integration"], "checks": ["request-id-contract"]},
    {"key": "request-id-multiple-clients", "kind": "behavior", "requiredIn": ["integration"], "checks": ["request-id-contract"]},
    {"key": "client-platform-ios", "kind": "behavior", "requiredIn": ["integration"], "checks": ["client-platform-owned"]},
    {"key": "client-platform-android", "kind": "behavior", "requiredIn": ["integration"], "checks": ["client-platform-owned"]},
    {"key": "client-platform-ohos", "kind": "behavior", "requiredIn": ["integration"], "checks": ["client-platform-owned"]},
    {"key": "client-platform-ohos-pc", "kind": "behavior", "requiredIn": ["integration"], "checks": ["client-platform-owned"]},
    {"key": "client-platform-unknown", "kind": "behavior", "requiredIn": ["integration"], "checks": ["client-platform-owned"]},
    {"key": "client-platform-exception", "kind": "behavior", "requiredIn": ["integration"], "checks": ["client-platform-owned"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-024 错误码副本与 IDL 同源
- **WHEN** 按锁定 IDL 建立或更新通信协议包的业务错误码副本，或升级 IDL 来源
- **THEN** 本文列明的 17 个错误名称、完整 bigint 数值及 DescribeErrorCode 的描述与独立 Go 来源样例逐项一致；副本和独立 Go Fixture 精确对应已评审的固定错误事实来源；generated lock 则按下文独立校验当前来源及支付兼容闭包，不要求两种来源提交相等。改错数值/描述、遗漏条目或来源不一致均使验证失败；副本参与手写覆盖，不放入 generated 或要求 ProtoGen 生成。SDK 从协议包消费该副本，错误分类及恢复矩阵保持本文规定。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "catalog-parity": "全部 17 个名称、完整错误值、canonicalCode/bizCodeName/source/retryable 与直接取自 Go 的独立样例一致",
    "source-alignment": "副本与 Go Fixture 来源固定一致；generated lock 来源独立且支付兼容闭包匹配，来源摘要和本次 sync/status 可追溯",
    "compatible-refresh": "上游只改来源提交/Producer摘要时可同步到current，支付闭包/生成树及固定错误事实不变",
    "projection-drift": "支付兼容字段、闭包项、输出、分支或fallback失配均不能按元数据刷新放行",
    "drift-rejected": "改错数值或描述、遗漏条目、来源失配的受控输入均验证失败"
  },
  "cases": [
    {"key": "all-errors", "kind": "engineering", "requiredIn": ["integration"], "checks": ["catalog-parity", "source-alignment"]},
    {"key": "wrong-code", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "wrong-description", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "missing-error", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "source-mismatch", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "metadata-only-sync", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-alignment", "compatible-refresh"]},
    {"key": "payment-projection-mismatch", "kind": "engineering", "requiredIn": ["integration"], "checks": ["projection-drift"]}
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

### Requirement: CONTRACT-12 每次调用的阶段通知

pay/observe SHALL 接受可选 onPhase，仅提供 channel_invoking、confirming，事件仅含 attemptId/phase；每阶段每运行至多通知一次，通知发生于最终结果之前。channel_invoking MUST 在参数/能力检查通过后、实际平台调用前发出；confirming MUST 在进入结果确认时、首次 query/provider 前发出。pay 只有接纳 success_hint/已返回 unknown 才进入 confirming；独立 observe 直接进入 confirming。取消、明确失败和会话中断按既有最终结果处理，无额外 channel_returned/ended 通知。SDK MUST 不等待业务返回、渲染或动画，不以阶段证明 PAID、权益到账或原生界面可见/已关闭；通知异常、停止与迟到隔离按本文“阶段通知与一次最终交付”执行。

#### Scenario: TC-PAYSDK-CONTRACT-020 可选阶段回调与结果分离
- **WHEN** 调用方分别省略/传入 onPhase，通过 pay 或 observe 消费 SDK，并在回调中读取 attemptId/phase
- **THEN** 两种接入均合法，省略回调不改变网络、渠道和结果规则；回调只含本次 attemptId 和两个约定阶段，最终 PaymentOutcome 仍经 Promise 交付一次。不存在 preparing、channel_returned 或轮询进度事件，独立 query 不增加过程通知参数。confirming 先于首笔查询和终态交付，但不能断言 UI 已渲染。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "callback-optionality": "省略或提供 onPhase 均合法且不改变网络、渠道、结果规则",
    "public-event-shape": "事件只含本次 attemptId 和 channel_invoking/confirming",
    "outcome-separate": "最终 PaymentOutcome 仍仅经 Promise 一次交付",
    "no-extra-phases": "无 preparing/channel_returned/轮询进度，独立 query 无过程通知参数",
    "confirming-order": "confirming 先于首笔查询和终态交付，且不代表 UI 已渲染",
    "query-no-notifications": "独立 query 只交付一次查询结果，不产生 onPhase 通知",
    "phase-type-surface": "实际双格式声明的 PhaseEvent 只有本次 attemptId 和两个约定 phase；query 参数不增加 onPhase，RunOptions 保留可选回调"
  },
  "cases": [
    {"key": "with-listener", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["public-event-shape", "outcome-separate", "confirming-order"]},
    {"key": "no-listener", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["callback-optionality", "outcome-separate"]},
    {"key": "observe-listener", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["public-event-shape", "no-extra-phases", "confirming-order"]},
    {"key": "independent-query", "kind": "behavior", "requiredIn": ["integration"], "checks": ["query-no-notifications"]},
    {"key": "no-extra-phase-values", "kind": "behavior", "requiredIn": ["integration"], "checks": ["public-event-shape", "no-extra-phases"]},
    {"key": "public-phase-type-surface", "kind": "engineering", "requiredIn": ["integration"], "checks": ["phase-type-surface"]}
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

### Requirement: CONTRACT-14 逐次支付的米大师环境选择

pay SHALL 通过 PaymentRequest.xpayEnv 接收可选的 sandbox 或 prod；未提供或 undefined 表示字段未设置。SDK MUST 在 provider、HTTP、渠道调用和阶段通知前拒绝其他值，以 reason=error、error.code=INVALID_INPUT、source=sdk、channelSignal=not_invoked 交付一次结果，不发出任何外部动作。初始化配置、RunOptions、PaymentRequestContext 和 TradeReference SHALL 不增加该字段，query/observe MUST 不接受或发送环境选择。

SDK MUST 把公共字符串映射为 generated XpayEnv 的具名常量，由 generated codec 写入 CreateTradePayRequest.xpay_env（ProtoJSON xpayEnv）。省略时保留 optional absence，不发送 null、0 或 XPAY_ENV_UNSPECIFIED；不能硬编码枚举数字或把选择写入 Header/BaseReq。SDK SHALL 不承诺请求值就是最终渠道环境，不根据 runtime/client_platform/lane/域名推算默认环境，不改写 signData.env 或选择 AppKey。部署行为和网关前提按下方三态表验收。

#### Scenario: TC-PAYSDK-CONTRACT-022 可选参数与非法输入
- **WHEN** 调用方省略 xpayEnv、显式传 undefined/sandbox/prod，或从 JavaScript 传 null、数字 0/1/2、空串、UNSPECIFIED/协议枚举名称和其他未知值
- **THEN** 前四种输入合法，其他值在外部动作前返回 INVALID_INPUT；公共类型只接受 XpayEnv 联合类型，参数仅在 PaymentRequest 上出现。中文注释和双格式声明保留省略、真实扣款及服务端覆盖规则。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "valid-runtime-inputs": "省略、显式 undefined、sandbox、prod 在运行时均合法",
    "invalid-runtime-before-effects": "null、数值、空串、协议枚举字符串及未知值均在任何外部动作前返回 INVALID_INPUT",
    "public-type-scope": "公共 TypeScript 只接受 XpayEnv 联合，字段只位于 PaymentRequest",
    "declaration-docs": "两种声明入口保留 absence、真实扣款及服务端覆盖规则的中文注释"
  },
  "cases": [
    {"key": "omitted", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["valid-runtime-inputs"]},
    {"key": "explicit-undefined", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["valid-runtime-inputs"]},
    {"key": "sandbox", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["valid-runtime-inputs"]},
    {"key": "prod", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["valid-runtime-inputs"]},
    {"key": "null", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "number-zero", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "number-one", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "number-two", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "empty-string", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "unspecified-name", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "protocol-enum-name", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "unknown-value", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["invalid-runtime-before-effects"]},
    {"key": "typescript-input-surface", "kind": "engineering", "requiredIn": ["integration"], "checks": ["public-type-scope"]},
    {"key": "dual-declaration-xpay-docs", "kind": "engineering", "requiredIn": ["integration"], "checks": ["declaration-docs"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CONTRACT-023 optional presence 与枚举编码
- **WHEN** 真实协议执行器分别编码省略、sandbox、prod 的 CreateTradePay 请求，以及 query/observe 请求
- **THEN** 前三者的原始 JSON 分别为无 xpayEnv 键、xpayEnv=XPAY_ENV_SANDBOX、xpayEnv=XPAY_ENV_PROD；query/observe 没有该键，所有请求的 Header/BaseReq 都没有环境字段。使用独立于被测 TS 映射的 wire 期望核对，不以相同 codec 往返成功替代。IDL 明确禁止显式 UNSPECIFIED=0，SDK 不用生成默认值补齐 absence。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "create-presence-and-enum": "CreateTradePay 原始 JSON：省略无键，sandbox/prod 分别为 XPAY_ENV_SANDBOX/XPAY_ENV_PROD",
    "query-absence": "协议 QueryTrade 原始请求不存在 xpayEnv，Header/BaseReq 也无环境字段",
    "observe-absence": "公共 observe 产生的 QueryTrade 原始请求不存在 xpayEnv，Header/BaseReq 也无环境字段",
    "independent-wire-oracle": "期望独立于被测 TS 映射，不能只靠相同 codec 往返成功"
  },
  "cases": [
    {"key": "omitted", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["create-presence-and-enum", "independent-wire-oracle"]},
    {"key": "sandbox", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["create-presence-and-enum", "independent-wire-oracle"]},
    {"key": "prod", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["create-presence-and-enum", "independent-wire-oracle"]},
    {"key": "query-no-env", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["query-absence", "independent-wire-oracle"]},
    {"key": "observe-no-env", "kind": "behavior", "requiredIn": ["integration", "weapp"], "checks": ["observe-absence", "independent-wire-oracle"]}
  ],
  "blockedBy": []
}
```

