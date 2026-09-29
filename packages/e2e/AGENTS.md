# packages/e2e/AGENTS.md

## 模板通用规则

### 按示例扩展新业务

新业务按示例组织 integration、FLOW、Fixture 和 reporter 绑定；场景事实来自有效 Spec，测试只消费公开包入口并保留实际证据。工具门禁的反例使用受控临时仓库，不把替身结果冒充 SDK 运行证据。

integration 用例置于 `tests/example/`，跨阶段流程使用独立的 `FLOW-*.spec.ts` 并在同一次运行中从公共入口执行到底。每个 owner 的 `tests/fixtures/<owner-id>/manifest.json` 记录 Spec 路径与摘要，case 数据独立成 JSON；用 `defineCase` 的 checkpoint 和 flow 绑定运行证据。小程序用例置于 `tests/weapp/example/`，通过宿主 runner 调用 SDK 公共入口。

`host/weapp/example-runner.ts` 只装配生产 SDK 并暴露 `runExampleCase`，`tests/weapp/example/` 通过现有 automator driver 调用它；网络记录必须来自 Shadow 观察到的真实小程序 `wx.request`。

## 当前业务：支付


必读：[Proposal](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/proposal.md), [Design](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/design.md), [能力 Spec](../../openspec/specs/payment-sdk/spec.md), [公共契约](../../openspec/specs/payment-sdk-contract/spec.md), [Tasks](../../openspec/changes/archive/2026-09-22-headless-payment-sdk/tasks.md), [README](../../README.md)。
[根 AGENTS](../../AGENTS.md)

1. 先读根 AGENTS、有效 Scenario/必需 FLOW 清单、支付 IDL/补充契约及 Design。测试期望由这些事实决定，不能从 SDK 实现、现有返回值或 Fixture 自动反推预期。
2. tests/sdk 与 tests/protocol 放单项行为/协议测试，tests/flows 放组合流程，tests/tooling 放 CLI 门禁验证。src/ 只放 harness、driver、用例绑定、Fixture 装载和报告工具；host/weapp 只作最小测试宿主。
3. 测试文件所有者为 TC/FLOW；同名 fixtures/<owner-id>/manifest.json 记录来源与版本，case-key JSON 保存该次输入/响应/渠道序列。步骤和断言在 *.spec.ts；不得把 fixtures 宣称为完整测试用例 DSL，或在协议 testing 里维护场景集合。
4. 使用稳定 caseId 和具体检查点绑定，一个 case 可以覆盖多个 TC/协议义务；FLOW 必需阶段须在同一次运行贯通，禁止把多个隔离测试拼接为流程通过。新增场景或流程必须同步绑定和数据，失效/归档按 Spec 生命周期处理，不回收 ID 表示另一种行为。
5. 集成测试消费 SDK 包与协议依赖包构建后的公开入口；仅替换外部 HTTP 服务和端侧平台 API。不得 mock SDK 核心/基建映射/协议客户端/codec；平台适配细节的单测留在产品包。weapp 必须实际经过开发者工具 wx.request。
6. 每例独立场景状态，响应序列固定，额外/缺失请求必须断言。成功流程检查交易引用、调用顺序/次数和最终结果；错误分支同时检查后续动作没有发生。禁止兜底成功、随机 AI 响应、只断言没有抛错或只贴场景 ID。
7. weapp 协议用例从已构建协议包根使用 createProtocolClient/createWechatMiniappHttp，SDK 用例调用 SDK 公共工厂，不自写 HttpPort 绕过生产网络适配。Vitest 使用现成断言、fake timers、生命周期和 reporter API；weapp 使用本地已有开发者工具及 miniprogram-automator，helper 只负责连接、执行 SDK 测试函数、取回结果与必要清理，不自研连接协议、工具控制器、UI 交互框架或执行引擎。harness/driver/reporter 的手写逻辑就近单测并纳入四项 100%。
8. 根 reporter 分别收集 unit 与 integration/weapp 报告，携带同次 run、源码/Spec/IDL/实际 Fixture 摘要及项目；module 无外部 Fixture 时明确 null，不能豁免测试源码 freshness。按 verification v2 分类汇总全部 Spec、支付 E2E behavior、IDL 和 FLOW 覆盖/通过，unit 不抵扣公共 E2E；tests/tooling 通过真实 CLI 验证门禁正向与反例，受控工具输入不得冒充被测 SDK 运行证据，验收按 Acceptance gates and evidence ownership。Node 替身、开发者工具、真实渠道/业务验收分别报告；缺环境不准跳过后宣称完整交付。
9. 阶段通知测试在同次 FLOW 中记录 beforeInvoke、第二次停止检查、实际平台调用、回调、confirming、首笔查询及最终结果的顺序/次数，并检查停止后没有动作；Fixture 只控制外部输入，不能伪造 SDK 阶段通知或内部 markInvoked；FLOW-007 分别验证通知内、通知后未调用、已调用后的停止，平台计数为 0/0/1。中文注释语义由评审核对，产物消费检查保留对应声明证据；业务 UI/afterClose 与权益验收由业务 change 负责。

10. CONTRACT-022/023、CORE-020 与 FLOW-008 的三态、非法输入、逐次隔离和原文保持必须绑定并运行；新增 IDL 字段不能仅刷新来源摘要后跳过覆盖。Android 沙箱与 Android/iOS 现网分别取证；网关字段贯通、真实扣款授权及部署环境不能由 Shadow 结果推定。

11. 固定 Go Fixture 的事实来源与当前 generated lock 来源分开核验；CONTRACT-024 保留固定目录/Go 一致性并覆盖来源刷新正例及完整支付闭包反例。当前 lock 摘要只绑定本次运行报告，不要求永久等于 Fixture 记录；不得改写旧 Go 取数证据或自动覆盖兼容基线。

12. Live 入口不导入 Shadow setup、Fixture 或渠道替身，沿用生产 SDK、协议客户端和微信原生能力；交易创建、表单及四项创建错误仅属于测试宿主。`.env.live` 只存评审白名单中的非敏感配置和可编辑默认表单，Token 仅由用户确认写 Storage 并逐请求读取；user_id 单独手填、只进创建 body、不落 Storage。不得记录原始凭据、签名、完整交易号或响应。
13. Live 控制台、构建与证据校验逻辑纳入 test-tools-unit 四项 100%；工程测试只证明工具和边界，不能抵扣真实 Live 矩阵。`pnpm check` 不打开开发者工具或发起支付；真实收银台仍为人工真机验收，不新增 UI 自动化框架。
