## Why

ESM 1.4 首次接入微信小程序虚拟商品支付。前端支付能力采用独立、纯 TypeScript 的 Headless SDK，供不同业务和运行环境复用。SDK 封装支付协议、渠道交互与交易查询，业务负责登录、订单、权益和 UI，为后续接入 H5、公众号网页及扫码支付提供扩展基础。

本 change 负责通用 SDK 的规划、实施及仓库内验收，维护于独立 `infra-payment-sdk` 仓库。业务接入由 ESM 前端仓库的 [esm-v1-4-business Change](../../../../esm/fe_app/openspec/changes/esm-v1-4-business/proposal.md) 负责；两者通过 SDK 公共契约连接，分别评审。

## What Changes

- 建立平台无关核心、支付基建协议适配、端侧支付方式适配及平台网络适配四个职责边界；SDK 自己维护请求能力，首期通过微信 `wx.request` 发送请求，浏览器 `fetch` 属于后续平台实现。
- 宿主提供支付基建契约要求的配置与数据获取方法。SDK 按 IDL 和网关公共契约维护接口、Header、BaseReq、编解码及支付请求重试规则。
- 定义调用方装配、method/channel 映射、SDK 内部 client_platform 采集、返回关联校验、渠道调起与交易查询流程；业务鉴权失效后按中断阶段续接，查询阶段只查原交易；渠道会话失效导致签名不可用时，业务恢复渠道会话，再以同一 tradeNo/channel/appId 发起 pay，使用本次响应完整有效参数；支付单复用、续用或新建由服务端决定。
- 在 SDK Spec 中统一定义调用参数、运行生命周期、支付事实、渠道行为信号、鉴权结果及未知结果的语义。业务方案引用此契约，不复制另一套定义。
- pay/observe 支持每次调用可选的 onPhase，仅通知 channel_invoking（即将调用端侧渠道）与 confirming（开始向支付基建确认结果）；Promise 各交付一次最终 PaymentOutcome。业务自行映射展示，阶段不代表已支付、原生界面关闭或权益到账。
- 公共契约维护阶段、交易状态、渠道信号、结束原因及相关错误字段的中文语义、触发场景和判断边界；手写公共类型及映射/状态迁移代码维护对应中文注释，双格式声明产物保留公共 JSDoc，并纳入任务评审与交付验收。
- 首期实现和验证微信小程序虚拟商品链路。H5、公众号和扫码支付作为后续扩展目标，通过显式能力和适配接口接入。
- ESM 负责 SKU 展示、业务下单策略、席位发放判断、抽屉、Toast、导航和登录交互。SDK 使用已有登录态访问支付基建，鉴权失效返回业务方。
- 接口基线为 IDL `4e5cb22659fd4f4c36d06ae81256dc1c43e691d9`。服务端根据鉴权身份与 appId 查询微信身份，SDK 分别处理绑定缺失与会话失效。支付方式通过 method 映射到 channel；按结构化 PayParams oneof 映射渠道参数，逐字传递 signData，以 BaseResp.status_code 判定业务结果。
- 具体业务错误码以锁定 IDL 的 error_code.go/error_contract.go 为权威，在通信协议包的手写目录集中维护 TypeScript 副本，覆盖 SDK 所需的两方法及网关错误；不依赖 ProtoGen 生成该副本。副本使用 bigint、保留中文说明和来源版本，按独立 Go 来源样例验证名称、数值及错误描述；IDL 升级时同步核对，纳入手写质量与交付门禁。

- 每次 pay 可通过 PaymentRequest.xpayEnv 选择 sandbox 或 prod；省略时不发送字段，由服务端采用部署默认值。SDK 通过 generated 枚举/codec 写入 CreateTradePayRequest.xpay_env，不把它作为初始化配置、Header、泳道或查询参数，不改写签名原文。测试部署允许逐请求选择；生产部署按 IDL 强制走现网，即使请求 sandbox 也可能真实扣款。网关须支持该字段，协议 presence、逐次隔离及真实环境行为分别验收。
- 渠道明确调起失败（含官方表未列出的非零安全整数 errCode，如 16）按 launch_failed 结束并保留十进制 originalCode；未映射码不回退为 unknown，只有无可用错误码（缺失、null、0、非整数、非安全整数、NaN、Infinity、非数字）才保持 unknown。-2 取消与 -15007 会话失效保持专属语义；-5（开通签约结果未知）仍按 unknown 进入既有自动查询。不新增或调整 EndReason 等公共联合类型值，消费方现有状态分支不变；若消费方镜像 PaymentError 结构，则须同步接受新增的 message/channelMessage 字段。PaymentError 稳定提供 SDK 定义的中文 message；渠道 fail 回调的 errMsg 仅在值为字符串时作为可选 channelMessage 透传，缺失、null 或非字符串时省略。message/channelMessage 不参与分类、状态机、查单、恢复、重试或重放；channelMessage 不进入诊断或日志。本轮由消费方（ESM 小程序容器）联调反馈驱动，只改渠道适配器映射、公共 PaymentError 类型与统一默认文案构造、核心 invoke 阶段的结束原因、对外错误投影与相应测试，并同步公共 JSDoc 与双格式声明重建。
- 定义显式泳道配置、按目标服务匹配路由及支付异步事件的泳道边界。网关、服务部署和权益消费分别进行联调验证。
- 内置 HTTP 请求超时 60 秒、结果查询间隔 3 秒、结果确认总时长 60 秒，允许初始化及单次覆盖；查询预算在渠道回调后起算，原生收银台等待不设 SDK 超时。
- 渠道适配器在阶段通知和第二次停止检查后，通过内部 markInvoked 同步登记实际调用准入，核心据此区分停止时的 not_invoked/unknown；不增加公共阶段、API 或渠道等待时限。
- 通信取消通过 SDK 内部 BackendResult 保留为独立控制结果，核心根据宿主停止或时间预算一次结算；不把取消伪装超时，不增加公共错误码或业务参数。
- 支付基建适配器通过内部查询错误标签传递已确认的重查语义；核心不依赖错误数字，未知错误的 retryable 提示不触发自动轮询，公开结果只保留公共字段。
- 生成 Consumer 跟踪已配置 IDL 分支的当前来源，手写错误目录保留独立固定 Go 事实来源；只有支付兼容闭包及生成树不变时才允许刷新生成来源，不以提交号相等耦合两类门禁。
- SDK 不维护交易支付历史；再次传同一交易号由服务端裁决，交易到期不由 SDK 推导关单。
- 采用 pnpm workspace 与 Vite 生态的 Monorepo，包含支付 SDK、通信协议和私有 E2E 三个 Package。SDK 包与协议依赖包采用 Vite 库模式及声明生成插件构建，交付 ESM + CommonJS 双格式及类型声明；测试统一使用 Vitest。两包独立管理版本，开发使用 workspace:*，发布转换为精确依赖；发布入口统一为 SDK，通信协议包的必要发布步骤由同一流程处理，业务方只安装和升级 SDK。
- 通信协议包维护 ProtoGen 生成契约、实例化请求执行器、公共请求上下文、平台网络适配及测试专用 Shadow 网关；SDK 包维护支付模型、编排、支付语义映射及端侧支付方式适配。协议包现有根入口具名导出 createWechatMiniappHttp(): HttpPort，供 SDK 工厂及仓库协议测试装配既有微信网络实现；沿用根入口双格式和声明，业务只安装 SDK，SDK 公共入口不转导出该工厂。
- 质量门禁覆盖静态检查、全部手写实现代码的四项单测覆盖率 100%，以及全部 Spec 验证、可观察行为的支付 E2E、支付 Consumer 的 IDL 契约与必需 FLOW 覆盖率各为 100%。模块正确性使用就近单测，构建/门禁使用工程验收；两类证据不抵扣公共行为 E2E。AI 依据事实生成并保存测试/Fixture，Vitest 执行确定性测试；自动生成的 Proto 代码不计入手写覆盖率。
- 方案阶段细化完整包内目录、配套技术选型、根及三包 AGENTS.md 条款正文与官方脚手架初始化步骤；实施记录模板/工具版本和必要配置差异，复用官方/社区基础能力。
- 场景门禁按 Spec/IDL 清单、具体测试绑定和当前运行报告核对，并独立检查多个 Scenario 组成的必需连续支付流程。架构与质量检查提供统一根命令，由用户在本地、CI 或其他受控执行环境显式触发；是否把这些检查配置为合并必需项属于仓库治理，不是 SDK 发布能力或本 Change 的完成前置。
- 验收运行模式仍仅有 Shadow 与 Live：Node integration 和开发者工具 weapp 均归 Shadow；Live 能力由本仓库最小测试小程序、生产 SDK、真实交易创建网关及真实微信虚拟支付 API 承载，闭合创建交易 → 预下单 → 渠道 → 查单 → PaymentOutcome。交易创建只属于测试宿主，不增加 SDK API。若真实渠道已由用户或测试负责人完成验证，Change 可使用有边界的外部验收确认作为事实输入；这不改变 Live 宿主能力，也不新增“真实服务端 + 渠道替身”模式。
- Live 使用根 .env.live 配置非敏感服务参数，构建时显式注入白名单；Token 由测试人员在小程序内确认写入 Storage，可替换/清除，SDK provider 每次读取。测试宿主提供环境三态选择和脱敏结果取证，不实现登录、签名或业务权益。Live 创建按 IDL 6726634 的 POST /api/base/trade/create 实现：user_id 可由独立非敏感 env key 预填、页面可修改且仅进入创建 body；默认商品/金额表单可编辑并校验等式，业务单号按草稿生成及保留，成功后只交真实 tradeNo 给 SDK。复用已登记文件级 Consumer 和生成 codec，创建错误/表单/适配仅在 E2E；QueryOrder 不消费，支付两方法及公共 API 不扩展。真实部署/账号/金额授权仍按验收前置落实，测试数据不代表服务端核价安全。
- 保持现有 Shadow 在协议包 testing、Fixture/host/driver 在 E2E 的所有权，测试设施不进入产品依赖图或产物。Live 与 Shadow 分开构建和运行；真实渠道事实可由仓库 Live 记录或外部验收确认提供，两者只是证据来源不同，不支持真实服务端搭配渠道替身的第三种模式。
- 为每个实施任务定义共同完成条件、专属验收及证据要求；工程验收覆盖脚手架复现、三包边界、三层质量基建的正向/反例验证、实际包消费和平台运行，并区分 SDK 工程、真实渠道、业务接入及实际发布结论。
- 恢复流程、参数结构、响应判定和重复支付边界按公共契约执行；当前无剩余 SDK 设计 TODO。Consumer/Profile 登记、完整 Fixture、平台运行及交付证据由实施任务落实；过期交易处置与关单由服务端负责。

## Capabilities

### New Capabilities

- `payment-sdk`：纯 TS 核心、调用生命周期、适配扩展、首期小程序虚拟商品支付以及隔离测试要求。
- `payment-sdk-contract`：SDK 对业务方和适配器的公共契约、支付结果与业务权益的边界、版本及未知能力处理。

### Modified Capabilities

无。ESM 业务接入由 `esm-v1-4-business` change 定义。

## Impact

- 仓库为 `git@gitlab.daqian369.com:esm/infra/infra-payment-sdk.git`，规划产物保存在本仓库 `openspec/changes/headless-payment-sdk/`。产品包为 `@daqian/payment-sdk` 与其精确依赖 `@daqian/payment-protocol`，私有测试包为 `@daqian/payment-e2e`；输出为 ESM + CommonJS 及类型声明，两包独立版本，统一由 SDK 发布流程交付至 GitLab 项目 245 的私有 npm registry。E2E 在本仓库作为独立调用方完成 Shadow 自动化和 Live 真实支付验收；ESM 的业务上线验收独立，不作为本 Change 完成条件。精确工具版本、支付 IDL 的 Consumer/Profile 登记及用户触发的发布执行能力按 Design 的工程交付输入表执行。
- 外部依赖：服务端通用支付基建、上述 IDL 基线、识别 xpay_env 的网关及微信官方虚拟支付 API。IDL 及配套网关契约作为接口事实来源；Consumer/Profile、网关升级与实际部署证据按 Tasks 落实，不把本地生成成功当作网关已升级。
- 首期使用方：[ESM 业务 Change](../../../../esm/fe_app/openspec/changes/esm-v1-4-business/proposal.md)。业务方只依赖 SDK 公共入口，不能访问内部状态或复制渠道适配逻辑。
- 实施前提：包含 xpayEnv、渠道失败码归类及错误码副本维护规则的当前方案重新通过独立 Plan Review，并满足各任务列明的契约和依赖条件；旧输入的评审不授权实施本版。
- 需求来源：[ESM 迭代需求](../../../../esm/fe_app/docs/sprints/sprint-20260906.md)。正式 SDK 契约以本 change 的 Spec 为维护位置；跨仓库本地路径布局见 [仓库 README](../../../README.md)。
- 业务接入：ESM 组合根提供配置/provider，业务层消费公共支付结果，SDK 返回中断阶段，业务恢复凭据后按公共契约选择 pay 或 query/observe；已进入结果查询阶段的交易不重新下支付单。业务方案、页面规格和测试开关由 `esm-v1-4-business` 维护，联合实施前完成契约一致性核对。
