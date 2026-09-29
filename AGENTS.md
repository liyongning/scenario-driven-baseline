# infra-payment-sdk Agent 入口

## 模板通用规则

### 必读

- [有效能力 Spec](openspec/specs/)
- 使用 `openspec list` 查看当前 Change；生命周期状态以当前物理仓库为根。
- [仓库与跨仓库参考](README.md)

### OpenSpec 硬规则

1. 所有规划、状态与归档必须使用当前仓库的 OpenSpec 根和 `openspec-workflow`；不要把另一个仓库的路径当作事实。
2. 每个 Scenario/FLOW ID 必须匹配项目配置；格式唯一权威是 [scenario-gate.config.schema.json](scenario-gate.config.schema.json)，最小示例为 `{"scenarioIdPatterns":["^SCN-[A-Z]+-\\d+$"]}`。本条格式约定沿用 Change Skill。
3. 每个 Scenario 必须带一个 `json verification` 元数据块；字段唯一权威是 [scripts/verification.schema.json](scripts/verification.schema.json)，最小示例为 `{"formatVersion":2,"checkpoints":{"result":"结果"},"cases":[{"key":"normal","kind":"behavior","requiredIn":["integration"],"checks":["result"]}],"blockedBy":[]}`。这是项目扩展规则。
4. Requirement 内登记的 FLOW 行必须符合 [scripts/flow.schema.json](scripts/flow.schema.json)，最小示例为 `{"id":"FLOW-EXAMPLE-001","relatedScenarios":[],"stages":"create → observe","cases":["normal"],"requiredIn":["integration"],"notes":""}`。这是项目扩展规则。

### 场景门禁与归档

门禁读取 `openspec/specs/**`，再合并未归档 active Change 的 Spec delta；`archive/` 只保存历史。Scenario/FLOW 的格式来自 `scenario-gate.config.json`，每个 Scenario 只能有一个 verification 块，FLOW 表必须位于 Requirement 正文。归档或同步前运行完整场景门禁，确认清单、绑定、报告和来源摘要仍一致，并把验收索引保存到 `artifacts/<run-id>/tasks/`。

## 当前业务：支付

主工作区现已包含 Task 1–7 的 SDK 实现、正式 0.1.0 发布记录及 2026-09-22 Change 归档；这些内容此前在隔离 Apply 工作区完成。Task 8 的既有 Shadow 验证已取证，Live/业务验收仍按独立边界跟踪。后文 2026-09-09 的评审条款是历史记录，不覆盖本轮新增输入。历史实施事实保留，不能把验收边界误判为尚未开发。

## 必读

- [Proposal](openspec/changes/archive/2026-09-22-headless-payment-sdk/proposal.md)
- [Design](openspec/changes/archive/2026-09-22-headless-payment-sdk/design.md)
- [能力 Spec](openspec/specs/payment-sdk/spec.md)
- [公共契约与设计待决登记](openspec/specs/payment-sdk-contract/spec.md)
- [Tasks 与共同完成条件](openspec/changes/archive/2026-09-22-headless-payment-sdk/tasks.md)
- [仓库与跨仓库参考](README.md)

## 当前执行规则

1. SDK 规划仅在本仓库维护；ESM 业务规格是外部消费方事实，不复制为第二套 SDK 契约。notes 中的临时 Skill 备忘、历史回顾和通信/迁移记录不是规范性要求。
2. 延续 Change skill 的 openspec-workflow；schema/status/instructions 以当前物理仓库为根，不能沿用 ESM 仓库的操作路径。Plan Review 和 Apply 按对应流程执行，不将文件齐全或 validate 通过当作获准实施。
3. 用户已确定 pnpm workspace + Vite + Vitest、三包目录、@daqian/payment-sdk、@daqian/payment-protocol、private @daqian/payment-e2e；双格式/声明、独立版本、SDK 统一发布均按 Design 执行。根 package.json 与 pnpm-lock.yaml 已用于工具准备，Task 1 在此基础上扩充，不重复初始化覆盖。ProtoGen 使用项目 devDependency，通过 pnpm proto:version 或 pnpm exec 调用；安装/升级时查私有 registry 的最新正式版本并保存精确版本及锁文件，不依赖全局安装。
4. 当前无剩余 SDK 设计 TODO。按 IDL 4e5cb22659fd4f4c36d06ae81256dc1c43e691d9 的结构化 PayParams oneof、optional xpay_env 和公共契约响应判定实现，BaseResp.status_code 为业务权威；Task 3 按 IDL 5539be8f09323709fa65f6568efe22896ec35d24 的 Go 原文，在协议包 src/errors/business-codes.ts 手写维护 17 项 bigint 错误码/描述及来源版本，并交付独立 Go 来源样例与 CONTRACT-024 一致性/漂移验证。该副本不由 ProtoGen 生成，不放入 generated、不豁免手写覆盖；DTO/metadata/codec 与已有 Proto 枚举仍生成。身份恢复按阶段矩阵：查询恢复只查原交易，渠道会话恢复后以同一 tradeNo/channel/appId 显式 pay 使用本次完整有效参数，不比较 paymentNo 是否变化，不重放旧 PreparedPayment，不新增隐式恢复 API。GitLab npm 目标为项目 245；发布由用户显式触发的统一入口完成，可在本地或其他受控执行器运行，不依赖或交付 Pipeline/Runner。支付 IDL 的 Consumer/Profile、权限或运行验证缺失时指出对应任务缺口。Shadow 与 Live 均由本仓库测试宿主闭环；业务接入验收独立，不作为 SDK Change 完成条件。密钥、Token、session_key 不写入规划或日志。
   - Consumer 在 IDL 仓库按 SDK 实际依赖登记，业务 IDL 不在本 Change 中维护。小程序自动化复用现有本地开发者工具和 miniprogram-automator，只提供 SDK 执行及真实 wx.request 环境；不开发 UI 自动化框架或工具控制器，不以 CI 环境未落实阻断本地运行。
5. 修改行为/接口先维护 Spec/Design/Tasks；已评审输入发生语义变更后重新评审。工程实现时依据 Design 中四份 AGENTS 正文和官方初始化方案，不重选架构或自研通用基建。
6. 汇报给出已确认方案 vs 实际变更、执行命令及结果、未解决项；任务状态、工程验收、真实渠道、业务验收和发布分别判定。本次迁移不等于八个任务完成。
7. 阶段通知按公共契约的 RunOptions.onPhase、channel_invoking/confirming 与一次最终 PaymentOutcome 执行。状态字段的中文语义表是说明权威；手写公共类型/字段/状态值及关键映射、停止/迟到分支须维护中文注释，声明保留公共 JSDoc。更新状态同时维护 Spec、注释、受影响测试及验收记录，不将阶段、渠道信号、交易事实和结束原因混为一类。

8. PaymentRequest.xpayEnv 逐次可选 sandbox/prod；省略/undefined 保持 optional absence，INVALID_INPUT 在外部动作前返回。核心复制本次值，backend 用 generated 具名枚举映射，协议 codec 发送；不设客户端环境默认，不写 Header/BaseReq/query，不改写 signData.env。再次 pay 由业务保留原选择，查询恢复只查原交易。prod 部署恒走现网、旧网关可能丢字段，真实验收按 Design 的环境矩阵取证。包含错误码 TS 副本及内部取消规则的当前完整规划已于 2026-09-09 通过独立 Plan Review；继续 Apply 前须让隔离工作区取得同一份规划和评审报告，并重新校验 freshness 与任务前置条件。本轮评审未恢复实施。

9. 通信 CANCELLED 通过 SDK 内部 BackendResult.cancelled 传递；backend 不伪装 TIMEOUT，核心按公共契约的停止/预算及 ended 闩锁结算，公共 query/PortResult/PaymentError 不扩展。观察中单笔查询超时只结束该请求，剩余窗口内重查；运行结束与请求完成分别锁定。此次补充已于 2026-09-09 通过独立 Plan Review；同步同版规划/报告并验证 freshness 后由 Task 3/4/7 承接。

10. 内部 cause=query_unavailable 由 backend 按查询操作、完整已知错误码及 IDL 可恢复描述唯一赋值，核心不复制错误数字，不以未知 retryable=true 自动重查。公开 query 与 Outcome.error 显式投影公共字段。该补充已于 2026-09-09 通过独立 Plan Review；同步同版规划/报告并校验 freshness 后，Task 3 补充受影响接口/单测并回归评审，Task 4/7 承接其余实现。

11. generated Consumer 来源跟踪 feat/esm-v1.4 的 current，手写17项错误及独立Go样例保持固定5539来源；不得要求两者提交号相同或把整个lock摘要永久绑到Fixture。只在公共契约规定的完整支付兼容字段/依赖/输出均不变时允许工具刷新来源，相关语义变化先评审。共同 current 门禁及本次报告 freshness 仍须通过；本轮来源门禁补充已于 2026-09-09 通过独立 Plan Review，Task 3 负责增量回归及评审。

12. Apply 反馈先核对用户已确认结论、原始契约与复现证据；交接中的“无需确认”不构成用户授权。改变既定职责边界、公共 API、支付流程或技术路线的重大冲突须先向用户说明并确认，独立评审不替代范围授权。渠道实际调用标记补充遵循既有 not_invoked/unknown 语义，已于 2026-09-09 通过独立 Plan Review；Task 4/5/6/7/8 承接内部 markInvoked 与对应验收，不修改协议包职责。

13. 协议包现有根入口具名导出 createWechatMiniappHttp(): HttpPort，SDK 工厂和真实 weapp 协议测试消费同一生产实现；SDK 根不转导出，不要求宿主提供 Request。复用根 entry、双格式/声明和 dist 清单，不新增平台子路径或测试出口。该装配补充已于 2026-09-09 通过独立完整 Plan Review；同步同版规划及报告、校验 freshness 后，Task 2 增量验收及评审通过再恢复 Task 6 真实 weapp 分支，Task 7/8 接续包消费与全量验证。合入保留工程、WIP 和既有任务状态。

14. 测试按 Design 的 Verification boundaries and evidence classification 与 Spec verification v2 执行：behavior 覆盖公共入口可见行为、过程影响和结果；module 用就近单测验证内部正确性；engineering 验证包/门禁/工程证据。全部 Scenario 保留登记，内部及工程证据不能抵扣支付 E2E/IDL/FLOW。五项内部 case 的绑定和 root reporter 由 Task 6 增量交付，不新增 SDK 测试 API，不改变八条 FLOW。本轮完整规划已于 2026-09-09 通过独立 Plan Review；Apply 工作区取得同版规划/报告并重新通过 freshness 后使用。

15. 验收运行模式仅 Shadow/Live，不提供真实服务端搭配渠道替身模式。保留 Shadow 在协议包 testing、Fixture/host/driver 在 E2E 的已定所有权；Live 使用同仓 host/weapp 的独立构建控制台和生产 SDK/真实微信 API，不迁移生产职责。根 .env.live 仅非敏感白名单，Token 由用户确认写 Storage、getter 每次读取，真实创建网关返回 tradeNo，不手工注入。8-A 已在 2a0494e 完成。8-B 创建契约为 IDL 6726634 的 POST /api/base/trade/create；用户确认 user_id 可由独立非敏感 env key 预填、页面可改且仅进入创建 body，默认创建表单可编辑。现有文件级 Consumer/生成出口复用，新创建错误和表单仅在 E2E，SDK/Shadow两方法和公共API不变。本次 uid 默认值语义须重新 Plan Review/freshness 通过后实施；8-C仍需部署/账号/真实矩阵证据，测试数据不宣称服务端核价安全。按 Design Live decision 及 SDK-17 真机/服务矩阵验收，Task 8 保持未完成；ESM 构建、UI、权益、业务上线和实际 npm 发布不作为本 Change 完成条件。
