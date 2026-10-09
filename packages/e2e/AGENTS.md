# packages/e2e/AGENTS.md

## 模板通用规则

### 必读

- [根 AGENTS](../../AGENTS.md)、[有效能力 Spec](../../openspec/specs/)、[仓库与跨仓库参考](../../README.md)、[模板使用指南](../../docs/template-guide.md)。

### 按示例扩展新业务

新业务按示例组织 integration、FLOW、Fixture 和 reporter 绑定；场景事实来自有效 Spec，测试只消费公开包入口并保留实际证据。工具门禁的反例使用受控临时仓库，不把替身结果冒充 SDK 运行证据。

- 测试期望来自有效 Spec、IDL 与 Design，不能从实现、现有返回值或 Fixture 反推。
- `tests/example/` 放单项行为，跨阶段流程使用独立的 `FLOW-*.spec.ts` 并在同一次运行中从公共入口执行到底；`tests/protocol/` 放协议集成，`tests/tooling/` 放 CLI 门禁验证，`tests/weapp/` 放小程序用例。`src/` 只放 harness、driver、用例绑定、Fixture 装载和报告工具；`host/weapp/` 只作最小测试宿主。
- 测试文件所有者为场景或 FLOW；同名 `tests/fixtures/<owner-id>/manifest.json` 记录 Spec 路径与来源摘要，case 数据独立成 JSON；步骤和断言在 `*.spec.ts`。不得把 fixtures 宣称为完整测试用例 DSL，也不在协议 testing 里维护场景集合。
- 使用稳定 caseId 和具体检查点绑定，一个 case 可以覆盖多个场景或协议义务；FLOW 必需阶段须在同一次运行贯通，禁止把多个隔离测试拼接为流程通过。新增场景或流程必须同步绑定和数据，失效/归档按 Spec 生命周期处理，不回收 ID 表示另一种行为。
- 集成测试消费 SDK 包与协议依赖包构建后的公开入口；仅替换外部 HTTP 服务和端侧平台 API。不得 mock SDK 核心/基建映射/协议客户端/codec；平台适配细节的单测留在产品包。weapp 必须实际经过开发者工具 `wx.request`。
- 每例独立场景状态，响应序列固定，额外/缺失请求必须断言。成功流程检查交易引用、调用顺序/次数和最终结果；错误分支同时检查后续动作没有发生。禁止兜底成功、随机响应、只断言没有抛错或只贴场景 ID。
- weapp 协议用例从已构建协议包根使用生产网络适配；SDK 用例调用 SDK 公共工厂，不自写 HttpPort 绕过生产网络适配。helper 只负责连接、执行 SDK 测试函数、取回结果与必要清理，不自研连接协议、工具控制器、UI 交互框架或执行引擎。harness/driver/reporter 的手写逻辑就近单测并纳入四项 100% 覆盖。
- 根 reporter 分别收集 unit 与 integration/weapp 报告，携带同次运行、源码/Spec/IDL/实际 Fixture 摘要及项目；module 无外部 Fixture 时明确 null，不能豁免测试源码 freshness。按 verification v2 分类汇总全部 Spec、行为 E2E、IDL 和 FLOW 覆盖/通过，unit 不抵扣公共 E2E。`tests/tooling` 通过真实 CLI 验证门禁正向与反例，受控工具输入不得冒充被测 SDK 运行证据。
- 新增 IDL 字段不能只刷新来源摘要而跳过覆盖；固定 Go 来源与 generated 来源分开核验，不得改写旧 Go 取数证据或自动覆盖兼容基线。

### 外部交互替身的设计标准

凡 SDK 需要与外部交互的地方，测试都在仓库内用替身闭环：

- 服务端接口由 Shadow 网关承载：路由从 generated metadata 发现，按 Fixture 编排响应与故障。Shadow 维护在协议包 `testing/`，只服务测试，不进入产品产物。
- 平台或第三方能力（例如小程序收银台、系统能力）由平台能力替身承载：在产品包中定义端口，适配器调用真实平台 API，替身放在 `packages/e2e/src/drivers/`，经用例注入。
- 不提供“真实服务端 + 替身”或“替身服务端 + 真实平台能力”的混合模式；真实外部验收由真实消费方项目承担，不在本仓库进行。
- weapp 用例仍通过真实 `wx.request` 访问 Shadow，证明平台网络适配的真实性。

### 微信开发者工具自动化的注意事项

已知限制：开发者工具第一次启动是稳定的；在同一个主进程上重复 `automator.launch()` 后会随机失败。失败有两种表现：一是 `checkVersion` 读到空版本号，报 `TypeError: Cannot read properties of undefined (reading 'split')`；二是 launch 或 evaluate 一直不返回，直到测试超时（120 秒）；三是退出主进程后冷启动偶尔超过 `miniprogram-automator` 默认的 30 秒启动等待，launch 直接失败。现有 driver 每个 case 都会重新 launch，结束时只 `disconnect`，不退出主进程，所以一次运行多个 weapp case 时可能出现这两种失败。它们发生在断言之前（报告里断言数为 0），与被测行为无关。

执行约定：

1. 退出主进程、清理残留进程与预热已由统一入口自动执行：`pnpm verify` 按 `project.manifest.json` 中 platform 项目登记的 `perFile: true` 与 `prepare: "weapp:prepare"` 逐文件运行，每个文件前先执行 `pnpm weapp:prepare`——`/Applications/wechatwebdevtools.app/Contents/MacOS/cli quit`，仍有残留时执行 `pkill -f wechatwebdevtools.app`，再用 `cli open --project <仓库根>/packages/e2e/host/weapp` 预热（约 25 秒）。不预热时，首个 case 的冷启动常超过 30 秒启动等待而必然失败，重跑也无济于事。`cli open` 的退出码不可靠（已观察到返回 255 但 DevTools 已可用），`weapp:prepare` 不以它判断是否就绪；预热只能消除冷启动超时，不能消除 120 秒挂起，挂起仍按第 2 条整文件重跑。
2. 出现上述失败时，`pnpm verify` 会自动先执行一次 `pnpm weapp:prepare` 再重跑失败用例所在的整个文件。手工单跑（例如调试某个文件）时须自行执行第 1 条的退出与预热，并按同样方式整文件重跑，用新的完整报告替换该文件的旧报告；重跑通过即为有效证据。不要用 `-t` 只跑单个 case：被过滤掉的 case 会以 skipped 写入报告，汇入场景门禁时造成重复绑定。不得把这类失败判定为业务失败，也不得据此修改断言、跳过用例或缩小统计范围。
3. 验收记录中写明哪些文件是重跑取得证据的（自动重跑或手工重跑），以及每次失败的现象。

本模板不追求在小程序生态下建设完整通用的自动化流程，因此暂不修改 driver。如需彻底消除，可在后续 Change 中让 driver 在每次 launch 前退出主进程，或让同一文件内的 case 复用一次启动。
