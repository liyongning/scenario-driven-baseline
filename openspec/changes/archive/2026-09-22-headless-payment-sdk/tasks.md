# 通用支付 SDK 实施计划

> 执行方法：`superpowers:subagent-driven-development` 或 `superpowers:executing-plans`。用户已确认 8-B 创建接口、可由 `.env.live` 预填且页面可改的 user_id 与可编辑默认表单；本次语义增量须独立方案评审，通过后再向 Apply 同步或委派；既有 Task 1–7、8-A 及已完成的 8-B 主体事实保留。另有渠道失败码归类增量（CORE-024）：明确调起失败保留十进制原码、未文档化有限非零数字码按 launch_failed 归类、不新增 EndReason，同样须重新 Plan Review 并通过 freshness 后才能在 Apply 工作区实施。

**Goal:** 交付 SDK 自行维护网络与渠道能力的纯 TS Headless 支付客户端，首期只完成小程序虚拟商品支付。

**Architecture:** 宿主配置/provider → SDK 工厂与核心 → 支付基建适配器 → 通信协议包实例执行器 → 平台网络；SDK 端侧支付方式适配器独立执行渠道动作。private E2E 包消费产品公开入口及协议包测试专用 Shadow；生产依赖 SDK → 协议，核心不依赖 ESM/Taro/Vue。

**Tech Stack:** TypeScript、pnpm workspace、Vite 库模式、unplugin-dts/vite、Vitest/coverage-v8、ESLint + typescript-eslint、tsc；Express Shadow、miniprogram-automator、dependency-cruiser、remark、Ajv 和 tsx 作为配套选型草案，职责及官方来源见 Design。产品包固定交付 ESM + CommonJS 及类型声明，两包独立版本并由 SDK 统一发布；精确版本、Node 兼容范围、实际发布登记及支付 Consumer/Profile 按 Design 工程交付输入表落实。以下文件布局和命令随本版方案评审；实施者按既定官方入口初始化，不在 Apply 中重新选型。

**Spec:** [能力](specs/payment-sdk/spec.md)、[公共契约](specs/payment-sdk-contract/spec.md)、[设计](design.md)。

## Global Constraints

- 工程包含 packages/payment-sdk、packages/payment-protocol 和 packages/e2e 三包。以下文件路径相对目标仓库根，按 Design 的实施文件树与四份 AGENTS 正文落盘；初始化输入齐备后创建。SDK 的协议 dependencies 使用 workspace:*，打包后为精确版本；发布仅有 SDK 入口，协议按需作为依赖步骤处理。手写模块的 *.test.ts 就近放置，跨包测试/Fixture 集中在 E2E；生成子树内不放手写代码。
- 实施仓库固定为 infra-payment-sdk，包名依次为 @daqian/payment-sdk、@daqian/payment-protocol、@daqian/payment-e2e；名称已确认，生成/registry/发布执行输入按 Design 落实。现有 README/根 AGENTS 仅提供规划入口，项目级 workflow schema 与迁入 Spec 已存在，不计为 Task 1 工程初始化完成。
- 初始化按 Design 的 Official scaffolding and reproducible bootstrap 执行：锁版 create-vite vanilla-ts → 官方库模式/声明插件 → Vitest projects/coverage → 官方 Lint/依赖规则初始化；配置只补本项目所需差异。docs/engineering/bootstrap.md 记录实际命令与来源，不自研通用基础设施，不在规划阶段执行脚手架。
- 本文是带前置门槛的任务清单。本轮 Shadow/Live 验收调整须重新 Plan Review，旧评审不覆盖新输入；三项协作结论已写入公共契约，工程与验收输入按各任务落实；不得把任务数量或文件存在解释为可直接 Apply。
- 启动受阻任务之前必须把缺失协议/决策写入 Spec、Design 和本 Task，补出版本化 fixture 或冻结分支表并重新评审。按已锁定 oneof 与两类网关出口制作有来源的完整样例，不以省略号报文或猜测载荷替代。
- 公共初始化接收配置/provider，runtime 字符串用于选择宿主环境。SDK 工厂负责初始化装配，核心编排 prepare/invoke/query，RuntimePort 提供时钟、ID 和等待工具；内部端口支持隔离测试。
- 平台网络首期用 wx.request；核心导入不访问 wx/window/document。SDK 内部采集 client_platform，不公开 OpenID/clientPlatform 配置。未来 fetch/其他真实渠道不计首期任务。
- 时间默认值为请求 60000 ms、查询间隔 3000 ms、结果确认 60000 ms，支持初始化/单次覆盖；查询预算在进入结果确认时起算，原生调用无 SDK 等待上限，expire_time 不制造关单。
- 身份错误结束原调用并交付 interruptedPhase；业务恢复后按公共契约矩阵显式 pay 或 query/observe，查询恢复不重新下支付单，渠道会话恢复后以同一 tradeNo/channel/appId 显式 pay 取得本次有效参数，SDK 不判断 paymentNo 是否变化。宿主 cancellation 只结束本地等待并隔离旧回调，渠道等待不设置 SDK 时限。
- xpayEnv 仅为 PaymentRequest 的逐次可选 sandbox/prod，省略/undefined 保留 optional absence；非法值在外部动作前返回 INVALID_INPUT。backend 用 generated 具名枚举，codec 写入 xpayEnv，不硬编码数字/默认 UNSPECIFIED，不写 Header/BaseReq/QueryTrade，不改写 signData.env。基线为 IDL 4e5cb22659fd4f4c36d06ae81256dc1c43e691d9；业务恢复 pay 保留原选择，查询恢复仍不传。
- 不自动登录、刷新 Token、绑定身份、重放 prepare 或支付；不接触 AppKey/session_key。日志不含完整支付参数和凭据。
- RunOptions.onPhase 为每次调用的可选回调，仅含 channel_invoking/confirming，事件仅 attemptId/phase；核心隔离异常、去重并保持最终结果一次交付。通知后复查停止，原生等待无上限，阶段不代表交易事实或 UI 渲染完成。
- 公共契约中文语义表为状态说明权威；手写公共类型/字段/状态值使用中文 JSDoc，映射及关键生命周期分支用中文注释说明触发场景和判断边界。公共注释随双格式声明交付，不手改 generated 注释、不新增中文文案 API；变更状态同步维护 Spec、注释和测试。
- Proto 协议产物独立生成到通信协议包的 generated 子树，从 package exports 消费；17 项业务错误码在 src/errors/business-codes.ts 按锁定 IDL 手写维护，经独立 Go 来源样例核验，不要求 ProtoGen 生成。通信实例不依赖 generated 全局 handler；Header/BaseReq、codec、provider 和网络在协议包，支付字段/状态/身份语义在 SDK。ESM 的 Thrift/Proto 迁移、业务 change、Final 和测试开关由业务实施负责。
- 所有测试均为 SDK 技术/契约证据，不是产品 e2e TC ready 证明。真实扣款联调须在明确授权的测试账号和环境执行。
- 单测门禁覆盖全部手写实现代码，语句/分支/函数/行覆盖率均为 100%；ProtoGen 自动生成代码不计入，生成工具自身质量由其维护方负责。按 Design 文件树及覆盖范围，显式配置全部适用源文件（包含未被测试导入的文件）及覆盖检查命令；各任务和最终交付均须遵守该门禁，协议消费与集成场景仍按 Spec 验证。
- 按 verification v2 区分 behavior/module/engineering；全部 Spec 验证、支付 E2E 可观察行为、支付 Consumer 契约义务与能力 Spec 的必需 FLOW case 均要求 100% 覆盖及全部通过；module 就近单测、engineering 工程检查分别取证，不抵扣 behavior/IDL/FLOW。AI 编写并保存测试/Fixture，CI 确定性重放；draft/skip/缺环境证据不计覆盖。Shadow 由协议包维护，场景在 E2E，生产包清单排除测试代码。单项测试可多对多绑定 Scenario，必需 FLOW 必须同一次运行贯通，不能拼接独立测试。
- 单测项目名采用 sdk-unit / protocol-unit / test-tools-unit，跨包项目采用 integration / weapp；完整 check 在两种运行环境的报告产生后检查全量场景覆盖，Node 快速检查不提前要求尚未产生的微信报告。
- Commit 小节为各任务的建议提交消息。

## 每个任务的共同完成条件

以下条件与每个任务的 Verification、Review / Acceptance 同时适用；RED/GREEN 中的定向测试只用于开发反馈，不能单独作为完成证明。具体证据格式、workspace 边界和最终交付判定见 Design 的 Acceptance gates and evidence ownership。

1. 前置依赖及本任务涉及的契约已满足，Files 中承诺的产物齐全，功能/目录/接口与 Requirements、Design 一致。部分分支仍受阻时，报告已完成范围及缺口，不勾选整个任务。
2. 执行 `pnpm proto:validate`、`pnpm proto:status`、`pnpm lint`、`pnpm typecheck`、`pnpm check:architecture`、`pnpm test:unit`、`pnpm build`；正常命令均成功，生成状态为 current；生成来源提交与固定 Go 错误事实不要求相等，按公共契约验证完整支付兼容闭包与本次 sync/status 证据，退出码非零不得视为通过。单测统计本任务结束时全部已交付手写实现，四项均为 100%，包含未导入文件，不只统计本次修改文件或定向测试；尚未实现的未来任务不制造占位文件，但本任务承诺文件缺失不能借此豁免。
3. 本任务专属命令、正向/反例和断言全部符合预期。早期任务不要求尚未交付的全量支付 E2E 通过；未交付命令/缺失场景必须如实记录，不用空脚本、skip 或缩减分母宣称根 `pnpm check` 已通过。完整门禁由 Task 8 验收。
4. 在 `artifacts/<run-id>/tasks/task-<n>.md` 保存本次验收索引，关联实际命令/退出码、原始报告、当前源码/Spec/IDL/Fixture 版本及覆盖明细，逐项记录“方案 vs 实际”。预期失败的门禁反例单列；工具报告分目录保存，不互相清除或覆盖。
5. 任务评审确认职责、断言与事实一致，缺口已关闭且无未经确认的偏差后才勾选。单任务完成、SDK 工程通过、真实渠道通过、实际发布和业务接入是不同结论；正式 Verification Artifact 在工作流准入条件满足后生成，实施任务先保存原始证据。
6. 涉及公共状态、结果映射或阶段迁移时，验收索引逐项记录中文语义表对应的源码/注释位置、触发场景和测试名；声明交付阶段另记录 ESM/CJS 声明位置。评审检查含义与边界一致；类型编译、JSDoc 存在或覆盖率不能替代中文语义核对。公共注释缺失/被构建移除或与 Spec 矛盾时不得标记完成。

## Implementation Tasks

一个无缩进 checkbox 对应一个可独立实施和 Review 的任务。Task 1–7 已在隔离 Apply 工作区完成，主规划同步该事实；8-B 新增范围由未完成的 Task 8 承接，CORE-024 渠道失败码增量为 Task 5/6/7 的追加义务并由 Task 8 汇总，两者都不重新初始化或复做 Task 1–7，也不翻转其既有勾选。各任务的契约、版本和生成输入未满足前，不猜测实现或测试期望。

**本轮渠道失败码增量（CORE-024；Task 5/6/7 增量范围，Task 8 汇总，不改变八任务跟踪）**

- 触发：宿主联调中 iOS 非中国大陆 Apple ID 的 errCode 16 被归为 unknown，宿主无法区分“渠道明确拒绝”与“结果真的未知”，业务单持续 PAYMENT_IN_PROGRESS 导致「支付中」没有出口；同时 -15001/-15010/-15011 等明确失败只交付信号，PaymentOutcome.error 为空。归类规则、无可用错误码边界、PaymentError 中文 message 以及 errMsg 仅在字符串时透传为 channelMessage 的约束以公共契约“渠道失败码映射”为准，设计见 Design 的同名 Decision。本增量为已评审规划的语义变更，须先重新 Plan Review 并通过 freshness，才可在 Apply 工作区实施。
- 目标工作区与记录：在隔离 Apply 工作区（feat/headless-payment-sdk 之上的当前分支）实施；同步后先复核本版规划 freshness。Task 5/6/7 的既有勾选是已完成事实，本增量不翻转、不重写其历史提交；增量证据单独写入 artifacts/<run-id>/tasks/task-5.md、task-6.md、task-7.md，由未勾选的 Task 8 汇总并给出总结论，增量完成前不得把 CORE-024 记入任何“已完成”结论。
- Commit：适配器映射、核心 invoke 结算与公共注释一并提交为 `fix(payment-sdk): classify channel launch failures`；单测、Fixture/manifest 与行为用例提交为 `test(payment-sdk): cover channel failure code mapping`。
- Files：
  - Modify packages/payment-sdk/src/adapters/channels/wechat-miniapp-virtual.ts：明确失败与 -15007 都通过统一错误构造得到 message，且仅把字符串 errMsg 写入 channelMessage；-2/-5 继续不产生 error。在 packages/payment-sdk/src/adapters/channels/wechat-miniapp-virtual.test.ts 新增带 `meta.paymentCase`（ownerId=TC-PAYSDK-CORE-024、caseId=adapter-failure-mapping、environment='sdk-unit'、fixtureCase=null、covers 引用本场景 case 与检查点）与 `context.annotate(..., 'payment-evidence')` 的 module 绑定用例；对 -15007 分别断言字符串、缺失、null、对象 errMsg 的 channelMessage 存在/省略，其余映射断言保留原路径。
  - Create packages/payment-sdk/src/errors/payment-error.ts 及就近 payment-error.test.ts：集中维护公共契约固定的 13 项 code→中文 message 与内部 PaymentError 构造函数，不从 SDK 根入口导出；单测以 ownerId=TC-PAYSDK-CORE-024、caseId=default-message-mapping、environment='sdk-unit'、fixtureCase=null 绑定完整 13 项表。Modify packages/payment-sdk/src/adapters/payment-infra/backend.ts、packages/payment-sdk/src/core/observation.ts 及其就近测试，使现有业务码、协议/网络、输入、超时等全部错误构造点使用该函数；只补齐公共字段，不改变分类、retryable、内部 cause 或控制流。
  - Modify packages/payment-sdk/src/core/client.ts：除既有 invoke 阶段结算变化外，公开 query/pay/observe 的白名单投影必需复制 message，并仅在存在时复制 originalCode/retryable/channelMessage；诊断仍不得包含 message/channelMessage。在 packages/payment-sdk/src/core/client.module.test.ts 按该文件既有 paymentCase 写法新增 caseId=core-invoke-failure-classification 的 module 绑定用例，并回归三类公开入口的实际对象键。
  - Modify packages/payment-sdk/src/core/lifecycle.test.ts 中 invoke 阶段 CHANNEL_ERROR/适配器抛错或 reject 的既有期望（reason=error → launch_failed）；validating 阶段（channel.available() 抛错）与 prepare/query 的 CHANNEL_ERROR 期望保持 reason=error，不因本次增量改写。
  - Modify packages/payment-sdk/src/contracts.ts：保留现有 code/source/originalCode/retryable 语义与全部枚举值，新增必填 `PaymentError.message: string`、可选 `PaymentError.channelMessage?: string` 及中文 JSDoc，同时更新 ChannelSignal.launch_failed、EndReason.launch_failed、PaymentError.originalCode 注释；在 contracts.test.ts 验证公共类型/注释边界，并 `pnpm build` 重建 packages/payment-sdk/dist 的 index.d.ts/index.d.cts。
  - Modify packages/e2e/tests/sdk/public-client-harness.ts，使 fail 回放可按 case 传入具体 errCode/errMsg（含 16、-15015、-15007）。Create packages/e2e/tests/sdk/TC-PAYSDK-CORE-024.spec.ts 及 tests/fixtures/TC-PAYSDK-CORE-024/manifest.json 与三个 behavior case 数据（launch-failed-documented、launch-failed-unmapped、channel-session-expired-message）；最后一项分别覆盖字符串与缺失/null/非字符串 errMsg，并断言公开 error 的固定 message/channelMessage、原码、结束原因和无查询。按 Task 6 既有格式登记 case/checkpoint 与 fixture 摘要，不新增 SDK 测试 API，不改八条 FLOW 的阶段序列与 FLOW-PAYSDK-002 的既有断言（其 launch-failed 只断言 reason/channelSignal/阶段）。
  - Modify packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-021/semantic-review-evidence.json：按新 contracts.ts 重录 sourceDigest 与各 entry 的 path/line 锚点；packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-021.spec.ts 不新增 case，仅随重录回归。
  - 当前 Plan Review 对 Spec 的修订会使 Apply 分支既有摘要失效；同步本版规划后，按当前 Spec 重新刷新受影响的既有 11 个 manifest（FLOW-PAYSDK-006、TC-PAYSDK-CONTRACT-003/014/017/023/024、TC-PAYSDK-CORE-015/016/017/022/023）及新增 TC-PAYSDK-CORE-024 manifest 的 sources.spec.sha256。Apply 阶段如再修改任一 Spec 文本须再次逐个重录，不能沿用评审前摘要。
  - weapp 回放由 Task 8 按既有分支汇总，仅在确需非 -1 原码回放时才调整 protocol-runner.ts。
- RED：先在统一错误构造单测逐项断言公共契约 13 个 code 的固定中文 message，并让类型/运行时用例要求每个 PaymentError 都带 message；在适配器单测加入 16、-15015、-99999 期望 launch_failed、十进制原码与字符串 channelMessage 的用例，并对 -15007 分别传入字符串、缺失、null、对象 errMsg，要求固定 CHANNEL_SESSION_REQUIRED message 且仅字符串进入 channelMessage；-2/-5 即使带 errMsg 也不得新增 error。公共 query/pay/observe 用例要求实际错误对象保留 message/可选 channelMessage 且诊断不含二者。当前实现缺少公共字段、统一文案和投影时必须失败。core lifecycle 中 invoke 阶段 CHANNEL_ERROR/适配器抛错或 reject 的既有期望由 reason=error 改为 reason=launch_failed，同时确认 validating 阶段（channel.available() 抛错）与 prepare/query 的 CHANNEL_ERROR 仍为 reason=error。非法码（缺失、null、0、非整数、非安全整数、NaN、Infinity、非数字）与 -2/-5/-15007 的既有分类断言保持且通过。
- GREEN：所有 PaymentError 构造点通过内部统一映射补齐稳定中文 message；适配器对明确失败码返回 CHANNEL_ERROR/source=channel/originalCode，并仅把字符串 errMsg 透传为 channelMessage。核心只在 phase=channel_invoking 按 launch_failed 结算，公开 query/pay/observe 按白名单投影 message 与可选 channelMessage。validating 阶段及 prepare/query 的 CHANNEL_ERROR、-5 的自动查单、-15007 的 channel_session_required、公共状态枚举与 EndReason 联合值均不变；message/channelMessage 不参与 SDK 判定，channelMessage 不进入诊断或日志。
- Verification：`pnpm exec vitest run --project sdk-unit packages/payment-sdk/src/errors packages/payment-sdk/src/adapters/channels packages/payment-sdk/src/adapters/payment-infra packages/payment-sdk/src/core packages/payment-sdk/src/contracts.test.ts`、`pnpm exec vitest run --project integration TC-PAYSDK-CORE-024 FLOW-PAYSDK-002 TC-PAYSDK-CONTRACT-021`、`pnpm check:fixtures`（预期 exit 0：51 个 manifest 无 stale，既有 50 + 新增 CORE-024）、`pnpm check:scenarios --inventory`（CORE-024 的三个 sdk-unit/module 绑定不再缺失；三个 integration case 在 CORE-024 增量集成验证前仍为预期缺口，由 Task 7 增量范围交付、Task 8 汇总，按共同完成条件 4 单列）及共同门禁；weapp 回放与全量聚合由 Task 8 执行。行为 case 从公共入口观察 error 的实际对象键、channelSignal/reason 及无自动查单，module case 在统一错误构造、适配器、backend/observation 和核心就近单测验证映射细节。双格式声明必须包含必填 message 与可选 channelMessage；manifest 刷新会改变 fixtureDigest，既有报告的 freshness 重录归 Task 8。
- Review / Acceptance：评审核对固定中文文案表、所有错误构造点、-5 与 0 的边界、原码为十进制字符串、PaymentError 始终包含稳定中文 message、字符串 errMsg 仅出现在可选 channelMessage 且非字符串时省略、channelMessage 不进入诊断/日志、结果仍为一次交付且无重放。未新增状态枚举，消费方既有状态分支不变；若宿主镜像 PaymentError 结构，仅同步接受 message/channelMessage 字段，不新增恢复或重试分支。

- [x] 1. 按工程配置定稿建立三包边界、公共类型与内部端口

  **Prerequisites**
  - 本版方案完成独立评审，独立版本、SDK 统一发布、双格式及类型声明按已定要求交付。使用已确认的 infra-payment-sdk 仓库、三包 name 和 GitLab 项目 245 的私有 npm registry；核对发布/依赖读取权限，按 Design 在 IDL 仓库按需登记本 SDK 的 Consumer，并建立对应 Consumer/Profile 配置；不维护业务 Consumer 或业务 IDL。平台自动化使用现有本地开发者工具；GitLab Pipeline/Runner 不属于本 Change 的交付物或本地测试前置。初始化前核对工具兼容约束、登记精确版本与官方命令。图、目录、内部通信签名、覆盖配置和命令采用本版定义，禁止使用浮动 latest 或试装后倒推选型。

  - 协议基线采用 IDL 4e5cb22659fd4f4c36d06ae81256dc1c43e691d9；登记 Consumer 后锁定包含该语义与登记的完整 commit。支付 Profile 必须保留 xpay_env optional presence、XpayEnv 具名枚举及真实 codec；缺失时报告 ProtoGen 能力缺口，不手改生成文件。网关升级属于 Task 8 的真实环境前置，不阻断本任务本地生成。

  **Files**
  - Modify: 根 package.json、.npmrc、.gitignore、pnpm-lock.yaml、docs/engineering/bootstrap.md，保留已安装的项目 ProtoGen 及其来源/版本记录；新增依赖由 pnpm 更新锁文件。Create: pnpm-workspace.yaml、tsconfig.base.json、tsconfig.test.json、tsconfig.tools.json、vitest.config.ts、vitest.shared.ts、eslint.config.js、.dependency-cruiser.cjs、proto-gen.yaml；SDK 包与协议依赖包的 package.json/vite.config.ts/tsconfig.build.json/vitest.config.ts；packages/e2e/package.json、vitest.config.unit.ts、vitest.config.integration.ts、vitest.config.weapp.ts。
  - Modify: 外部 IDL 仓库的 proto-gen.yaml，仅新增/维护 id=infra-payment-sdk 的 Consumer 契约，按 Design 的生成输入表选择 trade.proto 及可达依赖；本期实际调用仅 CreateTradePay/QueryTrade；不调整现有业务 Consumer。执行该仓库规定的配置与 Producer 校验，记录包含本次登记的版本；不能以仅检查旧 HEAD 的结果证明未提交配置已校验。
  - Modify: 根 AGENTS.md，将规划入口扩充为 Design 规定的工程条款。Create: packages/payment-sdk/AGENTS.md、packages/payment-protocol/AGENTS.md、packages/e2e/AGENTS.md；scripts/check-architecture.ts 及就近单测。用户显式触发的统一发布命令、检查规则与发布登记按工程交付输入落实；执行位置不是能力契约，不交付 GitLab Pipeline/Runner，也不配置远端合并保护或审批规则。
  - Create: packages/payment-sdk/src/index.ts、contracts.ts、contracts.test.ts、ports/backend.ts、ports/channel.ts、ports/runtime.ts、runtime/default.ts、runtime/default.test.ts；packages/payment-protocol/src/index.ts、ports/http.ts、ports/context.ts、client.ts 中的通信类型、transport/errors.ts 中的错误/结果类型。pnpm-lock.yaml/proto-gen.lock 由工具产生；支付 generated 由获准 ProtoGen 命令生成。
  - 此任务先导出公共/通信类型并实现内部运行辅助工具；createProtocolClient 在 Task 3 实现，createPaymentClient 在 Task 7 装配，不创建伪成功工厂。协议类型不引用 SDK 的 PortResult/PaymentError。

  **Requirements / Scenarios**
  - SDK-01/13/14/15；CONTRACT-01/02/08/11/12/13；TC-PAYSDK-CORE-001/014/017、TC-PAYSDK-CONTRACT-001/002/011/019/020/021 的类型、隔离、中文注释与执行规则部分。

  - SDK-16、CONTRACT-14；CORE-020、CONTRACT-022/023 的本任务职责部分，贯通 FLOW-008 及 FLOW-006 的环境选择检查。

  **Design Decisions**
  - SDK ownership and module graph；Public initialization and method selection；Packaging, ESM integration and source ownership；Official scaffolding and reproducible bootstrap；Agent instructions and architecture enforcement；Acceptance gates and evidence ownership；Phase notifications and documented state semantics。

  - Per-payment Xpay environment。

  **Interfaces**
  - Consumes: 公共契约的 PaymentClientOptions、PaymentRequest、PaymentPhase/PaymentPhaseEvent、RunOptions、PaymentOutcome、ChannelContext.beforeInvoke/markInvoked 等内部端口及中文语义表。
  - Produces: 严格类型、内部端口及 RuntimePort 默认工具实现；工厂待后续装配。

  **RED**
  - 编译正向消费者：只配置必填 runtime/provider 等字段，以 reference/method 发起支付，无需传完整 policy；接受初始化或单次局部覆盖。反向类型测试用 @ts-expect-error 检查 PaymentRequest 没有 openId、PaymentRequestContext 没有 clientPlatform、RunOptions 没有 onProgress；request/backend 不是初始化字段，runtime 只接受平台字符串。无 wx/window/document 时导入核心相关模块应无副作用。首次因缺类型/入口失败。
  - 正向类型消费覆盖省略/传入 RunOptions.onPhase，推断只读 attemptId/phase，两个 phase 均可穷举；反向覆盖 preparing/channel_returned/ended、访问事件 payParams、初始化级 onPhase 和缺少 beforeInvoke 或 markInvoked 的内部 ChannelContext。onProgress 继续不是公共字段，不能把原反向测试误读为禁止新的 onPhase。
  - runtime/default.test.ts 按 Design 的默认 Request ID 公式验证 pay 前缀、完整网关正则与 1–128 长度；冻结同一毫秒，多次调用及多个默认 runtime 共用时不得重复 ID；时间回拨后序号仍递增。通过受控 Date/Math.random 核对拼接结果，生成规则不依赖平台全局或额外 ID 工具。
  - Run: `pnpm typecheck && pnpm exec vitest run --project sdk-unit packages/payment-sdk/src/contracts.test.ts`。

  - contracts.test.ts 增加正向类型消费 PaymentRequest.xpayEnv 的省略/sandbox/prod；下面类型样例纳入真实 tsc 检查，非法数字/UNSPECIFIED、把 xpayEnv 放在 RunOptions、PaymentClientOptions、PaymentRequestContext 或 TradeReference 均须被拒绝，不能以 as any 绕过。首轮缺字段或允许非法值时失败。

  ```ts
  const ref = { tradeNo: 'T1' };
  const omitted: PaymentRequest = { reference: ref, method: 'wechat-miniapp-virtual-goods' };
  const undefinedEnv: PaymentRequest = { ...omitted, xpayEnv: undefined };
  const sandbox: PaymentRequest = { ...omitted, xpayEnv: 'sandbox' };
  const prod: PaymentRequest = { ...omitted, xpayEnv: 'prod' };
  // @ts-expect-error 公共输入不接受协议数字。
  const invalid: PaymentRequest = { ...omitted, xpayEnv: 2 };
  // @ts-expect-error 环境属于本次支付请求，不属于运行控制。
  const wrongPlace: RunOptions = { xpayEnv: 'sandbox' };
  ```

  **GREEN**
  - ProtoGen 使用根 devDependency，通过 pnpm scripts/pnpm exec 运行。安装/升级时从其私有 registry 查询最新正式版本并以精确版本及 lock 保存，禁止引用全局二进制；校验 pnpm proto:version 与依赖声明一致。现有工具准备记录不代表本 Task 已完成。
  - 在已有规划文件的目标仓库中，按锁定 create-vite vanilla-ts 初始化尚不存在的 SDK 包与协议包目录，保留 openspec、README 和根 AGENTS；再按官方 build.lib/unplugin-dts 配置转换，移除模板 DOM/示例样式。扩充已有根工具配置，由 pnpm 初始化 private E2E 包，统一 workspace 锁文件；Vitest/Lint/依赖分析采用已登记官方配置和项目规则。记录命令、模板版本、生成文件及调整原因，不自行编写替代脚手架。
  - 按 Spec 定义类型与端口，不导出 private core/test entry；默认 runtime 提供时钟、运行/请求标识和可取消等待。配置按三包依赖边界编译，核心不包含 DOM 类型；协议包不反向依赖 SDK，E2E private；SDK 与协议各自维护版本，SDK 以 workspace:* 依赖协议，E2E 无发布入口；根 coverage 显式覆盖全部手写实现，generated 精确排除。重复运行上述命令通过。
  - contracts.ts 按公共契约中文表给公共状态类型、字段和每个状态联合值补齐 JSDoc，ports/channel.ts 说明 beforeInvoke/markInvoked 返回 false 均禁止平台调用；类型声明配置保留公共注释。构建后核对两种声明，实际 tarball 及注释消费由 Task 7/8 继续验证；记录注释位置而非新建另一套状态定义表。
  - 根及就近 AGENTS 按 Design 四份条款正文落盘并解析迁移后的事实链接；dependency-cruiser 负责依赖图，check-architecture 只连接结果及目录/AGENTS 规则。初始化时建立静态/单测/架构统一检查命令，供任意受控执行器调用；完整场景检查在 Task 6 接入，不能把尚未实现的检查占位当作通过。

  - 导出带中文 JSDoc 的 XpayEnv；PaymentRequest.xpayEnv 说明省略、服务端默认/覆盖及现网扣款边界。核对 generated 的 optional 字段不以 0 代替未设置，具名 SANDBOX/PROD 可用；实际编码的三态验证由 Task 3 接续，不能仅凭生成退出成功验收。

  **Verification**
  - 在没有 node_modules/dist/artifacts 的干净副本中执行 `pnpm install --frozen-lockfile`，再执行共同完成条件中的命令；核对 package 依赖/exports 没有现有 ESM 应用模块或 UI 框架依赖，没有私有测试入口。保留本阶段 bootstrap 来源/版本/模板差异及复现日志。
  - `pnpm exec vitest run --project test-tools-unit scripts/check-architecture.test.ts && pnpm check:architecture`；对缺 AGENTS、断链引用、跨包反向导入、测试入口进入生产和目录违规的受控输入验证失败，再核对正常骨架通过。
  - 在临时副本分别加入已启用 lint 规则的违规、真实类型错误、未测试的函数/分支及未被测试导入的手写文件，分别执行真实 lint/typecheck/test:unit 命令，须非零退出并指出问题。核对正常报告四项 100%、完整 include/exclude 和测试发现清单；非零退出可由任意调用方传播，不以仅设置 thresholds=100 验收。Task 6 将这些受控门禁验证接入长期回归。

  **Review / Acceptance**
  - 完成条件：共同门禁通过，三包/四份 AGENTS 与图和文件树一致，初始化可复现，静态/架构/覆盖命令均有正向通过和反例阻断证据，评审逐项核对官方来源、锁定版本、脚手架命令及模板差异。生产工厂未完成不宣称 package 已可真实支付；初始化完成不代替包消费或支付验收。

  **Commit**
  - `feat(payment-sdk): define standalone contracts and internal ports`

- [x] 2. 在通信协议包实现微信网络适配

  **Prerequisites**
  - Task 1；工具和支持版本已按工程交付输入表登记；网络 timeout/RequestTask.abort 已有官方依据，真实能力在平台验收时验证。

  **Files**
  - Create: packages/payment-protocol/src/adapters/network/wechat-miniapp.ts、wechat-miniapp.test.ts；同目录测试辅助文件（仅供单测，不进入 exports）。
  - Modify: packages/payment-protocol/src/index.ts、packages/payment-protocol/AGENTS.md；Create: packages/payment-protocol/src/index.test.ts。核对既有 package.json 的根 exports/import/require/types/files 及 vite.config.ts 根 entry；配置已符合时保持，构建输出须包含新增具名导出，不增加平台子入口。已完成 Task 2 时只重开本次增量，保留原实现和历史证据。

  **Requirements / Scenarios**
  - SDK-09/10；CONTRACT-08/10；TC-PAYSDK-CORE-010/011、TC-PAYSDK-CONTRACT-011/017 的网络部分。

  **Design Decisions**
  - SDK-owned networking and host data providers；Budgets, cleanup and exclusive channel lifetime；Protocol network factory export and assembly。

  **Interfaces**
  - Consumes: HttpRequest、OperationContext 的预算与取消语义；内部平台 request 测试替身。
  - Produces: 协议包根具名 createWechatMiniappHttp(): HttpPort，保留 status/headers/body；不判业务支付状态，不接受业务 Request/provider 参数。

  **RED**
  - 假 wx.request 捕获输入并可分别触发 HTTP 200、401、500、平台 fail、迟到 success 与重复回调；记录 sendCount/abortCount。
  - 断言 URL/method/headers/body 原样发送，非 2xx 仍返回 HttpResponse，平台 fail 返回 NETWORK_ERROR；单次调用 sendCount=1，超时或停止尽力 abort，迟到结果不二次结算。模块导入不能访问 wx。
  - src/index.test.ts 从协议包根入口验证具名工厂及返回 HttpPort 的类型；移除/监测 wx 全局时加载模块和创建端口均不访问平台，实际 send 仍由原网络单测验证。缺导出、类型错误或创建即触碰平台须失败。
  - Run: `pnpm exec vitest run --project protocol-unit packages/payment-protocol/src/adapters/network/wechat-miniapp.test.ts packages/payment-protocol/src/index.test.ts`；缺实现/导出、自动判错/重放或平台提前读取时失败。

  **GREEN**
  - 封装 SDK 自己的 wx.request，通过 RequestTask 取消，统一为 HttpPort；无登录、刷新、lane 改写、业务参数解析和请求响应日志。在协议 src/index.ts 显式重导出 createWechatMiniappHttp，补齐中文 JSDoc 并同步协议 AGENTS；不扩展 SDK 公共 API、平台子路径或测试入口。再次运行同命令通过。

  **Verification**
  - 同命令加 `pnpm typecheck` 与 `pnpm --filter @daqian/payment-protocol build`；核对网络平台调用只在通信协议包网络模块中出现，适配器依赖保持独立。
  - 在协议包目录以 `node --input-type=module -e` 和 `node -e` 分别从包名 @daqian/payment-protocol import/require 已构建根入口，断言 createWechatMiniappHttp 为函数、调用返回带 send 的 HttpPort，且无 wx 时不抛错、不发送请求；保留完整脚本、命令/退出码及产物摘要。此检查不得使用 Vitest/源码 alias，不依赖 Task 6 的 check:package。核对两种声明中工厂签名和中文 JSDoc；实际 tarball 的声明编译/安装由 Task 7/8 验收。

  **Review / Acceptance**
  - 完成条件：共同门禁通过，HTTP 状态/平台错误/超时/取消/迟到与重复回调矩阵全部通过，原样传参、单次发送和一次结算有调用记录，根出口类型/无平台读取单测及构建双格式加载验证通过，生产依赖图无测试代码。假平台证明请求适配行为，不能作为微信线上网络联调证据。

  **Commit**
  - `feat(payment-sdk): own miniapp HTTP transport`

- [x] 3. 按最新支付基建契约实现协议与身份适配

  **Prerequisites**
  - Task 1/2；按公共契约锁定 IDL 4e5cb22659fd4f4c36d06ae81256dc1c43e691d9 及 Consumer 登记后的精确来源；历史服务端/网关仅支撑已核验规则，新增字段兼容按 Task 8 取证；参数、恢复和错误规则均已明确，公共请求字段按 Spec 映射，真实环境不作为字段设计待决；Task 1 已按固定 generated 路径与获准支付 Consumer/Profile 生成，并记录命令/版本。Consumer 登记来源为 5539be8f09323709fa65f6568efe22896ec35d24；具体业务错误码已有 Go 定义，本任务直接据此手写 TS 副本，不等待上游生成器增强。
  - 以公共契约的 BaseResp 判定顺序、Header/BaseReq、PayParams oneof、两类网关 JSON 出口及完整错误清单为输入；本任务先生成/核对完整非敏感 wire Fixture，再执行适配 RED/GREEN。未交付样例不得用未知期望代替。
  - 同一 tradeNo/channel/appId 再次请求时，服务端决定复用、续用、新建或错误；SDK 只消费本次完整有效参数，不建立历史映射或 forceNew。以合法复用及不同 paymentNo 响应分别验证消费路径；不把二期自动关单作为前置。

  **Files**
  - Modify: packages/e2e/tests/protocol/TC-PAYSDK-CONTRACT-024.spec.ts、同名 Fixture manifest.json、refresh-manifests.py 及其管理的全部 Go Fixture manifest；保留固定 Go 数据与取数记录，移除固定 idlLockSha256 相等门禁，加入 sources.generatedCompatibility。新增同名 provenance/{before.lock,after.lock,sync.json,status.json} 保存元数据刷新正例的前后 lock 和原始工具证据，不注册为支付数据 case。proto-gen.lock 由项目 proto:sync 更新，当前 Task 原始命令/状态另存 artifacts。
  - Modify: packages/payment-sdk/src/ports/backend.ts、adapters/payment-infra/backend.ts、backend.test.ts；BackendResult 失败结果新增内部 cause，协议包 API 不变。若 Task 3 原已完成，按此接口增量补交付、完整回归并重新评审其受影响范围，保留其他已验收产物。
  - Modify: packages/payment-sdk/src/ports/backend.ts，新增内部 BackendResult 并用于 prepare/query；不从 SDK 根入口导出，不修改公共 PortResult/PaymentError。
  - Create: packages/payment-sdk/src/adapters/payment-infra/backend.ts、backend.test.ts；packages/payment-sdk/src/ports/device-info.ts、adapters/platform/wechat-device-info.ts 及就近单测。支付字段、状态、错误映射归 backend.ts；需要拆分同职责辅助文件时保持在本目录，不建立第二映射入口。
  - Modify: packages/payment-protocol/src/client.ts、transport/errors.ts，在 Task 1 类型基础上实现 createProtocolClient/通信处理；Create: client.test.ts、transport/context.ts 及就近单测。client.ts 是 metadata/codec 实例执行器唯一入口，不另建 transport/execute.ts。协议 wire 样例及来源放 packages/e2e/tests/fixtures/，按公共契约输入表归属到同名 TC/FLOW；单测只读复用已确认数据。通信结果保留 wire 供 presence/oneof 校验，不另建 DTO/codec。
  - generated 文件由确认后的独立命令生成；不得手写 DTO 或 endpoint 表。
  - Create: packages/payment-protocol/src/errors/business-codes.ts、business-codes.test.ts；Modify: packages/payment-protocol/src/index.ts、packages/payment-protocol/AGENTS.md、根 AGENTS.md，导出错误目录/描述查询及来源提交，按 Design 更新手写所有权规则。
  - Create: packages/e2e/tests/protocol/TC-PAYSDK-CONTRACT-024.spec.ts、packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-024/idl-errors.json、同目录 manifest.json 及可复现取数输入；从固定 Go 原常量/DescribeErrorCode 直接取得独立期望，不以 TS 副本或临时审计文件充当正式来源。

  - Create: packages/e2e/tests/fixtures/TC-PAYSDK-CONTRACT-023/manifest.json、omitted.json、sandbox.json、prod.json、query-no-env.json；Task 6 建立对应协议执行测试。记录 IDL 原文/Go descriptor、生成命令及完整请求/响应；加入显式 UNSPECIFIED 与未知枚举的拒绝依据，不能用客户端同一 codec 生成期望。

  **Requirements / Scenarios**
  - SDK-05、CONTRACT-05/026 的内部查询恢复语义及本任务验收部分。
  - CONTRACT-05/025 的 backend 取消传递部分。
  - SDK-03/10/11；CONTRACT-02/03/04/06/08/09/10；TC-PAYSDK-CORE-011/012、TC-PAYSDK-CONTRACT-002/003/004/005/006/008/012/013/014/015/016/017/018。

  - CONTRACT-09、TC-PAYSDK-CONTRACT-024 的七个必需 case；错误副本精度、来源和漂移验证。
  - SDK-16、CONTRACT-14；CORE-020、CONTRACT-022/023 的本任务职责部分，贯通 FLOW-008 及 FLOW-006 的环境选择检查。

  **Design Decisions**
  - Generated provenance and fixed error facts。
  - Backend query recovery semantics。
  - Backend cancellation and terminal ownership。
  - Prepare-to-channel contract mapping；Authentication, identity and channel session；SDK-owned networking and host data providers；Lane routing and environment boundaries。

  - Per-payment Xpay environment；IDL-owned business error catalog。

  **Interfaces**
  - Consumes: 协议包 HttpPort/OperationContext、配置/provider、generated CreateTradePay/QueryTrade metadata/codecs；协议包按 IDL 手写维护的 paymentBusinessErrors/getPaymentBusinessError；SDK DeviceInfoPort 和支付内部端口。
  - Produces: createProtocolClient 及其 request(meta, request, context)，返回 CommunicationResult<DecodedHttpResponse>；SDK PaymentBackend.prepare/query 映射为自身 BackendResult（成功/错误沿用 PortResult，另有 cancelled）、PreparedPayment、TradeSnapshot、PaymentError。公共 HTTP 字段和支付语义分别只维护一处。

  **RED**
  - CONTRACT-024 证明旧提交号/整锁摘要相等规则在支付闭包不变的来源刷新下误拒绝。新增 metadata-only-sync 正例，固定错误目录及 Go JSON 不变；payment-projection-mismatch 逐类变异完整兼容字段/依赖集合/source-output/branch/fallback 必须拒绝。用 YAML 解析按ID取来源，不用首个 resolvedCommit 正则；现有 source-mismatch 继续验证 Go 事实，不仅检查生成版本。refresh-manifests 测试验证不再要求整锁相等、仍核对固定 Go 摘要且不改写 generatedCompatibility；兼容字段由 CONTRACT-024 统一验证，不在 Python 工具重复开发 YAML 校验器。无关来源变化不要求重新取 Go 数据。
  - backend.test.ts 验证 query 精确 QueryTradeUnavailable 且 IDL retryable=true 才有 cause=query_unavailable；未知码+匹配详情 retryable=true、CreateTradePayUnavailable、HTTP 401、无业务码 503、通信错误以及 prepare 收到任一 Unavailable 均无 cause。已知码的冲突结构化详情仍按权威 IDL；非 2xx 有效已知码遵守既有响应顺序。标签不放进 PaymentError，不扩展协议 API。
  - backend.test.ts 分别让 prepare/query 的假 ProtocolClient 返回 CANCELLED 与 TIMEOUT：前者严格为 {ok:false,cancelled:true}，不携带 error；后者仍为既有 TIMEOUT。无核心参与时也须终止 Promise；不能删除 CANCELLED 分支测试或等待 Task 4 覆盖。
  - business-codes.test.ts 验证 bigint 目录的命中/未知码、只读冻结；CONTRACT-024 从正式协议 exports 读取副本，与独立 Go 数据逐项核对名称集合、17 项数值及 canonicalCode/bizCodeName/source/retryable 和来源版本。数值改错、描述改错（包括 retryable）、遗漏任一项及提交失配分别应拒绝；初始无副本时测试失败，不跳过。
  - Run: `pnpm exec vitest run --project protocol-unit packages/payment-protocol/src/errors/business-codes.test.ts`；`pnpm exec vitest run --project integration TC-PAYSDK-CONTRACT-024`。
  - 用冻结 fixture 核验 tradeNo→trade_no、method→VIRTUAL、appId→app_id；断言出站 ProtoJSON 不含 open_id 和 body user_id；client_platform 由 SDK 设备采集产生，覆盖 ios/android/ohos/ohos_pc、未知值和采集异常，分别按 Spec 映射，不从宿主额外属性透传。捕获 SDK 请求记录，确认 pay 首次请求为 CreateTradePay，输入已有 trade_no，初始化不发送请求，SDK 不调用 CreateTrade。
  - 捕获两次发送验证当前 Token 每次获取、Request ID 不同且 Header/BaseReq 一致，并断言完整正则 `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`；Product ID 双位置一致、app_version/lane 标准 Header 与缺省省略、配置环境未被改写；provider 异常/挂起不发送；发送前扣除 provider 耗时。固定时钟及两个客户端交错调用也须满足 Request ID 格式、同值传输及不复用要求。
  - 响应矩阵逐项覆盖公共契约“协议与恢复的必需测试输入”：两种 HTTP 200 错误出口、非 2xx、信封缺失/冲突、全部公开错误、oneof 错分支/缺字段、错误交易/空 payment_no、未知状态与 int64；验证 status_code 权威和 wire presence，业务错误不被成功参数校验覆盖；不能以 success callback 或 HTTP 200 当支付成功。
  - Run: `pnpm exec vitest run --project protocol-unit --project sdk-unit packages/payment-protocol/src/client.test.ts packages/payment-sdk/src/adapters/payment-infra/backend.test.ts`；错误映射、字段来源或 codec 缺失时失败。

  - backend.test.ts/client.test.ts 分别核对 omitted/undefined 不设置字段且原始 JSON 无 xpayEnv，sandbox/prod 分别编码为 XPAY_ENV_SANDBOX/XPAY_ENV_PROD；query/observe 请求及 Header/BaseReq 无该字段。用锁定 Go 消息/ProtoJSON 或 descriptor 的独立期望校验，枚举值不能从 SDK 实现反推；已设置 0 违反 IDL，与 absent 分开验证。将错误的 PROD→SANDBOX 映射或省略→UNSPECIFIED 注入受控副本须使测试失败。

  **GREEN**
  - 从已验收 lock/status 导入完整 generatedCompatibility 期望，改造 CONTRACT-024/manifest维护工具；通过项目 proto:sync 更新当前分支来源，仅在兼容字段全部不变时接受，保持 paymentBusinessErrorsIdlCommit=5539。固定 Go 来源文件有无关改动只记录本次核验，不替换旧文件摘要。
  - 在 backend 单一业务映射处保留操作身份，并精确计算内部 cause；不从 error.retryable 或 originalCode 事后泛化推断。所有普通公共错误字段和值保持既有规则。
  - backend 在业务码处理前把 CommunicationError.CANCELLED 映射内部取消变体，所有普通成功/错误沿用原映射；不根据当前阶段伪造时间或渠道错误，不在适配器内触发停止结算。
  - 在指定手写文件逐项复制公共契约 17 项对应的 Go 常量/描述，数值使用 bigint 字面量，canonicalCode 使用 generated 枚举；保留原名称、中文场景注释及 paymentBusinessErrorsIdlCommit。实现只读目录及 getPaymentBusinessError，SDK backend 通过协议根 exports 消费，仍唯一负责 SDK 分类，不改原响应判定/恢复矩阵。
  - 保存独立 Go 取数的完整来源提交、文件摘要、命令及 JSON，重跑上述目录单测与 CONTRACT-024 测试通过。generated lock 来源与固定 Go Fixture/副本分开验收；未知码与描述冲突沿用既有规则，不通过通用分类或位段推断身份。
  - 通信实例执行器直接消费 generated method.meta/codecs；配置与 transport 绑定在实例闭包，不修改全局 config；交错执行两个实例，验证网关、Token、lane 和预算互不串用。通信层处理 Header/BaseReq 与 codec，SDK backend 保留唯一 method/channel、支付错误与关联映射。不调用内部 QueryPayment/SignWithSessionKey，不引入 SDK 登录。
  - 重复同命令通过。任何未被当前 IDL/冻结补充契约覆盖的期望须先回到 Spec，不能在实现中决定。

  - backend.ts 唯一映射 public XpayEnv 到 generated 常量；省略分支不赋值。通信执行器保持 codec 的 optional absence；网络只发送 body。复用现有 BaseResp 错误路径，不为 xpay 环境另造错误码或把所有环境错误当登录失效；同一响应的四个渠道参数保持原文，SDK 不实现服务端 env/AppKey 转换。

  **Verification**
  - proto:sync 后 proto:status 成功/current；保存同步前后 lock、命令/版本/原始输出和退出码，核对与本次源码/Fixture/Spec摘要一致。CONTRACT-024 七 case、所有现有集成及共同门禁全回归；报告分别列固定 Go 事实来源和当前 generated 来源。已完成 Task1–3 的历史交付保留，本 Task 来源门禁增量通过独立评审后恢复完成，不能以前一次sync_required报告代替。
  - 重跑目录单测、CONTRACT-024 和全部已有错误映射测试；检查 17 项真实值/描述与 Go 来源一致，受控漂移均触发断言失败，且已有渠道会话/鉴权/查询恢复结果无变更。固定 Go JSON 不随 generated lock 改版本；CONTRACT-024 另校验完整支付兼容闭包与本次 sync/status 来源。副本和查询逻辑纳入共同手写覆盖门禁，生产依赖不增加 Go/取数工具。
  - 上述测试通过且 fixture manifest 记录精确 IDL commit/schema 版本/来源；核对用户身份由网关 metadata 提供、服务端按用户与 app_id 查询微信身份、出站请求只含 SDK 使用的字段。
  - Fixture 锁定 IDL/服务端/网关 commit 与生成来源；复用 paymentNo 且 signData/paySig 相同、signature 重新签发的样例必须接受，不以 P2≠P1 或全部签名字段变化验收。不同单号响应同样正常消费；不能以 SDK 假 backend 证明服务端状态机；Task 8 再核验真实渠道恢复。服务端内部 RPC 中途失败按公开错误映射，不将 Unauthorized 解释为无副作用或未支付。

  - 证据逐项列出生成字段 presence、独立三态 JSON、同次 actual wire 及源版本；确认 CreateTradePay/QueryTrade 是唯一注册方法，内部 Prepay.xpay_env 只作契约核对。旧网关 a761953 的样例可验证旧响应出口，但不得标为新增字段已贯通。

  **Review / Acceptance**
  - 完成条件：共同门禁通过，冻结字段/错误矩阵逐项对应实际出站请求与结果，双实例交错执行不串配置，Fixture 来源和版本有效；标准 ProtoJSON 与独立网关 wire 期望一致，业务 Token、签名不进入诊断。类型、完整 wire 样例或错误映射证据缺失时本任务保持未完成；当前协议与旧外层 string 不兼容，必须使用锁定生成产物。

  **Commit**
  - `feat(payment-sdk): map trade contracts and distinct identity errors`

- [x] 4. 实现核心调度、有界查询与单次结束

  **Prerequisites**
  - Task 1；时间默认/覆盖和阶段状态表完成评审；身份中断断言按公共契约的阶段矩阵和 interruptedPhase 固定，不能用假端口自行改变恢复入口。测试使用内部假 backend/channel，不依赖 Task 3 真服务。

  **Files**
  - Create: packages/payment-sdk/src/core/client.ts、observation.ts、lifecycle.test.ts 及同目录假 runtime/backend/channel 测试辅助。
  - Modify: packages/payment-sdk/src/ports/channel.ts、packages/payment-sdk/src/contracts.test.ts 及就近调用该内部端口的测试辅助，补齐 markInvoked 必需同步方法；同步根/SDK/E2E AGENTS 对应条款，保留既有工程规则。Task 1 已完成的类型文件由本 Task 增量维护，不重做初始化或改公共 exports；协议包无此改动。

  **Requirements / Scenarios**
  - SDK-05、CONTRACT-05/026 的内部查询恢复语义及本任务验收部分。
  - CONTRACT-05/025 的核心结算、内部取消防御及全部竞态分支。
  - SDK-04/05/06/07/11/15；CONTRACT-03/04/05/07/11/12/13；TC-PAYSDK-CORE-005/006/007/008/012/018/019、TC-PAYSDK-CONTRACT-003/004/005/006/007/009/010/013/016/019/020/021。

  - SDK-16、CONTRACT-14；CORE-020、CONTRACT-022/023 的本任务职责部分，贯通 FLOW-008 及 FLOW-006 的环境选择检查。

  **Design Decisions**
  - Backend query recovery semantics。
  - Backend cancellation and terminal ownership。
  - Full payment execution and recovery；Budgets, cleanup and exclusive channel lifetime；Public initialization and method selection；Phase notifications and documented state semantics。

  - Per-payment Xpay environment。

  **Interfaces**
  - Consumes: PaymentBackend/BackendResult、ChannelAdapter、RuntimePort、RunOptions；内部 createCoreClient 装配。
  - Produces: pay/query/observe 调度、内部阶段、约定的 onPhase 通知与最终结果，向渠道提供 beforeInvoke 同步通知点与 markInvoked 一次调用准入，SDK 工厂后续组合它们。

  **RED**
  - lifecycle.test.ts 将相同 SERVER_ERROR/retryable=true 分别配有/无 cause=query_unavailable：有标签者按预算/间隔重查后 PAID，无标签者结束且保留最后快照；缺标签不能查原码补推断，标签与 code/source/retryable 不符不得进入业务重查。验证预算/停止优先、prepare 无重放、独立 query 一次请求，检查公开 PortResult 和 Outcome.error 的实际键只有公共字段。
  - lifecycle.test.ts 在 prepare/query 假 backend 返回 cancelled：验证已结束忽略、原始宿主停止为 stopped、deadline 到期为时间结束，以及两者均无的异常取消为 NETWORK_ERROR/source=network/originalCode=CANCELLED；公共 query 只返回既有 PortResult。覆盖停止/到期两种顺序、底层同步与迟到取消、已确认终态后的旧结果；Promise 只结算一次。增加短请求预算/长观察窗口：首笔查单第 5 秒到期但总窗口 60 秒，按 intervalMs 重查并最终 PAID；验证两种超时来源（协议 TIMEOUT、核心计时）均不提前 ended，旧请求取消/迟到结果不污染新请求。
  - 假端口记录调用序列：正常为 prepare→invoke→query；unsupported/busy 无外部调用；observe/query 无 prepare/invoke；cancelled/launch_failed 本次无自动 query。
  - success_hint + PAYING 不改 PAID；expire_time 到期仍 PAYING 时不结束观察，后续 PAID 正常确认；unknown 回调进入查询；普通无回调等待超过 HTTP/查询配置不结束、不提前查询，回调后才启动完整查询预算。
  - 假时钟覆盖内置默认、初始化/单次逐字段覆盖与隔离、provider 等待、慢 query、间隔和查询截止，断言同时查询数≤1；只在约定边界通知两个阶段，不在轮询重复通知，不交付中间 PaymentOutcome。结束后推进时钟及迟到响应，最终结果计数始终为 1；诊断/阶段回调异常不改变主结果。
  - CORE-018 的每种分支比较完整 trace：beforeInvoke → onPhase(channel_invoking) → 第二次停止检查 → markInvoked → 实际渠道 → onPhase(confirming) → query/provider → outcome；参数/prepare 失败、取消/失败/会话失效、独立 observe、首笔 PAID/CLOSED 和无监听分别按 Spec 断言阶段缺席/次数。事件键严格为 attemptId/phase，与本次结果关联。
  - CORE-019 覆盖两个通知分别同步抛错/返回拒绝 Promise及 thenable、拒绝迟于最终结果到达；均无未处理拒绝或异常原文日志。通知内停止时断言下一外部动作/provider 为零；channel_invoking 内停止保留 not_invoked。另以 beforeInvoke=true 后第二次停止检查命中、平台调用后停止两例，断言平台次数 0/1、stopped 信号 not_invoked/unknown、query=0、结果一次；停止订阅先于 adapter stopped Promise 也须正确。markInvoked 未准入/重复/停止后/confirming 后/旧运行均 false 且无副作用；正常及省略监听可首次 true，标记后再次 beforeInvoke 为 false。通知耗时超过查询预算不重新计时，不能发送超预算请求。通知内重入同单 busy，重复/停止竞态及新运行期间旧回调不再通知/查询；业务测试闭包在调用前建立运行标识并隔离旧异步更新。
  - 身份中断分别覆盖 prepare/invoke/query 的最终结果、interruptedPhase、引用、已知 paymentNo 及最后可信快照；结束后不因 Token 数据源更新自行恢复。业务显式继续时：prepare-auth 从 pay 开始，query-auth 仅 query/observe，channel-session 从新的 pay 开始。查单恢复前后 prepare/invoke 计数不增加，渠道会话恢复不能重用旧 PreparedPayment；两次响应 paymentNo 相同或不同时均不改变调度，三类身份错误不混淆。
  - Run: `pnpm exec vitest run --project sdk-unit packages/payment-sdk/src/core/lifecycle.test.ts`；原始空实现或错误状态迁移时失败。

  - lifecycle.test.ts 覆盖 xpayEnv=null/0/1/2/空串/UNSPECIFIED/协议枚举名称/其他未知值：最终 error/INVALID_INPUT、source=sdk、not_invoked，backend/provider/渠道/onPhase 计数为零。连续 sandbox→prod→省略分别只带本次值；在受控 provider 暂停时修改原 request 不改变已接纳的值。身份恢复 pay 由宿主保留选择，query/observe 仍不准备支付、不接收环境参数；同单活动调用即使更换合法 xpayEnv 也保持 busy。

  **GREEN**
  - observation.ts 只消费内部已确认 cause 与对应公共错误形态决定业务重查；核心不导入错误目录/复制数字。core/client.ts 构造公开 query 结果，Outcome.error 同样按 PaymentError 字段白名单复制；不展开内部失败对象，不输出内部标签到诊断。
  - 识别内部 cancelled 后按公共契约归属表处理；区分运行 ended 与每次请求完成闩锁，先锁定对应结果再取消底层。观察中仅单笔查询到期时清理该请求、保留运行并按剩余总预算重查，新请求上下文隔离旧请求结果；prepare 到期、观察总截止或宿主停止才按对应原因结束运行。区分原始 RunOptions.cancellation 与底层清理信号；无记录时按归属表区分宿主停止、运行截止、单请求截止与异常取消。
  - 按 design 状态表实现验证、阶段调度、运行级互斥、查询循环和 ended 闩锁；先结束标记，再清理/尽力 abort，最后交付。请求/观察阶段检查各自剩余预算，不把查询预算用于原生调用，不把 retryable 解释成 prepare 重放。
  - core/client.ts 在准入时保存本次监听并校验函数类型，先建立活动记录再向适配器提供 beforeInvoke；每阶段闩锁在调用监听前置位，事件为独立只读 attemptId/phase。同步 try/catch 隔离调用，Promise.resolve(回调返回值).catch 接收异步拒绝但不 await，不记录异常原文；结束后不再产生通知。core/observation.ts 固定截止后通知 confirming，再复查停止/剩余预算；beforeInvoke 通知后返回本次是否仍可继续，beforeInvoke 不置位渠道实际调用标记；markInvoked 按公共契约同步准入并一次置位，不发阶段通知。内部假渠道同步维护同一调用顺序，action 分支不标记。关键决定按中文语义表注释。
  - 重复上述命令通过；此任务不擅自补写原生收银台解锁规则。

  - core/client.ts 接纳 pay 时复制 reference、method、xpayEnv 并验证值域，非法值直接一次结束；仅把合法快照传给 PaymentBackend.prepare，不存客户端默认/交易环境历史。query/observe 继续只传 TradeReference；其他状态、超时、通知及互斥规则不因环境字段改变。

  **Verification**
  - 对带编号时序图和状态表记录测试名与调用计数。未知状态、身份差异、停止恢复及诊断异常均覆盖，等待结束不被归为支付失败。

  **Review / Acceptance**
  - 完成条件：共同门禁通过，阶段/时间边界与错误分支均有测试名、调用顺序和次数记录；单次结算、无重叠查询、渠道等待无 SDK 上限、不得自动重放均通过。本地 run 生命周期与原生界面生命周期没有混用；CORE-013 的平台回调隔离由 Task 5 按公共契约验证，不能以正常流程的核心测试通过视为关闭。

  **Commit**
  - `feat(payment-sdk): define bounded payment execution and observation`

- [x] 5. 实现虚拟支付参数消费与原生生命周期

  **Prerequisites**
  - Task 1/3/4；结构化参数模型与映射按公共契约实现，并有 Task 3 协议消费证据。宿主显式停止及 CORE-013 按公共契约的 ChannelContext.cancellation、kind=stopped 和旧回调隔离规则实施；正常渠道等待不设置 SDK 时限。

  **Files**
  - Create: packages/payment-sdk/src/adapters/channels/wechat-miniapp-virtual.ts、wechat-miniapp-virtual.test.ts、extension.test.ts；获准渠道样例放 packages/e2e/tests/fixtures/。

  **Requirements / Scenarios**
  - SDK-02/03/04/06/12/15；CONTRACT-07/09/12/13；TC-PAYSDK-CORE-002/003/004/005/007/013/018/019/024（024 为本轮增量）、TC-PAYSDK-CONTRACT-010/014/020/021。

  - SDK-16、CONTRACT-14；CORE-020、CONTRACT-022/023 的本任务职责部分，贯通 FLOW-008 及 FLOW-006 的环境选择检查。

  **Design Decisions**
  - Prepare-to-channel contract mapping；Budgets, cleanup and exclusive channel lifetime；Public initialization and method selection；Phase notifications and documented state semantics。

  - Per-payment Xpay environment。
  - 渠道失败码归类与保留原码（本轮增量）。

  **Interfaces**
  - Consumes: PreparedPayment、已冻结 pay_params schema/官方码表、ChannelContext（含 cancellation、beforeInvoke/markInvoked: () => boolean，不带 HTTP/查询 deadline）及公共契约的本地调用结束规则。
  - Produces: 唯一首期真实 ChannelAdapter，输出信号与渠道明确失败错误（CHANNEL_ERROR/source=channel/十进制 originalCode）；内部假动作适配验证扩展。

  **RED**
  - 以结构化协议及内部渠道模型 Fixture 验证四字段映射与 signData 原始字符串严格相等；缺字段/未知 mode/渠道不符不得调用微信，禁止在前端补签。
  - 顺序断言校验/调用参数准备 → beforeInvoke → 停止复查 → markInvoked → 平台调用；非法参数/能力缺失不调用 beforeInvoke。beforeInvoke 返回 false、第二次停止检查命中或 markInvoked 返回 false 均为 kind=stopped，平台计数零；成功只标记一次且紧接平台调用，中间无 await/通知/再次停止检查。平台 pending 后停止与前置停止分别验证，不把两者都断言 unknown；适配器不得直接调用业务 onPhase，也不得因重复原生回调重复进入 beforeInvoke。假动作适配不触发真实渠道通知点。
  - 假平台分别返回成功、取消、已知调起失败、-15007 会话失效、未知码、重复回调、无回调；无回调时推进时间不触发自动查询、结束或重放。验证显式 cancellation 返回 stopped、活动记录及订阅清理和旧回调隔离；调用前已停止不调渠道，停止/回调竞争仅先到事件生效；原调用结束后的显式同单 pay 是新流程。
  - 内部假适配返回 redirect/qr_code，断言 action_required 必含 nextAction，没有 DOM/UI/导航调用，query/observe 不会调起渠道；身份中断续接不以假动作定案。
  - Run: `pnpm exec vitest run --project sdk-unit packages/payment-sdk/src/adapters/channels`；错误参数、信号或互斥实现时失败。

  - 对 sandbox/prod/省略所对应的完整准备响应，断言端侧业务入参仍只有 mode/signData/paySig/signature，签名原文逐字一致，不多传 xpayEnv。包括请求 sandbox、服务端返回有效现网参数的样例：SDK 不从输入推定签名 env，不强转 PROD=2，不凭该请求值直接拒绝 iOS；样例仅证明消费边界，真实兼容见 Task 8。

  **GREEN**
  - 消费 SDK 内部 ChannelPaymentParams，完成原文透传、能力检测及官方错误映射；oneof/wire 映射只在 backend，不重新 JSON.parse 外层；未文档化非零安全整数码按明确失败归类并保留十进制原码，只有无可用错误码保留 unknown，不将 fail 全部归为未支付。等待渠道回调，不增加计时器；宿主结束本地调用及旧回调隔离按公共契约实现，kind=stopped 仅表示本地停止。重复同命令通过。
  - 参数与能力检查通过后同步调用核心提供的 beforeInvoke，处理 false 并复查 cancellation，再调用 markInvoked，true 时立即调用已准备的平台方法；在停止、实际调用标记和错误映射处保留中文场景/边界注释。阶段异常由核心隔离，不把业务观察者异常映射成 CHANNEL_ERROR。

  **Verification**
  - 支持列表只含虚拟商品；假扩展不导出，wx 只在平台调用边界访问，签名原文无变化且日志不泄漏。

  **Review / Acceptance**
  - 完成条件：共同门禁通过，原始签名字段严格一致，非法参数不调渠道，全部信号/无回调/重复与旧回调分支有断言；所有行为有协议/官方证据或显式评审决策。CORE-013 的预期从公共契约的显式停止和旧回调隔离规则取得，不接受实现者临时决定；平台替身通过不视为真机验收。

  **Commit**
  - `feat(payment-sdk): implement virtual payment channel lifecycle`

- [x] 6. 建立 Shadow 网关、Fixture 校验与跨包测试基础

  **Prerequisites**
  - 网络/Shadow 基建依赖 Task 1–3（含 Task 2 已评审的协议根网络工厂导出及增量验收）；五项内部 case 的证据补充还依赖 Task 4/5，Task 6 完成时这些模块须已交付；不依赖 Task 7 公共工厂。采用 Design 中已定义的测试入口、驱动及验证元数据格式，以及 Task 3 按公共契约生成的完整 wire 样例；无来源或带省略号的参数不作为可运行 Fixture。

  **Files**
  - Create: packages/payment-protocol/testing/index.ts、shadow/server.ts、routes.ts、requests.ts、faults.ts 及就近 *.test.ts。
  - Create: packages/e2e/src/harness.ts、drivers/node.ts、drivers/weapp.ts、drivers/channel-double.ts、package-consumer.ts、cases/define-case.ts、cases/fixture-loader.ts、reporters/scenario-reporter.ts 及就近 *.test.ts；packages/e2e/host/weapp 按 Design 文件树建立官方最小宿主；packages/e2e/tests/protocol/TC-*.spec.ts 与 tests/fixtures/base.json、fixture.schema.json、同名 TC/FLOW 目录内 manifest.json 和 case-key JSON。
  - Create: scripts/check-scenarios.ts、check-fixtures.ts、check-package.ts、verification.schema.json、lib/spec-inventory.ts、lib/contract-inventory.ts 及就近 *.test.ts；Modify: 根 Vitest/测试类型配置与 E2E 配置、docs/engineering/bootstrap.md。本任务原始基线 46 个 Scenario 已登记 verification v2；CORE-021/022/023 由 Task 8 承接、CORE-024 由 Task 5/6/7 增量承接并由 Task 8 汇总，共 50 个；按 Design 更新 schema/解析器和 reporter，再实现绑定。SDK 模块单测保留原路径，补充/复用实际断言及 Vitest meta/注记，不新增生产导出或 E2E 反向依赖；CI 只读取已保存的结构数据，不临时拆分自然语言。
  - Modify: packages/payment-sdk/src/core/lifecycle.test.ts、adapters/payment-infra/backend.test.ts、adapters/channels/extension.test.ts 中承接 CORE-001/002/010、CONTRACT-001 的就近单测，为五项内部 case 补齐绑定和实际断言执行记录；不修改产品行为。根 reporter 收集 unit 项目，fixtureCase=null 仅适用未读取外部数据的 module 用例，源码摘要不可缺。已有 Task 1–5 单测证据补充由 Task 6 增量回归及评审承接，不重做已通过任务。
  - FLOW-007 保留原九个 case，新增 stop-after-notification、stop-after-platform，共十一项；分别绑定 CORE-019 的未调用/已调用停止检查点，integration/weapp 都必须有同次运行证据。
  - Create: packages/e2e/tests/tooling/TC-PAYSDK-CORE-015.spec.ts、TC-PAYSDK-CORE-016.spec.ts、TC-PAYSDK-CORE-017.spec.ts 及同名 Fixture；通过命令入口和受控输入验证检查器输出/退出码，不将检查器自身的单测报告冒充 CLI 集成证据。

  - Modify: packages/e2e/tests/protocol/TC-PAYSDK-CONTRACT-024.spec.ts 的场景绑定；保留 Task 3 已运行的独立一致性断言，把七个 case、固定 Go 来源和当前生成兼容证据纳入清单/报告。漏掉此场景、失配来源或沿用旧报告均应阻断完整门禁。
  - Create: packages/e2e/tests/protocol/TC-PAYSDK-CONTRACT-023.spec.ts；沿用 Task 3 的同名三态/query Fixture。登记 CONTRACT-022/023、CORE-020 与 FLOW-008 五类 case 以及 FLOW-006 的新增检查点，尚无运行证据时保留覆盖缺口。

  **Requirements / Scenarios**
  - CONTRACT-026 五个 behavior integration case 及一个 engineering 声明 case 纳入有效清单及分母，Task 7 未运行时保持未覆盖；不能因内部标签不公开而省略场景。
  - CONTRACT-025 六个 integration case 纳入有效场景清单；Task 7 尚未运行时保持未覆盖，不因缺报告从分母删除。
  - CONTRACT-09、TC-PAYSDK-CONTRACT-024；保留七个 case 的独立 Go 来源、元数据刷新及支付闭包漂移断言，接入场景/来源门禁。
  - SDK-08/09/10/13/14；CONTRACT-08/09/10；CORE-009/010/014/015/016/017、CONTRACT-011/015/017/018 的协议/发布/场景边界；公共契约质量门禁。

  - SDK-16、CONTRACT-14；CORE-020、CONTRACT-022/023 的本任务职责部分，贯通 FLOW-008 及 FLOW-006 的环境选择检查。

  **Design Decisions**
  - Packaging, ESM integration and source ownership；Official scaffolding and reproducible bootstrap；Scenario-driven tests and shadow gateway；Verification boundaries and evidence classification；Composed payment flows and test granularity；Executable scenario coverage gate；Agent instructions and architecture enforcement；Acceptance gates and evidence ownership；Verification and delivery evidence。

  - Per-payment Xpay environment；IDL-owned business error catalog。

  **Interfaces**
  - Consumes: generated metadata、全部 Scenario 的 verification v2/IDL 版本、已校验的用例/Fixture、测试环境选择；真实 weapp 协议链路使用已构建协议包根导出的 createProtocolClient/createWechatMiniappHttp。
  - Produces: 仅测试可解析的 Shadow 入口、隔离场景与请求记录、固定响应/故障序列、运行驱动、覆盖及发布清单报告；不新增 SDK 生产测试 API。

  **RED**
  - 验证路由自动发现、缺路由、未匹配/额外请求、场景隔离、响应顺序、延迟/断连与清理；将错误字段/编码的实际请求与独立 wire 期望比较，应失败。
  - 故意提供缺 TC/缺 Fixture、失配来源版本、skip、缺运行证据、生产包夹带 Shadow、SDK tarball 残留 workspace:/latest/浮动协议依赖或依赖版本与验证记录不符的输入，检查报告准确列出缺口且不宣称全量通过。工具行为用受控输入做单测，不依赖真实支付环境。
  - 覆盖新增 Spec/IDL 无测试绑定、只贴文件 ID、必需参数 case 未展开、重复唯一键、无断言执行、失败但执行覆盖已满、旧 CI 报告、Node 抵扣 weapp、无依据减项的反例。以当前事实、绑定和报告为三组独立输入，验证完整门禁分别返回缺项/证据错误/失败，不从已有测试反推分母。
  - CORE-016 同时验证：用 unit 报告抵扣 behavior/IDL/FLOW、用工程检查抵扣支付 E2E、混合 Scenario 缺 module、缺 verification/kind，均列明缺口并失败；不得通过迁类或缺分类缩小分母。
  - CORE-016 增加：全部单项 TC 通过但缺 FLOW、流程缺 case/必需阶段、用多个测试拼接流程、只贴 FLOW ID 而无连续证据，均失败；同一次完整流程可显式覆盖多个 TC/协议检查点，计数按集合去重，不强制一场景一测试。
  - Run: `pnpm exec vitest run --project protocol-unit --project test-tools-unit`。

  - 新增门禁反例：当前 IDL 已有 xpay_env 但只登记方法未覆盖字段/presence；遗漏省略分支；只测 SANDBOX 未测 PROD；query 错带环境字段；FLOW-008 缺 case 或 weapp 证据；仅刷新 manifest 的 IDL 摘要而沿用未核验的旧请求数据。真实 CLI 均应指出缺口并非零退出。

  **GREEN**
  - Shadow 在协议包 testing，复用 Express 最小服务；Fixture 容器由 Ajv 校验，Spec 通过 remark AST 读取，模块依赖用 dependency-cruiser；本项目仅实现契约匹配、状态序列和检查规则。Fixture 在 E2E，路由从 generated metadata 按 Design 的两个实际消费方法选择，不另建手写 endpoint 表，不暴露额外生成的管理端方法。共享测试配置显式解析 @payment-test/protocol，生产 exports/files 排除 testing；每例隔离记录和状态并清理。
  - Node 测试网络桥接连接本地 Shadow；微信 driver 复用 miniprogram-automator 连接现有本地开发者工具，直接执行最小宿主中的 SDK 测试函数并取回结果；协议最小宿主从已构建协议包正式根出口装配 createProtocolClient 与 createWechatMiniappHttp，wx.request 使用工具真实实现，渠道回调由替身控制；不自写 HttpPort、不深层 import 源码、不以测试别名替代生产网络。不建设点击/导航/截图用例，不自研连接协议、重连调度或开发者工具控制器。两类报告明确测试替身与真实运行边界；CI 只重放已保存 Fixture，不临时调用 AI。重复单测命令通过。
  - define-case 包装 Vitest 注册，绑定 ownerId、caseId、covers、flowId/flowCase、environment 和 fixtureCase；不另建 runner 或用例 DSL。派生清单与 reporter 按项目、文件、完整名称核对；Spec/IDL/FLOW 规则决定分母与环境，Fixture 只提供数据。连续流程还核对同一 case 内的阶段、交易关联及结果；输出全部 Spec、按 kind 分类、支付 E2E behavior、IDL、FLOW 覆盖/通过 JSON 与摘要，失败非零退出；AGENTS、命令和 CI 同步。module 可直接使用 Vitest meta/annotate 并按同形证据读取，不要求导入 E2E helper；普通未绑定模块单测仍纳入四项代码覆盖。
  - 纳入 CORE-018/019、CONTRACT-020/021、FLOW-007 以及旧 FLOW 的新增通知检查点，先登记测试义务再实现绑定。harness 只记录真实 SDK 的 onPhase、平台调用、HTTP/provider 与 outcome 顺序，不由 Fixture 注入 SDK 事件；phase 值不写入 IDL 或 Shadow 引擎。声明注释检查在 integration 消费产物，中文语义通过评审取证，不让机器猜含义。

  - Shadow 请求记录保留原始 JSON 的键存在性，按独立 Fixture 对照，无键不能与 null/0/UNSPECIFIED 相等；禁止先经 codec 默认化后再匹配。SDK 与协议测试真实消费 generated；环境业务期望留在 E2E 场景，不放进 Shadow 通用引擎，不新增 Prepay 路由或把服务端部署策略伪装成已验证事实。

  **Verification**
  - 共同门禁通过后执行 `pnpm check:fixtures`、`pnpm check:scenarios --inventory`；逐项核对本期所有 Scenario 的验证元数据与支付 Consumer 契约义务。尚待 Task 7/8 实现的测试绑定和运行证据必须报告缺口，清单命令此时预期非零；结构或来源错误须在本任务修复，不能把预期缺口解释为全量验收成功。
  - 执行 `pnpm exec vitest run --project integration packages/e2e/tests/tooling`，通过真实 CLI 验证 CORE-015/016/017 的工具能力。CORE-017 只覆盖仓库内机器门禁、边界恢复及规则减项评审记录，不建立或读取远端合并保护/审批证据。沿用 Task 1 的静态/覆盖反例，并覆盖 RED 中全部缺项、失效证据、FLOW 拼接及包依赖/测试泄漏反例；报告中区分预期非零和非预期失败。
  - 分别以 Spec、IDL 为输入，完成 Design 中的贯通演练：独立义务清单 → 已评审的用例/检查点 → 版本化测试/Fixture → 真实执行 → 报告；正向受控集合完整通过，新增义务无绑定等反例被阻断。同一输入可确定性重放，不依赖 CI 调用 AI。
  - 执行已明确协议 case 的 integration 与 weapp 测试，记录实际 Header/body、解码结果及请求计数；weapp 至少一例经过开发者工具中的协议根工厂 → 生产网络适配器 → 真实 wx.request → Shadow。记录实际解析的构建入口/版本和调用链；只有裸 wx.request 或自写 HttpPort 的结果不满足该项。将具体 case、Vitest 过滤命令、工具版本和结果写入任务证据，不以 driver 单测替代平台驱动验收。未实现 SDK 全链路时场景报告仍显示相应缺口，完整产品消费与发布清单在 Task 7 验证。
  - weapp 使用本仓库 packages/e2e/host/weapp 最小测试小程序，连接现有本地工具完成“执行函数 → SDK/协议 → 真实 wx.request → Shadow → 结果断言”；记录工具版本、连接参数和必要清理结果。连接能力使用 automator 现成 API；不以运行 ESM 业务应用代替本仓库验证，不以尚未配好 Runner 阻断本地测试。

  - Run: `pnpm exec vitest run --project integration --project weapp TC-PAYSDK-CONTRACT-023`；本任务通过协议包公共客户端发送 generated CreateTradePay/QueryTrade，验证三态和 query 无字段；weapp 由同包根 createWechatMiniappHttp 提供网络，经真实 wx.request→Shadow，不等待 Task 7 的 SDK 工厂。SDK 公共 pay/observe 的输入、隔离与无字段行为由 Task 7/8 验证，本任务只统计实际执行的协议检查点。Task 6 的 inventory 已包括全部新义务，Task 7/8 尚未执行的 FLOW-008 不抵扣覆盖。

  **Review / Acceptance**
  - 完成条件：共同门禁及本任务工具 CLI/贯通演练通过；v2 的全部元数据、分类/来源/路由、Fixture、驱动、报告工具均有实际证据；五项 module case 有本次 sdk-unit 绑定/断言/报告；behavior/工程/IDL/FLOW 不混算，受影响就近单测及工具均已回归。Node 与开发者工具的最小协议链路通过。协议包无 SDK/E2E 反向依赖，Shadow/Node 驱动不进入生产入口；测试从 Spec/IDL 取得期望，客户端和 Shadow 同 codec 往返不能作为唯一协议证明。此结论仅为基建就绪，全量 TC/FLOW 仍由后续任务交付。
  - 评审核对平台接入仅是现成 automator 的薄封装和 SDK 测试函数；无新增 UI 测试框架或自研工具控制能力。平台执行中保留真实 SDK/协议及 wx.request，不能为了缩减接入代码而退化成单独测试裸请求 API。

  **Commit**
  - `test(payment-sdk): add shadow gateway and contract test infrastructure`

- [x] 7. 装配 SDK 生产客户端并验证公共消费

  **Prerequisites**
  - Task 1–6；公共 API 与模块装配完成评审。

  **Files**
  - Create: packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-026.spec.ts 及同名 tests/fixtures/TC-PAYSDK-CONTRACT-026/manifest.json、五个运行时 case 数据及 public-declarations 的产物检查输入。已知码引用 Task 3 独立 Go 样例，未知码样例以受控变异标注来源，不作为新 IDL 错误定义。
  - Create: packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-025.spec.ts 及同名 tests/fixtures/TC-PAYSDK-CONTRACT-025/manifest.json、六个 case 的受控响应/延迟数据；使用已装配公共客户端、真实 backend/通信执行器和平台网络替身/受控时钟。
  - Create: packages/payment-sdk/src/factory.ts、factory.test.ts；packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-001.spec.ts、TC-PAYSDK-CORE-014.spec.ts 及同名 Fixture；Modify: packages/payment-sdk/src/index.ts、package.json。
  - Create: packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-020.spec.ts、TC-PAYSDK-CONTRACT-021.spec.ts 及同名 Fixture/manifest，分别验证公开回调消费和源码/双格式声明中文注释的结构交付；注释语义核对保存到本任务验收记录。
  - Create: packages/e2e/tests/flows/FLOW-PAYSDK-001.spec.ts 及 fixtures/FLOW-PAYSDK-001/manifest.json、normal.json、long-channel-wait.json；通过同一次 pay 验证公共入口、prepare、渠道、PAYING → PAID 全链路。

  - Create: packages/e2e/tests/sdk/TC-PAYSDK-CONTRACT-022.spec.ts、TC-PAYSDK-CORE-020.spec.ts 及同名 Fixture/manifest；tests/flows/FLOW-PAYSDK-008.spec.ts 与 fixtures/FLOW-PAYSDK-008/{manifest,omitted,sandbox,prod,successive-selection,request-snapshot}.json。本任务交付完整测试代码与 integration 证据，weapp 由 Task 8 汇总。

  **Requirements / Scenarios**
  - SDK-05、CONTRACT-05/026 的内部查询恢复语义及本任务验收部分。
  - CONTRACT-05/025 的公开入口结算与无内部类型泄漏验证。
  - SDK-01/02/09/13/15；CONTRACT-01/07/08/09/10/12/13；TC-PAYSDK-CORE-001/002/010/014/024（024 为本轮增量）、TC-PAYSDK-CONTRACT-001/009/011/012/015/018/019/020/021；FLOW-PAYSDK-001/008 及 FLOW-PAYSDK-002 的 integration 证据。

  - SDK-16、CONTRACT-14；CORE-020、CONTRACT-022/023 的本任务职责部分，贯通 FLOW-008 及 FLOW-006 的环境选择检查。

  **Design Decisions**
  - Backend query recovery semantics。
  - Backend cancellation and terminal ownership。
  - SDK ownership and module graph；Public initialization and method selection；Packaging, ESM integration and source ownership；Composed payment flows and test granularity；Acceptance gates and evidence ownership；Phase notifications and documented state semantics。

  - Per-payment Xpay environment。
  - 渠道失败码归类与保留原码（本轮增量）。

  **Interfaces**
  - Consumes: 各 SDK 内部模块、PaymentClientOptions，以及协议根 createProtocolClient/createWechatMiniappHttp；遵守 Protocol network factory export and assembly。
  - Produces: 公共 createPaymentClient/PaymentClient、生产 exports；SDK 工厂根据配置/provider 完成内部装配。

  **RED**
  - 运行 `pnpm exec vitest run --project integration TC-PAYSDK-CONTRACT-026`：真实公开客户端/core/backend/协议配合受控网络，覆盖已知错误后 PAID、未知 retryable=true 结束、query 收到其他方法错误结束、prepare 不重放与公开 query 投影。最后一例对已知与未知错误分别断言只查一次、公开原码/retryable 保留、对象键无 cause；Outcome 同样检查。禁止 mock backend 来替代精确赋标签逻辑。
  - CONTRACT-025 的 prepare-stop/observe-stop、deadline-before-stop、stop-before-deadline、query-deadline、query-timeout-continue 六个 case 分别验证一次结果、原因不混淆和无隐式重新支付；停止保留快照/渠道信号，超时取消的迟到回调无效。query-timeout-continue 使用 5 秒请求预算与 60 秒观察窗口，首笔请求到期后按 intervalMs 重查，后续 PAID 确认；旧请求取消/迟到结果不影响新请求，不能在首笔到期时交付 timed_out。运行 `pnpm exec vitest run --project integration TC-PAYSDK-CONTRACT-025`，不 mock SDK 内部 backend/core，不把内部端口变体当公共错误码。
  - 独立消费者只导入已构建 public exports，配置必填 runtime/appId/gateway/enabledMethods/provider 后（省略 policy 使用内置值）使用测试平台替身执行 pay/query/observe。
  - 缺 provider、未知 runtime、重复/空 method、非法初始化 policy 抛配置错误，非法单次 policy 返回 INVALID_INPUT；创建阶段不请求网络。未知运行时支付方式返回 unsupported，不能注册真实未实现能力。
  - 从实际 SDK tarball 验证省略/传入 onPhase 的消费者均可编译和执行；事件字段/枚举正确，无私有端口泄漏。CONTRACT-021 使用现有 TypeScript 解析能力读取手写源码及 exports.types 指向的两类声明，检查公共状态类型/字段/联合值具备中文 JSDoc；移除某个注释或让任一格式丢失注释的受控副本须失败。声明可共用同一受检文件；语义是否正确另按权威中文表逐项评审，不能只断言出现中文字符。
  - Run: `pnpm build && pnpm exec vitest run --project integration TC-PAYSDK-CONTRACT-001 TC-PAYSDK-CONTRACT-020 TC-PAYSDK-CONTRACT-021 TC-PAYSDK-CORE-014 TC-PAYSDK-CONTRACT-022 TC-PAYSDK-CONTRACT-023 TC-PAYSDK-CORE-020 FLOW-PAYSDK-001 FLOW-PAYSDK-008`；缺工厂、exports、阶段或必需注释时失败。

  - 实际 SDK tarball 的 ESM/CJS 消费者都能编译并运行省略/sandbox/prod。检查 XpayEnv 与字段的中文 JSDoc 被两类声明保留；非法输入只能通过 JavaScript 边界测试传入，须零外部动作；初始化与 RunOptions 类型不新增环境配置。FLOW-008 五类 case 的每个必需检查点连续运行，不能把原始请求断言拆到独立测试再拼接。

  **GREEN**
  - 工厂内部装配 SDK backend、network、channel、device-info、runtime；从 @daqian/payment-protocol 根取得 createWechatMiniappHttp() 并注入 createProtocolClient 的 http，不深层 import 或自写网络，也不从 SDK 根转导出工厂/新增业务 Request 配置；复制静态配置，只在请求时获取 Token。核心/平台模块导入无副作用，公共入口不导出测试替换口。重复命令通过。

  **Verification**
  - CONTRACT-026 五个 case 与既有 CONTRACT-025 回归通过；`pnpm check:package` 及真实运行对象核对均确认公共 PortResult/PaymentError/query 和 SDK exports 未扩展，内部 cause 不泄漏。
  - 重跑 CONTRACT-025 六个 case 通过；现有双格式声明消费确认公共 query/PortResult/PaymentError 未扩展，BackendResult 不在 SDK exports；平台 wx.request 的取消本身仍由已有平台测试取证。
  - 执行上述集成命令和 `pnpm check:package`，并通过共同门禁。
  - 安装两个包的已打包产物，分别以 ESM import 和 CommonJS require 做独立消费者编译与执行，检查两种消费方式的类型声明解析和相同公共导出，覆盖 TC-PAYSDK-CORE-014；协议消费者从正式根取得 createWechatMiniappHttp(): HttpPort，验证工厂类型与中文 JSDoc、无 wx 加载/创建安全；SDK 消费者及 SDK exports 不包含网络工厂/注入口；检查发布清单和平台支持声明，验证 SDK 网络能力可独立运行。另建只声明 SDK 依赖的业务消费者验证传递依赖；harness 将安装源映射到本次 tarball 并核对协议版本/摘要，不要求业务消费者直接声明协议包。
  - 执行 FLOW-PAYSDK-001 的 integration 证据，检查原始 signData、交易引用、次数/顺序、渠道回调前不查询及 PAID 一次交付；weapp 证据按 Task 8 汇总，不能以 Node 抵扣。
  - 核对两个阶段通知先后位置、attemptId 与最终结果一致；逐项把中文状态表对应到 contracts.ts、backend 映射、核心/渠道停止分支及实际声明。confirmed/PAID/CLOSED、unknown 回调/无回调、cancelled/stopped、interruptedPhase/onPhase 的区别必须准确，保留源码/声明位置和评审结论。

  - FLOW-PAYSDK-008 的 integration 五类 case 按能力 Spec 检查 HTTP 枚举/presence、请求快照与连续隔离、query 无字段及渠道签名不变。测试只替换外部渠道/HTTP 服务，不能 mock backend 或 codec；SDK 公共 API 不要求业务导入协议包。缺任一 case/JSDoc/wire 断言时不得标记本任务完成。

  **Review / Acceptance**
  - 完成条件：共同门禁通过，实际 tarball 的双格式执行/类型消费及 SDK 唯一直接依赖安装均通过；FLOW-001 的 normal/long-channel-wait 与 FLOW-008 五类 integration case 各自从公共入口连续运行并贯通全部阶段。独立接入示例可运行，无业务 store/Taro/Vue/generated 内部路径依赖；weapp 及其他流程缺口保留给 Task 8，不在此宣称全量交付。

  **Commit**
  - `feat(payment-sdk): assemble SDK-owned public payment client`

- [x] 8. 完成全量场景自动化、平台联调与交付证据

  **本轮 Live 增量（8-A / 8-B / 8-C 为 Task 8 内顺序步骤，不改变八任务跟踪）**

  - 8-A — 独立宿主与工程门禁。按文件/RED/GREEN 粒度实施 Design 的 Live 文件表：live/config.ts、token-store.ts、controller.ts、evidence.ts、pages/live 原生绑定、app.live/vite.live/project.live 示例、src/live/build.ts/check.ts/check-evidence.ts/schema，以及各模块就近单测。创建 .env.live.example（仅白名单空值说明），gitignore 加 .env.live/project.live.config.json/.generated-live；根 scripts 增 live:build/live:check/check:live，文档写 docs/engineering/live-acceptance.md；更新已实现根和 E2E AGENTS、typecheck/coverage/依赖规则，产品包 AGENTS 的原职责保留。
  - 8-A RED：test-tools-unit 的 CORE-021 五个 case 验证错 env 来源/敏感字段/URL 被拒、Token 确认及清除/替换/Storage 异常/每次读取、创建失败无 pay、query 恢复不重下单、进行中重复点击和卸载旧回调隔离、白名单记录不泄密。新增 packages/e2e/tests/tooling/TC-PAYSDK-CORE-022.spec.ts 与 tests/fixtures/TC-PAYSDK-CORE-022/manifest.json、三个 case 的工具输入：真实调用构建/检查 CLI，验证 Shadow 依赖混入、touristappid、urlCheck=false、缺创建契约、缺矩阵/附件/摘要漂移/Shadow 报告冒充被拒。数据明确标工具样例，不能写为实际 Live 证据；无契约时预期 live:check 非零。
  - 8-A GREEN：复用 dotenv.parse/Ajv/Vite/Node 文件工具，按设计的确切文件来源、白名单和独立输出实现；Live app 不加载 Shadow setup，生产 SDK 自带网络和渠道不替换。内部 create-trade 端口在尚未登记契约时失败关闭，模块假端口只证明控制台，不连真实服务端。Token getter 每次读取 Storage，公共 SDK 不增加 API/provider。控制台保存/清除、环境选择、创建/pay/query、结果显示与导出均有执行测试，不以静态模板或代码覆盖排除豁免。
  - 8-A Verification：`pnpm exec vitest run --project test-tools-unit`、`pnpm exec vitest run --project integration packages/e2e/tests/tooling/TC-PAYSDK-CORE-022.spec.ts`、`pnpm check:scenarios --inventory` 及共同门禁；`pnpm live:build`/`pnpm live:check` 使用已提供配置实际运行，缺输入则记录对应命令失败，工具正例只在隔离临时目录按样例运行。新增模块 case 走 root reporter，工程 case 有真实 CLI 断言、Fixture 和来源。将当前完整自动化回归与仍缺 Live 的状态分开记录。8-A 评审通过后可阶段提交 `test(payment-sdk): add isolated live acceptance host`，不勾整个 Task 8。
  - 8-A 历史事实：已于隔离 Apply 提交 2a0494e4f92ff4706eebfc489f491e27852135e3 完成并评审；原始记录见 artifacts/20260910-task8a-final2。本轮不重复初始化或重做 8-A，但对受 8-B 影响的表单/构建/门禁回归。Task 8 保持未完成。
  - 8-B — 按已核 IDL 完成测试宿主真实交易准备。前置：本版完整 Plan Review/freshness 通过，取得同版文件；以 IDL 6726634 的 HTTP binding、身份/DTO/错误为基线。缺真实环境只阻断实际 Live 运行，不阻断本地生成、适配及自动化；文档必须分别登记契约就绪与部署未核实，不能把二者混成同一个 pending。
  - 8-B Files：Modify live/config.ts/controller.ts/page.ts/create-trade.ts/live.test.ts、pages/live/index.wxml、.env.live.example、src/live/build.ts/check.ts及schema、README、docs/engineering/live-create-trade-contract.md/live-acceptance.md、根/E2E AGENTS。Create live/trade-form.ts/runtime.ts/create-trade-errors.ts 及每个模块 *.test.ts、tests/tooling/TC-PAYSDK-CORE-023.spec.ts 和 tests/fixtures/TC-PAYSDK-CORE-023/{manifest.json,source-manifest.json,provenance/main.go,provenance/go.mod,各具名wire样例}。自动化配置沿用 test-tools-unit/integration，扩发现/覆盖/来源清单。实际生成只由 proto:sync 写协议 generated 和 proto-gen.lock；不手改生成文件或17项产品错误。
  - 8-B Interfaces：trade-form 的 createTradeDraft(defaults)、validateTradeDraft(draft)、toCreateTradeRequest(validDraft) 负责具名表单/decimal校验/复制；输入数字均页面 string，DTO 采用 generated CreateTradeRequest（int64 bigint）。CreateTradePort.create(request:CreateTradeRequest, context:OperationContext):Promise<CreateTradeResult>；结果按 Design 的 created/reference 或 failed/reason，新增 reason 只属于 E2E。controller 本次冻结草稿、配置创建协议客户端/60000ms预算和取消、成功才保留 tradeNo；runtime 仅给现有协议 client 提供时钟/ID/可取消等待，不新增网络或重试框架。
  - 8-B RED（先执行应失败的用例）：CORE-023 的 defaults-and-editing 验证内置交易默认值、严格 env 覆盖、`PAYMENT_LIVE_USER_ID` 的空值/合法值/非法值、页面编辑、新草稿恢复环境初值，以及 userId 不进入 Storage/日志/导出证据；numeric-and-item-boundaries 覆盖空值/小数/科学计数/符号/不安全整数/溢出、非BMP长度、非法enum、items 0/51、数量边界、每个金额等式及重复行号。draft-and-retry 覆盖新草稿单号不固定、行增删不复用、提交快照、失败原号重试、新草稿清旧引用、请求中不可编辑或二次提交。命令 `pnpm exec vitest run --project test-tools-unit packages/e2e/host/weapp/live`，当前实现不接纳 uid env key 或不预填时预期失败，不把“零测试”当RED；并按本轮修正扩展 CORE-021 `config-source`（良性未登记 key 被忽略且解析结果不变，现实现下应失败；凭据类 key 仍失败）。
  - 8-B RED wire/error：wire-success 对独立Go样例逐字段核对全部CreateTrade请求和响应、POST/完整URL、Token轮换、Header/BaseReq同Request ID与productId、uid仅body、正确codec及tradeNo透传。auth-parameter-conflict 覆盖4项创建码及3项网关码、HTTP401、uid不匹配、冲突success/error字段；invalid-envelope-and-no-replay 覆盖根/信封/码缺失、非法number/enum/orderNos/tradeNo、未知非零/非2xx+0/非JSON；timeout-unload-and-late 用受控时钟验证一次结束和零自动重试/支付。所有失败分支明确断言创建调用次数、SDK pay次数与引用未写入，不仅断言返回码。
  - 8-B GREEN 生成与来源：在IDL核对既有 infra-payment-sdk 文件级Consumer仍选trade.proto，无须新增/扩大登记；执行项目 `pnpm proto:sync`、`pnpm proto:validate`、`pnpm proto:status`，保存前后lock与完整生成差异，确认 CreateTrade.meta 为 POST /api/base/trade/create。生成 binding/描述变化不是 metadata-only 刷新；更新 CONTRACT-024 的 generatedCompatibility 及相关维护脚本期望并按7项旧用例回归，保存受审来源证据。固定5539的17项错误及Go样例不变；新4项错误在E2E由6726634 Go原文独立取数验证。若 current 包含本轮未核语义则先交Owner，不让更新期望掩盖差异。
  - 8-B GREEN 宿主：实现 Design 的默认表单/env 登记清单消费，以独立 `PAYMENT_LIVE_USER_ID` 预填但允许页面修改 uid，保持 uid 只进入创建 body；实现金额BigInt等式、草稿单号和冻结。config.ts 的校验口径为：已登记 key 各自按规则校验；凭据类 key（名称含 TOKEN/SECRET/SESSION_KEY/SIGNATURE/PASSWORD 等或 VITE_ 前缀）失败；其它未登记 key 不注入宿主配置且不使已登记配置失败（按本版 Design，本地 .env.live 不被要求与清单逐字相等），并在 live.test.ts 的 config-source 补对应断言；新增 key 仍须先登记并同步 .env.live.example 与校验器；受该口径变更影响的 CORE-021 case 重跑并重录证据，归 Task 8 汇总。Token 只由控制台确认写入 Storage：登记清单不含任何 Token/env 预填项，`.env.live` 出现敏感值按 CORE-021 `config-allowlist` 失败，Token 输入框没有环境初值；工作区若存在携带 `PAYMENT_LIVE_DEFAULT_ACCESS_TOKEN` 的未提交 WIP（.env.live.example、live/config.ts、live/page.ts 及相关断言与测试数据），Apply 前须一并回退，不得以 WIP 反证已授权。通过现有协议 client、微信生产HttpPort和generated metadata/codecs发请求，controller create 只保存有效真实引用、不自动pay。就绪后固定中文错误分类不再把所有 unavailable 说成契约缺失；保留取消/迟到隔离、显式恢复、日志白名单和原xpayEnv规则。协议客户端只负责已有通信，创建判错归E2E，产品 SDK 业务实现不修改。
  - 8-B GREEN 门禁：登记 docs/engineering/live-create-trade-contract.md 为已核契约（版本、方法、字段、4项新码及3项网关码、恢复/幂等/样例来源/未核部署项）；live:check 校验登记版本/绑定与实际generated、构建清单一致，不能只凭 Status 单词或硬编码 marker 消失通过。CORE-022 保留缺登记/配置/污染失败反例，增加已登记生成元数据不符的拒绝断言。CORE-023 generated-create-boundary 经真实构建产物检查方法/codec，确认SDK/Shadow仅两方法、QueryOrder未消费、创建代码/错误不进产品，复用原CLI检查机制不建新扫描框架。
  - 8-B Verification：`pnpm exec vitest run --project test-tools-unit packages/e2e/host/weapp/live`、`pnpm exec vitest run --project integration packages/e2e/tests/tooling/TC-PAYSDK-CORE-022.spec.ts packages/e2e/tests/tooling/TC-PAYSDK-CORE-023.spec.ts packages/e2e/tests/protocol/TC-PAYSDK-CONTRACT-024.spec.ts`、`pnpm check:fixtures`、`pnpm check:scenarios --inventory`及共同门禁、原完整Shadow回归。全部新手写四项100%；CORE-023七module/一engineering义务登记，独立Go输出和生成差异可追溯；受控构建正例不冒充真实服务。仓库 Live 记录模式在真实配置提供后执行 live:build/live:check；外部验收确认模式复用 8-A/B 已完成的宿主构建、配置边界和工程门禁证据，不重新执行 live:build/live:check，若该既有证据缺失则仍保持阻塞。8-B阶段实现/评审可结束，真实配置与部署执行留在8-C，总Task8仍未完成。
  - 8-B Review / Commit：原始命令/退出码/单测和绑定报告/差异/独立review归档 artifacts/<run-id>/tasks/task-8-b.md 及同次原件。核对完整请求、用户身份边界、幂等和错误不重放、无产品API扩展、无借核价风险扩建服务端；合格后延续授权阶段提交 `test(payment-sdk): connect live trade preparation gateway`，不自动发布或勾整个Task8。
  - 8-C — 真实验收与最终汇总。前置为 8-A/B 及其评审通过。真实渠道事实只能通过两种模式之一提供：仓库 Live 记录模式按固定 LIVE-PAYSDK 分母取得完整矩阵与评审证据；或外部验收确认模式由用户/测试负责人提供最小非敏感结论，必须精确绑定 SDK 版本 `payment-sdk-v0.1.0-alpha.2`，并明确实际平台为 Android、iOS，实际环境为测试环境，且正常支付通过、异常场景可被 SDK 拦截并向接入方提示。外部确认不要求逐项转录 case 或故障分类；没有声明的平台或环境不扩写为已单独验证。本 Change 不要求 SDK 维护侧取得或保存账号、Token、appId、域名、交易号、签名、设备明细或原始日志，也不要求重复执行已完成的真机验证。
  - 8-C Verification：同源输入 `pnpm check`（保留全部工程义务和新增 CORE-021/022/023/024）；采用仓库 Live 记录模式时执行 `live:check`/`check:live` 及详细 Live 记录校验；采用外部验收确认模式时不要求这些附件或命令作为额外前置，只核对最小确认记录已绑定本次 SDK 并说明实际平台、环境和正常/异常总体结果。Task 8 证据不记录敏感凭据或完整支付数据。更新 Task 8 证据、README、bootstrap 和 Live 操作文档；发布演练原要求保留。只有工程门禁、两种真实验收模式之一和最终评审满足才勾 Task 8；不依赖业务构建/UI/权益、不要求未授权 npm 上传。

  **Prerequisites**
  - Task 1–7；公共契约待决表各项关闭或对本期明确裁决；工程发布登记齐备。SDK 自动化使用 Shadow 与渠道替身，独立于业务 B-P01、真实支付网关和权益环境；仓库 Live 记录模式的真实渠道验收由本仓库宿主完成，外部验收确认模式消费已完成的 8-A/B 宿主边界证据及最小确认记录；业务联调独立，不作为本 Change 完成条件。

  - 真实渠道前取得已支持 xpay_env 的网关、trade、pay 构建版本与部署配置；旧 a761953/ae12898 不可作为兼容证明。仓库 Live 记录模式下由服务端配合提供字段贯通及 test/prod 策略的脱敏证据，本仓库 Live 宿主负责每次选择和恢复保留行为；外部验收确认模式只记录测试方实际使用的环境，不要求 SDK 维护侧拆解服务部署细节，也不把未声明环境写成已验证。

  **Files**
  - Create: packages/e2e/tests/sdk 与 tests/protocol 内全部已明确场景及同名 Fixture；tests/flows/FLOW-PAYSDK-002 至 007 的 *.spec.ts、同名 Fixture 目录与清单列出的全部 case 数据；汇总 tests/tooling 与 FLOW-001/008 证据。Modify: README.md（实际接入、阶段/状态中文说明入口与发布说明）、根质量门禁、host/weapp、平台驱动、docs/engineering/bootstrap.md；真实联调与版本原始证据保存到 artifacts/<run-id>/，由后续 Verify 阶段的正式 artifact 引用；建立唯一且由用户显式触发的 sdk-release 流程，用户可在本地或其他受控执行器中调用同一流程，执行器位置不构成能力契约，也不要求 GitLab Pipeline/Runner；发布流程说明写 README，清单/产物摘要写 artifacts。

  **Requirements / Scenarios**
  - SDK-08/14/15 及全量契约；TC-PAYSDK-CORE-009；CORE-001–024（含本轮渠道失败码增量 CORE-024）、CONTRACT-001–026 与 FLOW-PAYSDK-001–008 的最终证据汇总，以及 SDK-17 / LIVE-PAYSDK-001/002。

  - SDK-16、CONTRACT-14；CORE-020、CONTRACT-022/023 的本任务职责部分，贯通 FLOW-008 及 FLOW-006 的环境选择检查。

  **Design Decisions**
  - Repository-owned Shadow and Live acceptance；Verification and delivery evidence；Acceptance gates and evidence ownership；Lane routing and environment boundaries；Packaging, ESM integration and source ownership；Composed payment flows and test granularity；Official scaffolding and reproducible bootstrap；Phase notifications and documented state semantics。

  - Per-payment Xpay environment。

  **Interfaces**
  - Consumes: 自动化使用本仓库测试宿主、可消费 SDK、版本化 Fixture 与 Shadow；真实渠道验收可使用本仓库 Live 记录模式，或消费用户/测试负责人提供的有边界外部确认。外部确认不要求业务应用替代仓库 Live 宿主执行，只作为已完成事实的证据来源。
  - Produces: 版本化接入说明、分层验证证据及用户显式触发的 SDK 统一发布流程；本地 tarball 消费测试与正式 publish 独立，协议依赖发布属于正式流程内部步骤，实际发布由后续明确授权执行，执行位置不作为能力契约。

  **RED / GREEN**
  - 先以用户显式执行的公共消费者测试捕获本地 tarball 缺文件/类型/初始化字段问题，修复后通过；该测试不向正式发布交付 tarball 或摘要。正式发布预检覆盖 SDK 单独变更、协议依赖变更、双方变更、协议已存在/不可用和依赖成功但 SDK 失败，验证版本组合、正常 publish 顺序、最终 result 时序与阻断结果；常规回归使用受控执行器/registry 响应，不实际上传。正式流程不调用 pack/check:package、不读取或比较本地测试 tarball，复用 pnpm publish 而不自研发布引擎、不建设 CI 发布链路，也不建立协议包独立工作流。协议或平台测试失败回到对应任务，不能只改文档声明。
  - Run: `pnpm check`，包含快速检查、微信运行验证和本次输入对应的最新场景报告汇总。

  **Verification**
  - Shadow 在受控外部替身中完整核验成功、取消、未知回调、签名失效、业务登录失效、绑定缺失、微信会话失效、查询超时和恢复；仓库 Live 记录模式按 SDK-17 固定矩阵验收，外部验收确认模式消费测试方对本次 SDK 的整体真实测试结论，不为补材料重复制造故障；验证渠道等待没有 SDK 时限，宿主结束本地调用、旧回调隔离及身份恢复按公共契约和 FLOW-006 矩阵验证，查单 Token 恢复不得增加 prepare/invoke 次数，渠道会话恢复必须重新 CreateTradePay 并使用本次有效参数，不要求 payment_no 或全部签名字段变化。
  - 仓库 Live 记录模式由本仓库 Live 宿主核对真实请求公共字段/标准 lane，并配置测试 productId、Token、真实 appId/合法域名和权限；服务维护方提供路由与部署证据。外部验收确认模式不重复核对这些敏感运行输入，而消费 8-A/B 已完成的宿主构建边界与工程门禁证据，并以最小确认记录作为真实渠道事实。业务 baseline PAID 事件消费/权益结果独立，不作为 SDK 完成条件。
  - ESM 接入后的构建/e2e 由业务 Change 执行，不属于本 Task 验收或前置；SDK Live 不引用其结果填补本仓库矩阵。
  - FLOW-007 的十一项全部运行；stop-after-notification 使用外部受控 Cancellation 在适配器第二次检查命中，真实 SDK 核心/适配器仍被执行，平台/query=0 且 stopped/not_invoked；stop-after-platform 外部平台替身计数1并保持pending，停止后为 stopped/unknown，旧回调隔离。两项在 integration/weapp 分别取证，不用两个单测拼接。 验证两个阶段、首笔终态、observe、回调异常、回调内停止及重入，联同 FLOW-001–006 的通知轨迹核对。CONTRACT-021 的声明结构检查与中文语义评审记录均齐全，不能以 100% 覆盖宣称文档含义正确。
  - 真实虚拟支付验证阶段通知与平台回调/查单的可观测先后，不用普通 requestPayment 文档或替身推导虚拟支付全平台回调必达/动画完成。业务 change 验证临时隐藏不触发 afterClose、上下文保留、恢复确认态、页面卸载及旧运行隔离、PAID 后另查权益；本仓库自动化不依赖业务 UI 或该业务环境。
  - 仓库 Live 记录模式使用本仓库 Live 测试小程序，从真实创建网关取得交易引用；不接受 ESM 或其他业务应用代替该模式执行。若采用外部验收确认模式，不重复执行已完成的真机支付，也不以业务联调结果替代确认记录。业务方可引用 SDK 的已验收版本继续独立联调。
  - 回归 TC-PAYSDK-CORE-014 的协议根工厂 ESM/CJS/声明消费及 SDK 无转导出；复用本轮 Task 6/7 的同源构建证据，全量 weapp 从公共生产入口使用 SDK 自带网络，报告实际入口/产物摘要，不能以源码单测或裸请求替代。
  - SDK 发布目标固定为项目 245。受控发布演练须分别验证：本地显式 pack/消费者测试只证明测试 tarball；正式 sdk-release 从两个产品 workspace 依次执行正常 publish，绝不读取、复用或比较该 tarball/摘要。正式流程保留版本组合、协议先于 SDK、最终 result 最后落盘和失败阻断证据；实际上传仍按发布授权执行。执行器位置、分支阶段、远端合并保护和审批治理不改变发布结论，也不是本 Change 前置。
  - 检查四份 AGENTS 的事实入口、目录与命令和实际工程一致；统一检查和发布流程对失败非零退出，门禁减项仍须维护者评审。远端必需检查、审批和分支保护由仓库使用方自行治理，不作为本 Change 缺口。

  - Run: `pnpm exec vitest run --project integration --project weapp TC-PAYSDK-CONTRACT-022 TC-PAYSDK-CONTRACT-023 TC-PAYSDK-CORE-020 FLOW-PAYSDK-006 FLOW-PAYSDK-008`；两类环境完整通过新增场景和 FLOW-008，FLOW-006 再次 pay 保留选择、query 恢复无字段。随后根 `pnpm check` 聚合全部新鲜报告，不以定向命令代替全量门禁。
  - 仓库 Live 记录模式按 Design 的环境矩阵分别取得 test/prod 配置下网关→trade→pay 的三态证据：test 为默认沙箱/显式沙箱/显式现网，prod 三态均现网；证明字段及 absence 贯通，不只核验 HTTP 200。外部验收确认模式不要求重做或逐项转录这些交易，只记录测试方实际使用的环境和整体通过结论；未声明的环境不据此宣称已单独验证。iOS 沙箱不列为应成功能力；仓库 Live 执行时每类使用独立交易，避免把跨环境重复预下单的服务端决策当 SDK 环境切换保证。执行前确认账号、金额与实际有效环境的授权；传 sandbox 到 prod 仍可能扣款，不凭请求值替代授权。缺真实权限/证据如实保留，不输出 Token/AppKey/session_key/完整签名。
  - README 的业务接入说明包含 PaymentRequest.xpayEnv 三态、prod 强制现网、网关升级前提及恢复保留选择。ESM Change 由业务维护同一公共参数；联合实施前核对其接入方案，不在本仓库复制业务 IDL 或完成状态。

  **Review / Acceptance**
  - 工程完成条件：共同门禁与完整 `pnpm check` 通过，静态检查、全部手写四项单测覆盖率 100%、Spec/协议场景及必需 FLOW case 覆盖率 100% 且全部通过；实际包消费、受控发布演练和规则减项评审均有证据。逐流程核对同次运行的连续阶段，缺环境或 draft 不删出分母；不要求远端合并保护。
  - Task 8 整体完成还须通过工程门禁、仓库 Live 记录模式的完整矩阵证据或外部验收确认模式的最小结论记录，以及独立评审；不再把逐项 case、账号、Token、appId、交易号、设备明细、原始日志或仓库 Live 详细附件作为外部确认模式下 SDK 维护侧的必交输入。业务部署/权益联调和实际 SDK 上传分别记录，均不作为 SDK Change 完成条件或 Shadow 的隐含步骤；本任务不要求未经授权实际发布。购买入口的启用由业务 Change 根据真实验证结论决定。H5/公众号/扫码继续标未实现。

  **Commit**
  - `test(payment-sdk): verify public integration and release contract`

## TC 状态与依赖

- 已有实施基线：Apply 分支 feat/headless-payment-sdk 的 5b41f194bdabc2fa31fad127bb0082d2e0ce18b0，Task 1–7 完成；Task 8 的 final-ready-7 保存原始 Shadow 证据，不代表仓库门禁、Live 或发布完成。
- 8-A 的 CORE-021/022 已实施并取证；本轮8-B新增 CORE-023，待实施和验收；本轮渠道失败码增量新增 CORE-024，仅改适配器映射、核心 invoke 结束原因与对应测试；公共状态枚举与 EndReason 不变，PaymentError 公共结构以必填 message 和可选 channelMessage 做兼容扩展。旧 TC/FLOW 保留，受影响项按新输入回归，不改写历史报告。当前共50个Scenario，八条Shadow FLOW和九项LIVE矩阵不变。
- Live 创建网关契约已核 6726634；8-B本版评审/freshness后按既有生成能力实施。8-C部署/账户/权限/真实矩阵仍未完成，不复制业务IDL或手填tradeNo绕过。2026-09-18 用户确认远端合并检查、审批和分支保护属于仓库使用方治理，不再作为本 Change 缺口或发布前置。
