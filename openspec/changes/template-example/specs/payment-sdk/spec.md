## MODIFIED Requirements

### Requirement: SDK-14 可执行的架构与场景门禁

工程 MUST 按 Spec/IDL 验证清单、具体测试绑定和本次运行结果统计场景覆盖；必需子项、环境及版本证据缺失 SHALL 阻断完整门禁。根与三包 AGENTS.md 的规则正文 SHALL 在 Design 中细化，并在本期初始化时建立，保持与架构/目录、生成所有权、质量门禁和迭代规则一致；完整检查命令及规则评审机制随目标仓库交付，可由用户在本地、CI 或其他受控执行环境显式触发。testing SHALL 表示测试基础设施实现，跨包场景测试及 Fixture SHALL 位于 E2E。检查器验证结构和执行证据，断言是否正确表达场景须经评审。是否将检查配置为代码托管平台的合并必需项属于仓库治理，不作为 SDK 发布能力、完整门禁或本 Change 完成条件。

Scenario 与具体测试 case SHALL 支持多对多绑定。工程 MUST 额外验证本文件登记的必需集成流程：各流程必需 case 在对应环境中，从公共入口连续执行规定阶段，并验证调用顺序、跨阶段数据关联与最终结果。单项 Scenario 全部通过不得替代流程贯通；同一个流程 case 的阶段证据不得由多个独立测试拼接。TC 与 FLOW 均为稳定标识；缺失/重复标识、未知引用和缺少必需 case SHALL 使清单检查失败。

各 Scenario 的必需 case、kind、检查点和运行项目 SHALL 按 Design 的 verification v2 登记在原场景下，作为测试设计的一部分先于测试代码评审；测试绑定不能减少这些义务。behavior 验证公共入口可见的行为、过程影响与结果；module 验证内部模块正确性，使用所属就近单测；engineering 验证构建/CLI/声明及工程证据。全部 Scenario 保留登记并分别统计，module/engineering 不抵扣支付 E2E 或 FLOW。本版全部场景已有元数据，Task 6 完成解析、绑定及分类报告；缺元数据仍计为覆盖缺口，不能从分母排除。检查器只处理已保存的结构数据，不在 CI 中调用 AI 拆分自然语言。

每个实施任务 MUST 明确前置条件、交付文件、执行命令、通过标准及证据，并同时满足 Tasks 的共同完成条件与专属验收后才标完成。工程基建 SHALL 使用正常输入和违规反例验证真实 CLI 的通过/阻断结果；同一命令接入 CI 时不得吞掉失败，但不要求配置远端合并保护。TDD 记录、配置存在或只执行定向单测不能替代完整适用范围的门禁。验收矩阵及每个 workspace 的边界见 Design 的 Acceptance gates and evidence ownership。

测试基建 SHALL 分别以 Spec 和 IDL 为输入，贯通独立义务清单、用例设计、版本化测试/Fixture、真实被测入口执行及新鲜报告；受控正向集合通过，新增义务未绑定、错误 wire、缺环境、失败断言和流程拼接等反例 MUST 阻断。工具演练报告不得冒充全量 SDK 覆盖或真实渠道验收；正式交付仍须满足本期全部义务及必需 FLOW。

以下清单是本 Change 的固定必需流程门禁，描述 SDK 公共入口到外部边界的连续流程；业务 CreateTrade 在 SDK 外，测试输入是已有 tradeNo。每行定义一个稳定 FLOW，case key 为必须分别运行的分支，关联 Scenario 均使用 TC-PAYSDK- 前缀。检查器以本清单决定流程分母，不从现有 *.spec.ts 推导；恢复流程的预期来自公共契约的阶段矩阵。各流程是否已执行及是否通过，仍以任务证据和 Verify 结果为准。

| FLOW ID | 关联 Scenario | 公共入口与连续阶段/检查点 | 必需 case key | 必需环境 | 输入及验证说明 |
| --- | --- | --- | --- | --- | --- |
| FLOW-PAYSDK-001 | CONTRACT-001/002/003/008、CORE-003/005 | createPaymentClient → pay → CreateTradePay → 渠道 → QueryTrade(PAYING → PAID) → 一次最终结果；交易引用、签名原文、先后顺序、次数贯通，初始化及渠道回调前无多余请求 | normal、long-channel-wait | integration、weapp | 公共契约结构化参数样例（Task 3）；long-channel-wait 的长时钟断言在 integration，weapp 验证手动释放回调前无查询，不做真实半小时等待 |
| FLOW-PAYSDK-002 | CONTRACT-002/003、CORE-005 | pay → 准备成功 → 渠道明确取消/明确调起失败 → 对应结果；无自动 QueryTrade、重新准备或再次调起 | cancelled、launch-failed | integration、weapp | 公共契约结构化参数样例（Task 3） |
| FLOW-PAYSDK-003 | CONTRACT-002/014、CORE-004 | pay → 准备响应 → 参数/关联校验失败 → 协议错误；渠道未调用、无查询，不在前端修补签名 | missing-required-param、channel-mismatch | integration、weapp | 公共契约 oneof/必填规则及错误样例（Task 3） |
| FLOW-PAYSDK-004 | CORE-005/006、CONTRACT-003/004/019 | pay → 准备 → 渠道 unknown → 查询仍 PAYING → 查询预算耗尽 → timed_out；查询不重叠，迟到响应不二次交付，交易到期不合成 CLOSED | slow-query、expired-but-paying | integration | 结构化参数样例；时间断言使用受控时钟 |
| FLOW-PAYSDK-005 | CORE-012、CONTRACT-012/018 | pay → 准备 → 渠道 success_hint → 第一次查单 PAYING → 宿主 getter 数据更新 → 后续查单 PAID；使用新 Token、新 Request ID、相同交易引用，不重启 SDK/不重新 prepare | token-rotates-between-queries | integration、weapp | 结构化参数样例；本流程验证正常 Token 轮换，鉴权拒绝后的恢复由 FLOW-006 验证 |
| FLOW-PAYSDK-006 | CORE-011/013、CONTRACT-005/006/007/013 | 身份失效 → 原调用一次交付中断结果 → 宿主恢复 → 按阶段显式再次调用；另覆盖宿主停止后的旧回调隔离。具体调用顺序和次数见下表 | prepare-auth、query-auth、channel-session、channel-session-different-payment、native-stop-late-callback | integration、weapp | 公共契约参数/错误矩阵及 Task 3 完整样例；运行证据由 Task 7/8 交付 |
| FLOW-PAYSDK-007 | CORE-018/019、CONTRACT-020 | 公共 pay/observe → 本次阶段通知 → 外部渠道/HTTP → 一次最终结果；验证通知前后副作用、数据关联、回调异常与停止重入 | first-paid、first-closed、observe-only、stop-before-invoke、stop-after-notification、stop-after-platform、stop-before-query、handler-throw、handler-reject、reentrant-pay、no-listener | integration、weapp | 使用 Task 3 正常/终态数据及外部渠道替身，业务回调由测试消费者提供；不 mock SDK 核心或注入假的阶段事件，不要求真实 UI 动画 |
| FLOW-PAYSDK-008 | CORE-003/020、CONTRACT-022/023 | 公共 pay → CreateTradePay 的原始请求 → 本次参数/渠道 → QueryTrade → 一次结果；检查三态、presence、逐次隔离和签名不变 | omitted、sandbox、prod、successive-selection、request-snapshot | integration、weapp | 使用 Task 3 按独立 IDL 样例确定的请求期望及不同签名原文。Shadow 与渠道替身只验证 SDK 的请求/消费；实际部署默认和真扣款另由 Task 8 验收 |

FLOW-001 至 006 的每个 case 同时记录真实 SDK 的通知轨迹：正常/unknown 回调路径为 channel_invoking → confirming → 最终结果；取消/明确失败/会话失效只有 channel_invoking；prepare/关联/参数校验失败无通知。FLOW-001 长等待在释放渠道回调前不得有 confirming；FLOW-005 多次查单只通知一次 confirming；FLOW-006 query-auth 恢复的 observe 单独通知 confirming，native-stop-late-callback 的旧运行停止后不得再通知。每次事件 attemptId 与该次最终结果一致，不跨运行归属。

FLOW-007 每个 case 在同一次运行中验证下列检查点，两个环境均执行；快慢时间穷举和预算耗尽边界另由 CORE-019 的 sdk-unit/integration 用受控时钟验证，不要求微信环境执行真实长等待。

| case key | 连续步骤与必须断言 |
| --- | --- |
| first-paid / first-closed | pay → prepare → channel_invoking → 实际渠道调用/成功提示 → confirming → 首笔 query(PAID/CLOSED) → confirmed；两个终态各一个 case，通知各一次并先于终态，无强制显示时长 |
| observe-only | observe → confirming → 首笔 query(PAID) → confirmed；无 channel_invoking/prepare/渠道调用，channelSignal=not_invoked |
| stop-before-invoke | pay → prepare → channel_invoking 回调内停止 → stopped/not_invoked；实际渠道和 query 均为零 |
| stop-after-notification | pay → prepare → channel_invoking 正常返回 → 适配器第二次停止检查命中 → stopped/not_invoked；平台调用与 query 均为零。通过测试宿主的受控 Cancellation 在该检查点返回停止；不 mock 核心/适配器、不直接调用内部标记 |
| stop-after-platform | pay → prepare → channel_invoking → 实际平台调用一次并保持回调 pending → 宿主停止 → stopped/unknown；query 为零、结果一次，旧平台回调不改变结束结果或新运行 |
| stop-before-query | pay → prepare → channel_invoking → 渠道 success_hint → confirming 回调内停止 → stopped；首笔查询的 provider/HTTP 未发生，保留 success_hint |
| handler-throw / handler-reject | 两个通知的消费回调分别同步抛错/返回拒绝 Promise → SDK 仍完成正常渠道及 query(PAID)；次数不增加、结果不被观察者错误改写，无未处理拒绝；异常原文不进入诊断 |
| reentrant-pay | channel_invoking 回调内再次 pay 同交易 → 新调用 busy/无通知，原调用正常完成；原 prepare/渠道仍各一次，不将 busy 结果或事件归入原 attempt |
| no-listener | 省略 onPhase 的 pay 完成 prepare/渠道/query(PAID)，与有监听的正常 case 网络/渠道计数和结果语义一致 |

FLOW-008 每个 case 在 integration/weapp 的同一个连续测试内完成 prepare → channel_invoking → 渠道 success_hint → confirming → query(PAID) → confirmed；QueryTrade、Header 和 BaseReq 均无 xpayEnv，渠道业务参数只有原有四个字段（平台回调函数另计），signData 与本次准备响应逐字一致。

| case key | 连续步骤与必须断言 |
| --- | --- |
| omitted | 分别以省略和显式 undefined 运行完整支付；两个请求都完全缺少 xpayEnv 键，不发送 null/0/UNSPECIFIED |
| sandbox / prod | 各自完整运行，实际 HTTP JSON 分别带 XPAY_ENV_SANDBOX / XPAY_ENV_PROD；不把请求选择当作已证实的渠道环境，不改变网关地址或 lane |
| successive-selection | 同一客户端、不同有效交易引用，依次 sandbox → prod → 省略，前次结束后才开始下一次；每次独立完成全链路，第三次不继承前次值 |
| request-snapshot | pay 接纳 sandbox 后，在受控 provider 暂停期间把宿主原 request.xpayEnv 改成 prod；释放后实际 HTTP 仍发送 SANDBOX，完整支付使用本次响应，不依赖真实计时 |

非法输入的零副作用和类型检查由 CONTRACT-022 完整覆盖，不用一条成功 FLOW 替代。以上模拟支付不证明服务端支持环境选择；测试部署/生产部署、Android/iOS 的真实矩阵见 Design 和 Task 8。

FLOW-006 的环境补充检查：prepare-auth 使用 sandbox 并在显式重试保留；channel-session 使用 sandbox、channel-session-different-payment 使用 prod，两次 pay 保留各自原选择。query-auth 在首个 pay 使用 prod，恢复 observe 和独立 query 均不发送 xpayEnv。native-stop-late-callback 允许新 pay 显式使用不同选择，旧运行不能覆盖新值；这些输入只是本次测试数据，不增加 SDK 环境历史或服务端支付单切换保证。

FLOW-006 每个 case 在一次连续运行中验证下列检查点；业务恢复使用可控测试宿主操作，不让 SDK 执行登录。

| case key | 连续步骤与必须断言 |
| --- | --- |
| prepare-auth | pay(T) → CreateTradePay 鉴权失败 → auth_required/prepare → 宿主更新 Token → 显式 pay(T) → 准备/渠道/查询成功。首个 pay 的 prepare 恰好一次、invoke 为零，无 SDK 自动重试；后一次使用新 Token、同 tradeNo/method |
| query-auth | pay(T) → prepare → 渠道 success_hint → QueryTrade 鉴权失败 → auth_required/query，保留渠道信号与引用 → 宿主更新 Token → observe(T) → QueryTrade(PAID)。整个 case 的 prepare=1、invoke=1；新 Token 只用于后续查单，两个运行各交付一次。独立 query 失败再 query 及 unknown 信号恢复也按同一禁止重下单规则覆盖 |
| channel-session | pay(T) → prepare(P) → 渠道明确会话失效 → channel_session_required/invoke → 宿主完成服务端会话更新 → 显式 pay(T) → prepare 返回相同 paymentNo=P → 使用本次参数调渠道 → query(PAID)。tradeNo/channel/appId 不变；signData/paySig 允许相同，signature 使用第二次响应；prepare=2、invoke=2，无 SDK 登录或自动再准备、不直接重用旧 PreparedPayment。准备阶段 SessionExpired 分支按 CONTRACT-013 另验 |
| channel-session-different-payment | 同上连续会话恢复流程，第二次响应改为不同 paymentNo 及该响应完整参数；仍为 prepare=2、invoke=2，SDK 采用相同调度路径，不因前后单号相同/不同增减步骤。只证明 SDK 可消费服务端结果，不以 Fixture 代替服务端状态机验收 |
| native-stop-late-callback | pay(T) → prepare → 渠道不回调 → 宿主显式停止 → stopped → 新 pay(T) → 新运行的渠道/查询/结果。旧回调在新运行期间到达也不能触发查询或改变新结果；旧运行只结束一次。停止不关单、不关闭渠道界面 |

无关的场景组合不作笛卡尔积穷举；新增跨阶段交互风险时，先在本清单增加或修改必需流程/case 与检查点，再同步测试。FLOW 检查点须在同一 case 内关联真实执行断言；只有流程阶段全部贯通不自动满足所引用 Scenario 的全部边界。两者分别统计，防止用任意一个成功流程抵扣所有场景。

#### Scenario: TC-PAYSDK-CORE-015 新增场景或协议义务未绑定测试
- **WHEN** 有效 Spec 或支付 IDL 增加本期必需验证项，但测试未新增对应 case，或只给测试文件标注 ID 而缺少必需检查点绑定
- **THEN** 清单由事实源产生并列出缺项，场景门禁非零退出；不能以现有测试全部通过或减少统计范围宣称 100%。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "fact-derived-inventory": "清单从有效 Spec/IDL 事实源生成，不从已有测试反推分母",
    "missing-binding-rejected": "新增义务缺 case 或只标文件 ID 而无 checkpoint 时列明缺项并非零退出",
    "scope-cannot-shrink": "不能以测试通过或缩小统计范围宣称 100%"
  },
  "cases": [
    {"key": "missing-scenario-case", "kind": "engineering", "requiredIn": ["integration"], "checks": ["fact-derived-inventory", "missing-binding-rejected", "scope-cannot-shrink"]},
    {"key": "missing-idl-field-case", "kind": "engineering", "requiredIn": ["integration"], "checks": ["fact-derived-inventory", "missing-binding-rejected", "scope-cannot-shrink"]},
    {"key": "owner-id-without-checkpoint", "kind": "engineering", "requiredIn": ["integration"], "checks": ["missing-binding-rejected"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CORE-016 场景运行证据不足
- **WHEN** 绑定已存在，但必需 case 被跳过、断言未执行、必需运行环境缺报告、来源版本已变化，或断言失败；或者单项 Scenario 均通过但必需 FLOW 缺失/未贯通
- **THEN** 报告分别列出未执行、无效证据、流程缺口或失败；全部必需子项执行后才计该场景的执行覆盖，执行覆盖 100% 仍不能抵消断言失败；来自不同测试的阶段记录不能拼成一个 FLOW case，完整门禁阻断。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "execution-validity": "skip、无断言、缺环境、过期来源或失败分别报告为无效/未执行/失败",
    "all-required-subitems": "全部必需 case 和环境执行后才计执行覆盖",
    "pass-separate-from-coverage": "执行覆盖 100% 不抵消断言失败",
    "flow-continuity": "FLOW 必须由同一连续运行证明，不能拼接不同测试",
    "verification-kind-enforced": "以单测报告抵扣 behavior/IDL/FLOW 或以工程产物检查抵扣支付 E2E 时门禁失败；kind 与项目按 Spec 匹配，不能由绑定改类",
    "all-kinds-required": "混合 Scenario 即使 behavior 已通过，缺必需 module/engineering 证据仍不算全 Spec 验证完成；支付 E2E 与模块/工程统计分别显示",
    "metadata-stays-in-denominator": "缺 verification block 或缺 kind 的 Scenario 仍列入全部 Spec 缺口；不能通过缺少分类从 E2E 分母静默排除"
  },
  "cases": [
    {"key": "skipped-required-case", "kind": "engineering", "requiredIn": ["integration"], "checks": ["execution-validity", "all-required-subitems"]},
    {"key": "assertion-not-executed", "kind": "engineering", "requiredIn": ["integration"], "checks": ["execution-validity", "all-required-subitems"]},
    {"key": "missing-required-environment", "kind": "engineering", "requiredIn": ["integration"], "checks": ["execution-validity", "all-required-subitems"]},
    {"key": "stale-source-report", "kind": "engineering", "requiredIn": ["integration"], "checks": ["execution-validity"]},
    {"key": "failed-assertion-at-full-coverage", "kind": "engineering", "requiredIn": ["integration"], "checks": ["execution-validity", "pass-separate-from-coverage"]},
    {"key": "missing-flow", "kind": "engineering", "requiredIn": ["integration"], "checks": ["flow-continuity"]},
    {"key": "spliced-flow-evidence", "kind": "engineering", "requiredIn": ["integration"], "checks": ["flow-continuity"]},
    {"key": "unit-cannot-cover-behavior", "kind": "engineering", "requiredIn": ["integration"], "checks": ["verification-kind-enforced"]},
    {"key": "mixed-scenario-module-missing", "kind": "engineering", "requiredIn": ["integration"], "checks": ["all-kinds-required"]},
    {"key": "missing-verification-metadata", "kind": "engineering", "requiredIn": ["integration"], "checks": ["metadata-stays-in-denominator"]}
  ],
  "blockedBy": []
}
```

#### Scenario: TC-PAYSDK-CORE-017 架构与质量门禁缺失或违规
- **WHEN** 初始化缺少必需 AGENTS/规则入口，或后续变更引入产品反向依赖、生产入口包含 Shadow、场景测试目录越界、已启用的 lint/类型规则违规、未测试的手写实现，或无已确认依据地削弱必需门禁
- **THEN** 对应静态/架构/产物/覆盖命令指出可机械检测的缺失和违规并非零退出，包含未被测试导入的手写文件；恢复合法输入后正常门禁通过。规则减项列入维护者评审，不以仅创建 AGENTS 文件、设置阈值或显示定向测试通过宣称强约束已生效。代码托管平台的合并检查、审批和分支保护不属于本场景的验证义务。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "machine-gates": "静态、架构、产物和覆盖命令对可机械检测的违规非零退出",
    "boundary-enforcement": "反向依赖、生产夹带 Shadow、场景目录越界和未测手写文件被拒绝",
    "rules-restorable": "恢复合法输入后机器门禁通过",
    "review-record": "规则减项必须有维护者评审记录；机器只校验记录结构、关联版本与 freshness，不判断语义"
  },
  "cases": [
    {"key": "missing-agent-entry", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates"]},
    {"key": "reverse-dependency", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "shadow-in-production", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "scenario-directory-escape", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "lint-violation", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates"]},
    {"key": "type-violation", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates"]},
    {"key": "untested-handwritten-file", "kind": "engineering", "requiredIn": ["integration"], "checks": ["machine-gates", "boundary-enforcement"]},
    {"key": "restored-valid-input", "kind": "engineering", "requiredIn": ["integration"], "checks": ["rules-restorable"]},
    {"key": "gate-reduction-review-evidence", "kind": "engineering", "requiredIn": ["integration"], "checks": ["review-record"]}
  ],
  "blockedBy": []
}
```
