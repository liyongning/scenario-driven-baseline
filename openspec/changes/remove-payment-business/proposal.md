## Why

这是模板演进的第二步。上一步（`2026-09-30-template-example`）新增了中立示例与通用场景门禁；这一步删除支付业务逻辑，使仓库只剩模板骨架与示例。之后的第三步另开 Change，做完全通用化（包与项目参数化、可选能力模块化、模板使用指南），不在本次范围内。

删除不能直接进行：支付代码与模板通用能力纠缠在一起。架构与质量门禁、包消费、发布预检、Live 构建与证据工具、公共类型中文注释进入声明、IDL 协议义务派生、手写错误码的来源校验，这些都是模板要保留的通用能力，但它们的测试挂在支付场景 ID（`TC-PAYSDK-*`）之下，规范写在支付 Spec 里。直接删除支付 Spec，这些能力的覆盖义务会随之消失而无人察觉。因此本次按"先迁出、再删除"的顺序执行：先把通用能力迁到通用能力 Spec 和通用场景 ID 之下，再删除支付业务。每一步结束后 `pnpm check:fast` 必须通过。

用户已决定：模板**长期借用**支付 IDL 中的 `CreateTrade`、`QueryTrade` 作为示例协议，不替换 IDL。理由是示例只是样板，全部验证走 Shadow 网关；为示例在公司公共 IDL 仓库新增 proto 并不合适。因此 IDL 协议义务派生在本次直接改为针对这两个接口生效，而不是暂停。

## What Changes

### 1. 先迁出：通用能力换到通用 Spec 与场景 ID 之下

- 新增能力 `template-engineering`，承接支付 Spec 中与业务无关的工程要求：
  - 三包边界与产品交付：产品包只依赖协议包，E2E 私有；包产物的 ESM、CJS、类型声明可被消费，协议依赖在打包后固定为精确版本，测试代码不进入产物。
  - 架构与质量门禁：反向依赖、生产代码夹带测试设施、场景目录越界、lint 与类型违规、未被测试的手写文件、缺失 AGENTS 入口等违规被阻断，恢复后通过。
  - 公共类型中文 JSDoc 随双格式声明交付，缺注释被阻断；检查对象改为示例的公共类型。
  - 发布预检：统一发布入口的记录输入、版本组合与失败检查点。
  - Live 工具：非敏感配置白名单与 Token 存储控制、Live 构建与测试设施隔离、证据结构校验。只保留通用机制；支付的交易创建表单与支付证据矩阵删除，Live 证据矩阵只剩示例记录。
- 新增能力 `protocol-contract`，承接协议层的通用能力：
  - IDL 协议义务派生：从 generated 描述为示例消费的 `CreateTrade`、`QueryTrade` 自动列出字段映射、编码边界、公共请求上下文、响应与错误处理、超时等义务，每项义务须有 integration 与 weapp 证据。
  - 手写错误码事实与来源校验：错误码副本缩减为示例实际使用的几项（`QueryTrade` 的 Unauthorized、Unavailable，网关的 Unauthorized 等，最终清单由 Design 固定），继续用独立的 Go 来源样例校验名称、数值与描述。
- `scenario-gate` 增补覆盖对账与证据有效性要求。原来写在支付 SDK-14 里的规则迁入，包括：清单由事实源生成、缺绑定、skip、无断言、缺环境、来源过期、断言失败、FLOW 拼接、kind 抵扣等情况都要阻断。
- 相关测试原样保留，只把绑定改为新的 `SCN-*` ID；测试逻辑本身不变的，直接迁移。

### 2. 再删除：支付业务逻辑

- SDK：删除支付的 `core/`、`adapters/`（支付基建、渠道、平台设备信息）、`ports/`、`errors/`、`contracts.ts`、`factory.ts` 及其单测。示例不再依赖支付类型：它目前通过 `runtime/default.ts` 间接引用支付的 `contracts` 与 `ports`，改为使用自己的运行辅助端口类型。SDK 根入口只导出示例。
- 协议包：删除支付 Shadow 路由；Shadow 默认使用示例路由；错误码副本按第 1 部分缩减；通信执行器、网络适配、generated 代码保持不变。
- E2E：删除支付的 sdk、protocol、flows、weapp 用例，以及 51 个支付 Fixture；删除支付 weapp 宿主入口、支付 Live 控制台（交易创建、表单、控制器）；工具单测中作为样本数据的 `TC-PAYSDK-*` ID 改为通用格式。
- 规划：整份删除 `payment-sdk` 与 `payment-sdk-contract` 两份主 Spec。OpenSpec 1.6.0 无法用 delta 删除整个能力：删掉全部 Requirement 后，归档会以"Spec 至少要有一个 Requirement"拒绝，而且 CLI 没有删除能力的命令（已在仓库副本上模拟验证）。因此本 Change 不为这两份 Spec 写 delta，改为在最后一个任务中直接删除 `openspec/specs/payment-sdk/` 与 `openspec/specs/payment-sdk-contract/` 目录，并在 Design 中记录这一处例外。已归档的 Change 作为历史保留，不做修改。

### 3. 门禁与配置收口

- `scenario-gate.config.json` 只保留 `SCN-<CAPABILITY>-<NNN>` 与 `FLOW-<CAPABILITY>-<NNN>` 两种格式。
- 删除 GATE-04：它的核心义务"支付对账结果不变"失效，支付基线 Fixture 一并删除。其中"多格式配置"能力迁入新增的 GATE-09，场景改用新 ID `SCN-SCENARIO-GATE-011`。之所以不直接修改 GATE-04：OpenSpec 要求被修改的 Requirement 保留原有场景标题原文，而原标题写的是"支付对账结果不变"，保留下来会误导使用方。
- GATE-03 收紧 FLOW 表"关联 Scenario"一列：必须引用已登记的完整 Scenario ID。这是上一步登记的已知缺口，支付简写表删除后可以收紧。
- 完成后，完整的 `pnpm check`（含场景门禁与 weapp）应**以退出码 0 通过**，这是模板第一次全绿。

### 4. 文档

- 删除根目录与三个包 AGENTS.md 中的"当前业务：支付"整节。模板通用规则中与迁移相关的指向（能力 Spec、场景 ID）同步更新。
- README 只删除支付内容，保持与仓库现状一致，不在本次改写为模板使用指南。
- 删除 `docs/engineering` 中支付专属的 Live 文档；`.env.live.example` 删除支付专属键。

### 非目标

- 不改包名、scope、registry；不把示例提升为顶层目录结构；不做包与项目的配置化参数化；不做可选能力模块化；不写模板使用指南。这些都属于第三步。
- 不替换 IDL，不修改 ProtoGen Consumer 与生成配置。
- 不修复微信开发者工具自动化的已知不稳定问题，按 `packages/e2e/AGENTS.md` 的约定执行。
- 不做 Live 真实运行，不发布包。
- 不修改已归档 Change 的内容。

### 已知缺口（本次登记，不在本次处理）

- 删除支付后，"端侧渠道适配器"与"平台设备信息适配器"两类分层没有样例，示例只覆盖后端适配器。需要时再扩展示例。
- 模板使用指南（能力地图、从方案到验收的流程、可替换点清单）留给第三步。

## Capabilities

### New Capabilities

- `template-engineering`：三包边界与产品交付、架构与质量门禁、公共类型中文注释进入双格式声明、发布预检、Live 配置与构建和证据工具。
- `protocol-contract`：基于 IDL 的协议义务派生与覆盖保障（针对示例的 `CreateTrade`、`QueryTrade`），手写错误码事实与来源校验。

### Modified Capabilities

- `scenario-gate`：新增 GATE-07、GATE-08（覆盖对账与证据有效性，迁自支付 SDK-14）；新增 GATE-09（可配置的 ID 格式）；修改 GATE-03，收紧 FLOW 关联 Scenario；删除 GATE-04。
- `template-example`：修改 EX-01（不再引用"与支付客户端一致"）与 EX-05（隔离规则从"示例与支付互不导入"改为"产品包内各业务模块目录互不导入"）；EX-07"示例页面不调用支付接口"保留，因为借用的 IDL 中仍有扣款接口 `CreateTradePay`。
- `payment-sdk`、`payment-sdk-contract`：整份删除。由于 OpenSpec 的限制，不写 delta，由任务直接删除主 Spec 目录（见上文"规划"一条）。

## Impact

- SDK 包：大幅删除支付代码；根入口只导出示例；示例改用自己的运行辅助端口类型。
- 协议包：删除支付 Shadow 路由；缩减错误码副本；`testing` 导出调整。
- E2E：删除支付用例、Fixture、宿主入口与 Live 控制台；新增示例的协议义务矩阵用例（integration 与 weapp）；迁移后的通用能力用例改绑新 ID。
- 脚本：`contract-inventory` 改为基于示例路由与示例字段规则；`check-architecture`、`check-fixtures`、`check-package`、发布脚本中与支付耦合的部分调整。包名等标识不变。
- 规划：新增两份能力 Spec；直接删除两份支付主 Spec 目录；修改 `scenario-gate`。
- 运行要求：每个任务后 `pnpm check:fast` 通过；最终完整 `pnpm check` 通过，其中 weapp 需要本机微信开发者工具，并按 AGENTS 约定执行。
- 流程：按 openspec-workflow 推进，Specs、Design、Tasks 完成后须通过 Plan Review 才能 Apply。
