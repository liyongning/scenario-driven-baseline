# 前端 SDK 与服务端支付基建兼容性审查

审查时间：2026-09-07 16:20（Asia/Shanghai）。本记录是源证据与审查结论，不新增规范性要求，也不替代 Spec、Design 或 Plan Review。

后续落实（同日，用户要求核对并遵守既有 Request ID 规范）：COMPAT-01 已写入公共契约、Design 和 Task 1/3。当前小程序 commit `6fcf226488343efa9efe5a82165757fd2ac289cc` 的 `protoHttp.ts:35–44` 使用 `esm-${Date.now().toString(36)}-${requestProcessNonce}-${requestSequence.toString(36)}`，随机串在模块加载时生成、序号逐次递增；SDK 沿用该组合，固定 pay 前缀。IDL ae12898 只规定 Header/metadata 链路真源；完整允许字符规则来自网关锁定 common-sdk。Header/BaseReq 同值、同毫秒/多客户端/时间回拨的验收均已补齐。该落实由用户明确授权，以下审查表保留发现时的状态；更新后的规划需以新 digest 复审，不沿用本记录审查时的旧 PASS。

## 结论与范围

当前 SDK 方案能够消费最新 IDL 的 `InfraTradeService.CreateTradePay` / `QueryTrade`，未发现阻断首期微信小程序虚拟支付链路的直接契约冲突。接口、参数、三类身份错误、结果查询和支付单复用边界能够衔接。

飞书 revision 406 与当前 SDK **并非全文一致**：其中既有已被 IDL 替代的旧协议示例，也有与已确认 SDK 职责/策略不同的前端组件流程。按用户要求，协议冲突以 IDL 为准；IDL 没有规定的客户端策略，继续按已确认的 SDK Spec 和服务端补充结论判断，不把旧文档的前端组件要求自动加入 SDK。

发现一项 SDK 非阻塞说明遗漏：Request ID 字符规则缺少网关的首字符约束，详见下文。没有修订五份已评审规划输入、创建产品代码、勾选实施任务或发送外部消息。

## 本轮来源

| 来源 | 本次核验版本与范围 |
|---|---|
| SDK 规划 | Proposal、两份 Spec、Design、Tasks；规范化 digest `6963b251157c34f268ceb4cc611108cd3d5a3eb20b62d61b27cc0894e5ad9a82` |
| [飞书支付基建技术方案](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f) | fresh `lark-cli docs +fetch --as user`；doc token `MuFTdxNWBoEtkSx7Y2wcSDwjnDp`，revision **406**；读取 §8、§9 消费链路、§10、§13/14、§22、§27 等相关章节 |
| [支付 IDL](https://gitlab.daqian369.com/esm/narnia/idl/-/tree/ae128984a1c8126e3cb4662962b75a4ad527528a) | 两次读取远端 `refs/heads/feat/esm-v1.4` 均为 `ae128984a1c8126e3cb4662962b75a4ad527528a`；与 SDK pin 一致，无版本差异。本轮本地 IDL HEAD 也已是该提交、工作树干净 |
| 服务端补充契约 | [完整回复](payment-backend-reply-20260907.txt)、[已发送的前端结论](payment-frontend-alignment-20260907.md)；沿用已确认的阶段恢复与支付单复用边界，不将已发送当成收到二次确认 |
| 配套源码 | infra-pay `f5b03ba5d4010d213cdfe779e7d331319997d409`、infra-trade `36b636c02afb0a31447b52f83fea922120e08666`；网关 `a7619530784c4042fa109218764b9ad2335cd1de`、common-sdk `4dcc8e8b401b`，按固定 commit 只读核验 |

`/root/audit_server_docs` 负责飞书，`/root/audit_payment_idl` 负责 IDL；主 Agent 核对 SDK、交叉裁决文档差异并复读网关边界。原始飞书响应位于 `/tmp/payment-server-doc-audit-20260907.aUlQpt/`，临时文件可能清理，长期定位使用上述文档及下文 block 链接。

## SDK 与 IDL 的匹配矩阵

SDK 路径均相对本 Change，C 表示 `specs/payment-sdk-contract/spec.md`，D 表示 `design.md`。

| 核对项 | IDL / 补充事实 | SDK 对应 | 判定 |
|---|---|---|---|
| 下单与收银入口 | 业务调用内部 CreateTrade；公开支付入口 POST `/api/base/trade/pay`，查询 POST `/api/base/trade/query`，均 body `*`；[trade.proto:288](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/trade/v1/trade.proto#L288) | C:428–431；D:164–168、494–506：SDK 只消费两个公开方法 | 匹配 |
| prepare 输入 | tradeNo 1–25、有效非零 channel、appId 1–32；body user_id 已 reserved；[trade.proto:80](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/trade/v1/trade.proto#L80) | D:164–171：已有交易引用 + method 映射 + 初始化 appId | 匹配 |
| OpenID 与鉴权 | open_id 可选，传了就用，省略时由 pay 反查 wx；不是 deprecated 字段。网关从 Authorization 解析 uid 注入 metadata；交易不存在/不属当前用户同为 NotFound；[trade.proto:86](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/trade/v1/trade.proto#L86) | C:95–107、257–275：SDK 省略 OpenID、没有 body user_id；宿主负责身份建立与恢复 | 匹配；SDK 选择更窄的公开接口，不是声称 IDL 删除 OpenID |
| 渠道及设备平台 | Channel 明确 JSAPI_MINI/JSAPI_OA/NATIVE/VIRTUAL；client_platform 只描述设备，不选渠道/验签/风控；[pay.proto:27](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/pay/v1/pay.proto#L27)、[trade.proto:111](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/trade/v1/trade.proto#L111) | C:131–135、253；D:138、142–150：首期 method → VIRTUAL，设备内部采集 | 匹配；SDK 的四种采集结果不将 IDL 字符串值域封闭 |
| 支付参数 | PayParams oneof；virtual 为 sign_data/pay_sig/signature/mode；[pay.proto:182](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/pay/v1/pay.proto#L182) | C:442–457：校验 oneof 与 channel，四字段映射，signData 原文传递 | 匹配 |
| JSON 与响应判错 | lowerCamelCase、int64 字符串、枚举名称；BaseResp.status_code=0 为成功；实际默认值输出还取决于网关 marshaler；[JSON 契约测试](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/trade_pay_contract_test.go#L586)、[BaseResp](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/base.proto#L37) | C:459–470、520–524：先按有效业务信封判错，再校验成功数据，wire 防止 codec 默认值掩盖缺字段 | 匹配；冲突信封的完整优先级来自服务端补充与 SDK 消费策略，不能全部归因于 proto |
| 精确错误码 | CreateTradePay 10 项、QueryTrade 4 项、Gateway Proxy 3 项；[支付错误定义](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/error_code.go#L1312)、[网关错误](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/error_code.go#L733) | C:480–488 覆盖全部 17 项，按精确生成码而非通用 canonical 或文案区分 | 匹配；ChannelUnavailable 的 retryable=false，WxIdentityNotFound 不能合并交易 NotFound |
| 查询及支付事实 | QueryTrade 返回 TradeDetail/BaseResp，sync_channel 一期忽略；不返回内部 PaymentStatus/paymentNo；过期仍可能 PAYING，CLOSED 二期；[trade.proto:136](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/trade/v1/trade.proto#L136) | C:293–304、431–432：只以查询 PAID 认定支付成功；未知态归 UNKNOWN，超时不合成 CLOSED/未支付 | 匹配 |
| 重复收银及签名 | IDL 规定同 channel 复用/换 channel Conflict；三维 tradeNo/channel/appId 完整状态决策见[支付单源码:215](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/domain_service/payment_domain_service.go#L215) | C:269：显式新 pay，只使用本次完整参数；paymentNo 是否变化由服务端决定 | 匹配；具体状态决策不全由 IDL 表达 |
| 两种身份恢复 | 服务端回复区分准备/渠道会话恢复与查询恢复；签名每次以当前 session_key 生成；[virtual adapter:70](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/channel/wechatvirtual/adapter.go#L70) | C:261–267：prepare/invoke 恢复后显式 pay；query 恢复后只 query/observe，不重放旧签名 | 与 IDL 兼容，与补充结论一致 |
| 等待与期限 | 两方法未设置 rpc.timeout_ms；IDL 不规定客户端 3s/60s 策略或渠道回调上限；服务端默认期限/余量取文档，且过期仍可确认 PAID | C:279–291：请求/查询默认可覆盖；渠道无 SDK 计时上限；服务端管理期限/关单 | 匹配；不能把“IDL 没规定”解释成“IDL 强制采用 SDK 策略” |
| 泳道与权益 | 请求 lane 与异步事件 lane 不等价；事件取生产者 RUNTIME_LANE；[trade_event.proto:45](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/trade/v1/trade_event.proto#L45) | C:528、530–560：SDK 发送显式 lane，业务负责事件消费/权益联调 | 匹配；不能承诺开发 lane 自动贯通异步权益 |

## 飞书差异及采用的依据

这些差异不是待实施 Agent 自行选择的分支，也不作为恢复旧设计的理由。

| 项目 | 飞书 revision 406 | 裁决与影响 |
|---|---|---|
| 支付参数类型 | [§9.11.3](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnRRA25DtY5y6vL8KRCbpMth)、[§10.1](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnJ3CSL7Uk27FiM6949qbuYe) 仍写 `string pay_params` | 与现行 IDL 直接冲突。采用 oneof；照文档解析会破坏成功响应消费。SDK 已采用正确结构 |
| 请求字段/长度 | [§10.1](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnJ3CSL7Uk27FiM6949qbuYe) 未含 app_id/client_platform，trade_no 上限 40；[请求表](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnxYSvNKJVU0oQbE5A4l8AKd) 认为 JSAPI 必传 OpenID | 采用 IDL 的必填 appId、可选 OpenID/client_platform、tradeNo 上限 25。SDK 不接 OpenID 的选择兼容；不可称 IDL 已删除该字段 |
| 枚举名称 | [§10.2](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnEm8OrtTpCZI0BTLEiSxMDh) 仍为 WECHAT_MINI/H5/PC | 采用 IDL 的 WECHAT_JSAPI_MINI/JSAPI_OA/NATIVE；首期 VIRTUAL=4 一致。旧名称不能进入生成请求或 Fixture |
| 登录与自动会话恢复 | [组件握手](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnxkUB8VyBmBZK92bLWoHuGP)、[会话失效动作](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcni7jpurOVJeGQ4lLDf2aZmd) 由组件 wx.login/取得 OpenID/重收银 | IDL 不强制 SDK 承担登录。按已确认职责由宿主恢复，SDK 结束原调用并消费下一次显式调用；重取当前签名的目标一致 |
| 自动选/切渠道 | [§9.11.1](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcng1DQWi7NeLvpW9CgaEf1Nc) 按 goods_type 选渠道，合规错误后切换一次 | CreateTradePay 无 goods_type；商品形态在业务建单及服务端。按 SDK 显式 method，不自动换渠道。IDL 自身 error_code.go:1324 的“切通道”指导与 trade.proto:293 的 PAYING 换渠道 Conflict 也有张力，不能当必需重试协议 |
| prepare 自动退避 | [Unavailable 动作](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnRUGb3ZZiPJv6TEId58D7Tb) 1/2/4 秒、最多 3 次 | IDL 只表明可退避重试，未要求 SDK 自动/特定次数；按 C:304 不自动重放 prepare。返回 retryable 供调用方决策 |
| Conflict 后自动查单 | [Conflict 动作](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnbOpazje333i99wTZGaqiBb) 自动 QueryTrade、跳转/轮询 | IDL 未规定 SDK 必须自动调用。按 C:483 返回 CONFLICT；不能直接当已支付，宿主可显式查询 |
| invoke 前额外查询 | [§9.10.2](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnWvk6A3O6RFXN0YJci6MSWh)、[组件职责](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnYJO3HSVUqZ0PIY5HUPsyWg) 要先 QueryTrade，再做 5 分钟余量守卫 | 这是旧客户端流程要求，两个方法 IDL 未规定此额外调用。按已确认 SDK prepare → invoke → 渠道信号后 query；服务端收银时检查期限，SDK 不缓存参数供以后直接重放 |
| 本地 EXPIRED | [§9.11.3](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcntx0Nt0bAe942YKS3yzJT0f) 剩余不足 5 分钟停止轮询、返回 EXPIRED | 文档将 EXPIRED 定义为本地 UI 结果，并非服务端 TradeStatus，不能误报成两边账务状态冲突。SDK 按既定预算保留 PAYING，允许之后查到 PAID；不新增 EXPIRED 交易终态 |
| Unauthorized 的 HTTP 状态 | [§13](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnJchFJfFVMPlAD0s1KYdcSh) 认为网关映射 HTTP 401 | HTTP 状态不由这份 proto 单独确定。锁定网关 http.go:613–616、648–653 实际 HTTP 200 + BaseResp；SDK 已兼容该出口及代理层真实 401/其他非 2xx。不能只靠 401 识别登录态失效 |
| Request ID 格式 | [§14](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnDOW3z2HXfEh0vNmqVBvowd) 写固定时间格式 yyyyMMdd_HHmmss_SSS_abcdef | IDL 只定义字段与链路真源，没有格式/长度约束。配套网关允许更广格式，SDK 不必照时间模板；首字符精度遗漏见下文 |
| 异步 lane | [§9.7](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcn3Dwo0Zj5CBD4vWFzDFkaMo)/[§9.8](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnItZwIaIWnZarddLlmH6PEp) 说取 ctx lane，[§10.4](https://ocn0jrysp7wp.feishu.cn/wiki/VZHLwabCCiVXHxkwuf1cox9In2f#doxcnX0DW02GKB3CJKRRf22yyhb) 又说 RUNTIME_LANE | 按 IDL 的生产者进程 RUNTIME_LANE。SDK C:528 已准确界定同步请求与异步权益的联调责任 |

相关飞书消费章节还未完整描述 BaseResp 判定、两类 JSON 出口、Header 映射、独立 WxIdentityNotFound 和查询中断恢复阶段；这些属于说明缺失，不等于反对当前 SDK。SDK 已有 IDL、网关源码和服务端回复作为依据。文档讨论的“渠道从未回调”多指服务端通知，不能用它推导 wx 原生回调等待上限。

## 非阻塞项与准入结论

| ID | Severity | Technical Validity | Attribution | Scope / authority | Blocking / disposition | 处置 |
|---|---|---|---|---|---|---|---|
| COMPAT-01 | Minor | confirmed | introduced（SDK 说明） | in_scope：CONTRACT-10；C:513 要求遵守配套请求契约 | non_blocking / non_blocking | C:513 只有字符集/1–128，缺少首字符字母数字。建议实施 ID 生成与断言时使用完整规则；本轮仅记录，未修改已评审输入 |
| COMPAT-02 | Minor | confirmed | preexisting_unrelated（IDL 注释） | out_of_scope（修复外部 IDL）；审查依据 base.proto:45 vs error_code.go:3、17–21 | non_blocking / out_of_scope | base.proto 注释仍写 15 位，实际错误格式/常量为 14 位。SDK 使用 int64 与生成错误常量，不做固定 15 位校验，无受影响路径 |
| COMPAT-03 | Important（若照旧指引增加自动切渠道） | confirmed | preexisting_unrelated（外部指引） | out_of_scope（修复外部 IDL/文档）；trade.proto:293 vs error_code.go:1324 | non_blocking / out_of_scope | 两处外部指导有张力；SDK 已明确不自动切渠道，当前消费无冲突。不据此增加新行为或重新打开 SDK 架构 TODO |

COMPAT-01 的配套依据：[common-sdk httputil.go:35](https://gitlab.daqian369.com/esm/narnia/common-sdk/-/blob/4dcc8e8b401b/httputil/httputil.go#L35) 正则为 `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`。非法值目前记录日志后仍传播，不因此拒绝支付；尚无 SDK 实现，不能将说明遗漏称为已复现运行故障。

上表均为已判定、保留的非阻塞项（`resolution_status=accepted`），无待补证或需用户裁决的 HOLD；`admitted_blockers=0`、`hold_total=0`。上节旧文档差异已经按当前 IDL 或已确认 SDK 责任裁决，不作为修复 SDK 的 finding。外部文档可据此同步；本次仅保存本地审查记录。

## 本轮执行证据与边界

IDL agent 在 `/Users/liyongning/Projects/workspace/dev/idl` 执行既有定向检查：

```sh
git ls-remote origin refs/heads/feat/esm-v1.4
go test . -run '^(TestPayProtoIsInternalOnlyAndPhaseOneScoped|TestTradeProtoHTTPBindingsAndPhaseOneScope|TestInfraTradePayErrorCodesAreRegisteredAndUnique|TestDescribeErrorCodeInfraTradePayContracts|TestInfraTradePayQualifiedCodesAreExplicitlyRegistered|TestPayProtoHasNoGeneratedHTTPGateway|TestTradePayRequestBizNoLengthsMatchBiznoFormat|TestClientPlatformValueDomainStaysOpen|TestPayParamsJSONShapeIsTheFrontendContract)$' -count=1
```

9 项测试通过，退出码 0，输出摘要 `ok .../idl 0.641s`。测试覆盖 oneof JSON 形态、HTTP 绑定、公开错误注册/限定词描述、单号长度、client_platform 开放值域和内部 pay 不生成 HTTP gateway。执行前后 IDL 工作树干净。这里保存 agent 返回的执行摘要，不将其伪装为完整原始日志。

主 Agent 复读了当前 trade/pay/base/trade_event 字段、相关飞书原文、锁定网关 writeError/鉴权出口与 common-sdk 正则。规划 freshness 检查在审查前通过，本记录写入后再次检查；notes 不在五份规划 digest 中。

以下仍是既有实施/验收任务，不是新协作 TODO：支付 Consumer 登记、实际生成/Profile 核验、完整去敏 wire Fixture、两类网关出口与 17 项错误样例、SDK 场景测试、平台及真实渠道运行。当前 IDL 尚未登记 infra-payment-sdk Consumer，Task 1 已明确负责。服务端 9 项测试通过不代表 SDK 自动化、真实支付、业务权益或发布通过。

### 飞书原始响应摘要

| 临时文件 | SHA-256 |
|---|---|
| errors.json | `706933013ae39dba5d038020627564879cbbe85d732540d312bd91110662e9a2` |
| flows.json | `42e085567898897b072787e422aa3d4b981988548166f24b042593f9174220d7` |
| interaction.json | `953fd44b810dc669fc04eb65956a0dbafa94882fdca60c2b1f41f6dbcd301a8e` |
| overview.json | `e94a5e6645381bd9588d16c35a2d346ead505c10193d2c7a07fe4ae6c0660b99` |
| proto.json | `9a0469f8d05a2afb50e0bc7abfbdeb83fa48cd100a6e32103f8833b0bf7ff6e8` |
| references.json | `29d39f15e5dbe83222a71b8fc326bd15acbab8f3017e1c0b00ad5188239e1cac` |
| states.json | `9e1e5dd4584f78875da873aa65e905ab7be1e519f66c78d4ca15427fd1e839f1` |
