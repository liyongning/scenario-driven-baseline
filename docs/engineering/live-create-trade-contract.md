# Live 交易创建网关契约登记

Status: ready

权威来源是 IDL `67266349aef2dc589e68541f042ff845749b3363` 的 `trade.proto`、`base.proto`、`pay.proto`、`error_code.go` 与 `error_contract.go`。当前 Consumer 实际解析到 `80707134aff4149d6195b197409b1a58f91a01f4`；相对受审版本，trade.proto 只移动了本宿主不消费的 ApplyRefund HTTP 路径并补充 client_platform 注释，pay.proto 仅注释，base/枚举未变，创建消息与四个创建错误码逐字节一致；新增的 pay_repair.proto 与调整过的 wx.proto 都不在 trade.proto 文件级闭包内。ProtoGen 生成方法为 `POST /api/base/trade/create`、`body=*`，本仓库仍复用既有 `trade.proto` 文件级 Consumer。

Token 通过 `Authorization: Bearer <token>` 交给网关注入 metadata `user_id`。测试人员另外手填十进制 `user_id`，该值只写请求 body；服务端要求它等于登录 uid。本宿主不解析 Token，不生成 `user_id` Header，也不把 user_id 写入 env、Storage、SDK 初始化或 PaymentRequest。`productId`、可选 `lane/appVersion` 由协议公共上下文写入 Header，`baseReq.requestId/productId` 由同一协议客户端生成。

请求使用 generated `CreateTradeRequest`。自 6726634 起 `items[].sku_snapshot` 是结构化 `SkuSnapshot`：`wechatVirtualProductId`（最长 64，微信虚拟支付道具 id，服务端为空时回退 `skuId`）与 `bizSnapshot`（最长 2048 的 JSON 字符串，服务端不解析、原样落库）。宿主表单按对象编辑这两个字段，wire 不把对象拼回旧的单层 JSON 字符串。内置默认值为 `payment_sdk_live`、虚拟商品、单价/原价/应付 100 分、优惠 0，满足服务端渠道策略的最低交易金额；`.env.live` 可通过严格的 `PAYMENT_LIVE_TRADE_DEFAULTS_JSON` 覆盖这些非敏感字段。页面允许编辑全部创建字段，提交前校验字符串长度、enum、int32/int64 十进制范围、JSON、行号唯一性，以及逐行和整单金额等式。业务交易号和子单号随草稿生成；失败后显式重试保留原号，新建草稿才换号。

创建成功必须同时满足：HTTP 2xx，原始响应明确含无损 `baseResp.statusCode=0`，`tradeNo` 为 1–25 字符，状态为已定义且非 UNSPECIFIED，`orderNos` 与请求 items 等长、每项 1–25 字符且唯一。只有此时才把真实 `tradeNo` 留在宿主内存供支付 SDK 使用。创建不会自动支付。

本地错误分类固定为：HTTP 401、CreateTrade/Gateway Unauthorized → `auth`；CreateTrade/Gateway InvalidParameter → `invalid_input`；CreateTrade Conflict → `conflict`；CreateTrade Unavailable、Gateway NotFound、未知非零码、网络、超时与无有效信封的非 2xx → `unavailable`；本地停止 → `cancelled`；2xx 的非法信封或成功载荷 → `invalid_response`。CreateTrade 四项码为 `10100801001010/20/40/70`，网关三项码为 `20200002001010/20/30`。所有失败均不自动重发、换号、查询或发起支付。

创建预算为 60 秒；取消只结束本地等待，不改变服务器交易事实。Token 在每次创建调用时从 Storage 重新读取。CreateTrade 适配器、表单和四项创建错误只位于 E2E 测试宿主；支付 SDK 公共 API、Shadow 的 CreateTradePay/QueryTrade 两方法清单和固定 17 项产品错误表均未扩展，QueryOrder 也未被消费。

本登记证明契约和本地实现已就绪。test/prod 完整地址、兼容网关与 trade/pay 部署版本、测试账号权限、真实 user_id 校验和渠道扣款仍由 Task 8-C 的受限 Live 记录证明；当前未把模块假响应或 Go 样例当成真实服务验收。服务端仍接受调用方自报金额，因此该测试表单不能作为正式 C 端商品核价方案。
