# SDK 公共契约（草案 v2）

状态：`draft`。本文是 SDK 对业务方的唯一公共契约来源，定义初始化、公共 API、支付结果及请求上下文；流程续接按本文“凭据恢复与再次调用”执行。类型/命名属于待评审 API 提案，服务端 wire DTO 由 IDL 生成。全部 TC 均为 draft，待实现测试与 fixtures。

SDK 自带 HTTP 与端侧渠道能力；宿主提供配置与数据获取方法；SDK 按 IDL 及配套网关契约组装请求。内部端口用于模块隔离和 SDK 自身测试。

## ADDED Requirements

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

## 公共 API 提案

首期公开运行环境和方式只包含已计划交付的微信小程序虚拟支付。未来新增 runtime/method 必须扩大契约、参数模型和验证范围；内部假适配器不进入生产能力列表。

```ts
export type PaymentRuntime = 'wechat-miniapp';
export type PaymentMethod = 'wechat-miniapp-virtual-goods';
/** 米大师逐次支付环境的请求选择；不是 SDK 宿主、泳道或服务端实际环境的证明。 */
export type XpayEnv =
  /** 请求沙箱；仅服务端允许时生效。生产部署仍走现网，不能据此保证不扣款。 */
  | 'sandbox'
  /** 请求现网，可能真实扣款；仅在已获准的账号、金额及环境中使用。 */
  | 'prod';
export type TradeReference = Readonly<{ tradeNo: string }>;
/** 交易快照状态：服务端查询事实或 UNKNOWN；不同于 SDK 阶段和调用结束原因。 */
export type TradeState =
  /** 服务端返回交易已创建，尚未确认支付。 */
  | 'CREATED'
  /** 服务端返回支付处理中；不能据此认定未扣款。 */
  | 'PAYING'
  /** 服务端查询确认已支付；业务权益是否到账由业务接口确认。 */
  | 'PAID'
  /** 服务端查询确认已关闭；不能用本地计时合成，一期不保证产生。 */
  | 'CLOSED'
  /** 尚无可信查询结果或状态不可识别；不是支付失败。 */
  | 'UNKNOWN';
/** 本次运行收到的渠道信号；渠道成功提示不能代替服务端 PAID。 */
export type ChannelSignal =
  /** 本次未实际调用渠道，包括 prepare 失败、调用前停止和独立 observe。 */
  | 'not_invoked'
  /** 渠道给出成功提示，SDK 继续查询交易事实。 */
  | 'success_hint'
  /** 渠道明确返回用户取消；不同于宿主停止 SDK 等待。 */
  | 'cancelled'
  /** 渠道明确调起失败；明确失败保留 CHANNEL_ERROR 与渠道原码，明确会话失效同时使用专属结束原因。 */
  | 'launch_failed'
  /** 渠道返回结果不明，或已调渠道但本地停止时尚无结果；仅前者自动查单。 */
  | 'unknown';
/** 本次 SDK 调用为何结束；不是账务状态，也不是 onPhase 的阶段值。 */
export type EndReason =
  /** 查询取得 PAID 或 CLOSED，具体终态看 snapshot.state。 */
  | 'confirmed'
  /** 渠道明确取消，本次直接结束，不自动查单。 */
  | 'channel_cancelled'
  /** 明确调起失败，本次直接结束并保留渠道原码；不证明交易关闭。 */
  | 'launch_failed'
  /** 业务凭据缺失/失效；按 interruptedPhase 决定恢复入口。 */
  | 'auth_required'
  /** 服务端明确缺少微信身份绑定，交宿主恢复。 */
  | 'identity_required'
  /** 明确渠道会话失效，交宿主恢复；不能用一般签名错误推断。 */
  | 'channel_session_required'
  /** 当前环境或支付方式不可用，未进入实际支付调用。 */
  | 'unsupported'
  /** 同客户端同交易已有活动 pay，拒绝本次重入。 */
  | 'busy'
  /** 请求/结果确认等待预算耗尽；不覆盖原生收银台等待，不证明未支付。 */
  | 'timed_out'
  /** 宿主显式结束本地等待；不取消渠道支付、不关单。 */
  | 'stopped'
  /** 其他错误导致本次结束，分类与来源见 error。 */
  | 'error'
  /** 交宿主承接 nextAction；首期真实虚拟支付不产生此分支。 */
  | 'action_required';
/** 业务可观察的执行边界；没有 preparing、channel_returned 或 ended 事件。 */
export type PaymentPhase =
  /** 参数校验后、调用端侧渠道前；通知内停止可使实际调用不发生。 */
  | 'channel_invoking'
  /** 进入服务端结果确认、首次查询前；不是已支付或权益到账。 */
  | 'confirming';
/** 每次调用的阶段通知；不携带支付参数或业务上下文。 */
export type PaymentPhaseEvent = Readonly<{
  /** 本次 SDK 运行标识，与最终结果相同；不是交易号或幂等键。 */
  attemptId: string;
  /** 本次新进入的约定执行阶段。 */
  phase: PaymentPhase;
}>;
/** 错误分类与来源；不替代交易快照，不携带支付原文。 */
export type PaymentError = Readonly<{
  /** 稳定错误分类，恢复与重试仍依照阶段矩阵。 */
  code:
    /** 业务凭据缺失或失效，按中断阶段恢复。 */
    | 'AUTH_REQUIRED'
    /** 服务端明确缺少所需微信身份绑定。 */
    | 'IDENTITY_REQUIRED'
    /** 明确渠道会话失效，不从一般签名错误推断。 */
    | 'CHANNEL_SESSION_REQUIRED'
    /** 当前环境或支付方式不可用。 */
    | 'UNSUPPORTED'
    /** 同客户端同交易已有活动 pay。 */
    | 'BUSY'
    /** 本次调用参数或配置覆盖非法。 */
    | 'INVALID_INPUT'
    /** 宿主数据 provider 抛错或提供非法上下文。 */
    | 'HOST_CONTEXT_ERROR'
    /** 平台网络传输失败，不证明服务端无副作用。 */
    | 'NETWORK_ERROR'
    /** 响应信封、关联或支付参数违反消费契约。 */
    | 'PROTOCOL_ERROR'
    /** 端侧渠道错误，不自动推断未支付。 */
    | 'CHANNEL_ERROR'
    /** 服务端业务错误，按精确协议判定可否继续观察。 */
    | 'SERVER_ERROR'
    /** 服务端拒绝当前支付操作的冲突，不等于已支付。 */
    | 'CONFLICT'
    /** 请求或结果观察的时间错误；原生等待没有此上限。 */
    | 'TIMEOUT';
  /** 错误的归一来源，不能据此判断账务状态。 */
  source:
    /** SDK 核心或输入校验。 */
    | 'sdk'
    /** 宿主数据 provider。 */
    | 'host'
    /** 平台网络传输。 */
    | 'network'
    /** 网关及服务端响应边界。 */
    | 'gateway'
    /** 端侧支付渠道。 */
    | 'channel';
  /** SDK 稳定提供的默认中文文案；业务可直接展示或自行覆盖。 */
  message: string;
  /** 可选原始错误码，不包含异常原文或完整响应；渠道明确失败保留十进制 errCode。 */
  originalCode?: string;
  /** 可重试提示，不授权 SDK 自动重放 prepare 或渠道支付。 */
  retryable?: boolean;
  /** 渠道 fail 回调的 errMsg；仅字符串值透传，不参与 SDK 判定。 */
  channelMessage?: string;
}>;
export type PortResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: PaymentError }>;
export type TradeSnapshot = Readonly<{
  /** 当前快照关联的原交易引用。 */
  reference: TradeReference;
  /** 最后可信服务端状态；未取得可信快照时为 UNKNOWN。 */
  state: TradeState;
  /** SDK 取得快照的时刻，不伪装成服务端事件时间。 */
  observedAtMs: number;
  /** 服务端交易期限，不触发 SDK 自动关单或截断收银台。 */
  expiresAtMs?: number;
  /** server 表示来自有效查询；unavailable 表示无可信查询，state 必为 UNKNOWN。 */
  source: 'server' | 'unavailable';
}>;
export type PaymentAction =
  | Readonly<{ kind: 'redirect'; url: string }>
  | Readonly<{ kind: 'qr_code'; content: string }>;
export type ObservationPolicy = Readonly<{
  intervalMs: number;
  maxWaitMs: number;
}>;
export type PaymentPolicyOverrides = Readonly<{
  requestTimeoutMs?: number;
  observation?: Partial<ObservationPolicy>;
}>;
// 通信协议包拥有此基础类型，SDK 从自身入口转出，宿主无需深层导入。
export type Cancellation = import('@daqian/payment-protocol').Cancellation;
export type RunOptions = Readonly<{
  policy?: PaymentPolicyOverrides;
  cancellation?: Cancellation;
  /** 每次调用可选阶段通知；SDK 不等待返回，异常不改变主流程，最终结果仍由 Promise 交付。 */
  onPhase?: (event: PaymentPhaseEvent) => void;
}>;
export type PaymentRequest = Readonly<{
  reference: TradeReference;
  method: PaymentMethod;
  /** 本次米大师环境选择；省略/undefined 由服务端采用部署默认值，SDK 不填 UNSPECIFIED。生产部署恒走现网。 */
  xpayEnv?: XpayEnv | undefined;
}>;
/** 本次 pay/observe 唯一最终结果；成功、取消、错误、超时和停止均使用此对象。 */
export type PaymentOutcome = Readonly<{
  /** 与本次阶段事件相同的运行标识，用于隔离重复调用。 */
  attemptId: string;
  /** 最后可信交易事实；不由渠道提示或本地结束原因改写。 */
  snapshot: TradeSnapshot;
  /** 本次渠道调用及其返回情况，不代表服务端支付结论。 */
  channelSignal: ChannelSignal;
  /** 本次调用结束的原因；confirmed 仍需区分 PAID/CLOSED。 */
  reason: EndReason;
  /** 准备成功后已知的支付单号；恢复时不比较是否变化。 */
  paymentNo?: string;
  /** 三类身份/会话中断必须携带：prepare 预下单、invoke 渠道调用、query 结果查询；不是过程通知。 */
  interruptedPhase?: 'prepare' | 'invoke' | 'query';
  /** 可选错误分类、来源与原码；不得包含原始支付载荷或凭据。 */
  error?: PaymentError;
  /** 仅 action_required 携带，表示后续动作，不代表付款完成。 */
  nextAction?: PaymentAction;
}>;
export type PaymentRequestContext = Readonly<{
  productId?: string;
  lane?: string;
  appVersion?: string;
}>;
export type DiagnosticEvent = Readonly<{
  attemptId?: string;
  requestId?: string;
  phase: string;
  code?: PaymentError['code'];
  originalCode?: string;
}>;
export type PaymentClientOptions = Readonly<{
  runtime: PaymentRuntime;
  gatewayBaseUrl: string;
  appId: string;
  enabledMethods: readonly PaymentMethod[];
  getAccessToken: () => string | null | Promise<string | null>;
  requestContext?: PaymentRequestContext;
  policy?: PaymentPolicyOverrides;
  onDiagnostic?: (event: DiagnosticEvent) => void;
}>;
export interface PaymentClient {
  pay(request: PaymentRequest, options?: RunOptions): Promise<PaymentOutcome>;
  query(reference: TradeReference): Promise<PortResult<TradeSnapshot>>;
  observe(reference: TradeReference, options?: RunOptions): Promise<PaymentOutcome>;
}
export declare class PaymentConfigurationError extends Error {
  readonly code: 'INVALID_CONFIG';
}
export declare function createPaymentClient(options: PaymentClientOptions): PaymentClient;
```

`PaymentError.message` SHALL 只按稳定 `code` 使用下表中文默认文案，不因 source、originalCode、retryable、服务端 message/details、异常原文或渠道 errMsg 改写。SDK 内部所有错误构造及公开 query/pay/observe 投影 MUST 覆盖完整表；消费方可以自行替换展示文案，但不能依赖 SDK 从渠道原文推断本地化或恢复动作。

| PaymentError.code | message |
| --- | --- |
| AUTH_REQUIRED | 登录状态已失效，请重新登录 |
| IDENTITY_REQUIRED | 缺少微信支付身份，请先完成绑定 |
| CHANNEL_SESSION_REQUIRED | 支付会话已失效，请重新发起支付 |
| UNSUPPORTED | 当前环境或支付方式不受支持 |
| BUSY | 当前交易正在支付中，请勿重复操作 |
| INVALID_INPUT | 支付参数无效 |
| HOST_CONTEXT_ERROR | 获取支付上下文失败 |
| NETWORK_ERROR | 网络请求失败，请稍后重试 |
| PROTOCOL_ERROR | 支付响应格式异常 |
| CHANNEL_ERROR | 支付渠道调用失败 |
| SERVER_ERROR | 支付服务处理失败 |
| CONFLICT | 当前支付操作存在冲突 |
| TIMEOUT | 支付请求超时，请稍后确认支付结果 |

`channelMessage` SHALL 仅承载渠道 fail 回调中确认是字符串的 errMsg；它不是默认 message 的来源。所有会产生 PaymentError 的渠道 fail 分支均遵守该规则，包括 -15007；-2 与 -5 按下方映射不产生 PaymentError，因此也不因存在 errMsg 新增 error/channelMessage。

初始化必填 runtime、gatewayBaseUrl、appId、enabledMethods、getAccessToken；requestContext、policy、onDiagnostic 可选。配置缺失/非法、未知 runtime、空或重复 enabledMethods、非法时间配置，工厂抛 PaymentConfigurationError。工厂不会发送网络或触发支付；缺实际平台能力在操作时返回 unsupported。

SDK 内置 requestTimeoutMs=60000、observation.intervalMs=3000、observation.maxWaitMs=60000。按字段合并“内置默认 → 初始化 policy → 单次 pay/observe 的 policy”；仅 undefined 表示未覆盖，0、负数、NaN、Infinity 均非法。初始化覆盖在工厂校验，单次覆盖非法返回 INVALID_INPUT，不触发网络。query 使用初始化的 requestTimeoutMs。配置对象创建/调用时复制；变更宿主原对象不修改已有实例或运行，后续运行需覆盖 options 或新建客户端。

```ts
function connectPayment(input: PaymentClientOptions) {
  const client = createPaymentClient(input);
  return {
    payTrade(reference: TradeReference) {
      return client.pay({ reference, method: 'wechat-miniapp-virtual-goods' });
    },
    observeTrade(reference: TradeReference) {
      return client.observe(reference, { policy: { observation: { maxWaitMs: 90000 } } });
    },
    queryTrade(reference: TradeReference) {
      return client.query(reference);
    },
  };
}
```

公开 runtime 是宿主环境选择字符串，例如 wechat-miniapp；method 是该环境中的支付方式，并映射到服务端 channel。内部 RuntimePort 提供时钟、ID 与等待工具，DeviceInfoPort 提供下单端信息；工厂完成装配，核心决定 prepare/invoke/query 顺序。

Token 在每次实际 HTTP 前重新读取。SDK 不缓存业务 Token；业务更新 getter 的数据源即可让下一次请求使用新值，无需重建 SDK。已因身份错误结束的调用不自动复活，业务按下方恢复矩阵显式调用 pay 或 query/observe。

requestContext 承载 productId、lane、appVersion，映射见下方请求字段表。client_platform 用于设备系统统计/排障，由 SDK 内部读取 wx.getDeviceInfo().platform：ios→ios、android→android、ohos/ohos_pc→harmony，其余或异常→unknown；不对外提供配置项，不参与 method/channel 选择。只取 platform，不采集其他设备属性。首期没有浏览器客户端，不能把开发者工具或 PC 微信标成 web。

pay/observe 通过本次 RunOptions.onPhase 通知约定执行边界，公共 Promise 各返回一次最终 PaymentOutcome；onDiagnostic 仅供诊断，不是业务阶段入口。成功提示不是 PAID，查询 timed_out 表示本次结果等待结束而非支付失败。身份/会话错误结束当前调用，以 reason/error、interruptedPhase 和交易上下文交付中断信息；SDK 不悬挂原 Promise 等待外部登录，不提供 resume API。

### xpayEnv 的三态、部署语义与职责

| PaymentRequest.xpayEnv | CreateTradePay 的 ProtoJSON | 允许逐请求选择的 test 部署 | prod 部署 |
| --- | --- | --- | --- |
| 省略或 undefined | 完全省略 xpayEnv 键 | 采用部署默认，按本基线为沙箱 | 现网 |
| sandbox | XPAY_ENV_SANDBOX | 沙箱 | 忽略请求选择，仍为现网 |
| prod | XPAY_ENV_PROD | 现网，真实扣款 | 现网，真实扣款 |

以上服务端规则取自 [XpayEnv 原始定义](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/4e5cb22659fd4f4c36d06ae81256dc1c43e691d9/infra/pay/v1/pay.proto)。仅 RuntimeEnvTest 允许逐请求覆盖；其他部署由服务端默认策略处理，SDK 不解析其环境变量。省略保持旧客户端行为，不等于“请求现网”。显式 XPAY_ENV_UNSPECIFIED=0 被 defined_only/not_in:[0] 约束拒绝，不能当作省略。SDK 公共 API 不暴露 generated 枚举数值。

SDK 在 pay 接纳时复制本次 reference/method/xpayEnv；后续宿主修改原对象不影响在途请求，前次显式值不成为下次默认值。值不进入全局配置或本地交易历史。身份恢复需要再次 pay 时，业务保留原环境选择（包括原先省略），按恢复矩阵显式传入；查询恢复只使用原 tradeNo，不携带 xpayEnv。重复 pay 的支付单复用/拒绝由服务端决定，SDK 不增加环境幂等键，也不承诺更换请求选择就一定生成不同支付单。

该字段只参与支付准备请求。trade 透传至 PrepayRequest.xpay_env；哪些渠道认识它由 pay 决定，首期 SDK 只公开虚拟商品方式。后续新增 method 再扩展对应能力说明。PayParams、PreparedPayment、ChannelPaymentParams 及 wx.requestVirtualPayment 的四个参数不新增环境字段；服务端负责 env/AppKey 配对和签名。IDL 枚举 PROD=2 与签名原文 env=0 不相等，SDK 不强转、不解析或补写 signData 内部字段，不从响应或请求自行宣称“实际走了沙箱”。

网关必须使用识别 CreateTradePayRequest.xpay_env 的 IDL，且保持 optional presence。旧 grpc-gateway 的 DiscardUnknown=true 会静默丢弃 xpayEnv，HTTP 成功不能证明字段传到 pay。Task 8 真实渠道前取得网关/交易/支付服务构建版本及该字段贯通的脱敏证据；本地 ProtoGen 与 Shadow 通过仅证明 SDK 出站，不证明部署已升级。SDK 不增加探测网关版本或自动切换环境的接口。

按本 IDL，iOS 无沙箱，沙箱验收使用 Android；iOS 验收采用服务端实际生效的现网环境。不能仅凭请求 sandbox 在 SDK 内拒绝 iOS，因为 prod 部署会忽略该请求。真实渠道前确认实际部署与有效环境、账号及金额授权；未经授权不执行可能真实扣款的调用。有效环境取证由服务端提供非敏感记录，不在 SDK 内解析签名来推断。

### 状态字段的中文语义与触发场景

以下表格是方案、公共类型注释、映射及消费说明的共同依据。phase 回答“SDK 正在做什么”，channelSignal 回答“本次渠道说了什么”，reason 回答“本次调用为什么结束”，snapshot.state 回答“最后掌握的交易事实是什么”。PaymentOutcome 是最终结果对象，不是第三个阶段通知。

| phase | 中文含义与触发位置 | 判断边界 |
| --- | --- | --- |
| channel_invoking | 即将调用端侧渠道：预下单与参数/能力校验通过后，在实际平台 API 前通知 | 不保证收银台已显示；通知内停止可使实际渠道调用不发生 |
| confirming | 正在向支付基建确认结果：pay 接受 success_hint/已返回 unknown 后或独立 observe 开始时，在首笔 query/provider 前通知 | 不表示已支付、HTTP 已发出或权益到账；每运行一次，不随轮询重复 |

| snapshot.state | 中文含义与来源 | 处理与判断边界 |
| --- | --- | --- |
| CREATED | 查询返回交易已创建 | 继续观察；prepare 成功不自行生成此状态 |
| PAYING | 查询返回交易支付处理中 | 继续观察，不证明未扣款；不能根据 expire_time 合成 CLOSED |
| PAID | 查询确认交易已支付 | 结束观察；业务权益由业务接口确认 |
| CLOSED | 查询确认交易已关闭 | 结束观察；只能来自服务端，一期不保证写入 |
| UNKNOWN | 尚无可信查询结果，或服务端状态不可识别/未知 | 不认定失败；unavailable 必须为 UNKNOWN，server 也可能返回未知状态 |

| channelSignal | 中文含义与出现位置 | 后续规则 |
| --- | --- | --- |
| not_invoked | 本次未实际调用渠道：prepare/校验失败、调用前停止、busy/unsupported、独立 observe | 不说明该交易历史上从未支付 |
| success_hint | 渠道给出成功提示 | 进入 confirming，不直接将快照改为 PAID |
| cancelled | 渠道明确返回用户取消 | 以 channel_cancelled 结束，不自动查询；不是服务端关单结论 |
| launch_failed | 渠道明确调起失败；明确会话失效也保留该信号 | 普通失败以 launch_failed 结束；会话失效使用 channel_session_required，不混淆恢复动作 |
| unknown | 已收到无法确定的渠道结果；或已调渠道但显式停止时尚无有效结果 | 只有“已收到 unknown 回调”的活动流程进入 confirming；无回调不自动查单，stopped 不恢复运行 |

| reason | 中文含义 | 触发阶段及最终交付条件 |
| --- | --- | --- |
| confirmed | 已取得服务端终态 | query/observe 取得 PAID 或 CLOSED；是否支付成功仍看 snapshot.state |
| channel_cancelled | 渠道返回用户取消 | invoke 接受明确 cancelled，本次直接结束，无 confirming |
| launch_failed | 明确调起失败 | invoke 明确失败，本次直接结束并携带渠道原码；失败不是交易关闭 |
| auth_required | 需要恢复业务鉴权 | prepare/query 检出 Token 缺失或 Unauthorized；携带 interruptedPhase |
| identity_required | 需要建立所需微信身份绑定 | prepare/query 收到明确身份缺失错误；携带 interruptedPhase，不当作 Token 过期 |
| channel_session_required | 需要恢复渠道会话 | prepare/invoke/query 收到明确会话失效语义；携带 interruptedPhase，按恢复矩阵处理 |
| unsupported | 当前环境或支付方式不可用 | 输入/能力检查拒绝，不进行实际支付调用 |
| busy | 当前同单支付运行仍活动 | 同客户端同交易 pay 重入，拒绝新调用，不干扰原调用 |
| timed_out | 本次等待预算耗尽 | 预下单请求（含 provider）超时或结果确认总窗口耗尽；单笔查单超时按观察重试规则处理，不等于每次立刻结束整个观察；原生等待无此上限 |
| stopped | 宿主主动结束本地等待 | 调用前或 prepare/invoke/query 期间显式 cancellation；不取消渠道支付、不关单、不推断未扣款 |
| error | 其他不能继续的错误 | 输入错误或按既有规则须结束的网络、协议、渠道、服务端等错误；invoke 阶段的渠道明确失败按 launch_failed 结算，不落入本原因；分类见 error |
| action_required | 需要业务承接下一动作 | 内部适配器返回 redirect/qr_code，必须带 nextAction；首期只通过假适配器验证 |

| 辅助字段 | 中文含义与场景 |
| --- | --- |
| attemptId | 一次执行标识；本次事件与最终结果同值，不同运行不可仅凭 tradeNo 区分，不作为服务端幂等键 |
| snapshot.source | server=有效服务端查询；unavailable=未取得可信快照，此时不能假称服务端返回了 UNKNOWN |
| interruptedPhase | 三类身份/会话错误位置：prepare=预下单，invoke=端侧渠道，query=结果确认；不是 onPhase 事件 |
| error.code | AUTH_REQUIRED/IDENTITY_REQUIRED/CHANNEL_SESSION_REQUIRED 对应三类恢复；UNSUPPORTED/BUSY 为准入拒绝；INVALID_INPUT=参数错误，HOST_CONTEXT_ERROR=provider 异常，NETWORK_ERROR=传输失败，PROTOCOL_ERROR=信封/关联/参数违约，CHANNEL_ERROR=渠道错误，SERVER_ERROR=服务端错误，CONFLICT=服务端冲突，TIMEOUT=时间错误。分类不授权自动重放 |
| error.source | sdk=核心/校验，host=宿主 provider，network=传输，gateway=网关及服务端响应边界，channel=端侧渠道；不据来源推断交易是否成功 |
| error.originalCode / retryable | 已归一原码与重试提示；不输出原始异常或支付载荷，retryable 不授权 SDK 自动重付 |
| paymentNo / nextAction | 本次已知支付单号 / action_required 的后续动作；单号是否复用由服务端决定，动作不代表已支付 |

例如渠道 success_hint 后最后查到 PAYING，观察预算耗尽时仍为 `channelSignal=success_hint, reason=timed_out, snapshot.state=PAYING`。字段各自保留来源，不能改成支付失败。源码联合值、字段及关键分支的中文注释须解释这种组合，不能只把英文直译为“成功”“失败”。公共 JSDoc 随双格式声明交付；实现注释解释状态迁移、精确错误映射和停止/迟到边界，不要求每行代码重复说明。

### 阶段通知与一次最终交付

1. onPhase 只绑定本次 pay/observe，不进入初始化全局配置；事件是独立只读数据，仅有 attemptId/phase。非函数 onPhase 在准入时按 INVALID_INPUT 结束，不发通知/请求；省略回调不改变执行路径。没有 preparing、channel_returned、ended、百分比或每轮查询事件，独立 query 保持现有接口。
2. 核心先登记活动运行和最终结果闩锁，再向适配器提供 ChannelContext.beforeInvoke。适配器完成参数/能力校验后，仅在真实平台调用前执行该同步通知点；核心在此发 channel_invoking，不等待 UI 渲染或动画。
3. beforeInvoke 通知后复查运行与 cancellation；返回 false 时适配器不得调用平台，返回 kind=stopped，核心交付 stopped/not_invoked。返回 true 后适配器立即复查停止，再调用 ChannelContext.markInvoked；仅返回 true 时紧接着调用平台一次。实际调用标记由核心在 markInvoked 内同步置位，不能在 beforeInvoke 中置位。不能仅因发出 channel_invoking 就把未调渠道的信号记为 unknown。
4. pay 只在接纳 success_hint/已返回 unknown 时进入确认；observe 通过准入后直接进入。先固定观察截止，再发 confirming，随后复查停止与剩余预算，才开始首笔 query/provider；通知内停止不发查询，保留已有渠道信号。多轮查询不重复通知；首笔即 PAID/CLOSED 也先通知再交付终态，不人为延迟。
5. SDK 同步调用回调但不 await 返回；同步抛错和返回 Promise/thenable 的拒绝均隔离，不改 reason、快照、重试或下一动作，不产生 unhandled rejection。同步耗时仍会占用 JS 线程，SDK 不承诺抢占。异常不记录原文/对象或支付载荷；异步拒绝被接收后不得复活 ended 运行或再次通知。
6. 通知内同客户端同交易再次 pay 仍 busy，不影响原运行；每个公开阶段至多一次。回调返回值不是流程控制协议，主动停止只用 cancellation；再次 pay 应在原调用结束并清理后显式发起，事件不触发自动重付。
7. 等待渠道时停止与回调只接纳先处理者；停止先到，旧回调不得再发 confirming/查单。平台信号先接纳后，后续 cancellation 仍可结束查询。结束先置 ended、清理计时/取消订阅及活动记录，再交付一次 PaymentOutcome；以后忽略通知、重复和迟到结果，不影响新 attempt。
8. 无渠道回调不产生 confirming、不自动查询、不新增渠道超时，不依据 onShow/onHide 推断关闭。进程退出不保证旧事件/Promise 交付，恢复按原交易 query/observe 的既有规则；本地停止不推导支付失败或原生界面关闭。
9. 宿主在调用前建立运行标识，以闭包绑定交易/来源/组件有效性，不等最终 Promise 才识别本轮。SDK 不能撤销已执行的业务回调及其异步任务；宿主在事件、最终结果及自身 await 后检查运行/页面仍有效。业务容器映射展示 Props，临时视觉隐藏不走实际关闭或 afterClose，不清理业务上下文；纯 UI 不依赖 SDK 枚举，SDK 不包含业务界面或权益逻辑。

正常顺序为 `prepare → channel_invoking → 平台调用/回调 → confirming → query → PaymentOutcome`。取消、明确失败/会话错误为 `channel_invoking → 平台回调 → PaymentOutcome`；prepare/调用前校验失败没有阶段通知。独立 observe 为 `confirming → query → PaymentOutcome`；调用前已停止、非法输入或 busy 不发通知。各路最终结果含义以中文语义表及恢复/时间规则为准。

### 凭据恢复与再次调用

SDK SHALL 在收到明确身份/会话错误时结束当前调用，先设置 ended、清理本地等待和活动记录，再交付一次结果。pay/observe 的三类中断结果 MUST 携带 interruptedPhase、原交易引用及已知 paymentNo，并保留已有渠道信号和最后可信快照；该字段描述本次错误位置，不代表交易账务状态。独立 query 返回 PortResult 错误，调用方已知其处于查询阶段。SDK MUST 不自动登录、刷新凭据、重放支付或等待外部恢复后继续原 Promise。

| 中断位置与原因 | 业务恢复动作 | 恢复后的 SDK 入口与服务端行为 |
| --- | --- | --- |
| prepare：业务 Access Token 缺失/失效 | 恢复同账号业务 Token，更新 getter 数据源 | 以原 tradeNo/method 显式 pay，从 CreateTradePay 重新请求；SDK 不调用 CreateTrade，不将 Token 更新当成签名失效或强制换单指令 |
| query：业务 Access Token 缺失/失效，包括渠道已成功但查单鉴权失败 | 恢复同账号业务 Token，更新 getter 数据源 | 对原 tradeNo 显式 query/observe，仅调用 QueryTrade；禁止重新 CreateTradePay/invoke。已确认 PAID 不再发起支付；仅有 success_hint/unknown 时也先查原交易 |
| prepare：缺少微信身份绑定 | 业务完成对应身份建立，服务端可按同一业务用户/appId 查到身份 | 原 tradeNo/method 显式 pay，由服务端执行支付准备 |
| prepare/invoke：明确渠道 Session Key 失效、旧用户态签名不可用 | 业务完成渠道登录及服务端会话更新；只更新业务 Token 不算恢复渠道会话 | 原 tradeNo/method、相同 appId 显式 pay，再次 CreateTradePay；SDK 校验并使用本次响应的完整有效参数再 invoke；服务端决定支付单复用、续用或新建，SDK 不重放旧 PreparedPayment |
| query：服务端报告其他身份/会话错误 | 按精确错误恢复相应身份/会话 | 仍仅 query/observe 原 tradeNo；处于结果确认阶段不能以任何登录态更新为由重新下支付单 |

“重新下支付单”指以同一 tradeNo + channel + appId 再次请求 CreateTradePay，开启新的 SDK 执行流程，不重新创建业务订单或交易。payment_no 是否变化、渠道单号是否复用及重新签名由服务端处理；SDK 不保存支付历史、不比较前后单号或全部签名字段、不设置 forceNew。有效 PREPAID 可复用 payment_no/outTradeNo/signData/paySig，signature 由服务端以当次 session_key 代签；SDK 只使用本次响应的参数，不缓存旧 PreparedPayment 直接调渠道。Task 3/7/8 分别验证协议消费、连续调用和真实渠道证据。

服务端内部 RPC 在中途失败时，SDK 根据公开错误及当前阶段执行同一矩阵；Unauthorized 不证明服务端没有副作用。CHANNEL_SESSION_REQUIRED 必须来自明确会话失效语义，网络错误、一般签名错误或未知回调不能被推断成该类错误。查询中断不清除渠道结果，也不推断未支付。

服务端负责可能产生的冗余、无效支付单，一期保留、二期按服务端计划自动关单；SDK 不依赖每次恢复一定产生或一定不产生冗余单。业务 Token 失效或查询中断不能将已支付/结果未知的支付单标记为无效；SDK 不关单、不退款，也不等待二期关单能力才能实施。

宿主负责保管交易引用和恢复所需的业务上下文；进程退出后从业务订单入口找回 tradeNo，先 query/observe 原交易，不能假定旧 Promise 或支付结果仍在内存。显式再次付款是新的 pay 调用，是否可付款由服务端事实裁决。SDK 本地停止不等于支付失败：invoke 无回调时只在宿主显式 cancellation 后返回 stopped、释放活动记录并忽略旧回调；不根据界面关闭或等待时长自动结束。

### 时间配置与阶段边界

| 范围 | 默认值及规则 | 依据 |
| --- | --- | --- |
| 单次 prepare/query 请求 | 60000 ms；包含 getAccessToken 等待，发送前扣除已耗时 | IDL 支持 rpc.timeout_ms，但两个支付 HTTP 方法未配置；现有小程序透传可选 timeout，wx.request 默认 60000 ms。此值是 SDK 配置默认值 |
| 结果查询间隔 | 3000 ms；首次立即查询，后续在上一请求结束后等待间隔；不重叠查询 | 支付基建技术方案 §9.11.3 |
| 结果确认总时长 | 60000 ms；pay 在渠道返回 success_hint/unknown 后起算，observe 在调用时起算 | 服务端方案的支付后查单窗口；SDK 允许初始化及单次覆盖 |
| 原生收银台等待 | 不设置 SDK 本地上限，不使用查询预算或 trade.expire_time 截断 | 无回调时持续等待，不因等待较久自动查询或再次支付；宿主显式 cancellation 只结束本地等待 |
| 交易支付有效期 | 服务端 expire_time 是毫秒时间戳；SDK 不提供覆盖项、不合成 CLOSED | 服务端方案默认 30 分钟、预下单要求余量大于 5 分钟，均由服务端管理；本地超时不保证渠道关闭 |

observe 内每次请求截止为 min(当前时间 + requestTimeoutMs, 结果确认截止)，provider 及 HTTP 共用这次截止。到期不再发送查询；已接收到的 PAID/CLOSED 在同一处理回合优先，交付后迟到结果不再改变结果。应用挂起时不承诺定时器执行；恢复执行时先检查结果确认截止，不补发漏掉的轮询。收银台期间前后台切换不会启动查询计时或推断支付结束。

交易有效期不能推导渠道回调的最晚时刻，也不能保证用户关闭界面后 SDK 一定收到回调。过期未支付交易的处置、关单及渠道期限协调属于服务端职责；当前 IDL 的 TradeStatus.CLOSED 标注“二期，一期不写入”。SDK 按服务端实际返回处理：PAYING 保留待确认事实，PAID/CLOSED 按终态处理；不以 SDK 计时弥补关单能力，也不将服务端关单建设列为 SDK 设计待决项或实施前提。

来源：[支付基建技术方案](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f)，已核对 revision 406 的 §9.2/§9.11.3；[wx.request](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html)；当前小程序 packages/app/src/shared/transport/protoHttp.ts:158、packages/app/src/shared/utils/request.ts:32 及 packages/app/src/app.config.ts。服务端 RPC 5 秒／网关至少 6 秒的预算不等于客户端 HTTP 超时。

### 结果与生命周期不变量

- source=unavailable 时 state 必须 UNKNOWN；observedAtMs 是 SDK 获取快照的时间，不能伪装成服务端事件时间。
- reason=confirmed 仅对应服务端 PAID/CLOSED；CLOSED 不是首期必定产生的状态。准备成功不能合成已知交易状态。
- 仅 reason=action_required 可以携带 nextAction，且该原因必须有 nextAction；动作不是支付成功。首期真实适配器只返回信号，动作分支用内部假适配器验证。
- auth_required、identity_required、channel_session_required 分别对应同名语义的错误码；busy/unsupported 同样提供对应 error。stopped 只停止等待，不附加关单承诺。
- 三类身份/会话结果的 interruptedPhase 与实际出错阶段一致。prepare 未调渠道时 channelSignal=not_invoked；invoke 明确会话失效时为 launch_failed，但 reason 必须为 channel_session_required；query 中断保留已有渠道信号。stopped 不伪造渠道取消，未收到有效渠道结果时保留 not_invoked（尚未调用）或 unknown（已调用但结果未知）。
- success_hint 或已返回的 unknown 信号后启动结果确认预算并查询；cancelled/launch_failed 本次直接结束。渠道明确会话失效应映射 CHANNEL_SESSION_REQUIRED，结束本次 pay；业务恢复渠道会话后，以同一 tradeNo/channel/appId 显式 pay，使用本次响应的完整有效参数。无回调不是 unknown 回调，不由查询计时器结束原生调用。
- maxWaitMs 只覆盖结果确认阶段；prepare 和独立 query 各使用单次请求预算，invoke 无本地 deadline。超时不表示服务端回滚、交易关闭或未扣款。
- 查询 PAID/CLOSED 结束；CREATED/PAYING/UNKNOWN 按间隔继续；网络错误及 backend 用内部 cause=query_unavailable 明确标识的已确认可恢复 QueryTradeUnavailable 只在剩余预算内按间隔重查；不能仅凭公开 retryable=true 重查未知或其他业务错误。协议及其他非身份类确定错误结束观察；鉴权、身份、会话中断保留事实并结束观察，interruptedPhase=query；恢复后仍只 query/observe 原交易，不重新调起支付。
- 服务端返回终态时先处理终态再判断本次期限；已结束运行的迟到结果始终无效。诊断与阶段回调异常隔离；仅约定的两个公开边界触发 onPhase，不公开其他内部状态变化。
- retryable 只保留服务端事实，不授权自动重放 prepare、业务下单或渠道调用。完整状态表见 design 的 Full payment execution and recovery。

## 内部端口提案（不属于公共初始化 API）

以下端口供工程内部装配、独立模块测试使用，不从 SDK 的公共入口导出；内部 createCoreClient 接受支付端口，生产 createPaymentClient 自行构造依赖。PaymentBackend、BackendResult、ChannelAdapter、RuntimePort、DeviceInfoPort、PaymentError 与 PortResult 由 @daqian/payment-sdk 维护；HttpPort、HttpRequest/Response、OperationContext、Cancellation、CommunicationError/Result 由 @daqian/payment-protocol 维护。协议包根 exports 导出通信客户端、createWechatMiniappHttp(): HttpPort 和这些通信类型供 SDK 消费，禁止引用 SDK 的支付类型。代码注释中的 payment-sdk/payment-protocol 表示 packages/ 下的目录名，跨包 import 使用完整 npm 名称。

### 协议包微信网络工厂的生产导出

@daqian/payment-protocol 的现有根入口 SHALL 具名导出 createWechatMiniappHttp(): HttpPort；实现唯一归属 src/adapters/network/wechat-miniapp.ts，由 src/index.ts 显式重导出。该零参数工厂只创建既有网络端口，模块加载和工厂创建 MUST 不读取 wx 或发送请求；实际 send 按既有预算、取消及通信结果契约调用 wx.request。中文 JSDoc 说明用途、返回值、平台读取时机及无登录/重放职责，声明构建保留说明。

生产 createPaymentClient 从协议包根入口取得工厂，将创建的 HttpPort 注入 createProtocolClient 的 http 字段；不跨包读取源码路径、不使用测试别名、不另写 HTTP 实现。协议包的具名导出供 SDK 内部依赖装配和仓库验证使用，不加入 @daqian/payment-sdk 根导出，也不新增 PaymentClientOptions 的 http/request 配置；业务接入方式不变。首期不导出浏览器网络工厂或新增平台子入口。

现有 package exports["."] 的 import/require 及各自 types SHALL 均包含该工厂，继续复用根 Vite entry 和 dist 发布清单；generated 子入口不变，testing/Shadow/平台测试替身不进入生产依赖图或 tarball。根入口在没有 wx 的 Node 环境中可安全 import/require 并创建端口，这只验证加载安全，不声明 Node 或浏览器为真实支持平台。

Task 2 交付根导出、类型/加载单测、构建后的双格式入口验证与协议 AGENTS；Task 6 通过已构建协议包根入口的同一工厂及真实执行器，在开发者工具中走真实 wx.request → Shadow，不由测试宿主重写 HttpPort 或替换 SDK 自带适配器。Node 的外部网络替身继续遵循原测试边界。Task 7 自动装配并验证实际 tarball 的双格式/声明，Task 8 汇总全量平台证据；Task 6 的最小协议贯通不依赖 Task 7 尚未交付的 SDK 公共工厂。

```ts
// payment-protocol/src/ports/context.ts
type Cancellation = Readonly<{
  isStopped: () => boolean;
  subscribe: (listener: () => void) => () => void;
}>;
type OperationContext = Readonly<{
  deadlineAtMs: number;
  cancellation?: Cancellation;
}>;
// payment-protocol/src/ports/http.ts
type HttpRequest = Readonly<{
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs: number;
  cancellation?: Cancellation;
}>;
type HttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
}>;
interface HttpPort {
  send(request: HttpRequest): Promise<CommunicationResult<HttpResponse>>;
}
// payment-protocol/src/transport/errors.ts
type CommunicationError = Readonly<{
  code: 'EMPTY_ACCESS_TOKEN' | 'HOST_CONTEXT_ERROR' | 'NETWORK_ERROR'
    | 'TIMEOUT' | 'CANCELLED' | 'CODEC_ERROR';
  originalCode?: string;
  http?: HttpResponse;
}>;
type CommunicationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: CommunicationError }>;
// payment-protocol/src/client.ts
// RpcMethodMeta 直接 import 自 generated/std，不在手写代码中重建。
type ProtocolClientOptions = Readonly<{
  gatewayBaseUrl: string;
  getAccessToken: () => string | null | Promise<string | null>;
  requestContext?: Readonly<{ productId?: string; lane?: string; appVersion?: string }>;
  http: HttpPort;
  runtime: Readonly<{
    nowMs: () => number;
    nextRequestId: () => string;
    sleepMs: (durationMs: number, cancellation?: Cancellation) => Promise<void>;
  }>;
}>;
type DecodedHttpResponse<T> = Readonly<{
  data: T;
  wire: Readonly<Record<string, unknown>>; // 本次已解析 JSON，仅供边界/presence 校验
  http: HttpResponse;
}>;
interface ProtocolClient {
  request<Req, Resp>(
    meta: RpcMethodMeta<Req, Resp>,
    request: Req,
    context: OperationContext,
  ): Promise<CommunicationResult<DecodedHttpResponse<Resp>>>;
}
declare function createProtocolClient(options: ProtocolClientOptions): ProtocolClient;
// payment-sdk：只 import 上述通信类型；下列支付端口由 SDK 拥有。
type ChannelContext = Readonly<{
  attemptId: string;
  cancellation?: Cancellation;
  /** 核心同步通知点：适配器校验通过后调用；false 表示已停止，禁止实际平台调用。 */
  beforeInvoke: () => boolean;
  /** 紧邻实际平台调用前同步登记；true 仅返回一次，false 时禁止调用。不是业务阶段通知。 */
  markInvoked: () => boolean;
}>;
interface DeviceInfoPort {
  clientPlatform(): 'ios' | 'android' | 'harmony' | 'unknown';
}
// SDK 内部渠道调用模型，不是手写 wire DTO，不从公共入口导出。
type ChannelPaymentParams = Readonly<{
  kind: 'wechat_virtual';
  mode: 'short_series_goods';
  signData: string;
  paySig: string;
  signature: string;
}>;
type PreparedPayment = Readonly<{
  reference: TradeReference;
  paymentNo: string;
  method: string;
  payParams: ChannelPaymentParams;
  expiresAtMs?: number;
}>;
/** SDK 内部适配结果；业务恢复标签与通信取消都不得泄漏到公开结果。 */
type BackendResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: PaymentError;
      /** 本次 QueryTrade 精确命中已确认可恢复的错误，仅由 backend 赋值。 */
      cause?: 'query_unavailable';
    }>
  | Readonly<{ ok: false; cancelled: true }>;
interface PaymentBackend {
  prepare(request: PaymentRequest, context: OperationContext): Promise<BackendResult<PreparedPayment>>;
  query(reference: TradeReference, context: OperationContext): Promise<BackendResult<TradeSnapshot>>;
}
type ChannelInvocation =
  | Readonly<{ kind: 'signal'; signal: ChannelSignal }>
  | Readonly<{ kind: 'action'; action: PaymentAction }>
  | Readonly<{ kind: 'stopped' }>; // 本地停止，不是渠道取消或渠道 abort
interface ChannelAdapter {
  readonly method: string;
  available(): boolean;
  invoke(payment: PreparedPayment, context: ChannelContext): Promise<PortResult<ChannelInvocation>>;
}
interface RuntimePort {
  nowMs(): number;
  nextAttemptId(): string;
  nextRequestId(): string;
  sleepMs(durationMs: number, cancellation?: Cancellation): Promise<void>;
}
```

HttpPort 不解析业务状态；HTTP 非 2xx 仍成功返回 HttpResponse，平台传输失败、超时或取消分别返回对应通信错误。ProtocolClient 的 ok 仅表示可解码的通信结果，非 2xx 或 BaseResp 业务失败仍交 SDK 基建适配器裁决；解码失败返回 CODEC_ERROR 并保留 http。body 若为文本由通信执行器解析为 ProtoJSON，再交 generated codec；禁止 raw bigint 穿过该边界。通信执行器等 provider 返回后重新计算剩余预算再发送，不能让 provider 消耗的时间逃出总预算。

SDK 工厂在实例内装配 ProtocolClient 的网络端口、静态配置、Token getter、时钟与请求 ID 工具；业务方不注入这些完整内部组件。基建适配器调用 request(CreateTradePay.meta, request, context) 或 QueryTrade.meta，不调用依赖全局 handler 的生成函数。RpcMethodMeta 及 codec 类型已在当前小程序 generated/std.ts 核对；支付 Profile 必须提供这些能力，缺失交 ProtoGen 维护方处理。

SDK 基建适配器消费 decoded 响应、wire 和 HTTP 上下文，统一返回内部 BackendResult，通常分支沿用 PortResult/PaymentError：EMPTY_ACCESS_TOKEN → AUTH_REQUIRED，HOST_CONTEXT_ERROR/NETWORK_ERROR/TIMEOUT 保留对应 SDK 分类；CODEC_ERROR 带非 2xx http 时先按下方 HTTP 规则处理，其余为 PROTOCOL_ERROR。通信 CANCELLED 统一返回 { ok: false, cancelled: true }，不附加 PaymentError，不在 backend 伪造 TIMEOUT 或渠道取消。核心按下方“通信取消与运行结束的归属”处理。中途身份失效按恢复矩阵交付，服务端内部 RPC 错误也使用同一公开错误映射。wire/http 只用于本次内部判错，不得整包输出到诊断。

### 已确认的查询恢复语义与公开结果投影

BackendResult 的失败分支可带内部 cause='query_unavailable'，它表示本次 QueryTrade 精确命中已确认可恢复的服务端错误。生产代码仅由 SDK 的 payment-infra/backend 赋值，不在 PaymentError 上加字段，不由协议包、业务方或核心依据原码重新推断。核心不导入业务错误目录、不复制 bigint 数值、不解析 originalCode、canonical、文案或码位段来判定重查。

backend 先执行本文既定 HTTP/BaseResp 判定顺序，再以“本次操作为 query + 业务权威 status_code 精确等于 paymentBusinessErrors.ErrInfraTradeQueryTradeUnavailable.statusCode + 同一锁定 IDL 描述 retryable=true”判定标签。三个条件全部满足才给失败结果添加 cause；prepare、未知码、其他方法错误、HTTP 401、无有效业务码的 HTTP 错误以及通信/协议错误均不添加。HTTP 非 2xx 若按既有判定得到有效非零的该业务码，也按上述规则；401 仍优先鉴权失败。结构化 error 的冲突字段仅按既有规则诊断，不能覆盖 status_code 或 IDL 描述，不能用 wire.retryable=true 为未知码添加标签。

| backend 的输入与操作 | 内部失败结果 | pay/observe 核心行为 |
| --- | --- | --- |
| query：已确认可恢复的 QueryTradeUnavailable | error 仍为 SERVER_ERROR/source=gateway，按 IDL 保留原码和 retryable=true；cause=query_unavailable | 在剩余观察预算内按 intervalMs 重查；不重置总预算、不再次 prepare/invoke |
| query：未知非零码且结构化 retryable=true，或返回 CreateTradePayUnavailable 等其他错误 | error 按既有规则保留 SERVER_ERROR/原码/重试提示；无 cause | 不因 retryable 提示重查；按已有确定错误路径结束并保留最后可信快照 |
| prepare：任何错误，包括两种 Unavailable | error 按既有规则保留；无 cause | 结束本次 pay；不重放 prepare 或渠道调用 |
| query：网络错误或 TIMEOUT | 不添加该业务 cause | 网络错误与单次超时仍按既定剩余预算规则处理；停止/总截止仍优先，不依赖该标签 |

观察核心仅在失败结果同时满足 cause=query_unavailable、error.code=SERVER_ERROR、error.source=gateway、error.retryable=true 时采用上述业务重查分支。标签缺失或与这些字段不一致时，不凭原码补标签、不对 SERVER_ERROR 重查，沿用既有错误结束路径。该约束同时适用于内部假端口；测试需显式表达已确认语义，不能用同一个无标签 SERVER_ERROR 冒充两种分支。retryable 字段继续对外保留，但不是独立的自动重试授权。

独立 PaymentClient.query 无论是否有标签均只查询一次。core/client.ts 从 BackendResult 显式构造公开 PortResult，成功取 value，普通失败按公共 PaymentError 字段 code/source/message/originalCode?/retryable?/channelMessage? 投影，不直接返回内部失败对象或展开内部对象。pay/observe 的 PaymentOutcome.error 使用相同的公共字段投影；内部 cause 不加入 Outcome、阶段事件、公开错误、诊断载荷或 SDK 根 exports。message 由 SDK 按稳定错误分类提供中文默认文案；channelMessage 只保留渠道 errMsg 的字符串值，缺失、null、非字符串时省略，且不参与分类、状态机、查单、恢复、重试或重放，也不进入诊断或日志。既有 cancelled 分支仍按“通信取消与运行结束的归属”处理，不能作为公共结果直接返回。类型兼容不证明运行时字段已剥离，测试必须检查实际对象键。

Task 3 修改 ports/backend.ts 与 backend 映射并验证正反矩阵；若此前已完成该任务，同步后只对受影响的内部接口/映射补充实现与完整回归/评审，再恢复其完成状态，不重做已验收的其他模块。Task 4 覆盖有标签/无标签同类公开错误的不同处置、预算/停止优先、无重放及公开投影；Task 7 从真实装配公开入口验证 CONTRACT-026 五个 case，Task 6 纳入场景分母，Task 8 汇总全部证据。

### 渠道实际调用标记

ChannelContext.markInvoked SHALL 是核心提供的内部同步方法，类型为 () => boolean；不增加公共 API、阶段或 PaymentOutcome 字段。beforeInvoke 只负责 channel_invoking 通知及通知后的准入，不能证明平台 API 已调用。适配器的本地变量或异步 kind=stopped 返回不能代替此同步标记，因为核心可能先收到宿主停止并交付最终结果。

适配器完成参数/能力检查和调用参数准备后，按 beforeInvoke → 第二次 cancellation 检查 → markInvoked → 实际平台 API 的顺序执行。任一准入返回 false 或停止检查命中时，返回 kind=stopped，平台调用次数为零。markInvoked 返回 true 到平台调用之间 MUST 无 await、业务通知、额外停止检查或其他可重入外部调用；方法获取和参数准备在此之前完成，紧接着执行已取得的平台方法。同步平台方法抛错仍按既有渠道调起失败处理，不恢复为 not_invoked；标记只说明已进入本地调用步骤，不保证收银台展示、渠道接受或支付成功。

核心以本次运行的局部状态保存 beforeInvoke 成功准入与 invoked 标记。markInvoked 只有在本次 invoke 阶段、beforeInvoke 已成功返回 true、运行仍活动且尚未标记时才接受；先复查停止，随后同步置位并将初始 channelSignal 从 not_invoked 改为 unknown，返回 true。未通知/未准入、重复、已停止、已进入 confirming 或旧运行的标记返回 false，不发通知、不改信号/结果、不影响新运行；省略 onPhase 监听仍正常准入和标记。已经标记后再次 beforeInvoke 返回 false，不给重复平台调用许可。

停止与渠道结果继续使用既有一次结束规则：未标记时停止交付 stopped/not_invoked；已标记且未接纳有效渠道结果时停止交付 stopped/unknown；已接纳有效结果则保留该信号，不被迟到标记覆盖。公开 query/observe、action_required 的无平台动作不使用标记。内部假渠道执行实际调用分支时同样调用 markInvoked，不能仅调用 beforeInvoke 就伪装已调用；E2E 仍通过真实 SDK 渠道适配器，只替换平台 API，不伪造此内部标记。

验收将“通知内停止”“beforeInvoke 返回 true 后第二次停止检查命中”“实际平台调用后停止”分别运行，断言平台次数为 0/0/1，对应信号为 not_invoked/not_invoked/unknown，全部查询次数为零、结果一次。另验证标记重复/迟到、停止先于 adapter Promise 返回、正常成功/失败回调以及省略监听不受影响。Task 4 交付内部类型与核心标记/就近单测，Task 5 交付真实适配器顺序与停止边界，Task 6/7/8 按 CORE-019 和 FLOW-007 的固定 case 交付场景、公开连续流程及报告；不新增协议包能力。

### 通信取消与运行结束的归属

BackendResult 仅位于 SDK 内部 ports/backend.ts，不从 SDK 公共入口导出；公共 PortResult、PaymentError 和 PaymentClient.query(reference) 签名保持不变。backend.prepare/query 无论通过真实通信执行器或模块假端口收到 CANCELLED，都立即返回 cancelled 变体，不等待核心结算、不吞掉该结果、不将它归为 TIMEOUT。协议原生 TIMEOUT 仍按既有错误映射返回，二者分别测试。

核心分别维护整次运行的 ended/结束原因和每次请求的完成闩锁。宿主停止、prepare 请求到期或观察总预算耗尽时，先锁定运行结束原因；独立 query 到期则锁定该次调用结果，再清理并尽力取消请求、交付原有公共结果。观察中仅单次查询请求到期且总预算尚有余量时，只锁定该请求的完成结果为 TIMEOUT，取消并清理该请求，再按 intervalMs 重查，不设置整次 pay/observe 的 ended。每次重查使用新的请求上下文；旧请求完成之后的取消/响应不得进入后续请求或更新快照。消费 BackendResult 时先检查运行 ended 和所属请求是否已完成，再在访问 error/value 前识别 cancelled 变体。处理规则如下：

| 核心接收时的情况 | 处理及公共结果 |
| --- | --- |
| 运行已经结束，或结果所属的旧请求已完成 | 忽略 cancelled 或其他迟到结果，不再次交付、不改变 ended 原因，不污染正在进行的新请求 |
| 运行仍活动，原始 RunOptions.cancellation 已停止 | 按宿主停止结束 pay/observe：reason=stopped，保留最后快照/渠道信号，不附加伪造的 TIMEOUT/CHANNEL_ERROR |
| 未有宿主停止，prepare 请求预算或观察总预算已耗尽 | 结束整次 pay/observe，reason=timed_out；核心判定的预算耗尽为 TIMEOUT/source=sdk，保持最后快照与渠道信号 |
| 独立 query 请求预算已耗尽 | 返回公共 PortResult 的 TIMEOUT/source=sdk，不产生 stopped 或 PaymentOutcome |
| 观察总预算仍有余量，但当前查询请求 deadline 已到 | 只将该请求归为 TIMEOUT/source=sdk，按既有观察重试规则等待 intervalMs 后重查；不结束整次运行、不交付中间结果、不重置总预算。等待结束时再检查剩余预算，不在总截止之后补发 |
| 两者均无，内部端口异常返回 cancelled | 归为 NETWORK_ERROR/source=network，originalCode=CANCELLED，进入既有网络错误处理；不得假设宿主停止、预算到期或渠道取消。独立 query 同样返回该 PortResult 错误，不泄漏内部变体 |

已锁定的运行结束原因或请求完成结果始终优先；请求已完成但运行仍活动时，后续宿主停止仍可结束整次观察。活动运行兜底时若原始停止信号和到期同时可见，按表中顺序先处理宿主停止；观察总截止与单次请求截止同时到达时结束整个观察。用于尽力取消底层的内部信号不能冒充原始 RunOptions.cancellation。已接纳响应与计时/停止的既有先处理者规则保持不变，尤其不以取消结果覆盖已结束的 PAID/CLOSED。

Task 3 的 backend 单测必须独立断言 CANCELLED→cancelled、TIMEOUT→TIMEOUT，不能因为 Task 4 另有停止竞争就删除适配器分支测试。Task 4 用假端口覆盖全部上表分支、停止/到期先后、超时取消的同步与迟到返回；特别验证 requestTimeoutMs=5000、maxWaitMs=60000 时首笔查单到期后按 intervalMs 重查，后续 PAID 正常确认，旧请求的取消/迟到结果无效。协议返回 TIMEOUT 与核心请求计时到期均走这一重查规则。Task 7 从公开 pay/query/observe 验证 TC-PAYSDK-CONTRACT-025 六个 case。cancelled 变体仅作为内部控制结果，不增加公共错误码、回调、resume 或业务接入参数。

支付基建适配器从 generated PayParams 读取 oneof，按下表唯一映射为 SDK 拥有的 ChannelPaymentParams；核心只传递该模型，不读渠道字段。ChannelAdapter 校验内部 method/kind 与必要字段后，经 ChannelContext.beforeInvoke 通知、停止复查及 markInvoked 同步准入，将四个调用字段传给 wx.requestVirtualPayment，不传 kind，不重新解码 wire 或解析外层 JSON string。signData 原始字符串必须保留。正常调用在渠道回调后结算；ChannelContext 不含 HTTP 或查询截止，SDK 不设置渠道回调时限。ChannelContext 透传 RunOptions.cancellation：调用前已停止则不调渠道；等待中停止返回 kind=stopped，解除本地取消订阅并隔离后续平台回调，核心交付 stopped 并释放活动记录。正常回调与停止竞争时仅第一个被处理的事件生效；清理引用不等于平台一定释放其回调，迟到回调不得再查单、通知或影响新运行。不调用不存在的渠道 abort，也不从 onHide/onShow 推断宿主已停止。

## 已核对的服务端边界

核验日期：2026-09-09。接口基线为 IDL `4e5cb22659fd4f4c36d06ae81256dc1c43e691d9`（feat/esm-v1.4）；在 `/Users/liyongning/Projects/workspace/dev/idl` fetch 后按 commit 读取，本地旧 HEAD 未切换。既有支付/恢复流程的历史实现参照为 infra-trade `36b636c02afb0a31447b52f83fea922120e08666`、infra-pay `f5b03ba5d4010d213cdfe779e7d331319997d409`；网关基线见下方请求字段节。历史实现参照不证明已支持本次新增字段；xpay_env 的事实以本次 IDL 原文为准。以上为契约与源码核验，不代表线上部署或真实支付通过。

| 入口/字段 | 已核对事实 | SDK 处理/证据 |
| --- | --- | --- |
| CreateTrade | 内部 RPC；业务后端创建交易和子单，返回 trade_no、order_nos、status | SDK 不调用；IDL infra/trade/v1/trade.proto 的 CreateTrade 定义 |
| CreateTradePay | POST /api/base/trade/pay；已有 trade_no、channel、app_id，可选 xpay_env，身份来自 metadata | backend.prepare；入口及字段由锁定 trade.proto 生成 |
| xpay_env | CreateTradePayRequest 字段 7 与内部 PrepayRequest 字段 15 共用 infra.pay.v1.XpayEnv；optional，已设置时只允许 SANDBOX/PROD | SDK 仅调用 CreateTradePay；三态与部署规则见上表，不调用 Prepay |
| prepare 响应 | trade_no、payment_no、channel、结构化 PayParams、expire_time、base_resp | 先判错再校验关联和分支；trade.proto 的 CreateTradePayResponse |
| QueryTrade | POST /api/base/trade/query；sync_channel 一期忽略，只查询本地交易事实 | SDK 只用 tradeNo；trade.proto 的 QueryTradeRequest/QueryTrade；不将其描述为强制渠道对账 |
| TradeStatus | CREATED/PAYING/PAID/CLOSED；一期不写 CLOSED，过期仍可能 PAYING | 只根据查询结果报告事实，不用期限制造关单 |
| 重复 prepare | 同 trade_no/channel/app_id；服务端决定复用、续用、新建或 Conflict | SDK 普通再次请求，不要求 payment_no 变化；pay 的 payment_domain_service.go:215–245 |
| 渠道与参数 | MINI_JSAPI=1、OA_JSAPI=2 共用 wechat_jsapi；NATIVE=3 用 wechat_native；VIRTUAL=4 用 wechat_virtual | oneof 决定参数形状，channel 决定调用方式；首期仅 VIRTUAL；pay.proto 的 Channel/PayParams |
| 内部 QueryPayment / SignWithSessionKey | 无公开 HTTP；签名接受 sign_data 原文 | SDK 不调用内部 RPC，不接收 session_key |
| BaseResp | status_code 是业务权威；success 冗余；error/status_msg 条件返回 | base.proto 的 BaseResp；按下方判定顺序归一 |
| 时间与 int64 | HTTP 输出 int64 为十进制字符串，枚举为名称，键为 lowerCamelCase | 由 generated codec 编解码；时间转 number 时检查安全整数 |
| 业务 SKU/下单/权益 | 不由通用交易状态提供 | 业务 change 独立维护，不合成权益字段 |

来源：[IDL 交易契约](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/4e5cb22659fd4f4c36d06ae81256dc1c43e691d9/infra/trade/v1/trade.proto)、[支付参数 oneof](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/4e5cb22659fd4f4c36d06ae81256dc1c43e691d9/infra/pay/v1/pay.proto)、[BaseResp](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/4e5cb22659fd4f4c36d06ae81256dc1c43e691d9/base.proto)、[支付单决策](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/domain_service/payment_domain_service.go)。表格描述消费边界，不作为手写 DTO/endpoint 的来源。

### 结构化支付参数与渠道映射

CreateTradePayResponse.pay_params 为 infra.pay.v1.PayParams message；外层 SHALL 不按字符串 JSON 解析。generated oneof 的 TypeScript 表达及字段访问方式由 ProtoGen 产物决定，不手写第二套 wire 类型。支付基建适配器校验请求与响应 channel 一致，且 pay_params 非 null、恰好选择该渠道分支；失败响应的 null/默认字段必须先按 BaseResp 处理，不能误判为成功或抢先覆盖业务错误。

| IDL 字段 | ProtoJSON 位置 | SDK 内部模型及微信调用位置 | 校验 |
| --- | --- | --- | --- |
| wechat_virtual.sign_data | payParams.wechatVirtual.signData | payParams.signData → signData | 非空 string，逐字保留，不 trim、不 JSON.parse/stringify |
| wechat_virtual.pay_sig | payParams.wechatVirtual.paySig | payParams.paySig → paySig | 非空 string，原样传递 |
| wechat_virtual.signature | payParams.wechatVirtual.signature | payParams.signature → signature | 非空 string，使用本次响应的值 |
| wechat_virtual.mode | payParams.wechatVirtual.mode | payParams.mode → mode | 必须等于 short_series_goods |

内部 kind=wechat_virtual 由已校验的 oneof 生成，不发给渠道。mode 同时存在于服务端签名原文和上述调用字段，SDK 使用调用字段，不解析或搬移 signData 内的 mode，也不在客户端校验/重签其内部内容。服务端 SignData/PaySig 落库，同一有效 PREPAID 可以复用；signature 按当次 session_key 代签。SDK 不要求四个字段全部改变。

缺字段、空值、旧外层 string、未知/多分支、channel 与分支不匹配或未知 mode 均返回 PROTOCOL_ERROR，不调用渠道。generated codec 丢弃/归一字段之前可能丢失的 presence、原始字段类型或多分支信息，用本次 wire 作补充校验；不得因 codec 默认值而接受缺失信封。此校验只守消费边界，不重写 ProtoJSON codec。未来渠道扩展须新增 SDK 内部调用模型、映射及测试；当前生成类型中存在 JSAPI/Native 不表示 SDK 已支持它们。

实现依据：[virtual BuildPayParams](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/channel/wechatvirtual/adapter.go)、[签名模板](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/channel/wechatvirtual/sign.go)。首期虚拟支付在 CreateTradePay 阶段只创建本地支付记录及签名，渠道下单发生于 wx.requestVirtualPayment；SDK 仍不凭一般 Unauthorized/网络失败推断服务端无副作用。

### HTTP、信封与业务结果的判定顺序

以下为 SDK 消费策略。服务端 status_code 的权威性适用于有效业务信封，不能把 HTTP 失败、不可解码内容或缺字段经 codec 补出的 0 当作成功。 本基线 base.proto 已将错误码注释更正为 14 位、Method 段 3 位；字段和数值契约未因此改变。SDK 按完整错误码副本匹配，不按旧注释的位数自行切片解析。

1. 先处理本地取消、超时、provider 和平台传输错误。没有 HTTP 响应时不猜测业务状态。
2. HTTP 401 映射 AUTH_REQUIRED。其他非 2xx：若可正常解码且有有效、非零 BaseResp.status_code，按 IDL 错误码副本归一；否则 SERVER_ERROR（source=gateway）。HTTP 403 不自动推断 Token 过期，非 2xx + status_code=0 也不能进入成功分支。无业务码时 originalCode 记录 HTTP 状态，不记录响应原文。
3. 对 2xx 响应，根必须为对象，baseResp 必须非 null，statusCode 必须实际存在、非 null 且可无损解为 int64。缺失/非法、文本不可解析或 codec 失败为 PROTOCOL_ERROR。标准返回是十进制字符串；若 generated codec 接受 ProtoJSON 的安全整数数字形式，可正常消费；不允许不安全 number、布尔值或对象被隐式转换为成功码。presence 从 wire 检查，值由 generated codec 解码。
4. status_code≠0 时，按该数值对应的 IDL 错误标识归一；success=true、error.biz_code/canonical 冲突不能覆盖它。status_code=0 时继续业务响应校验。success 缺失/矛盾，或 error/status_msg 与状态码条件矛盾，记录 phase=response-envelope-inconsistent 的脱敏诊断，不改判 status_code。错误详情缺失时仍能按状态码返回错误；不能从文案识别登录态。
5. 错误 retryable 优先使用该状态码在 IDL 副本中的错误描述；无描述时只采纳与状态码一致的结构化 error.retryable，否则不提供。未知非零码返回 SERVER_ERROR 并保留原码。retryable 不授权 SDK 自动重放 prepare。
6. 业务成功后，prepare 继续校验交易引用、payment_no、channel、oneof、必要参数与毫秒值；query 校验返回交易引用、快照结构与时间，未知交易状态映射 UNKNOWN。只有有效 QueryTrade 的 PAID 可表示已支付；CreateTradePay 成功或 Conflict 均不能替代查询。

HTTP body 由通信执行器解析一次，返回 decoded data 与只供内部校验的 wire/http；支付基建适配器负责上述业务判定。error.biz_code 与 status_code 不同等异常只记录状态码/阶段/关联 ID，不输出 error.details、消息原文或支付参数。

### 身份与错误契约

业务完成登录和渠道会话恢复，SDK 只消费其结果。已有绑定时，小程序 GetOpenIDByCode 兑换新的 wx.login code 并刷新服务端 session_key；缺少 uid/OpenID 绑定时，业务取得 Token 后以新的 code 调带鉴权的 BindWxUserIdentity。两者不是 SDK 的自动恢复 API；code 一次性，不可自动重放。SDK 不获取或接收 OpenID/session_key。IDL 的 GetOpenIDByCode 返回 OpenID 供业务登录；Bind 响应不返回 OpenID/session_key，不能混称二者的响应。网关可选鉴权的兼容行为不作为 SDK 登录依赖。来源：[微信身份契约](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/4e5cb22659fd4f4c36d06ae81256dc1c43e691d9/infra/wx/v1/wx.proto)。

下表是 SDK 映射决策，常量取自协议包按 IDL 维护的 TypeScript 副本；所有服务端响应错误 source=gateway，含义为来自服务端通信边界，不断言错误发生在网关进程。渠道 API 直接返回的错误 source=channel。

| IDL 错误标识 | SDK code / reason（pay/observe） |
| --- | --- |
| ErrGatewayProxyUnauthorized、ErrInfraTradeCreateTradePayUnauthorized、ErrInfraTradeQueryTradeUnauthorized | AUTH_REQUIRED / auth_required |
| ErrInfraTradeCreateTradePayWxIdentityNotFound | IDENTITY_REQUIRED / identity_required |
| ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter | CHANNEL_SESSION_REQUIRED / channel_session_required |
| ErrInfraTradeCreateTradePayConflict | CONFLICT / error；不映射 PAID/CLOSED，不自动改渠道或再查单 |
| ErrInfraTradeCreateTradePayChannelUnavailable | UNSUPPORTED / unsupported；不自动替换支付方式 |
| ErrInfraTradeCreateTradePayInvalidParameter、ErrInfraTradeQueryTradeInvalidParameter、ErrGatewayProxyInvalidParameter | INVALID_INPUT / error |
| ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter、ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter | CHANNEL_ERROR / error；保留精确原码，不当 Session Key 失效 |
| ErrInfraTradeCreateTradePayNotFound、ErrInfraTradeQueryTradeNotFound、ErrGatewayProxyNotFound | SERVER_ERROR / error；保留各自原码，不臆造交易状态或新增 NOT_FOUND 公共类型 |
| ErrInfraTradeCreateTradePayUnavailable、ErrInfraTradeQueryTradeUnavailable；其他未识别非零码 | SERVER_ERROR / error；按上述规则保留 retryable/originalCode |

QueryTrade NotFound 同时涵盖“不存在”和“不属于当前用户”，SDK 不区分。身份错误按 interruptedPhase 恢复；查询中断保留原交易、渠道信号和最后可信快照。完整错误输入清单来自 [error_code.go](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/4e5cb22659fd4f4c36d06ae81256dc1c43e691d9/error_code.go) 的两方法及网关错误，不能只覆盖三类身份码。

### 业务错误码的 TypeScript 副本

BaseResp.status_code 在 Proto 中声明为 int64，当前 TypeScript codec 解码为 bigint。具体方法级错误常量以 IDL 根目录 error_code.go 为权威，错误描述以 error_contract.go 的 DescribeErrorCode 为权威；其中同时包含通用错误和业务专用错误。Proto 中已有的 CanonicalErrorCode 等枚举继续使用 generated，不能据此推导完整业务错误码。

通信协议包 SHALL 在 packages/payment-protocol/src/errors/business-codes.ts 手工维护所需 TypeScript 副本，源提交锁定为 `5539be8f09323709fa65f6568efe22896ec35d24`（Consumer 登记版，继承 4e5cb22 的支付语义）。该文件 MUST 位于 generated 外，包含以下 17 项的原始名称、完整 bigint 值，以及 DescribeErrorCode 的 canonicalCode、bizCodeName、source、retryable；中文注释说明场景和来源。副本仅保存服务端事实，SDK code/reason 仍由 SDK 基建适配器唯一映射。原始描述的 source 与 SDK PaymentError.source=gateway 分属不同层次，不能直接覆盖后者。

| IDL 原始名称 | 完整十进制值（TS 使用 bigint） | retryable |
| --- | --- | --- |
| ErrGatewayProxyInvalidParameter | `20200002001010` | false |
| ErrGatewayProxyUnauthorized | `20200002001020` | false |
| ErrGatewayProxyNotFound | `20200002001030` | false |
| ErrInfraTradeCreateTradePayUnauthorized | `10100801002020` | false |
| ErrInfraTradeCreateTradePayNotFound | `10100801002030` | false |
| ErrInfraTradeCreateTradePayChannelUnavailable | `10100801002080` | false |
| ErrInfraTradeCreateTradePayConflict | `10100801002040` | false |
| ErrInfraTradeCreateTradePayInvalidParameter | `10100801002010` | false |
| ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter | `10100801002090` | false |
| ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter | `10100801002100` | false |
| ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter | `10100801002110` | false |
| ErrInfraTradeCreateTradePayWxIdentityNotFound | `10100801002120` | false |
| ErrInfraTradeCreateTradePayUnavailable | `10100801002070` | true |
| ErrInfraTradeQueryTradeUnauthorized | `10100801003020` | false |
| ErrInfraTradeQueryTradeInvalidParameter | `10100801003010` | false |
| ErrInfraTradeQueryTradeNotFound | `10100801003030` | false |
| ErrInfraTradeQueryTradeUnavailable | `10100801003070` | true |

本表为当前版本的核验清单；数值与描述以同一锁定 IDL 原文件为准。副本不另创错误编号，不通过位段计算、文案或 CanonicalErrorCode 代替精确匹配。SDK 所需范围为此 17 项，未来消费范围变更先更新契约；未知非零码保留原码并按 SERVER_ERROR 处理，不因此推断身份恢复。

副本 MUST 按手写源码接受质量检查；生产源码及测试逻辑纳入四项 100% 覆盖要求，不能使用 generated 排除项。IDL 更新时分别核对生成闭包与 Go 错误含义；无关上游变化按下节刷新生成来源并记录差异，保留固定错误事实。确需升级错误事实时先评审，再专门重新取数并同步副本/来源/Fixture/测试。proto:status 的 current 只证明 ProtoGen 管理的输出，不证明副本一致。此项不要求新增 ProtoGen 功能、Go/TS 生产生成器或运行时 Go 依赖；DTO、method metadata、codec、channel/XpayEnv 等既有 Proto 枚举仍由 ProtoGen 管理。

验收使用从锁定原始 Go 常量及 DescribeErrorCode 直接取得的独立样例，不能 import TS 副本后反向生成期望。Task 3 将完整 JSON、来源文件摘要、可复现取数命令及输出摘要保存到 packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-024/，并逐项验证；普通测试重放已核验数据，不要求现场运行 Go 或访问真实服务。IDL lock 更新后按下节验证生成兼容及本次状态；固定 Go 来源不随之改号，禁止只替换版本字符串。

### 生成来源与错误事实来源分别校验

Generated Consumer 的来源与手写错误目录的事实来源 SHALL 分别记录。proto-gen.lock 记录本次从 feat/esm-v1.4 解析的生成来源；常规共同门禁要求项目 ProtoGen 的 proto:status 成功且 current/up_to_date。paymentBusinessErrorsIdlCommit、独立 Go 错误 JSON 及 Go wire Fixture 的来源继续固定 5539be8f09323709fa65f6568efe22896ec35d24；二者不要求提交号相同。每次运行的输入清单仍记录当前 lock 完整摘要用于本次报告 freshness，但不得把该摘要当作固定 Go Fixture 的永久来源约束。

Task 3 在 TC-PAYSDK-CONTRACT-024 的 manifest.sources.generatedCompatibility 记录已验收生成基线，来源为原始 ProtoGen lock/status 证据，不能用当前未校验的 lock 自动覆盖期望。记录 lockVersion、tool.version/projectionVersion、sourceId=payment-idl、consumerId=infra-payment-sdk、contractDigest、完整 projection.digest/roots/files（包含各 closureDigest、descriptorDigest、selectedBy），以及 payment-ts 输出的 generator/generatorVersion/profile/profileDigest/configDigest/path/treeDigest。必须包含 idl/base.proto、idl/common/v1/enums.proto、idl/infra/pay/v1/pay.proto、idl/infra/trade/v1/trade.proto 及全部可达描述，不仅抽查四个文件。初始完整 12 项依赖与生成树摘要取自已验收 5539 生成证据；后续本节允许的来源刷新不改变这份兼容期望。

| 检查对象 | 验收规则 |
| --- | --- |
| 固定错误事实 | 副本和 manifest.sources.idlCommit 均精确为已评审 Go 来源；17 项名称/值/描述对独立 JSON 一致；原 Go 文件、取数程序、输出摘要及命令可追溯。source-mismatch 仍拒绝错误事实来源漂移 |
| 当前 generated 产物 | YAML 解析锁文件，按 source/output ID 定位，不能仅正则读取第一处 resolvedCommit；完整兼容字段与基线一致，闭包无缺失/新增/摘要变化，实际生成树由 proto:status 验证；来源提交允许不同于 Go 事实 |
| 无关上游变化后的同步 | 允许只刷新 resolvedCommit/producerInputDigest；requestedBranch/resolvedBranch 仍为 feat/esm-v1.4、fallbackUsed=false，工具/配置/contract/projection/全部 descriptor/输出树不变。通过项目 proto:sync 生成 lock，不能手改 lock 或伪造 current |
| 本次来源与运行证据 | Task 验收目录保存同步前后 lock、sync/status 原始输出与退出码、执行命令/工具版本；来源提交与当前 lock 一致、兼容摘要与两份 lock 一致。记录当前源码/Spec/Fixture/lock 摘要，旧报告不得因支付树未变而冒充本次完整回归 |
| 兼容闭包发生变化 | 不按“只刷新来源”放行。停止受影响任务，核对实际消费语义并更新相关规划/样例、独立评审及回归后接受新基线；不能同步改期望让测试自然通过 |

本轮 8-B 显式准入 6726634 的 CreateTrade/QueryOrder HTTP metadata 与调用方校验增量；它不是“无关上游变化后的同步”。按完整 lock/IDL/生成差异记录更新已评审 generatedCompatibility，保留固定 5539 的17项事实与 Go 样例；新增错误只归 E2E。两方法 SDK/Shadow 清单、原七个 CONTRACT-024 反例义务不变。CreateTrade 的绑定/codec 由 CORE-023 单独验收，QueryOrder 附带生成但禁止注册或调用。若新来源超出本次核定差异，仍按上表变化分支重新评审。

同步时还需核对当前 IDL 相对固定 Go 来源的支付相关错误含义。若 Go 文件只有无关错误新增，保留 5539 的文件摘要和数据，另存本次差异核验；不得把新文件摘要塞进旧取数记录。若 17 项数值/描述、公共判错或可达依赖的含义变化，先回到契约核对及评审，再专门重新取数，不能由 generated current 推导错误副本仍正确。常规 CONTRACT-024 测试只读取本地版本化期望和 lock，不联网或运行 Go；远端 current 的事实由同一 Task 的 proto:status 原始证据提供，未运行/失败不算通过。

CONTRACT-024 保留原五个 case，新增 metadata-only-sync 与 payment-projection-mismatch，共七个 integration case。前者用已记录的 5539→fa352692de4577bd1538a4175fa835b51d52dd92 两份 lock 及其原始工具证据验证不同提交可兼容，且目录、错误 JSON 不变；后者对 contract/projection/roots/files/descriptor/config/tree 等字段逐类作受控变异，缺少 base/pay/trade/enums 或任一可达项、额外项、错误 source/output、fallback 或分支失配均应拒绝。现网分支继续前进时用新的实际同步证据验收，不能把 fa352 写成固定的 current 目标。

迁移现有 Go Fixture manifest 时，保留 sources.idlCommit、idlFiles、独立数据和既有取数证据，移除固定 sources.idlLockSha256 相等门禁，补入 generatedCompatibility。同步修改 refresh-manifests.py 对全部受其管理的 manifest 的旧 lock 检查及对应测试；保留 Go 文件/数据摘要核验。维护脚本变化与兼容基线导入另行记录，不伪称重新执行过 Go 取数；若重新执行，也必须使用固定来源并保存新证据。当前运行的 lock 摘要写验收报告，不反写为固定 Fixture 来源。



### 平台与请求契约依据

核验日期：2026-09-06（失败码表于 2026-09-17 按同一官方页面复核）。官方虚拟支付 API 最低基础库为 2.19.2，首期验证目标为基础库 3.6.1 及以上的实际微信客户端；API 版本可用不等于账号/业务类目已开通或 iOS/Android 真机已验收。SDK 在操作前检查 wx.request、wx.requestVirtualPayment 及对应 canIUse；客户端准入、渠道开通和签名配置仍由渠道/服务端判断，未知官方错误保留原码并按下方“渠道失败码映射”归类，不丢弃。

| 官方事实 | SDK 处理 |
| --- | --- |
| wx.request 支持 timeout 和 RequestTask.abort | 网络超时尽力 abort；不承诺撤回已送达服务端的请求 |
| wx.requestVirtualPayment 参数为 mode、signData、paySig、signature；signData 以签名原始字符串传递 | 按已定义 oneof 映射四个调用字段，透传签名原文；mode 两处同时存在 |
| 虚拟支付 -2 表示取消；-15007 表示 Session Key 过期；-5 表示开通签约结果未知 | 分别归为 cancelled、CHANNEL_SESSION_REQUIRED（保留原码）和 unknown，不能都判 launch_failed 或都判 unknown |
| 官方未给出原生等待上限或取消收银台接口；异常退出可使成功回调丢失 | 等待渠道回调，不设置 SDK 回调时限；本地结束由显式 cancellation 触发；进程退出后由业务找回 tradeNo 并 query/observe |
| outTradeNo 的单次使用约束以及 -15002/-15012 等重复/关闭错误 | 由服务端管理渠道单号和当前签名；SDK 不比较或替换 outTradeNo，不把它当成 trade_no；使用本次响应参数 |
| wx.getDeviceInfo.platform 含 ios/android/ohos/ohos_pc/PC/devtools 等值 | 只按本文 client_platform 映射采集，不需要业务提供 |

官方来源：[虚拟支付 API](https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html)、[签名指南](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html)、[设备信息](https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.getDeviceInfo.html)、[小程序运行机制](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/operating-mechanism.html)。Session Key 失效需要重新取得登录 code 并由服务端兑换；[ResetUserSessionKey](https://developers.weixin.qq.com/miniprogram/dev/server/API/user-login/api_resetusersessionkey.html) 继承原到期时间，不能用于恢复已过期会话。SDK 不执行渠道登录。

### 渠道失败码映射

以下映射依据微信官方虚拟支付失败码表（2026-09-17 按虚拟支付 API 官方页面复核）。fail 回调的 errCode 是渠道对本次调起的结论；SDK 只按数字码归类，不从 errMsg 推断恢复动作。每个 PaymentError 都提供稳定的中文 message；fail 回调的 errMsg 只有在确认是字符串时才写入可选 channelMessage，缺失、null、非字符串时省略。channelMessage 是透传信息，不参与分类、状态机、查单、恢复、重试或重放，也不进入诊断或日志。

| 输入（errCode） | 渠道结论 | SDK 归类与交付 |
| --- | --- | --- |
| -2 | 支付取消 | channelSignal=cancelled、reason=channel_cancelled、无 error；不自动查单 |
| -5 | 开通签约结果未知 | channelSignal=unknown、无 error；进入 confirming 与自动查询。这是失败码里唯一按“结果未知”处理的一类，无可用错误码的情形见末行 |
| -15007 | session_key 过期 | error={code:'CHANNEL_SESSION_REQUIRED',source:'channel',message:'支付会话已失效，请重新发起支付',originalCode:'-15007',channelMessage?:'<字符串 errMsg>'}；reason=channel_session_required、interruptedPhase=invoke；不自动查单 |
| 其它官方已列出码：1001、-1、-4、-15001~-15014（-15007 除外）、-15016~-15021 | 参数/签名/商品/环境/频控等明确失败 | channelSignal=launch_failed、reason=launch_failed；error={code:'CHANNEL_ERROR',source:'channel',message:'<SDK 中文默认文案>',originalCode:'<十进制码>',channelMessage?:'<字符串 errMsg>'}；本次直接结束，不自动查单、不重放 |
| 官方表未列出的非零安全整数码，如 16、-15015 | 官方未文档化，errMsg 可能说明原因 | 与上一行相同归为 launch_failed 并保留十进制原码；不因未映射回退为 unknown，errMsg 仅在字符串时作为 channelMessage 透传，不作为分类契约 |
| 缺失、null、0、非整数、非安全整数、NaN、Infinity、非数字 | 无可用数字错误码 | channelSignal=unknown、无 error；按无明确归因的未知回调进入既有查询路径 |

明确调起失败必须携带 error，且包含 SDK 稳定的中文 message；不能把 PaymentError 留空或只给信号。不得为细分渠道原码新增 EndReason 值，宿主按 originalCode 区分文案与重试策略。取消（-2）与会话失效（-15007）保持专属语义，不能被默认归类覆盖；其中 -15007 仍按本表产生 PaymentError，并与其它产生错误对象的 fail 分支一样，仅在 errMsg 为字符串时透传 channelMessage。-2/-5 保持无 error，不能仅因 errMsg 存在而新增。0 与缺失码视为“无可用错误码”，不视为渠道明确拒绝。渠道 errMsg 不保证存在或可展示，缺失、null 或非字符串时省略 channelMessage。

平台调用同步抛错不产生 errCode，也不属于上表的 fail 回调输入：该情形仍按渠道明确失败以 CHANNEL_ERROR 与 launch_failed 结束、不带 originalCode，不回退为 unknown、不自动查单。prepare/query 阶段的 CHANNEL_ERROR 语义不变，仍为 reason=error。

### 请求字段与泳道映射

| 数据 | SDK 来源 | 实际发送位置 |
| --- | --- | --- |
| Token | 每次请求 getAccessToken() | Authorization: Bearer <token> |
| Product ID | requestContext.productId；不猜测业务值 | 如配置则写 generated BaseReq.product_id（ProtoJSON baseReq.productId）及 X-Product-ID，二者同值；未配置省略，SDK 按网关返回处理鉴权结果；业务方提供与其 Token 匹配的配置 |
| Request ID | 每次 HTTP 生成新标识；符合 `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`：首字符为 ASCII 字母或数字，后续允许字母数字及 . _ : -，总长 1–128 | request_id Header 与 BaseReq.request_id（baseReq.requestId）同值；链路真源是 Header |
| 应用版本 | requestContext.appVersion | 如配置则写 app_version Header |
| lane | requestContext.lane | 如配置则写标准 lane Header，未配置不发；不从业务请求拦截器读取 |
| 用户 ID | 网关从 Token 解出 | SDK 不发送 body user_id 或用户身份 Header |
| client_platform | SDK DeviceInfoPort | 仅 CreateTradePay.client_platform（ProtoJSON clientPlatform），不是公共 Header |
| xpayEnv | 本次 PaymentRequest.xpayEnv | 仅按上表设置 CreateTradePay.xpay_env（ProtoJSON xpayEnv）；省略保持 absence；不进入 Header/BaseReq/QueryTrade |
| HTTP 载荷 | generated metadata 与 ProtoJSON codec | Content-Type: application/json；路径和方法不在 SDK 手写镜像表 |

Request ID 的传输位置与链路真源来自 [IDL base.proto:10](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/4e5cb22659fd4f4c36d06ae81256dc1c43e691d9/base.proto#L10)，IDL 未规定生成格式。上述正则来自网关锁定依赖 [common-sdk httputil.go:35](https://gitlab.daqian369.com/esm/narnia/common-sdk/-/blob/4dcc8e8b401b/httputil/httputil.go#L35)。默认生成沿用当前小程序的时间戳、进程随机串和递增序号组合，SDK 使用 pay 前缀，具体公式与生成器归属见 Design 的 SDK-owned networking and host data providers；宿主不提供 Request ID，不以它替代交易号或支付幂等键。

既有 HTTP/Header/响应规则的网关历史参照：infra-gateway `a7619530784c4042fa109218764b9ad2335cd1de`，其 go.mod 锁定旧 IDL ae12898，不能作为 xpay_env 兼容证明。真实验证前须提供已升级网关及服务端版本，按三态节和 Task 8 验证字段未被丢弃。http.go:613–616 的 writeError 使用 HTTP 200 + baseResp；proxy 的鉴权失败、路由拒绝走此出口，支付请求使用 Bearer，Product ID body 优先/Header 兜底。auth_policy.go 注释中的“401”不能作为当前实际 HTTP 行为，判定以可执行代码为准。SDK 同时保留对代理层非 2xx 的处理，不能假定所有错误均为 HTTP 200。

网关有两种 JSON 出口：支付 handler 经 newGatewayMux 的 grpc-gateway 默认 marshaler，EmitUnpopulated=true，成功 statusCode="0"、失败 payParams=null 和标量默认值都会输出；网关自行拒绝经 common-sdk 的 JSONProtoField，EmitUnpopulated=false，只包 baseResp，未赋值字段可省略，非零 statusCode 仍输出。两者均 UseProtoNames=false，采用 lowerCamelCase/int64 字符串。SDK 错误分支不要求出现 tradeNo/payParams 等成功字段。SDK 只发送标准 lane，不同时发送 X-Lane。

来源：[网关响应与路由实现](https://gitlab.daqian369.com/esm/narnia/infra-gateway/-/blob/a7619530784c4042fa109218764b9ad2335cd1de/internal/infra/gateway/http.go)、[网关 marshaler 测试](https://gitlab.daqian369.com/esm/narnia/infra-gateway/-/blob/a7619530784c4042fa109218764b9ad2335cd1de/internal/infra/gateway/marshaler_test.go)、[common-sdk JSONProtoField](https://gitlab.daqian369.com/esm/narnia/common-sdk/-/blob/4dcc8e8b401b/httputil/protojson.go)。核验过程记录已从仓库移除；该核验不代表部署验收。

deploy `ad304eb2`、common-sdk `c5df216a` 的静态机制按目标服务匹配 lane，未匹配走 stable 默认路由；不会把原业务 lane 改成 baseline，也不是实例故障自动回退。缺省 Header 可能取进程 RuntimeLane。gatewayBaseUrl 与 lane 分别配置，业务可在初始化覆盖；SDK 不强制 baseline，不自动切换测试/生产。产品接入的部署与 Product ID/JWT 值由业务接入方和服务端维护方配置；SDK Live 验收则由本仓库测试宿主维护对应非敏感配置并与服务端核对，无需业务应用参与。

IDL trade_event.proto:45,68 明确事件 lane 来自生产者进程 RUNTIME_LANE，一期回调在基线、消费者按 lane 过滤。同步请求携带开发 lane 不保证异步 PAID 事件进入开发权益消费者，由业务接入方与支付/业务服务端在权益联调中确认，SDK 只负责按契约发送 lane。

## SDK 验收与业务接入责任

以下为实施后的验收及接入要求，不列入设计待决项，不因缺少某个业务域名/账号的实测而阻塞 SDK 契约设计。

单元测试代码覆盖率门禁为全部手写实现代码的语句、分支、函数和行覆盖率均达到 100%，覆盖 SDK、协议/网络实现及手写工具逻辑。ProtoGen 自动生成代码不计入该门禁，其生成质量由 ProtoGen 维护方负责；本项目仍验证手写代码对生成契约的正确消费及端到端协议交互。测试配置必须显式包含全部适用手写源文件，未被测试导入的文件也计入统计；覆盖目录以 Design 的完整文件树和根 Vitest 配置责任表为准。

SDK 与通信协议包 SHALL 独立管理版本，统一以 SDK 为发布入口。SDK 开发依赖使用 workspace:*，打包产物 MUST 固定经验证的协议精确版本；业务方只安装/升级 SDK，不承担协议版本选配。协议无产物变更时复用原版本；有变更且需要交付时，由同一 SDK 发布流程升级依赖和 SDK，先使协议依赖可用再发布 SDK。通信协议包 SHALL 不设置独立发布工作流；依赖步骤失败 MUST 阻断 SDK 发布，依赖发布成功不等于 SDK 交付成功。

工程 SHALL 设置三类质量门禁：静态检查、单元测试及其覆盖率、集成场景/流程覆盖及测试通过。静态检查包含 Lint、TypeScript 类型及依赖/发布边界检查。全部手写实现包含 Shadow 网关、E2E harness/driver 和可执行工程工具，AI 编写的实现同样计入；测试断言、Fixture 数据、声明和纯配置不作为被测实现统计。

全部 Spec 验证、支付 E2E 的可观察行为场景及支付 Consumer 的本期实际 HTTP 消费契约义务 SHALL 分别达到 100% 执行覆盖且全部通过。Spec case 以 verification v2 的 kind 区分 behavior、module、engineering；内部模块正确性由就近单测验证，工程产物/门禁由对应验收入口验证，二者不计支付 E2E。混合 Scenario 的全部必需分类均验证后才完成全 Spec 验收；分类不能由测试作者自行改写。本期方法固定为 infra.trade.v1.InfraTradeService.CreateTradePay 与 QueryTrade，包含其可达字段与错误；按文件生成的其他方法不注册到 SDK/Shadow，不成为额外支持声明，生成配置与范围核验见 Design。分母来自本期适用的全部 Scenario 与 IDL/补充契约义务；方法覆盖不能代替字段、编码、错误及交互场景覆盖。不明确的语义、draft/skip、缺 Fixture 或缺少用例要求的运行环境证据 SHALL 标为未覆盖/待决，不能删除后宣称 100%。集成测试文件头引用 TC/IDL 方法和来源版本，与同名 Fixture 建立映射并自动出报告；module 使用就近单测的具体 meta/检查点记录，无外部数据时不要求空 Fixture，仍校验测试源码 freshness。

AI SHALL 基于 Spec/IDL 编写并保存测试及 Fixture，CI 重放已校验的版本化产物。Vitest 是测试执行器，不是代码生成器。Shadow 维护在通信协议包的测试目录，由 E2E 装载场景；生产 exports、产物和依赖图 MUST 排除 Shadow/Fixture/驱动。SDK 行为集成、协议集成、小程序运行验证与真实渠道验收分别报告，测试替身不充当真实平台/服务端证据。执行链路与文件归属见 Design 的 Scenario-driven tests and shadow gateway。

场景门禁 SHALL 从有效 Spec 全集与支付 Consumer 契约构建必需验证项，按具体 case、检查点和运行环境绑定测试，核对当前源码/Spec、IDL 锁定与 Fixture 版本的运行结果。文件头 ID、存在的测试文件、仅调用接口或断言计数均不能单独证明语义覆盖；全部必需子项执行后场景才计入执行覆盖，失败另行阻断。规则、范围和环境来自 Spec，不由测试或 Fixture 自行缩减。自动生成清单与覆盖报告，不维护第二套人工映射表；具体机制见 Design 的 Executable scenario coverage gate。

目标 SDK 仓库 SHALL 在本期初始化时提供根与三个包的 AGENTS.md，其规则正文及实施路径在方案阶段写入 Design，规定 Spec 驱动迭代、单测/场景测试与 Fixture 归属、生成所有权、架构边界、质量命令和证据要求；同时提供并执行统一的架构/场景检查，检查失败 MUST 以非零状态结束，可接入 CI 作为执行器，但不要求由 CI 合并保护承载。CI 合并检查、审批和分支保护不属于本 Change 的 SDK 验收前置。初始化 SHALL 复用已登记的官方脚手架、官方配置及社区能力；项目只实现支付特定逻辑和工程规则连接。语义及断言正确性须经评审，机器检查不宣称可自动理解全部自然语言需求。详细文件责任与执行契约见 Design 的 Agent instructions and architecture enforcement。

完整门禁 SHALL 同时满足能力 Spec 登记的必需 FLOW case 覆盖与通过均为 100%。一个集成 case 可以覆盖多个 Scenario 和协议义务；每个必需流程的阶段、交易数据关联与结果须在同一次连续运行验证。单项 TC 通过不得抵扣缺失流程；测试步骤/断言维护在 E2E 测试代码，Fixture 维护输入和模拟数据，二者共同来源于 Spec/IDL。

SDK 最终工程交付 MUST 验证实际打包产物：干净消费者只声明 SDK 依赖，ESM import、CommonJS require 和两种对应 TypeScript 声明消费均成功，协议精确依赖及产物身份与验证清单一致；不能使用仓库源码 alias 代替安装结果。工程验收 SHALL 同时具备三包边界、完整质量门禁、必需场景/连续流程和小程序运行证据；统一架构/场景检查须已执行且失败可被非零状态阻断。CI 合并检查、审批、分支保护等仓库治理不属于本 Change 的验收前置。真实渠道、业务接入及实际发布分别给出结论，发布演练不表示已上传或真实可支付。

每项任务的验收 SHALL 按 Tasks 的共同完成条件及专属标准，保留关联源码/Spec/IDL/Fixture 版本的命令、报告及评审记录；静态/覆盖门禁和 Spec/IDL → 测试交付链路本身也必须有正向执行与反例阻断证据。详细验收矩阵、证据位置与分阶段完成判定见 Design 的 Acceptance gates and evidence ownership。前置契约未确认或所需证据缺失时，只报告已验证范围，不把部分通过视为整个任务或 SDK 已完成。

| 类别 | 责任方 | 内容与通过证据 |
| --- | --- | --- |
| SDK 协议与平台验收 | SDK 维护方，支付基建配合提供样例/测试环境；真实测试由已具备环境的测试方执行 | 本 Change 的真实渠道结论采用仓库 Live 记录模式或外部验收确认模式之一。外部确认必须精确绑定 `payment-sdk-v0.1.0-alpha.2`，并明确实际 Android/iOS 平台、测试环境、正常支付通过及异常场景可被 SDK 拦截并向接入方提示；不要求逐项转录 LIVE-PAYSDK case、故障类型或原始运行数据，也不把未声明环境扩写为已验证；静态或 mock 证据不能单独替代真实验收 |
| Live 宿主与配置 | SDK 维护方及基建/微信环境维护方；已有真实验收时由测试方确认 | 仓库 Live 记录模式按根 `.env.live`、创建契约和 Live 宿主规则执行；外部验收确认模式无需向 SDK 维护侧转交测试账号、Token、appId、域名、交易号或原始日志，但必须提供上述最小确认字段及覆盖范围 |
| 业务接入配置 | 业务接入方与网关/支付服务维护方 | 按 SDK 公共配置提供 gatewayBaseUrl、appId、productId、lane、Token getter 等实际值；配置小程序合法域名、网关 JWT 和渠道开通参数；SDK 按 IDL 及配套网关契约编码，不替业务选择或探测环境 |
| 业务链路联调 | 业务接入方与业务/支付服务维护方 | 验证部署路由、Token/业务标识匹配、基线支付事件消费及权益发放；SDK 提供标准请求和交易结果，业务成功条件由业务 B-P01 管理 |

SDK Change SHALL 保留本仓库 Shadow 与工程验证闭环；真实渠道结论可由已完成真实验收的测试方提供并由用户/测试负责人确认，不要求业务应用或本仓库重复执行真机支付。Live 的交易创建能力仍仅为测试宿主准备，不增加 pay/query/observe 之外的 SDK API，不扩大 SDK/Shadow 的两方法清单；创建契约已由 6726634 的 CreateTrade HTTP binding 明确，按 SDK-17、CORE-023 及 Design Live decision 实施。user_id 可由独立 `.env.live` 白名单预填且页面可改，只进入创建 body；默认表单/新4项创建错误留在 E2E。现有文件级 Consumer 的 generated 输出可被宿主消费，不注册到 SDK/Shadow，不新增公共配置/PaymentRequest 字段。QueryOrder 不在实际消费范围。Token getter 每次从宿主 Storage 读取，更新 Token 不自动恢复；恢复阶段矩阵、签名原文和支付结果语义均不变。

协议新增或变化若产生设计缺口，应先更新本契约再评审；未完成验收本身不新建设计 TODO。本次错误码副本维护规则及既有 xpayEnv 公共参数须纳入新的 Plan Review，旧评审不适用于当前输入。验收操作与证据分别在 Tasks 和后续 verification artifact 中维护，接入条件写入业务接入说明。

## 协议与恢复的必需测试输入

下表细化已有 TC/FLOW 的测试义务，不增加独立状态表或测试框架。Task 3 建立协议样例与适配单测；Task 6 把义务登记到场景元数据并建立校验/绑定；Task 7/8 从公共入口运行。全部仍为 draft。

| 输入组 | 必需内容与断言 | 归属 |
| --- | --- | --- |
| 正常 virtual 响应 | 精确 oneof、四字段映射、mode、签名原文包含不同键序/空格/转义仍逐字一致；所有时间及状态码 int64 字符串、枚举名称 | CORE-003、CONTRACT-002/014；FLOW-001 |
| 失败与网关出口 | HTTP 200 的 trade 错误（payParams=null、tradeNo 空、channel UNSPECIFIED）；只有 baseResp 的网关 Unauthorized/NotFound/InvalidParameter；先保留业务错误，不报成功参数缺失 | CONTRACT-005/013/017 |
| 响应防御 | 非 2xx、401、403、非 JSON、缺/null baseResp 或 statusCode、非法/不安全 int64；success 冲突/缺失、error 码冲突/缺失、未知非零码；逐条验证判错顺序 | CONTRACT-014/017 |
| 参数拒绝 | 旧外层 string、null/空/未知/多 oneof、channel 与分支冲突、错交易/空 payment_no、四字段缺失/空/错类型、未知 mode；全部禁止调用渠道 | CORE-004、CONTRACT-014；FLOW-003 |
| 错误全集与 TS 副本 | 当前 17 项错误的名称、完整数值及 Go 描述逐项核对，并按上表映射；固定 Go 事实与当前生成来源分开验证，来源刷新成功、支付闭包漂移失败。Conflict 不能映射 PAID，NotFound 不区分交易缺失或账号不符 | CONTRACT-005/006/013/017/024 |
| 恢复后再次取参 | 同单号且 signData/paySig 相同、signature 按新会话生成；以及不同单号和本次有效参数。两种响应都走正常新 pay，不以单号差异选择流程；query-auth 恢复仅查询 | CONTRACT-013；FLOW-006 的渠道会话 case 与 query-auth |
| xpay 环境 | 省略/undefined 的键缺失，sandbox/prod 的具名枚举编码，显式 0/未知值拒绝；query/observe 不发送；连续调用不串值，恢复 pay 保留原选择；签名原文及渠道四参数不因请求值被 SDK 改写 | CONTRACT-022/023、CORE-020；FLOW-008 与 FLOW-006 |
| 查询恢复判别 | QueryTrade 已知可恢复码由 backend 唯一赋内部 cause；未知/其他错误即使 retryable=true 也结束；独立 query 一次调用并剥离标签，Outcome 同样不泄漏 | CONTRACT-026，Task 3/4/7 |
| 取消与结算 | CANCELLED 与 TIMEOUT 分开；原始宿主停止/运行预算先处理者锁定结果；单笔查询到期保留剩余观察窗口，旧请求取消不干扰重查；内部变体不泄漏公开 query | CONTRACT-025，Task 3/4/7 |
| 请求与时间 | Token 每次读取、Header/BaseReq 一致、open_id 省略、内部 client_platform、显式 lane；毫秒安全转换，原生等待无 SDK 时限 | CONTRACT-012/015/018/019；FLOW-004/005 |

Fixture 存放于 packages/e2e/tests/fixtures 的同名 TC/FLOW 目录；manifest 记录 source kind、完整 IDL/服务端/网关 commit、生成命令与样例摘要。数据必须是可执行的完整 JSON；服务端回复中的省略号样例仅是形态参考，不能直接当完整 fixture。按锁定 Go 消息及对应生产 marshaler 生成非敏感结构样例，再以独立 wire 期望核对 SDK 的 TS 产物；非法响应在该样例上作明确变异。无需真实 Token/session_key，模拟签名只证明结构与原文传递，不宣称可向微信支付。真实渠道证据另按 Task 8 取得。

## 待确认事项（权威登记）

当前无待补充的 SDK 产品 API 设计 TODO；Live 真实创建契约现已取得（6726634），用户确认 `PAYMENT_LIVE_USER_ID` 可为空或提供合法正整数初值、页面可改且仅入 body，以及可编辑默认表单；8-B 本版消费语义重新评审，8-C 部署、账户和真实矩阵仍按前置落实。恢复入口、结构化参数、错误判定及重复支付边界已写入本文；工程版本、Consumer/Profile 登记、完整 Fixture 与实际运行证据由 Design 工程输入表和 Tasks 落实。既有 TC/FLOW 实施事实见 Tasks 与运行证据；8-A 已交付，8-B/8-C 尚未完成，方案确定不等于验收完成。

业务权益及商品期限呈现仍归业务 B-P01/B-P08。

## 业务接入要求

- 组合根按 PaymentClientOptions 提供初始化配置与当前 Token provider，业务通过 pay/query/observe 使用支付能力。
- 业务后端先建单并返回 trade_no，前端将交易引用、method 和可选 xpayEnv 交给 SDK；微信身份查询由支付服务端负责。
- 业务负责 auth_required、identity_required、channel_session_required 对应的凭据恢复，保存原 tradeNo/method/xpayEnv（包括省略）、相同 appId 的客户端上下文和中断结果；按恢复矩阵显式再次调用。查询阶段恢复后只查询原交易；渠道会话失效且尚需支付时重新 pay，使用本次响应的有效参数。账号改变时先由业务确认原交易的访问归属，不直接续接。
- 业务可通过本次 onPhase 消费两个约定阶段，自行映射 UI；临时隐藏不触发实际关闭/afterClose。事件与最终结果都校验当前运行和组件有效性，不仅按 tradeNo 区分新旧。pay/observe 最终返回仍分别表达交易事实、渠道信号与结束原因；业务权益由业务接口确认。
- 业务按每次支付意图选择 xpayEnv；省略由服务端取默认，sandbox 不保证生产部署免扣款。业务 ESM Change 负责接入该字段及恢复时保留选择；本 SDK 不维护业务 IDL/页面契约。
- 联调覆盖网关识别 xpayEnv、部署默认/显式环境、显式泳道配置、支付事件与权益消费者的对接。业务 change 负责对应接入方案、页面规格和测试，联合实施前完成公共契约一致性核对。
