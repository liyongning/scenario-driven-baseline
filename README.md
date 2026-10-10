# SDK 领域项目模板

通用 TypeScript Headless SDK 工作区模板：三个包（产品包、协议包、private 测试工程）加一个可复制的示例能力，按“按示例扩展新业务”的分层扩展新业务。工程形态由根目录 [project.manifest.json](project.manifest.json) 登记，改包、命令、测试项目或发布设置时先改清单。

使用入口见 [模板使用指南](docs/template-guide.md)，设计理由见 [技术架构文档](docs/architecture.md)，Agent 入口见 [AGENTS.md](AGENTS.md)。

| Workspace 目录    | 包名                      | 职责                                                                                     |
| ----------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| packages/sdk      | @daqian/template-sdk      | 公共入口与示例能力（`src/example/`）：工厂校验装配，核心编排端口，适配器负责外部协议映射 |
| packages/protocol | @daqian/template-protocol | ProtoGen 契约与生成入口、通信执行器、网络适配及测试专用 Shadow                           |
| packages/e2e      | @daqian/template-e2e      | private 测试工程，不发布                                                                 |

消费方只安装产品包。产品包采用独立版本，协议依赖固定到精确版本，发布统一由 SDK 发布入口处理；不需要发布能力时可按指南“包发布”替换点整块删除。

## 常用命令

```sh
pnpm install --frozen-lockfile
pnpm check:fast          # proto 校验、lint、build、typecheck、架构、单测、fixture、集成与包检查
pnpm test:e2e:weapp      # 小程序项目；按 packages/e2e/AGENTS.md 的约定逐文件运行
pnpm check:scenarios     # 用报告对账 Spec、绑定与证据
```

## 规划入口

- [Agent 工作入口](AGENTS.md)
- [模板使用指南](docs/template-guide.md)
- [技术架构文档](docs/architecture.md)
- [有效能力 Spec](openspec/specs/)
- [工具准备记录](docs/engineering/bootstrap.md)

工作流 schema 不随本模板提交，使用方自行安装（例如 Change Skill 的 `openspec-workflow`）。门禁读取 `openspec/specs/**` 并合并未归档 Change 的 Spec delta；归档前须让清单、绑定、报告与来源摘要保持一致。

## 外部交互替身

协议包在 `testing/` 下提供测试专用 Shadow：路由来自协议来源（当前由 IDL 生成描述转换），只服务测试，不进入生产产物。E2E 包保存来源化 Fixture、Node/WeApp 薄驱动、用例绑定与 reporter。平台自动化直接使用本机微信开发者工具，通过 miniprogram-automator 连接，并以真实 `wx.request` 请求 Shadow；真实外部验收由消费方项目承担，不在本仓库进行。

## 版本与发布

产品包与协议包按依赖顺序发布，目标是使用方自己的 registry：清单 `manifest.release` 是 registry 与 tag 前缀的唯一来源，模板占位值含 `<PROJECT_ID>`，预检会拒绝占位值，避免复制模板后误发。

## 项目初始化（给 Agent 的内容）

以 sdk-template 为基线初始化本项目：先按 docs/template-guide.md 的"初始化方式"做适配评估，产品方案与前后端方案在 <路径>。使用过程中的发现记入 docs/template-feedback.md。

## 维护者说明

工作流 schema（`openspec/schemas/`）不随本模板提交：`.gitignore` 不忽略它，使用方按 Change Skill 安装后应正常提交。模板仓库自己维护时，如果不希望跟踪 schema，在 `.git/info/exclude` 中本地排除，而不是修改 `.gitignore`。
