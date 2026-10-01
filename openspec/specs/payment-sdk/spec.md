# payment-sdk Specification

## Purpose
TBD - created by archiving change headless-payment-sdk. Update Purpose after archive.
## Requirements
### Requirement: SDK-01 纯 TS 与 Headless

SDK MUST 使用纯 TypeScript 源码并输出独立可消费的 JS/类型声明。核心 SHALL 不依赖 UI 框架、ESM 项目模块、DOM 或微信全局对象；平台调用只存在于 SDK 自带适配边界。SDK MUST 不提供页面、Toast、业务导航或登录交互。公共初始化接收配置与数据 provider，SDK 工厂负责内部依赖装配。

#### Scenario: TC-PAYSDK-CORE-001 无平台环境导入
- **WHEN** 测试环境没有 `wx/window/document` 且没有 ESM 依赖
- **THEN** 核心入口可导入并通过 SDK 内部测试入口注入假端口运行，导入时没有平台副作用；生产入口根据 runtime 字符串选择平台，并装配 SDK 自带依赖。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "production-runtime-assembly": "生产入口按 runtime 字符串选择平台并装配 SDK 自带依赖，创建期间不触发外部动作",
    "headless-internal-core": "无 wx/window/document/ESM 依赖时核心导入无平台副作用，内部假端口可驱动核心完成运行；不把内部测试入口导出到生产包"
  },
  "cases": [
    {"key": "runtime-assembly", "kind": "behavior", "requiredIn": ["integration"], "checks": ["production-runtime-assembly"]},
    {"key": "headless-core-import-and-run", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["headless-internal-core"]}
  ],
  "blockedBy": []
}
```

### Requirement: SDK-05 有界观察与清理

SDK SHALL 内置并允许覆盖查询间隔 3000 ms、结果确认总时长 60000 ms 和单次请求超时 60000 ms；策略必须为有限正数，不同时发起重叠查询。结果预算从进入查询确认阶段起算，不包含预下单和原生收银台等待，在 confirming 通知前固定且不因回调重置。停止后 MUST 清理自身计时器/取消订阅，忽略迟到结果，不撤销在途支付；诊断与阶段回调异常不能破坏支付结算。内部阶段由核心维护，pay/observe 各交付一次最终结果。通信 CANCELLED 经内部 BackendResult 交给核心按公共契约结算，适配器不将其伪装 TIMEOUT；取消与计时竞争遵守一次结束原因锁定。服务端错误的观察重查只消费 backend 按公共契约赋予的内部 cause=query_unavailable，不能仅凭 retryable 或原码推断；公开 query 只请求一次，所有公共结果剥离内部标签。

#### Scenario: TC-PAYSDK-CORE-006 慢查询与超时
- **WHEN** 查询请求持续较慢，随后观察预算耗尽
- **THEN** 不启动第二个重叠请求，本地只结束一次，返回最后可信快照及 timed_out；迟到响应不再次通知业务。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "no-overlap": "慢查询期间同时在途请求数不超过一",
    "single-timeout-result": "观察预算耗尽只结算一次并返回最后可信快照及 timed_out",
    "late-result-isolated": "迟到查询响应不再通知或改变结果"
  },
  "cases": [
    {"key": "slow-query", "kind": "behavior", "requiredIn": ["integration"], "checks": ["no-overlap", "single-timeout-result"]},
    {"key": "late-query-after-timeout", "kind": "behavior", "requiredIn": ["integration"], "checks": ["single-timeout-result", "late-result-isolated"]}
  ],
  "blockedBy": []
}
```

### Requirement: SDK-06 并发与重试约束

SDK MUST 阻止同客户端同交易活动 pay 的重入；前次调用结束后相同 tradeNo 按普通调用交给服务端处理，不维护交易支付历史表。宿主显式 cancellation 可结束原生调用的本地等待并释放活动记录，不关闭渠道界面。SDK SHALL 不自动重试创建业务订单、支付提交或不确定幂等性的准备接口；查询恢复不等于重新支付。本地 attemptId 不是服务端幂等键。

#### Scenario: TC-PAYSDK-CORE-007 重复回调和连续点击
- **WHEN** 同一交易重复调用 pay 且渠道重复发送回调
- **THEN** 实际调起只有一次，每次运行只产生一个最终结果；业务仍需服务端幂等保障。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "single-invocation": "同交易活动 pay 的并发/连续调用只产生一次实际渠道调起",
    "one-outcome-per-run": "重复渠道回调不使任一运行交付多个最终结果",
    "server-idempotency-boundary": "证据不宣称 SDK 替代服务端幂等"
  },
  "cases": [
    {"key": "duplicate-pay", "kind": "behavior", "requiredIn": ["integration"], "checks": ["single-invocation", "one-outcome-per-run"]},
    {"key": "duplicate-channel-callback", "kind": "behavior", "requiredIn": ["integration"], "checks": ["single-invocation", "one-outcome-per-run", "server-idempotency-boundary"]}
  ],
  "blockedBy": []
}
```

### Requirement: SDK-07 可观测性不携带敏感支付载荷

SDK SHALL 提供可选、宿主控制的阶段/错误诊断，不强依赖项目 logger。诊断 MUST 不包含 token、AppKey、session_key、完整 signData、paySig 或 signature。

#### Scenario: TC-PAYSDK-CORE-008 错误日志脱敏
- **WHEN** 适配器遇到参数错误或请求失败并记录诊断
- **THEN** 输出只有关联标识、阶段和错误码，不输出原始支付响应或签名载荷。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "diagnostic-allowlist": "诊断只含关联标识、阶段和错误码",
    "sensitive-data-absent": "诊断不含原始支付响应、Token 或签名载荷"
  },
  "cases": [
    {"key": "invalid-param-log", "kind": "behavior", "requiredIn": ["integration"], "checks": ["diagnostic-allowlist", "sensitive-data-absent"]},
    {"key": "network-failure-log", "kind": "behavior", "requiredIn": ["integration"], "checks": ["diagnostic-allowlist", "sensitive-data-absent"]}
  ],
  "blockedBy": []
}
```

### Requirement: SDK-09 SDK 维护平台网络能力

SDK MUST 自己维护 HTTP 请求实现，网络实现归属通信协议包，首期通过微信网络适配器调用 wx.request。平台适配 SHALL 只处理 URL/method/headers/body、超时、取消与网络结果；公共请求上下文与 codec 执行在通信协议包，支付语义映射在 SDK 基建适配器中完成。生产核心通过内部端口访问平台能力，宿主通过公共配置与数据 provider 接入。协议包根入口 SHALL 导出 createWechatMiniappHttp(): HttpPort，SDK 工厂通过该生产入口装配；模块加载和创建端口不访问平台，SDK 公共入口不转导出此工厂。

#### Scenario: TC-PAYSDK-CORE-010 网络与支付渠道隔离
- **WHEN** 内部测试独立替换网络端口和端侧渠道端口
- **THEN** prepare/query 只通过网络端口，invoke 只通过端侧渠道端口；网络适配不判断 PAID，渠道适配不自行查询，模块导入及创建网络端口不读取 wx。生产装配和 weapp 协议测试从协议包正式根入口取得同一网络实现，不通过深层源码或测试别名绕过包边界。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "protocol-root-factory": "按本 case 的消费者，从已构建协议根入口取得 createWechatMiniappHttp；生产 SDK 装配与 weapp 协议链路分别取证",
    "lazy-platform-access": "协议包加载及创建网络端口不读取 wx，真正 send 时才访问平台",
    "package-boundary": "不经深层源码或测试别名；SDK 根不转导出协议网络工厂",
    "real-weapp-network": "weapp 通过同一生产网络实现及通信客户端发出真实 wx.request",
    "network-port-isolation": "内部假通信端口记录 prepare/query 的网络调用；替换网络实现不改变渠道端口，通信端口不裁决 PAID",
    "channel-port-isolation": "内部替换渠道端口只承接 invoke，渠道适配不自行查询；prepare/query 仍交给支付基建及通信边界"
  },
  "cases": [
    {"key": "protocol-root-factory", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-root-factory", "lazy-platform-access", "package-boundary"]},
    {"key": "weapp-production-network", "kind": "behavior", "requiredIn": ["weapp"], "checks": ["protocol-root-factory", "real-weapp-network"]},
    {"key": "replace-internal-network-port", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["network-port-isolation"]},
    {"key": "replace-internal-channel-port", "kind": "module", "requiredIn": ["sdk-unit"], "checks": ["channel-port-isolation"]}
  ],
  "blockedBy": []
}
```

### Requirement: SDK-11 数据 provider 纳入预算

SDK MUST 在每次实际 HTTP 前取得当前 Token，数据获取受当前请求截止约束，等 provider 返回后重新计算请求剩余预算。provider 异常 SHALL 与服务器错误区分；SDK 不缓存或记录业务凭据。

#### Scenario: TC-PAYSDK-CORE-012 provider 消耗等待时间
- **WHEN** provider 消耗部分或全部操作预算
- **THEN** 发送时网络超时不超过剩余预算；耗尽时不发送请求，迟到 provider 不启动网络或二次回调。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "remaining-budget": "provider 返回后网络 timeout 不超过操作剩余预算",
    "no-send-after-exhaustion": "provider 已耗尽预算时不发送网络请求",
    "late-provider-isolated": "迟到 provider 不启动网络或二次回调"
  },
  "cases": [
    {"key": "provider-partial-budget", "kind": "behavior", "requiredIn": ["integration"], "checks": ["remaining-budget"]},
    {"key": "provider-exhausts-budget", "kind": "behavior", "requiredIn": ["integration"], "checks": ["no-send-after-exhaustion"]},
    {"key": "late-provider-result", "kind": "behavior", "requiredIn": ["integration"], "checks": ["no-send-after-exhaustion", "late-provider-isolated"]}
  ],
  "blockedBy": []
}
```

### Requirement: SDK-13 Monorepo 三包与产品交付边界

仓库 SHALL 使用 infra-payment-sdk；三个 package.json name 分别为 @daqian/payment-sdk、@daqian/payment-protocol、@daqian/payment-e2e，对应目录为 packages/payment-sdk、packages/payment-protocol、packages/e2e。名称已经确认，发布 registry 与权限按 Design 的工程交付输入表登记。

工程 SHALL 使用 pnpm workspace、Vite 库模式及声明生成插件、Vitest，包含支付 SDK、通信协议、private E2E 三个 Package。SDK SHALL 通过 package exports 单向依赖通信协议包；协议包 SHALL 提供 ProtoGen 契约、按 IDL 维护的业务错误码副本、实例化请求执行器与平台网络能力。协议包的 Shadow 仅供测试使用，生产入口与发布产物 MUST 不包含 Shadow、Fixture 或 E2E 依赖；E2E 统一维护跨包行为与协议场景。工程 SHALL 使用 Design 中登记的官方脚手架/官方最小配置及社区工具，按已审议目录落地，不由实施者重新搭建通用构建或测试框架。SDK 包与协议依赖包 MUST 同时交付 ESM、CommonJS 及匹配的类型声明；两包 SHALL 独立管理版本，SDK 以 workspace:* 消费同仓库协议包，发布依赖 MUST 转为经验证的精确版本；发布流程 SHALL 统一以 SDK 为入口，通信协议包作为内部依赖随该流程处理，业务方只安装和升级 SDK；精确版本、Consumer/Profile 等初始化输入按 Design 的工程交付输入表落实。本地 `pnpm pack`/`check:package` 只用于显式的包内容、安装及双格式消费测试；正式发布 SHALL 独立使用产品包的正常 `publish` 命令，不读取、复用或比较本地测试 tarball 及其摘要，也不得把两者文件一致作为发布前置或成功条件。

#### Scenario: TC-PAYSDK-CORE-014 双包构建与消费
- **WHEN** 使用锁定协议生成两个包，构建并打包后安装到独立消费者
- **THEN** SDK 包与协议依赖包的 ESM import 与 CommonJS require 入口、对应 TypeScript 类型入口和协议依赖均可解析，双格式导出一致的公共 API；协议根具名工厂 createWechatMiniappHttp 在 ESM/CJS 及对应类型入口均可消费，无 wx 时加载和创建安全，SDK 根不转导出它，生产根入口不含测试实现；SDK 发布清单固定协议依赖的精确版本，业务消费者只声明 SDK 依赖即可完成安装；协议未变时复用已发布版本，需要新协议版本时先确保依赖可用再发布 SDK，失败阻断本次 SDK 交付；E2E 为 private，SDK 公共入口不导出内部测试端口，生产依赖图和发布清单不含 Shadow/Fixture/驱动；生成状态为 current，手写错误码副本通过独立来源一致性验证，无手写 endpoint/DTO 或循环依赖；并发创建客户端不互相覆盖网关、Token、lane 或预算，Node 消费通过不代替小程序真机验证。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "dual-module-consumption": "SDK 与协议包的 ESM import、CommonJS require 及对应类型入口可解析，双格式公共 API 一致",
    "protocol-network-export": "协议根 createWechatMiniappHttp 可由 ESM/CJS/类型入口消费，加载和创建时无 wx 读取",
    "sdk-export-boundary": "SDK 根不转导出协议网络工厂，生产根入口不含测试实现",
    "dependency-release-contract": "本地 SDK tarball 固定精确协议版本且单 SDK 依赖消费者可安装；正式发布独立使用正常 publish，并保持协议先于 SDK 的顺序",
    "production-package-clean": "产品 exports、依赖图和 tarball 不含内部测试端口、Shadow、Fixture、驱动或手写 generated 对象",
    "source-and-graph-current": "生成状态 current、错误码来源一致、无循环依赖或手写 endpoint/DTO",
    "client-isolation": "并发客户端的网关、Token、lane、预算互不覆盖",
    "weapp-runtime-evidence": "小程序环境实际从已构建生产入口执行协议网络路径；Node 静态/消费证据不能抵扣"
  },
  "cases": [
    {"key": "sdk-esm-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dual-module-consumption", "production-package-clean"]},
    {"key": "sdk-commonjs-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dual-module-consumption", "production-package-clean"]},
    {"key": "sdk-types-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dual-module-consumption"]},
    {"key": "protocol-network-esm-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "protocol-network-commonjs-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "protocol-network-types-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "sdk-does-not-reexport-network", "kind": "engineering", "requiredIn": ["integration"], "checks": ["sdk-export-boundary"]},
    {"key": "sdk-only-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dependency-release-contract"]},
    {"key": "package-boundaries", "kind": "engineering", "requiredIn": ["integration"], "checks": ["production-package-clean", "source-and-graph-current"]},
    {"key": "concurrent-clients", "kind": "behavior", "requiredIn": ["integration"], "checks": ["client-isolation"]},
    {"key": "weapp-production-runtime", "kind": "behavior", "requiredIn": ["weapp"], "checks": ["weapp-runtime-evidence"]}
  ],
  "blockedBy": []
}
```

### Requirement: SDK-14 可执行的架构与场景门禁

工程 MUST 按 Spec/IDL 验证清单、具体测试绑定和本次运行结果统计场景覆盖；必需子项、环境及版本证据缺失 SHALL 阻断完整门禁。根与三包 AGENTS.md 的规则正文 SHALL 在 Design 中细化，并在本期初始化时建立，保持与架构/目录、生成所有权、质量门禁和迭代规则一致；完整检查命令及规则评审机制随目标仓库交付，可由用户在本地、CI 或其他受控执行环境显式触发。testing SHALL 表示测试基础设施实现，跨包场景测试及 Fixture SHALL 位于 E2E。检查器验证结构和执行证据，断言是否正确表达场景须经评审。是否将检查配置为代码托管平台的合并必需项属于仓库治理，不作为 SDK 发布能力、完整门禁或本 Change 完成条件。

Scenario 与具体测试 case SHALL 支持多对多绑定。工程 MUST 额外验证本文件登记的必需集成流程：各流程必需 case 在对应环境中，从公共入口连续执行规定阶段，并验证调用顺序、跨阶段数据关联与最终结果。单项 Scenario 全部通过不得替代流程贯通；同一个流程 case 的阶段证据不得由多个独立测试拼接。TC 与 FLOW 均为稳定标识；缺失/重复标识、未知引用和缺少必需 case SHALL 使清单检查失败。

各 Scenario 的必需 case、kind、检查点和运行项目 SHALL 按 Design 的 verification v2 登记在原场景下，作为测试设计的一部分先于测试代码评审；测试绑定不能减少这些义务。behavior 验证公共入口可见的行为、过程影响与结果；module 验证内部模块正确性，使用所属就近单测；engineering 验证构建/CLI/声明及工程证据。全部 Scenario 保留登记并分别统计，module/engineering 不抵扣支付 E2E 或 FLOW。本版全部场景已有元数据，Task 6 完成解析、绑定及分类报告；缺元数据仍计为覆盖缺口，不能从分母排除。检查器只处理已保存的结构数据，不在 CI 中调用 AI 拆分自然语言。

每个实施任务 MUST 明确前置条件、交付文件、执行命令、通过标准及证据，并同时满足 Tasks 的共同完成条件与专属验收后才标完成。工程基建 SHALL 使用正常输入和违规反例验证真实 CLI 的通过/阻断结果；同一命令接入 CI 时不得吞掉失败，但不要求配置远端合并保护。TDD 记录、配置存在或只执行定向单测不能替代完整适用范围的门禁。验收矩阵及每个 workspace 的边界见 Design 的 Acceptance gates and evidence ownership。

测试基建 SHALL 分别以 Spec 和 IDL 为输入，贯通独立义务清单、用例设计、版本化测试/Fixture、真实被测入口执行及新鲜报告；受控正向集合通过，新增义务未绑定、错误 wire、缺环境、失败断言和流程拼接等反例 MUST 阻断。工具演练报告不得冒充全量 SDK 覆盖或真实渠道验收；正式交付仍须满足本期全部义务及必需 FLOW。

以下清单是本 Change 的固定必需流程门禁，描述 SDK 公共入口到外部边界的连续流程；业务 CreateTrade 在 SDK 外，测试输入是已有 tradeNo。每行定义一个稳定 FLOW，case key 为必须分别运行的分支，关联 Scenario 均使用 TC-PAYSDK- 前缀。检查器以本清单决定流程分母，不从现有 *.spec.ts 推导；恢复流程的预期来自公共契约的阶段矩阵。各流程是否已执行及是否通过，仍以任务证据和 Verify 结果为准。

| FLOW ID | 关联 Scenario | 公共入口与连续阶段/检查点 | 必需 case key | 必需环境 | 输入及验证说明 |
| --- | --- | --- | --- | --- | --- |
| FLOW-PAYSDK-001 | CONTRACT-001/002/003/008 | createPaymentClient → pay → CreateTradePay → 渠道 → QueryTrade(PAYING → PAID) → 一次最终结果；交易引用、签名原文、先后顺序、次数贯通，初始化及渠道回调前无多余请求 | normal、long-channel-wait | integration、weapp | 公共契约结构化参数样例（Task 3）；long-channel-wait 的长时钟断言在 integration，weapp 验证手动释放回调前无查询，不做真实半小时等待 |
| FLOW-PAYSDK-004 | CORE-006、CONTRACT-003/004/019 | pay → 准备 → 渠道 unknown → 查询仍 PAYING → 查询预算耗尽 → timed_out；查询不重叠，迟到响应不二次交付，交易到期不合成 CLOSED | slow-query、expired-but-paying | integration | 结构化参数样例；时间断言使用受控时钟 |
| FLOW-PAYSDK-005 | CORE-012、CONTRACT-012 | pay → 准备 → 渠道 success_hint → 第一次查单 PAYING → 宿主 getter 数据更新 → 后续查单 PAID；使用新 Token、新 Request ID、相同交易引用，不重启 SDK/不重新 prepare | token-rotates-between-queries | integration、weapp | 结构化参数样例；本流程验证正常 Token 轮换 |

FLOW-001 至 006 的每个 case 同时记录真实 SDK 的通知轨迹：正常/unknown 回调路径为 channel_invoking → confirming → 最终结果；取消/明确失败/会话失效只有 channel_invoking；prepare/关联/参数校验失败无通知。FLOW-001 长等待在释放渠道回调前不得有 confirming；FLOW-005 多次查单只通知一次 confirming。每次事件 attemptId 与该次最终结果一致，不跨运行归属。

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
