# Scenario 驱动的工程基线模板

一套可复用的工程基线：一套技术架构，加一套能证明"需求真的做完了"的质量体系，主要面向由 Agent 协作开发的项目。新项目可以直接以它为起点，已有项目可以把它当作参考样例，按需接入。

**解决的问题**：开发中"需求说的"、"测试测的"和"代码做的"很容易悄悄脱节。测试全绿，却说不清它验证了哪条需求；需求或代码改了，旧测试和模拟数据照样通过。

**核心做法**：每条需求场景有一个唯一 ID（如 `SCN-WEB-EXAMPLE-002`），从需求文档一路带到测试用例、测试数据、模拟服务端和运行报告，最后由门禁按 ID 对账。哪条需求没有证据、哪份证据已经过期，门禁都会直接失败，"做完了"由门禁判定，而不是靠人或 Agent 自述。

清单驱动的 TypeScript monorepo 模板：提供可复用的技术架构，以及以 Spec Scenario 为唯一 ID、贯通用例、Fixture、Shadow 与门禁对账的质量体系。产品形态、协议与运行平台都是可替换点，当前并列提供“Headless SDK + IDL + 小程序”和“Web 应用 + OpenAPI + 浏览器”两套具体实现，并以组合绑定把它们接到同一套清单、证据和门禁上；后续可按同一方式扩展其他端。工程形态由根目录 [project.manifest.json](project.manifest.json) 登记，改包、命令、测试项目或发布设置时先改清单。

使用入口见 [模板使用指南](docs/template-guide.md)，设计理由见 [技术架构文档](docs/architecture.md)，Agent 入口见 [AGENTS.md](AGENTS.md)。

| Workspace 目录    | 包名                      | 职责                                                                                        |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------------- |
| packages/sdk      | @daqian/template-sdk      | Headless SDK：公共入口与业务能力，工厂校验装配，核心编排端口，适配器负责外部协议映射        |
| packages/protocol | @daqian/template-protocol | IDL + ProtoGen 协议包：契约与生成入口、通信执行器、小程序与浏览器网络适配及测试用路由构造器 |
| packages/openapi  | @daqian/template-openapi  | OpenAPI 协议包：契约、生成物、REST 执行器、浏览器网络适配与测试用路由构造器                 |
| packages/web      | @daqian/template-web      | Vue Web 应用产品包：前端分层、组件树、状态分层与产物边界；private，不发布                   |
| packages/e2e      | @daqian/template-e2e      | private 测试工程：用例、驱动、宿主、报告与本地预览，不发布                                  |

消费方只安装 `sdk` 形态的产品包。它与绑定的 IDL 协议包采用独立版本，协议依赖固定到精确版本，发布统一由 SDK 发布入口处理；Web 应用包与只被它绑定的 OpenAPI 协议包参与构建和证据，但不发布。不需要发布能力时可按指南“包发布”替换点整块删除。

## 常用命令

```sh
pnpm install --frozen-lockfile
pnpm check:fast          # proto 校验、lint、build、typecheck、架构、单测、fixture、集成与包检查
pnpm test:e2e:weapp      # 小程序项目；按 packages/e2e/AGENTS.md 的约定逐文件运行
pnpm test:e2e:browser    # Chromium 浏览器项目；首次运行前安装 Playwright Chromium
pnpm preview:local       # 用序列数据集查看指定状态的 Web 示例
pnpm dev:remote          # 开发代理；目标服务端只从环境变量读取
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

协议包的 `testing/` 保存各自的路由构造器、适配器与浏览器步骤执行器；协议无关的 Shadow 引擎在 `packages/e2e/src/shadow/`，只服务测试与本地预览，不进入生产产物。E2E 包保存来源化 Fixture、Node/API/小程序/浏览器驱动、宿主、用例绑定与 reporter。小程序经真实 `wx.request` 访问 Shadow，浏览器经 Chromium 与同源代理执行真实 `fetch`；真实外部验收由消费方项目承担，不在本仓库进行。

## 版本与发布

`sdk` 形态的产品包与其绑定的协议包按依赖顺序发布，目标是使用方自己的 registry：清单 `manifest.release` 是 registry 与 tag 前缀的唯一来源，模板占位值含 `<PROJECT_ID>`，预检会拒绝占位值，避免复制模板后误发。`web-app` 产品包与 OpenAPI 协议包默认 private。

## 项目初始化（给 Agent 的内容）

以 scenario-driven-baseline 为基线初始化本项目：先按 docs/template-guide.md 的"初始化方式"做适配评估，产品方案与前后端方案在 <路径>。使用过程中的发现记入 docs/template-feedback.md。

## 维护者说明

工作流 schema（`openspec/schemas/`）不随本模板提交：`.gitignore` 不忽略它，使用方按 Change Skill 安装后应正常提交。模板仓库自己维护时，如果不希望跟踪 schema，在 `.git/info/exclude` 中本地排除，而不是修改 `.gitignore`。

## 作者与交流

- 作者：李永宁，更多文章见 [github 仓库 liyongning/blog](https://github.com/liyongning/blog)，新文章会第一时间在微信公众号发送：[李永宁lyn](https://gitee.com/liyongning/typora-image-bed/raw/master/202202171742614.jpg)
- 接入中遇到问题，欢迎提 issue；也可以关注公众号，加入交流群一起讨论

## 许可证

[MIT](LICENSE)
