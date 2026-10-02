# Task 9 演练逐项记录（`task-9-redrill.md` 的附录）

本文件补齐 Design"重新演练"证据条要求的逐演练记录：提示词、执行者、步骤摘要、改动文件、`check:fast` 结果、猜测记录与处理、依据文件。内容取自 Bridge 派发的演练 Agent 返回的完整报告（原文保存在 Bridge 会话中，此处如实摘录，未改写结论）。分类采用 Design"重新演练"的三类标准：1 阻塞、2 指引错误或误导、3 需要额外理解。Agent 的自评标签与 Bridge 的判定不同时，两者都写出。

## 提示词

每个演练派发一个全新 general-purpose Agent，提示词只含以下内容，不含本 Change 的任何规划文本。

### 公共结构（两轮相同）

```
You are acting as a new user of an SDK project template. You have no other context about this project.

Repository (a disposable … , nothing you change is kept): <副本路径>
Dependencies are installed. <网络与 install 限制>. Do not commit.

First read the root `AGENTS.md` and `docs/template-guide.md`[, and the product package's `AGENTS.md`（D4）], then follow the guide to complete this goal:

GOAL (Dn): <目标>

Rules:
- Work only from documentation and code inside this repository. Do NOT read anything under `openspec/changes/`[ or `artifacts/`（重做）], and do not look outside this repository.
- Do not modify gate logic: non-test files under `scripts/` may only be deleted if the guide explicitly tells you to delete them; do not edit them.（D3/D4：Do not edit non-test files under `scripts/`[, `eslint.config.js` or `.dependency-cruiser.cjs`（D4）].）
- Whenever you have to guess, find the guide inconsistent with the code, or find a missing step, write a "guess log" entry with the exact location, what happened, and what you did. Note which files (besides AGENTS.md and the guide) you relied on.
- Done means `VERIFY_RUN_ID=drill-<id> pnpm check:fast` exits 0.（重做：If a run fails only by a test timeout while the machine is busy, rerun once and report both.）You do not need to run the scenario gate or weapp tests.

Final report (plain text): steps; `git status --short`; final `check:fast` exit code and last summary lines; `git diff --stat -- scripts …`; the guess log（重做：for each entry also say whether the guide was WRONG/MISLEADING, whether you were BLOCKED, or whether you only needed EXTRA UNDERSTANDING）.
```

### 各演练目标（原文）

- **D1**：Following the guide's "替换点地图 → 包发布" section, remove the package-release module from this template entirely.
- **D2**：Following the guide's "替换点地图 → 运行平台" section, remove the WeChat mini-program platform (the platform test project) from this template, without adding any replacement platform. The project manifest must end with no platform-class test project, and no Spec case may still list `weapp` in `requiredIn`.
- **D3**：Following the guide's "初始化方式", rename the product package (only the product package) to directory `packages/demo-sdk` and npm name `@daqian/demo-sdk`.
- **D4**：Using the existing example module as the model (per the guide's "初始化方式"), add a new business module `notice` to the product package (`src/notice/`) with a factory, core, port(s), adapter(s) and co-located unit tests. Keep it small. Export it publicly only if the guide says so. Then, WITHOUT editing `eslint.config.js` or `.dependency-cruiser.cjs`: temporarily add a file inside your new module's `core/` directory containing `void wx;`, run `pnpm lint`, record whether lint rejects it and with which rule, then delete that probe file.
- **D5（只在第一轮由 Agent 执行）**：Your team does not use IDL/ProtoGen; it describes its HTTP API with OpenAPI. Following the guide's "替换点地图 → 协议来源" section, produce the complete plan of what you would need to change to switch this template's protocol source from IDL + ProtoGen to OpenAPI … Do not implement anything. Start from the guide, then verify the guide's list against the actual code.

### 两轮的差异

| 项 | 第一轮 | 重做 |
|---|---|---|
| 基线 | `b5d6682`，detached git worktree（含 git 历史与 `artifacts/`） | `f742844` 导出、模拟归档、删除本 Change 规划与证据、`git init` 单次提交 |
| 禁读 | `openspec/changes/` | `openspec/changes/`、`artifacts/` |
| 安装 | `pnpm install --frozen-lockfile --offline` | `pnpm install --frozen-lockfile --offline` |
| 超时提示 | 无 | 仅超时失败时允许重跑一次并报告两次结果 |
| 自评类别 | 无 | 每条记录自评 WRONG/MISLEADING、BLOCKED 或 EXTRA UNDERSTANDING |

## 第一轮（基线 `b5d6682`）

### D1 删除发布模块 — 执行者：全新 Agent

- **步骤**：读 AGENTS 与指南；`git grep` 发布相关引用；删除 `scripts/sdk-release.ts`、`check-release.ts` 及两份单测、`SCN-TEMPLATE-ENGINEERING-004` 用例与 Fixture；删清单 `release`、根脚本 `release:preflight`/`sdk-release`、两包 `publishConfig`；删除主 Spec ENG-04 并改 Purpose；改指南、README、AGENTS、`bootstrap.md`。
- **改动文件**：19 项（6 个文档/配置修改、6 个 Fixture/用例删除、2 个 package.json、清单、4 个 scripts 删除）。
- **check:fast**：exit 1。`test:unit` 失败：`check-scenarios --inventory` 报 `openspec/changes/generalize-template/specs/template-engineering/spec.md: MODIFIED Requirement ENG-04 does not exist`；集成测试在高负载下另有 `SCN-TEMPLATE-EXAMPLE-008` 5 秒超时（单独运行通过）。
- **依据文件**：`scripts/check-architecture.ts`、`check-scenarios.ts` 及测试、`scripts/lib/project-manifest.ts`、清单、各 package.json、README、`bootstrap.md`、ENG 主 Spec、`SCN-TEMPLATE-ENGINEERING-001/004/005` 用例。
- **猜测记录**：

| # | 位置与现象 | 处理 | 判定 |
|---|---|---|---|
| 1 | "包发布"未列两个发布脚本的单测 | 一并删除 | 3 |
| 2 | 未列 `SCN-TEMPLATE-ENGINEERING-004.spec.ts` | 按维护规则删除 | 3 |
| 3 | `bootstrap.md` 描述发布能力，未列出 | 改写 | 3 |
| 4 | 未说明删整个 ENG-04 还是只删场景 | 删整个 Requirement 并改 Purpose | 3 |
| 5 | 本 Change 未归档，delta MODIFIED ENG-04 与删除冲突，无法到绿 | 未处理（禁读 `openspec/changes/`） | 演练环境问题（重做时模拟归档） |
| 6 | Spec 与已删用例的 case 数不一致 | 已随删除消失 | 3 |
| 7 | 指南多处句子默认发布仍存在 | 改写 | 3 |
| 8 | `SCN-TEMPLATE-ENGINEERING-001` 的 `dependency-release-contract`、`005` 对可选 `release` 的读取 | 保留（与发布流程无关） | 3 |
| 9 | 锁文件未变 | 无需处理 | 3 |
| 10 | 误写 `/tmp/x` 后立即删除 | 无影响 | 不计 |

### D2 去掉小程序平台 — 执行者：全新 Agent

- **步骤**：改清单（删 weapp 项目、必需命令、`hostRoots: []`、`allowedDirectories` 去掉 `host`）；删 `host/weapp/**`、`tests/weapp/**`、`vitest.config.weapp.ts`、`drivers/weapp*`（保留 `node.ts`）；改根脚本、`vitest.config.ts`、`eslint.config.js`、`.gitignore`、`define-case.ts`、`bootstrap.test.ts`；改三份主 Spec；改 AGENTS、README、`bootstrap.md`、指南；修单测并补 `context.test.ts`。
- **改动文件**：31 项。
- **check:fast**：第 3 次 exit 0（unit 41/280、覆盖率 100%；integration 31/79）；前两次为单测期望与覆盖率。
- **依据文件**：清单与 schema、package.json、`vitest.config.ts`、`check-architecture.ts`、`spec-inventory.ts`、`contract-inventory.ts`、`check-scenarios.ts`、两包 AGENTS、`define-case.ts`、`bootstrap.test.ts`、`transport/context.ts`、被删 `weapp-host.test.ts`（`git show HEAD`）。
- **猜测记录**：

| # | 位置与现象 | 处理 | 判定 |
|---|---|---|---|
| 1 | 指南列整个 `drivers/`，`node.ts` 为集成用例所需 | 只删 `weapp*` | **2**（照字面会删错） |
| 2 | 未列 coverage include、eslint host globals、`.gitignore` | 删除 | 3 |
| 3 | 未列 `define-case.ts` 环境类型与 `bootstrap.test.ts` | 修改 | 3 |
| 4 | "协议来源"链接 `host/weapp/protocol-runner.ts`，删平台后断链 | 去掉链接 | **2**（指南未提示跨章节链接） |
| 5 | `hostRoots` 改成什么未说明 | 设为 `[]` | 3 |
| 6 | Spec 中含 weapp 的 case 未逐个列出 | grep 修改 | 3 |
| 7 | `contract-inventory.test.ts`、`spec-inventory.test.ts` 依赖真实清单的 weapp | 改测试期望 | 3 |
| 8 | `spec-inventory.test.ts` 读取归档 Spec | 改指向主 Spec 并更新计数 | 3 |
| 9 | 删 weapp 后 `transport/context.ts` 失去覆盖来源 | 补单测 | 3 |
| 10 | `check-scenarios.ts` 默认报告名含 `weapp.json` | 不改（文件不存在即被过滤） | 3 |
| 11 | `miniprogram-automator` 依赖去留 | 保留并在 `bootstrap.md` 注明 | 3 |
| 12 | active Change 是否仍含 weapp 不可核对 | 未处理 | 演练环境问题 |
| 13 | 受控输入的测试仍含 weapp | 保留 | 3 |
| 14 | 硬规则 7 仍描述平台网络工厂 | 保留（生产适配器仍在） | 3 |

### D3 产品包改名 — 执行者：全新 Agent

- **步骤**：改清单（目录、包名、`sourceRoots`、`tagPrefix`）；移动目录；替换配置与测试中的旧名/旧路径与交替组；`pnpm install --offline` 刷新链接；修 `check-package.test.ts`。
- **改动文件**：45 项。
- **check:fast**：第 3 次 exit 0（unit 43/287、覆盖率 100%；integration 31/79）；第 1 次测试期望，第 2 次两个 5 秒超时（高负载）。
- **依据文件**：清单、package.json、`packages/sdk/package.json` 与 `vite.config.ts`、`.dependency-cruiser.cjs`、`check-architecture.ts`、`check-package.ts`、`check-release.ts`、`scenario-gate-helpers.ts`。
- **猜测记录**：

| # | 位置与现象 | 处理 | 判定 |
|---|---|---|---|
| 1 | 指南未提写死产品目录/包名的测试（约 15 个） | grep 后修改 | 3 |
| 2 | 自建临时清单的测试是否改名 | 保留 | 3 |
| 3 | `sdk-release.ts` 临时目录前缀含旧名，不得改 | 保留（外观） | 3 |
| 4 | `tagPrefix` 取值未给 | 设为 `demo-sdk-v` | 3 |
| 5 | 测试项目名 `sdk-unit` 是否随改 | 保留 | 3 |
| 6 | 批量替换误改指南中的 `(sdk|e2e)` 示例文字 | 还原 | 3 |
| 7 | 根 AGENTS 的通用清单示例是否属于"示例路径" | 保留 | 3 |
| 8 | 断网下 `pnpm install` | `--offline` 成功 | 3 |
| 9 | 高负载下测试超时 | 重跑通过 | 1（门禁不稳定，见下） |
| 10 | 历史验收索引含旧名 | 保留 | 3 |
| 11 | `openspec/changes/` 下规划含旧名 | 未读取 | 演练环境问题 |

### D4 新增业务模块 — 执行者：全新 Agent

- **步骤**：以 `example/` 为样板建 `src/notice/`（contracts、factory、core/notifier、ports/channel、adapters/wechat-toast 及就近单测）；未改 `index.ts`；wx 探针。
- **改动文件**：`packages/sdk/src/notice/` 下 8 个新文件，无其他改动。
- **wx 探针**：`pnpm lint` exit 1，`no-restricted-globals`。
- **check:fast**：第 3 次 exit 0（unit 46/306、覆盖率 100%；integration 31/79）；前两次为 `SCN-TEMPLATE-EXAMPLE-008` 5 秒超时（负载约 16）与 `SCN-TEMPLATE-EXAMPLE-005` 计时断言。
- **依据文件**：`example/` 各文件、`runtime/`、`index.ts`、协议包 `wechat-miniapp.ts`、`eslint.config.js`、`.dependency-cruiser.cjs`、两份 vitest 配置、package.json、清单、`SCN-TEMPLATE-EXAMPLE-008.spec.ts`（仅用于诊断超时）。
- **猜测记录**：

| # | 位置与现象 | 处理 | 判定 |
|---|---|---|---|
| 1 | 未给文件布局 | 照抄 `example/` | 3 |
| 2 | 无后端协议时适配器写法无样例 | 参照 `wechat-miniapp.ts` | 3 |
| 3 | 无 Scenario 时用例如何绑定 | 普通单测 | 3 |
| 4 | 内部模块是否需要 Spec/Change | 未建 | 3 |
| 5 | `SCN-TEMPLATE-EXAMPLE-008`、`005` 高负载下超时/计时失败 | 降负载后重跑 | **1**（门禁不稳定，无法判定） |
| 6 | 守卫自动覆盖与代码一致 | 无需处理 | 无问题 |

### D5 OpenAPI 纸面推演 — 执行者：全新 Agent

- **产出**：按清单、根配置、门禁脚本、协议包生成代码与执行器、Shadow、工程接线、产品包、E2E、Spec、文档分组的完整改动清单；用 9 组 `grep` 核对完整性。
- **依据文件**：仓库内全部相关文件（只读）。
- **猜测记录**：

| # | 位置与现象 | 判定 |
|---|---|---|
| 1 | `requiredCommands` 还含 `proto:version`，指南只列 3 个 | 3 |
| 2 | 来源摘要 `idlDigest` 写死读取 `proto-gen.lock`，`fingerprints.ts` 未列 | 3 |
| 3 | `transport/context.ts` 导入 `BaseReq`，未列 | 3 |
| 4 | 公共导出 `businessErrorsIdlCommit` 属公共 API 变更，未提示 | 3 |
| 5 | `tsconfig.build.json` 的 DOM lib 仅为 ProtoGen 而加 | 3 |
| 6 | `tsconfig.test.json`、`.gitignore`、锁文件、`.npmrc` 未列 | 3 |
| 7 | 指南引用的 `SCN-PROTOCOL-CONTRACT-004` 不在主 Spec | 演练环境问题（在本 Change delta 中） |
| 8 | 指南称 SCN-003 Fixture 只改来源摘要，实际整个目录与 IDL/Go 绑定 | **2** |
| 9 | 依赖生成产物的测试与工具未逐个列出 | 3 |
| 10 | README、`bootstrap.md`、e2e AGENTS、其他 Spec 未列 | 3 |
| 11 | OpenAPI 文档放置位置、`RpcMethodMeta` 替代形态未说明 | 3 |
| 12 | 指南步骤 4 写死 `proto:*`，替换时未提示改写 | 3 |
| 13 | `shadow-engine-no-generated` 的 `pathNot` 写死 `idl-routes.ts` | 3 |

### 第一轮汇总与修复

- 第 1 类：`SCN-TEMPLATE-EXAMPLE-008` 高负载下超出 5 秒默认超时（D1、D3、D4）。
- 第 2 类：D2#1（`drivers/` 整体删除）、D2#4（跨章节链接未提示）、D5#8（SCN-003 Fixture 表述）。
- 演练环境问题：D1#5、D2#12、D3#11、D5#7（本 Change 未归档）。
- 修复见中间提交 `f742844`（`task-9-redrill.md` 第一轮"修复"一段）。

## 重做（基线 `f742844`，不带历史的快照）

### D1 删除发布模块 — 执行者：全新 Agent

- **步骤**：读 AGENTS 与指南；`git grep` 发布相关；删除两个发布脚本及单测、`SCN-TEMPLATE-ENGINEERING-004` 用例与 Fixture；删清单 `release`、根脚本、两包 `publishConfig`；删除主 Spec ENG-04、改 Purpose 与 ENG-05 一条；改指南、README、AGENTS（规则 9）、`bootstrap.md`。确认 `openspec/changes/` 只有 `archive/`，无 active delta。
- **改动文件**：19 项。
- **check:fast**：首次即 exit 0（unit 41/246、覆盖率 100%；integration 30/75）。
- **依据文件**：清单与 schema、各 package.json、ENG 主 Spec、`SCN-TEMPLATE-ENGINEERING-005.spec.ts`、README、`bootstrap.md`、`.gitignore`、`scripts/` 下 grep 结果（含 `check-architecture.ts`、`project-manifest.ts`）。
- **猜测记录**：

| # | 位置与现象 | Agent 自评 | 判定 |
|---|---|---|---|
| 1 | 未列发布脚本的单测与 ENG-004 用例 | MISLEADING（清单不全） | 3：照做不会出错，类型检查与 grep 暴露 |
| 2 | 列出文件但未明说"删除" | EXTRA | 3 |
| 3 | 未说删整个 ENG-04 及 Purpose/ENG-05 措辞 | EXTRA | 3 |
| 4 | `publishConfig` 删除还是改 | EXTRA | 3 |
| 5 | `bootstrap.md` 未列 | MISLEADING（缺步骤） | 3：门禁不检查，属清单不全 |
| 6 | 指南自身多处需同步 | EXTRA | 3 |
| 7 | 规则 9 删除还是改写 | EXTRA | 3 |
| 8 | 可选 `release` 的读取保留 | EXTRA | 3 |
| 9 | 无阻塞、无不一致 | — | 无问题 |

### D2 去掉小程序平台 — 执行者：全新 Agent

- **步骤**：删 `drivers/weapp*`（保留 `node.ts`）、`host/`、`tests/weapp/`、`vitest.config.weapp.ts`；改根脚本、`vitest.config.ts`、`eslint.config.js`、`.gitignore`、`bootstrap.test.ts`；改清单；改两份主 Spec；改指南（含去掉协议来源中的 `protocol-runner.ts` 链接）、README、两份 AGENTS、`bootstrap.md`；修两份单测并补 `context.test.ts`。生产适配器、`factory.ts`、`ExampleRuntime` 与 ENG-003 Fixture 按指南保持不变。
- **改动文件**：35 项。
- **check:fast**：第 3 次 exit 0（unit 41/280、覆盖率 100%；integration 31/79）；前两次为单测期望与覆盖来源，无超时。
- **依据文件**：清单与 schema、`project-manifest.ts`、`check-architecture.ts`、`spec-inventory.ts`、`contract-inventory.ts`、`check-scenarios.ts`（只读）、e2e AGENTS、README、`bootstrap.md`、两份主 Spec、`git grep`。
- **猜测记录**：

| # | 位置与现象 | Agent 自评 | 判定 |
|---|---|---|---|
| 1 | `contract-inventory.test.ts` 写死 `['integration','weapp']` | MISLEADING（清单不全） | 3 |
| 2 | 覆盖来源在协议包 `context.ts` | EXTRA | 3 |
| 3 | `spec-inventory.test.ts` 合成输入依赖真实清单 | MISLEADING（未列） | 3 |
| 4 | 读取归档 Spec 的单测 | WRONG/MISLEADING；部分受演练规则限制 | 3：真实使用方可读归档，按测试报错修复 |
| 5 | 只删测试侧时"本项目已删除"写法 | EXTRA | 3 |
| 6 | 能力地图行改成什么 | EXTRA | 3 |
| 7 | `miniprogram-automator` 依赖 | EXTRA | 3 |
| 8 | `define-case.ts` 类型 | EXTRA | 3 |
| 9 | `.gitignore`、eslint、`bootstrap.test.ts`、`bootstrap.md` 未逐个列出 | MISLEADING（清单不全） | 3 |
| 10 | AGENTS 规则 11 删除还是改写 | EXTRA | 3 |
| 11 | Spec 正文改写措辞 | EXTRA | 3 |

首轮第 2 类修订（只删 `weapp*`、跨章节链接提醒）均被照做，未再出现误删或断链遗漏。

### D3 产品包改名 — 执行者：全新 Agent

- **步骤**：改清单；`git mv`；替换配置、测试与文档中的旧名/旧路径及交替组；`pnpm install --offline`；按门禁报错修指南链接与写死旧路径的测试。
- **改动文件**：44 项。
- **check:fast**：第 3 次 exit 0（unit 43/287；integration 31/79）；第 1 次指南 8 处断链，第 2 次两个单测写死旧路径，均由门禁直接指出，无超时。
- **依据文件**：清单、package.json、`.dependency-cruiser.cjs`、`tests/tooling/helpers.ts`、`scenario-gate-helpers.ts`、`check-architecture.ts`、`check-package.ts`（只读）、门禁输出。
- **猜测记录**：

| # | 位置与现象 | Agent 自评 | 判定 |
|---|---|---|---|
| 1 | 是否需在 Change 中进行 | EXTRA | 3 |
| 2 | 同步清单未含指南自身的链接 | MISLEADING（缺步骤） | 3：门禁直接报断链 |
| 3 | 写死旧名的测试未逐个列出 | MISLEADING（遗漏） | 3：已知限制已说明以 grep 与门禁为准 |
| 4 | 自建临时清单的测试保留旧名 | EXTRA | 3 |
| 5 | `sdk-unit` 是否随改 | EXTRA | 3 |
| 6 | `tagPrefix` 取值 | EXTRA | 3 |
| 7 | 根 AGENTS 通用清单示例 | MISLEADING/模糊 | 3 |
| 8 | 交替组提醒准确 | EXTRA | 无问题（首轮修订有效） |
| 9 | 其他未改名项 | EXTRA | 3 |
| 10 | `--offline` 正常 | — | 无问题 |

### D4 新增业务模块 — 执行者：全新 Agent

- **步骤**：读三份文档与 `example/` 全部文件等；建 `src/notice/`（contracts、ports/sender、core/notifier、adapters/wechat-toast、factory 及就近单测）；未导出；未改任何配置；wx 探针。
- **改动文件**：`packages/sdk/src/notice/` 下 8 个新文件，无其他改动。
- **wx 探针**：`pnpm lint` exit 1，`no-restricted-globals`。
- **check:fast**：首次即 exit 0（unit 46/305、覆盖率 100%；integration 31/79）。
- **依据文件**：sdk AGENTS、`example/**`、`runtime/*`、`index.ts`、协议包 `wechat-miniapp.ts`、`eslint.config.js`、`.dependency-cruiser.cjs`、两份 vitest 配置、tsconfig、package.json、清单、`check-architecture.ts`（开头）。
- **猜测记录**：

| # | 位置与现象 | Agent 自评 | 判定 |
|---|---|---|---|
| 1 | 是否对外导出 | EXTRA | 3 |
| 2 | 内部模块是否需要 Spec/场景绑定 | EXTRA，略有遗漏 | 3 |
| 3 | SDK 侧平台适配器无代码样例 | EXTRA | 3（已知限制已说明） |
| 4 | 纯类型文件是否计入覆盖率 | EXTRA | 3 |

### D5 — Bridge 评审（重做阶段不派 Agent）

首轮唯一的第 2 类问题（D5#8，SCN-003 Fixture 表述）已在 `f742844` 改为"只换 IDL 时刷新来源摘要与 `provenance/`；换成非 IDL 来源时整个目录随 PC-02 整体替换或删除"；其余记录为第 3 类，由"已知限制"覆盖。

## 偏差记录

- 两轮副本均以 `pnpm install --frozen-lockfile --offline` 安装（离线环境）；`--offline` 与 `--frozen-lockfile` 同时生效，锁文件未变化。Design 写的是 `pnpm install --frozen-lockfile`。
- Agent 的完整原始报告保存在 Bridge 会话中，未单独落盘；本附录逐条摘录其结论与依据文件。
