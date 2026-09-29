# packages/payment-protocol/AGENTS.md

## 模板通用规则

### 按示例扩展新业务

新业务只通过协议包公开入口消费生产能力；generated 由获准工具维护，testing/Shadow 负责测试宿主，不把业务场景写进通用协议引擎。模块单测就近维护，跨包行为由 E2E 绑定 verification case。

## 当前业务：支付


必读：[Proposal](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/proposal.md), [Design](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/design.md), [能力 Spec](../../openspec/specs/payment-sdk/spec.md), [公共契约](../../openspec/specs/payment-sdk-contract/spec.md), [Tasks](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/tasks.md), [README](../../README.md)。
[根 AGENTS](../../AGENTS.md)

1. 先读根 AGENTS、proto-gen.yaml/lock、公共请求契约与 Design。src/generated/ 仅由获准 ProtoGen 管理；不在其中增加手写 index、测试或 AGENTS，不编辑 generated DTO、codec 或 metadata。
2. ProtoGen 是项目根 devDependency，通过项目 pnpm scripts/pnpm exec 执行；安装/升级查私有 registry 最新正式版并保存精确版本与锁文件，不使用全局工具。生成顺序为 proto:version → proto:validate → proto:status；需要更新时 proto:sync → proto:status。使用支付 Consumer/Profile 和精确来源，不能复制 ESM Consumer/分支。缺生成能力提交给 ProtoGen 维护方处理。
3. client.ts 按实例绑定配置/provider/transport，消费 generated method.meta/codecs；transport/context.ts 维护公共 Header/BaseReq；transport/errors.ts 维护通信错误；adapters/network/ 只封装平台 HTTP。不得配置全局 handler、刷新登录态或自动重放请求。
4. 协议包不引用 SDK/E2E 类型，不解释 PAID、渠道结果或权益。返回 decoded 协议、只供校验的 wire 及 HTTP 上下文供 SDK 映射；禁止将这些原文输出诊断，生产入口只导出已审议的客户端、createWechatMiniappHttp、通信类型、错误目录/描述查询/来源提交及 generated 子入口；该网络工厂从现有根入口供 SDK 装配，加载/创建不读取平台，测试不得另写 HttpPort 代替其 weapp 证据。交付产物变化需要升级自身版本，由 SDK 发布流程统一处理依赖发布；不提供单独的协议包发布入口，不要求业务方直接安装或选配协议版本。
5. testing/index.ts 和 testing/shadow/ 为 Node 测试工具；通过 @payment-test/protocol 供仓库测试使用。Express/Ajv 等测试依赖不得进入生产导入图和 tarball；Shadow 路由由 Consumer metadata 发现，不手写 endpoint 表。
6. src/ 与 testing/ 内手写逻辑的单测就近，协议/流程集成和 Fixture 在 E2E；不把某个支付用例写入 Shadow 引擎。修改执行 protocol-unit、生成状态、类型/构建及受影响协议/流程测试；交付执行根完整门禁。

7. 生成契约须保留 xpay_env 的 optional presence，codec 区分省略与显式枚举；不手写数字常量/DTO/codec 或在网络层选择环境。Shadow 路由按业务登记，支付登记 CreateTradePay/QueryTrade；测试匹配保留原始字段存在性，场景环境期望由 E2E 提供。

8. 上条数字常量限制不包括已评审的 `src/errors/business-codes.ts`：该手写文件以 IDL `5539be8f09323709fa65f6568efe22896ec35d24` 的 Go 原常量和 DescribeErrorCode 为唯一来源，完整维护 17 项 bigint、generated canonical 枚举及原始描述。目录/条目冻结，查询按完整 bigint 精确匹配；不得从 canonical、文案或位段推断细分码。根 exports 暴露 paymentBusinessErrors、paymentBusinessErrorsIdlCommit、getPaymentBusinessError 和描述类型；文件纳入手写四项 100% 覆盖。固定 Go 来源取数输入、manifest 和 CONTRACT-024 五类一致性/漂移测试放 E2E；模块单测仅通过文件读取复用已确认 Fixture 数据，不引入 E2E 运行代码或类型。

9. generated lock 来源与固定 Go 错误源分别验收；遵循公共契约的完整兼容闭包比较与 current 门禁。无关上游更新不改写固定目录；相关错误语义变化先评审。
