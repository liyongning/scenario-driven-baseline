# 服务端完整回复核对（非规范性）

> 历史记录：当前方案已按[最终落实记录](contract-alignment-20260907.md)更新。本文保留当时的讨论与核验状态，不作为现行实施要求。

输入：[用户提供的完整回复](payment-backend-reply-20260907.txt)。本次为回复与会话结论的对照核查，不代替 Plan Review，也未执行服务端部署或真实支付测试。原 SDK 规划尚未按本次差异改写，不能据其现有 P2≠P1 断言实施。

## 核验来源

- IDL：ae128984a1c8126e3cb4662962b75a4ad527528a。已 fetch 并通过 git show 核验；原 IDL checkout 仍在 285f1be，未切分支或改工作树。
- infra-pay：f5b03ba5d4010d213cdfe779e7d331319997d409，通过临时 bare clone 核验。
- infra-trade：36b636c02afb0a31447b52f83fea922120e08666，通过临时 bare clone 核验。
- 核验时上述支付行为在服务分支后续提交中未改变；后续 diff 主要是文档注释。本次没有执行服务端测试或用户回复中所称的 protojson 实跑。

## 结论对照

1. **P02 核心契约已经明确。** pay_params 为 PayParams oneof，虚拟支付分支为四个字段，只有 sign_data 是签名原文字符串。mode 在 signData 内容和顶层都有，不能把此前文档未写全解释成服务端与渠道不兼容。base.status_code=0 表示成功，错误码优先于冗余 success。网关自行拒绝请求的 HTTP 行为在回复中仍明确未核验；带省略号的样例不能直接当可执行 Fixture。
2. **与上轮“渠道会话恢复后一律新 payment_no”有实质差异。** 同 trade_no/channel/app_id 的有效 PREPAID 复用 payment_no、signData、paySig、outTradeNo；signature 按当次 session_key 重新计算。CREATED 续用，无在途支付单才新建，SUCCESS 优先 Conflict。SDK 应显式重新请求 CreateTradePay 获取本次有效参数，不应要求 payment_no 一定变化。
3. **首签失败与复用重签失败不同。** 在 New/ContinueCreated 的首签路径中，明确 SessionExpired 会尝试把 CREATED 改为 FAILED；当该状态已落库，下次可新建。PREPAID 的 BuildPayParams 重签失败只返回 SessionExpired、不退状态，恢复后仍复用。因此回复 P01-B 中“只有本地 payment 行、下次复用或续用”的概括还应包含已落 FAILED 后新建的分支。
4. **查询恢复与用户最后澄清一致。** 已调渠道、查单时业务 Token 失效，恢复后仅 QueryTrade。不能为了恢复查询再次下支付单；Conflict 也不能直接被 SDK 翻译成 PAID，因为它还覆盖过期、换渠道及换 appid 等情况。
5. **身份建立和渠道会话刷新分开。** GetOpenIDByCode 在小程序分支刷新 session_key，但不能建立业务 uid 与 OpenID 的绑定；缺绑定时仍需 BindWxUserIdentity。已有绑定后的渠道会话刷新与缺绑定不是同一路径，均由业务登录流程负责，SDK 不新增 OpenID/session_key 入参。

## 可定位证据

- [PayParams 和签名原文契约](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/pay/v1/pay.proto#L185)：185–200 行。
- [BaseResp](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/base.proto#L37)：37–48 行。
- [支付单复用决策](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/domain_service/payment_domain_service.go#L215)：215–242 行。
- [每次重签 signature](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/channel/wechatvirtual/adapter.go#L70)：70–109 行；Prepay 无渠道下单。
- [双处 mode 的签名模板](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/channel/wechatvirtual/sign.go#L25)：25–31 行。
- [首签失败与复用重签失败](https://gitlab.daqian369.com/esm/infra/infra-pay/-/blob/f5b03ba5d4010d213cdfe779e7d331319997d409/internal/biz_service/prepay_biz_service.go#L368)：368–425 行。
- [会话刷新能力](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/wx/v1/wx.proto#L26)与[独立绑定入口](https://gitlab.daqian369.com/esm/narnia/idl/-/blob/ae128984a1c8126e3cb4662962b75a4ad527528a/infra/wx/v1/wx.proto#L127)。

## 方案修订影响

- P02 的旧 string 载荷与 mode 位置待决需要替换为结构化 oneof 的消费、分支关联校验、签名原文保护、BaseResp 判错规则及完整协议 Fixture 要求。
- 上轮恢复记录中的“新 payment_no”和 Design/Spec/FLOW-006 中的 P2≠P1 固定断言不能继续沿用。待本次口径对齐后，应按“显式重新请求，由服务端按状态复用/续用/新建”统一修订。该差异已经告知用户，不静默把两套结论视为一致。
- P01 的查询恢复原则无需推翻。完整 SDK 的 Promise、中断阶段及本地停止规则属于 SDK 契约，与后端是否复用支付单分层处理。
- 自动关单仍是二期后端职责；不能继续宣称每次会话恢复必然留下冗余单，也不因这处差异把自动关单变成 SDK 一期前置。
