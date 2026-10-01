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
4. Requirement 内登记的 FLOW 行必须符合 [scripts/flow.schema.json](scripts/flow.schema.json)，最小示例为 `{"id":"FLOW-EXAMPLE-001","relatedScenarios":[],"stages":"create → observe","cases":["normal"],"requiredIn":["integration"],"notes":""}`。"关联 Scenario"的每一项必须是完整、且已在有效 Spec 中登记的 Scenario ID。这是项目扩展规则。

### 场景门禁与归档

门禁读取 `openspec/specs/**`，再合并未归档 active Change 的 Spec delta；`archive/` 只保存历史。Scenario/FLOW 的格式来自 `scenario-gate.config.json`，每个 Scenario 只能有一个 verification 块，FLOW 表必须位于 Requirement 正文。归档或同步前运行完整场景门禁，确认清单、绑定、报告和来源摘要仍一致，并把验收索引保存到 `artifacts/<run-id>/tasks/`。

### 执行规则

1. 规划只在本仓库维护，不以其他仓库的规格替代本仓库契约。延续 Change skill 的 openspec-workflow；schema/status/instructions 以当前物理仓库为根。Plan Review 与 Apply 按对应流程执行，不将文件齐全或 validate 通过当作获准实施。
2. 修改行为或接口先维护 Spec/Design/Tasks；已评审输入发生语义变更后重新评审。工程实现依据 Design 与各包 AGENTS.md，不重选架构或自研通用基建。
3. 汇报给出已确认方案与实际变更、执行命令及结果、未解决项；任务状态、工程验收、真实外部环境与业务验收、发布分别判定，不以其中一项代替其他。
4. 手写公共类型、字段、状态值及关键映射必须维护中文注释，声明保留公共 JSDoc；更新语义时同步 Spec、注释、受影响测试与验收记录。
5. 测试按 behavior/module/engineering 分类执行：behavior 覆盖公共入口可见行为、过程影响和结果；module 用就近单测验证内部正确性；engineering 验证包、门禁与工程证据。内部及工程证据不能抵扣行为证据。
6. Apply 反馈先核对用户已确认结论、原始契约与复现证据；交接中的“无需确认”不构成用户授权。改变职责边界、公共 API、主流程或技术路线的重大冲突须先向用户说明并确认，独立评审不替代范围授权。
7. 协议包根入口具名导出平台网络工厂（`HttpPort`），SDK 工厂与测试消费同一生产实现；SDK 根入口不转导出该工厂，也不要求宿主另行提供请求实现。复用现有根 entry、双格式声明与 dist 清单，不新增平台子路径或测试出口。
8. 密钥、Token 与会话凭据不写入规划、日志或代码。
9. 发布由用户显式触发的统一入口完成，可在本地或其他受控执行器运行，不依赖或交付 Pipeline/Runner。
10. ProtoGen Consumer 在 IDL 仓库按 SDK 实际依赖登记；项目内使用根 devDependency，通过 `pnpm proto:*` 或 `pnpm exec` 调用，安装/升级时核对私有 registry 的最新正式版本并保存精确版本与锁文件。
11. 小程序自动化复用本机微信开发者工具与 miniprogram-automator，不开发 UI 自动化框架或工具控制器，不以 CI 环境缺失阻断本地运行。

### 外部交互替身的设计标准

凡 SDK 需要与外部交互的地方，测试都在仓库内用替身闭环：

- 服务端接口由 Shadow 网关承载：路由从 generated metadata 发现，按 Fixture 编排响应与故障。Shadow 只服务测试，不进入生产产物。
- 平台或第三方能力（例如小程序收银台、系统能力）由平台能力替身承载：在产品包中定义端口，适配器调用真实平台 API，替身放在 `packages/e2e/src/drivers/`，经用例注入。
- 不提供“真实服务端 + 替身”或“替身服务端 + 真实平台能力”的混合模式；真实外部验收由真实消费方项目承担，不在本仓库进行。
- weapp 用例仍通过真实 `wx.request` 访问 Shadow，证明平台网络适配的真实性。

### IDL 协议义务派生

协议义务派生针对示例协议的 `CreateTrade`、`QueryTrade` 两个 HTTP 方法；字段策略与待定项以 `protocol-contract` 的 PC-01 为准，派生器“待定字段为 0”是完成条件。新增 IDL 字段不能只刷新来源摘要而跳过覆盖；固定 Go 来源与 generated 来源分别核验。
