# Task 3 方法级错误生成缺口核验（非规范性）

日期：2026-09-09。来源为“支付 SDK _ apply”交接；本次在 SDK 主工作区做规划输入核验，不修改 Apply worktree、IDL 或 ProtoGen 实现。本记录是证据与交接材料，不替代 Spec/Design/Tasks，不把核验结果当成缺口已修复。

## 后续决定（2026-09-09，以此覆盖下方历史建议）

用户已明确：SDK 以 IDL 为主，在通信协议包手写维护所需错误码的 TS 副本，本期不做 ProtoGen 错误码生成。范围同时包含通用及业务专用错误；不存在“业务专用错误必定在 Proto 中”的假设。Spec/Design/Tasks 已改为 17 项 bigint 常量/描述、锁定来源、独立 Go Fixture 一致性与漂移验证，由 Task 3 承接；不再等待上游新增生成能力，也不再需要选择 ProtoGen 实施任务。

以下生成缺口核验仍是事实，但“禁止手写副本”“上游生成能力为前置”的内容仅保留为历史讨论，不能覆盖当前正式规划。临时审计数据依然不是 Task 3 已验收产物；Task 3 须从固定原始来源重新交付正式样例及证据。此次为规划语义变更，旧 Plan Review 摘要已失效。后续用户授权继续，当前已完成独立 Plan Review：Approved，Critical/Important 为 0，Minor 为 2，digest 为 6df512cef15ab4515be9a347a7fa3d4d10c7e31e7851e9915ad685c48bb840ba；具体准入与说明口径见 plan-review.md。该结果不等于 Task 3 实现或验收完成。

## 结论与状态

Task 3 的前置输入缺口成立。SDK 当前契约要求的 17 个 CreateTradePay、QueryTrade 与 GatewayProxy 错误定义只在 IDL Go 代码中，当前 TypeScript 生成输出没有可导入的同名常量与精确错误描述。不能用 CanonicalErrorCode、biz_code_name 文案、错误码位段解析或 SDK 手写数字表代替。

已有 SDK 公共错误分类、BaseResp.status_code 权威性及恢复矩阵不需要因此降级。优先由 IDL/ProtoGen 提供正式机器可读来源及生成能力；格式、Profile 和生成路径应在上游方案中确认，不能在 SDK 工作区临时拼一个 Go 解析器或后处理 generated 目录。现有 ProtoGen 配置没有可直接开启此能力的选项，升级到当前最新发布版也不能解决。

本次仅新增这份核验记录；五份正式规划输入未改，无新 Plan Review digest。0e7605c 的 PASS 仍对应原冻结输入，但不证明这个已证实缺失的 Task 3 前置条件满足。Task 3 继续阻断；上游交付后需核对并更新具体输入，发生规划语义变更则重新评审。

## 已核实的固定来源

| 对象 | 固定版本与核对结果 |
| --- | --- |
| SDK 已评审规划 | 0e7605cc2a11fb7d0490a69f2465c548a5dc0761；digest 25a238e3db4e210f86207aead7ca5b5e1e314757a034e0ba45a030297981f072 |
| Apply 交接版本 | feat/headless-payment-sdk，e7ba0ac；Task 1/2 已完成属于 Apply 会话报告，本轮未重复验收这些任务 |
| 支付 IDL | 5539be8f09323709fa65f6568efe22896ec35d24，新增 infra-payment-sdk Consumer，支付语义继承 4e5cb22659fd4f4c36d06ae81256dc1c43e691d9 |
| 本地安装及私有库最新正式 ProtoGen | 0.1.2；项目 pnpm proto:version 返回 build commit 9f706d4811a8ffaffeabcfa6fbaedff8670f1c89；pnpm view 同样返回 0.1.2 |
| 消费 Profile | generated-idl2-compatible/v1，output packages/payment-protocol/src/generated |
| 实际 TS 产物 | 有 BaseResp、ErrorInfo、CanonicalErrorCode；BaseResp.statusCode 为 bigint。错误名在少数 JSDoc 出现，不是可 import 的常量 |
| 生成器来源核对 | proto-gen/internal/idl/workspace.go 只纳入 .proto；internal/config/types.go 的 Producer/Consumer 契约没有错误目录输入；plugins/tsclient/generator.go 由 descriptor projection 经 ts-proto 生成 |

IDL 的 base.proto 明确把 error_code.go 标为错误码唯一真源；error_contract.go 的 DescribeErrorCode 提供 canonicalCode、bizCodeName、source 与 retryable。原消息指出的四个错误只是子集，SDK 完整映射还需查询错误和网关错误。

## 精确错误值：只读核验结果

下表由锁定 IDL archive 内运行 Go 程序，直接引用原 Go 常量并调用 DescribeErrorCode 得到，没有在 SDK 写入数字常量。它是审计数据，不是获准的 SDK 生产错误目录或生成器输出。

| Go 名称 | 十进制 statusCode | canonicalCode | retryable |
| --- | --- | --- | --- |
| ErrGatewayProxyInvalidParameter | 20200002001010 | CANONICAL_ERROR_CODE_INVALID_PARAMETER | false |
| ErrGatewayProxyUnauthorized | 20200002001020 | CANONICAL_ERROR_CODE_UNAUTHORIZED | false |
| ErrGatewayProxyNotFound | 20200002001030 | CANONICAL_ERROR_CODE_NOT_FOUND | false |
| ErrInfraTradeCreateTradePayUnauthorized | 10100801002020 | CANONICAL_ERROR_CODE_UNAUTHORIZED | false |
| ErrInfraTradeCreateTradePayNotFound | 10100801002030 | CANONICAL_ERROR_CODE_NOT_FOUND | false |
| ErrInfraTradeCreateTradePayChannelUnavailable | 10100801002080 | CANONICAL_ERROR_CODE_UNAVAILABLE | false |
| ErrInfraTradeCreateTradePayConflict | 10100801002040 | CANONICAL_ERROR_CODE_CONFLICT | false |
| ErrInfraTradeCreateTradePayInvalidParameter | 10100801002010 | CANONICAL_ERROR_CODE_INVALID_PARAMETER | false |
| ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter | 10100801002090 | CANONICAL_ERROR_CODE_INVALID_PARAMETER | false |
| ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter | 10100801002100 | CANONICAL_ERROR_CODE_INVALID_PARAMETER | false |
| ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter | 10100801002110 | CANONICAL_ERROR_CODE_INVALID_PARAMETER | false |
| ErrInfraTradeCreateTradePayWxIdentityNotFound | 10100801002120 | CANONICAL_ERROR_CODE_NOT_FOUND | false |
| ErrInfraTradeCreateTradePayUnavailable | 10100801002070 | CANONICAL_ERROR_CODE_UNAVAILABLE | true |
| ErrInfraTradeQueryTradeUnauthorized | 10100801003020 | CANONICAL_ERROR_CODE_UNAUTHORIZED | false |
| ErrInfraTradeQueryTradeInvalidParameter | 10100801003010 | CANONICAL_ERROR_CODE_INVALID_PARAMETER | false |
| ErrInfraTradeQueryTradeNotFound | 10100801003030 | CANONICAL_ERROR_CODE_NOT_FOUND | false |
| ErrInfraTradeQueryTradeUnavailable | 10100801003070 | CANONICAL_ERROR_CODE_UNAVAILABLE | true |

相同 canonicalCode 对应不同 SDK 行为，例如普通 InvalidParameter、ChannelPolicyInvalidParameter、SessionExpiredInvalidParameter、ChannelRejectedInvalidParameter 均为 INVALID_PARAMETER；普通 NotFound 与 WxIdentityNotFound 均为 NOT_FOUND。不能只按 canonicalCode 识别身份恢复。ChannelUnavailable 与普通 Unavailable 的 retryable 也不同。

## 完整 wire Fixture 来源

有足够的权威生成输入，但没有现成、完整、可直接验收的 SDK Fixture 集。Apply 工作区尚无 packages/e2e/tests/fixtures，服务端回复里的省略号样例不能执行。

- 锁定 IDL 5539be8 的 gen/go、BaseResp/ErrorInfo、trade/pay oneof 与错误常量/DescribeErrorCode 可提供消息结构和错误语义。
- trade_pay_contract_test.go 的 TestPayParamsJSONShapeIsTheFrontendContract 明确并测试 lowerCamelCase、int64 字符串、具名枚举与 oneof JSON 形态。
- 锁定网关 a7619530784c4042fa109218764b9ad2335cd1de 的两个出口仍须分别取证：支付 gRPC 响应走默认 grpc-gateway marshaler（EmitUnpopulated=true）；writeError 走 common-sdk JSONProtoField（既有核验为 EmitUnpopulated=false），只有 baseResp 外层。
- 网关真实 Git 地址为 git@gitlab.daqian369.com:esm/narnia/infra-gateway.git。esm/infra/infra-gateway 不可用；本轮按正确 remote 成功读取固定 a761953。不要把链接路径错误当作服务不可用。该历史版本仍不证明 xpay_env 已部署兼容。
- 网关锁定 common-sdk v0.0.0-20260618152318-4dcc8e8b401b；已有核验见 contract-alignment-20260907.md。本轮重新核对了固定网关 writeError 与 go.mod，未重新运行完整网关测试。
- Task 3 应按这些原始来源生成完整合法 JSON，记录消息/代码/工具版本、生产 marshaler 配置、命令和摘要；在合法样例上明确变异得到防御测试。结构模拟签名不能当作真渠道签名。本次没有冒充已交付这些 Fixture。

本轮在隔离的固定 IDL archive 中运行：

```sh
go run /tmp/payment-sdk-error-contract-audit-20260909/inspect_errors.go
go test . -run '^Test(DescribeErrorCodeInfraTradePayContracts|PayParamsJSONShapeIsTheFrontendContract)$' -count=1 -v
```

两项 IDL 原有测试均通过。完整错误清单和日志位于 /tmp/payment-sdk-error-contract-audit-20260909/；这里的临时程序仅用于读取权威值，不作为产品生成脚本或消费依赖。

## 上游交付的最小验收要求（待上游方案确定实现）

1. 错误名称、精确 int64 值、方法/网关归属及 DescribeErrorCode 的语义有唯一权威来源；不得人工维护 Go/TS 两套事实。
2. IDL Producer 将该来源作为正式契约输入；ProtoGen 对应 Profile 可消费并生成 TypeScript。错误目录变化必须参与来源摘要、状态/兼容性检查，不能仅修改 Go 错误而令 Consumer 仍显示 current。
3. 17 个必需错误都有受支持的 generated 符号和精确错误描述；与 BaseResp.statusCode 的 bigint 比较方式明确、全精度保持，符号可通过通信协议包使用，SDK 公共包不泄漏 generator 私有路径。
4. 用固定 Go 权威与 TS 实际产物逐项比对；错误值、retryable、特殊错误描述或遗漏项的变异应使测试失败。失败/不支持输入不得静默省略错误、继续生成或破坏既有输出；相同输入再次同步应 no-op。
5. 不回归已有 Profile 的文件/类型/codec 兼容与 Consumer 投影、输出事务规则；若新增正式输出或 Profile，明确路径、版本和迁移方式。
6. 完成后回交精确 IDL/ProtoGen 提交、正式可安装版本、配置与生成命令、产物路径和错误清单。SDK 规划按该事实更新并重新评审，再将同一规划及 PASS/freshness 交回 Apply。不能在这些事实缺失时编一个新 digest 宣称解阻。

## 下一步归属

已向用户询问由新建 ProtoGen 任务、指定现有任务，还是当前任务继续负责上游能力。确定前不向已结束的 ESM 2.1 ProtoGen 任务擅自派发新迭代，也不自行新建用户任务。收到归属后，将本记录作为可复核的交接输入。
