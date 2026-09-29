阳阳，收到你对支付 SDK 三项契约问题的完整回复。我们已核对你提供的 IDL ae12898、infra-trade 36b636c、infra-pay f5b03ba，下面把前端最终采用的处置规则同步给你，请核对是否与服务端理解一致。

**一、共同边界：前端重新发起支付调用，支付单复用由服务端决定**

业务先创建交易并取得 trade_no，SDK 接收已有交易号，通过 CreateTradePay 获取本次支付参数，再调起渠道。前端所说的“重新下支付单”，指再次请求 CreateTradePay，开启一次新的 SDK 支付流程。

SDK 保持原 trade_no、channel、app_id，不判断 payment_no 是否变化，不要求生成新单号，也不维护支付单复用历史。服务端按状态决定复用、续用、新建或返回错误。SDK 校验并使用本次响应中的完整、有效 pay_params；不会拿上一次缓存的参数直接重放，也不要求所有签名字段都必须变化。

你说明的有效 PREPAID 复用 payment_no/outTradeNo/signData/paySig、按当前 session_key 重签 signature，完全符合这个前端边界。SDK 测试不会以“恢复后 payment_no 必须改变”作为验收条件。

**二、P01：身份中断后，前端从哪里继续**

1. 准备阶段业务 Access Token 失效：本次 SDK pay 返回 auth_required 和中断阶段，业务恢复同账号登录态后，用原交易号显式再次 pay，重新请求 CreateTradePay。SDK 每次 HTTP 请求读取业务提供的当前 Token，无需重建 SDK，也不自行登录或自动重试准备接口。
2. 准备阶段或调用渠道时明确报告 session_key 失效：本次 pay 返回 channel_session_required；业务完成渠道登录及服务端 session_key 更新后，用同一 trade_no/channel/app_id 显式再次 pay。SDK 重新取得本次有效参数后调渠道，服务端内部是否复用支付单不影响前端流程。仅更新业务 Access Token 不等于完成渠道会话恢复。
3. 渠道动作已发生，后续 QueryTrade 才遇到 Token 失效：本次调用返回 auth_required，保留原交易引用、渠道信号和最后可信查询结果；业务恢复登录态后，只调用 query/observe 查询原交易，不重新 CreateTradePay、不再次拉起收银台。只有成功提示、尚未查到 PAID 时也按此处理，不能把查询失败当成未支付。
4. 微信身份绑定缺失单独返回 identity_required，由业务处理绑定；不与 Token 或渠道会话失效合并。已有绑定后的 GetOpenIDByCode 会话刷新，与缺绑定时的 BindWxUserIdentity 分开处理，均属于业务登录流程。SDK 不接收或维护 OpenID、session_key，也不执行这些登录/绑定接口。
5. 原 SDK 调用在明确身份错误时结束，只返回一次最终结果，并携带中断阶段及交易上下文。业务恢复后显式调用 pay 或 query/observe；SDK 不悬挂旧 Promise 等待登录、不新增 resume 接口。换账号后按服务端 NotFound 处理，不根据错误码推断“交易不存在”还是“不属于当前用户”。

**三、P02：按新结构消费参数和判错**

- 按新 IDL 生成和消费 PayParams oneof；首期校验 channel 与 wechat_virtual 分支一致，校验必要字段和交易关联后再调用渠道。外层不再按 JSON string 解析。
- mode 在 signData 内容和调用参数顶层同时存在，与当前契约一致。SDK 使用顶层 mode，并逐字保留 sign_data 原文；不解析重序列化、不修改签名内容、不在前端补签。
- 以 BaseResp.status_code 作为业务成功/失败判据；success 等冗余字段不覆盖错误码，冲突时记录脱敏诊断。HTTP 200、字段存在或渠道 success 回调均不能单独表示支付成功；业务成功响应还须通过参数/关联校验。
- ProtoJSON 编解码交给生成契约：int64 字符串、枚举名、失败 payParams=null、oneof 仅输出命中分支等规则纳入协议测试，不手写另一套 DTO 或按字段存在判断成功。SDK 对外交易成功只依据 QueryTrade 返回的 PAID；Conflict 也不能直接映射为 PAID。
- 你回复中尚未核验的网关自行拒绝请求的 HTTP 行为，前端会对照网关契约/实现补核；完整去敏报文和 Fixture 在测试落实时补齐。这些作为具体核验工作跟进，不再扩大成新的架构决策问题。

**四、P04 与等待/关单的处置**

P04 对 SDK 的要求收敛为“同一交易再次请求时，取得本次可用参数或明确错误”。支付单状态机、首签失败后的落库状态、复用条件及重新签名由服务端负责；SDK 不依赖它一定产生或一定不产生冗余支付单。

原生收银台等待不设 SDK 回调时限，不用 HTTP/查单超时或 expire_time 推断收银台关闭。渠道成功提示或已返回的未知结果后按策略查询；明确取消/调起失败返回业务。宿主显式停止仅结束本地等待、清理活动记录并隔离旧回调，不关单、不退款；进程退出后由业务找回 trade_no 查询事实。自动关单及渠道期限协调按服务端规划推进，不作为 SDK 一期实现前提。

以上是前端对三项 TODO 的最终理解，我们将据此统一更新 Spec、Design、Tasks 和测试预期。请重点核对：准备失败恢复后重新请求、渠道会话恢复后重新取参、查询中断恢复后只查询，以及支付单复用完全归服务端这四个边界。如果有不一致，请直接指出对应场景和服务端期望；一致的话回复确认即可，避免前后端实施时各自补出不同流程。
