# packages/payment-sdk/AGENTS.md


必读：[Proposal](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/proposal.md), [Design](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/design.md), [能力 Spec](../../openspec/specs/payment-sdk/spec.md), [公共契约](../../openspec/specs/payment-sdk-contract/spec.md), [Tasks](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/tasks.md), [README](../../README.md)。
[根 AGENTS](../../AGENTS.md)

1. 先读根 AGENTS、能力 Spec、公共契约及 Design 的模块图/流程。src/index.ts 是公共导出；factory.ts 校验配置并装配客户端；禁止内部测试工厂进入公共 exports。
2. core/ 只编排内部端口；ports/ 定义 backend/channel/runtime/device-info；adapters/payment-infra/backend.ts 是 method/channel、支付结果、错误和交易关联映射的唯一位置；adapters/channels/ 只消费准备参数并调用渠道；adapters/platform/ 只采集设备信息；runtime/ 提供运行工具。
3. HTTP 执行、Header/BaseReq 和 ProtoJSON 由协议包负责；SDK 工厂通过协议包根导出的 createWechatMiniappHttp 装配网络，不在 SDK 根转导出；SDK 不另写 HTTP 层。核心无 wx/DOM/Node/ESM 依赖，平台全局只在对应适配边界按调用读取。
4. 宿主只提供已定义配置/provider。禁止业务登录、Token 刷新、OpenID 输入、签名生成、SKU/权益/UI/导航逻辑。渠道信号不是服务端账务事实；时间与重复调用严格引用公共契约，不在本文件复制默认值或另定续接规则。
5. 每个手写模块的 *.test.ts 就近维护；模块单测可注入内部假端口。Spec 标为 module 的 case 使用现有 Vitest meta/注记绑定检查点，收集实际单测证据，不增 SDK 公共测试导出或反向依赖 E2E helper。公共支付流程在 E2E tests/flows，不能用内部假 backend 的单测代替跨包流程证据。
6. 修改本包执行 sdk-unit、类型、构建及相关 TC/FLOW；交付前根 pnpm check。恢复入口、结构化参数及响应判错按公共契约；SDK 不比较恢复前后 paymentNo，不重放旧参数。新契约缺口先更新 Spec，再评审，不在实现中猜测。
7. onPhase 仅按公共契约的两个边界发出，由核心隔离异常并去重，渠道适配器通过 beforeInvoke 通知核心、通过 markInvoked 同步登记调用；通知后的第二次停止检查命中时保持 not_invoked，重复/迟到标记无效；禁止业务 UI 进入回调实现、误用 onDiagnostic 或新增渠道超时。contracts.ts 和映射/生命周期的中文注释逐项对齐中文语义表，双格式声明保留公共 JSDoc，验收记录源码与声明位置。

8. xpayEnv 仅由本次 PaymentRequest 输入；核心复制并校验，backend 映射 generated 具名常量；省略保持 absence。不得放入初始化默认或从 runtime/lane 推断，不得改写 signData.env；查询不携带选择，恢复按公共契约由业务显式再次 pay。

9. ports/backend.ts 的内部 BackendResult 只为通信 CANCELLED 增加 `{ok:false,cancelled:true}`；prepare/query 都中性透传，不附 error、不伪装 TIMEOUT。公共 PortResult/PaymentError/PaymentClient.query 和 SDK 根 exports 不扩展；停止、预算与异常取消的最终结算归核心。backend 错误分类只从协议根出口消费手写 IDL 目录，不再复制错误数字或导出目录。
