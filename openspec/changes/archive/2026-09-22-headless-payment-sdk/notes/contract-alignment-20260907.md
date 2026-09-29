# 前后端契约落实与网关核验（非规范性）

日期：2026-09-07。本记录保存本轮规划更新的证据与边界；正式要求以 Spec/Design/Tasks 为准。未执行 Plan Review、Apply、部署、发布或真实支付。八个实施任务未勾选，36 个 TC、6 个 FLOW 均为 draft。

## 结论来源与落实

- 用户最终明确：前端以同一 tradeNo/channel/appId 再次请求 CreateTradePay，作为新的 SDK 调用；不要求 paymentNo 变化。支付单复用、续用、新建与签名由服务端负责，SDK 只消费本次响应完整有效参数。
- [服务端完整回复](payment-backend-reply-20260907.txt)明确结构化 PayParams oneof、mode 两处存在、signData 原文、status_code 权威，以及有效 PREPAID 可复用单号/SignData/PaySig、当次重签 signature。
- [已发送的最终前端结论](payment-frontend-alignment-20260907.md)及原回执保持原样。消息 ID 为 om_x100b66d2188610a0b1b4befe157165f；本轮先后只读核查该会话，截至记录时张阳阳无新增回复，不将二次确认记为已收到，也未重复发送。
- 本轮同步 Proposal、Design、两份 Spec、Tasks、根 AGENTS 和 README；清除旧 P02 待决及“恢复必须新 paymentNo”的要求。旧通信/回顾不作为实施规则。
- 身份中断结束原调用；prepare 恢复后显式 pay，query 恢复后仅 query/observe。渠道 Session Key 恢复与业务 Token 恢复分开。无原生回调计时器，显式停止和迟到回调隔离规则保留。
- SDK 内部 ChannelPaymentParams、decoded wire 存在性校验、完整错误映射与测试输入是本轮细化的 SDK 消费设计；不声称这些前端类型由服务端定义。全部随当前规划接受独立评审。

## 精确来源

| 仓库 | 核验 commit | 核验范围 |
| --- | --- | --- |
| IDL | ae128984a1c8126e3cb4662962b75a4ad527528a | trade/pay/base/wx、错误定义、PayParams JSON 契约测试 |
| infra-trade | 36b636c02afb0a31447b52f83fea922120e08666 | CreateTradePay/QueryTrade 业务响应、错误与纯转发边界，沿用前轮源码核验 |
| infra-pay | f5b03ba5d4010d213cdfe779e7d331319997d409 | 支付单决策、虚拟参数构造与签名，沿用前轮源码核验 |
| infra-gateway | a7619530784c4042fa109218764b9ad2335cd1de | 两个支付 HTTP 路由、鉴权拒绝、生产 marshaler；go.mod 的 IDL 同为 ae12898 |
| common-sdk | 4dcc8e8b401b | 网关锁定依赖的 JSONProtoField / ErrorBaseResp 出口 |

网关实际仓库是 esm/narnia/infra-gateway；探测 esm/infra/infra-gateway 返回不存在/无权限，未以该失败推断服务异常。IDL 原工作树未切换或修改；pay/trade/gateway 通过临时 bare clone 或指定 commit 的 archive 读取。

## 网关与协议测试

发现两条不同序列化路径：

1. http.go 的 writeError 固定 HTTP 200 + baseResp，鉴权失败/网关路由拒绝走此路径。其 common-sdk JSONProtoField 使用 EmitUnpopulated=false；只出现 baseResp，未赋值字段可省略，非零 statusCode 仍输出。auth_policy.go 中的“401”注释不等于当前实际状态码。
2. 支付 handler 经 newGatewayMux 的默认 grpc-gateway marshaler，EmitUnpopulated=true、UseProtoNames=false：lowerCamelCase、int64 字符串、枚举名称；失败时 payParams=null、标量默认值可出现，oneof 不输出未命中的分支。

在临时完整源码副本执行已有测试，没有修改业务源码或增加测试。初次运行因 Go 私有模块元信息解析到错误的 esm/narnia.git 地址失败；Go workspace 尝试又遇到 macOS /var 与 /private/var 路径及旧依赖图解析问题。最终仅在临时网关副本的 go.mod 使用本地 replace，分别指向锁定 common-sdk 4dcc8e8b401b 和 IDL ae12898 的完整 archive，GOWORK=off 后执行成功；原仓库与用户全局 Go/Git 配置未修改。因此证据证明锁定源码的行为，不能证明私有 Go 模块下载链路或生产部署可用。

执行命令（临时网关根，实际以参数数组调用）：

```sh
GOWORK=off go test -mod=mod ./internal/infra/gateway -run 'TestGatewayMarshalerKeepsLowerCamelCaseJSON|TestInfraGateway_TradePayRequiresTokenAndInjectsUserID|TestInfraGateway_TradeQueryRouted' -count=1 -v
GOWORK=off go test -mod=mod gitlab.daqian369.com/esm/narnia/idl -run '^TestPayParamsJSONShapeIsTheFrontendContract$' -count=1 -v
```

结果：两条命令退出码均为 0；网关 3 项测试通过，IDL 参数形态测试及 5 个子项通过。原始测试使用模拟后端，部分响应字段是测试默认值；不能当作完整支付成功 Fixture。筛选的原始结果与完整日志摘要见 [测试结果](gateway-contract-tests-20260907.txt)，不是 SDK 自动化或真机验收。

## ProtoGen 与测试输入落实

使用 SDK 项目内 0.1.2，先读取官方 init 模板；临时 Git 仓库中的 init producer/consumer 成功。在 ae12898 的临时 IDL archive 中加入设计规定的 infra-payment-sdk Consumer 后，config validate --json 返回 status=valid、exitCode=0。仅验证配置结构，没有修改正式 IDL、登记远端 Consumer 或生成产品代码。

Design 已明确 Consumer/source/output/Profile/目录与两个实际 HTTP 方法；按文件生成的其他方法不自动注册到 SDK 或 Shadow。ProtoGen 0.1.2 包说明明确原生执行支持 darwin/arm64，CI 应选择匹配执行环境。

公共契约增加必需测试输入表：正常 oneof、两种错误出口、信封缺失/冲突、非法参数、完整错误码、恢复后复用/不同 paymentNo、请求与时间。Task 3 生成完整非敏感结构样例并保存来源，Task 6 建立元数据/Fixture 绑定，Task 7/8 运行连续流程。回复中的省略号样例不能直接执行；模拟签名不证明真实可支付。

## 当前状态

三项协作问题的前端设计已具备依据，无新增需用户决策的设计 TODO。后续按 Plan Review → Apply 推进，工具生成、完整 Fixture、实际包消费、平台/真实渠道证据仍由八个实施任务交付。本轮不把验证规划文件或服务端定向测试通过记为 SDK 工程完成。

## 规划文件校验

- openspec validate headless-payment-sdk --strict --json：通过，issues 为空。
- 文档链接、代码围栏、尾随空白及旧结论扫描：通过；4 张时序图都有 autonumber。
- Scenario ID 共 36 个且唯一，FLOW ID 共 6 个且唯一，8 个顶层 Task 全部未勾选；现有 verification 示例的 blockedBy 已清空，未生成运行通过证据。
- openspec status：schema=openspec-workflow，Plan Review 为 ready，尚无 plan-review.md；本轮未开始独立评审。
