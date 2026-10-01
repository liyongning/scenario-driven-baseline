# 工程初始化记录

本文件保留模板的工具准备事实：安装来源、精确版本、项目内调用方式与已经裁定的工程取舍。按业务任务编号的历史进度与未完成说明不在此维护。

## 工具链与依赖版本

| 项目 | 核对结果 |
| --- | --- |
| Node / pnpm | 22.21.1 / 10.20.0 |
| create-vite | 9.2.0 |
| Vite | 8.2.2 |
| Vitest / @vitest/coverage-v8 | 5.0.0 |
| unplugin-dts | 1.1.0 |
| TypeScript | 5.9.3 |
| ESLint / typescript-eslint | 10.10.0 / 8.70.0 |
| dependency-cruiser | 18.2.0 |
| tsx | 4.23.13 |
| @types/node | 22.20.1 |
| globals | 17.12.0 |
| @microsoft/api-extractor | 7.59.1 |

TypeScript 采用 5.9.3，满足 typescript-eslint `>=4.8.4 <6.1.0`，未使用不兼容的 TypeScript 7。Node 22.21.1 满足以上 engines 交集。

官方入口：[create-vite](https://vite.dev/guide/)、[库模式](https://vite.dev/guide/build#library-mode)、[声明插件](https://github.com/qmhc/unplugin-dts)、[Vitest projects](https://vitest.dev/guide/projects)、[ESLint TS 配置](https://typescript-eslint.io/getting-started/)、[dependency-cruiser](https://github.com/sverweij/dependency-cruiser)。

## ProtoGen 项目内安装

### 来源与版本

| 项目 | 核对结果 |
| --- | --- |
| npm 来源 | https://gitlab.daqian369.com/api/v4/projects/216/packages/npm/ |
| 包 | @daqian/proto-gen |
| dist-tags.latest / 最高正式发布版本 | 0.1.2 |
| 版本列表核对 | 0.1.0、0.1.1、0.1.2 及其预发布；无 0.1.3，显式查询 0.1.3 返回 E404 |
| CLI 报告 | 0.1.2，commit 9f706d4811a8ffaffeabcfa6fbaedff8670f1c89 |
| bundled buf | 1.58.0 |

根 `.npmrc` 指定工具依赖所在项目 216，无写入凭据；产品包 `publishConfig` 指向项目 245，两者职责见 README。

### 初始化与限定修改

1. 通过 `npm view` 查询 registry 的 latest、完整版本列表、engines 和 tarball。
2. 执行 `pnpm init --init-package-manager --init-type module` 生成根 `package.json`。
3. 根包设为 private，工具准备版本 0.0.0；移除模板 main、默认失败的 test 脚本和未选定 license，增加 `proto:version`。根版本不是产品版本。
4. 执行 `pnpm add --save-dev --save-exact @daqian/proto-gen@0.1.2`，由 pnpm 产生精确依赖与 `pnpm-lock.yaml`。
5. `.gitignore` 忽略 `node_modules`、`.pnpm-store` 和 `.DS_Store`；未创建产品包、未修改全局工具、未执行生成。

### 验证结果

- `pnpm proto:version`：退出 0，版本 0.1.2。
- `pnpm exec which proto-gen`：退出 0，指向 `./node_modules/.bin/proto-gen`。
- `pnpm install --frozen-lockfile`：退出 0，lockfile up to date。

后续安装复现使用锁文件；升级时先查发布源最新正式版，再更新精确依赖和本记录。所有项目命令使用本地依赖，不因系统全局 ProtoGen 的版本不同而改变行为。

## 脚手架与工程转换

- 产品包使用锁版 `pnpm create vite@9.2.0 <包目录> --template vanilla-ts --no-interactive`（非交互，退出 0）；`packages/e2e` 使用 `pnpm init --init-package-manager --init-type module`，随后改为 private 包，移除默认 main/license/test，没有浏览器宿主模板或成功占位脚本。模板自带的 `index.html`、`public/vite.svg`、`src/main.ts` 等示例文件与其 tsconfig/.gitignore 由共享工程配置替代；保留已有根规划文件，不重跑根 `pnpm init`。
- 库构建 target=es2020、formats=['es','cjs']；声明由 unplugin-dts/vite 输出，`tsc` 独立校验。声明插件通过官方 `outDirs: ['dist', { dir: 'dist', moduleFormat: 'cjs' }]` 与 `bundleTypes` 输出 `index.d.ts`/`index.d.cts`；补精确 peer `@microsoft/api-extractor` 7.59.1（Node >=20.9.0）。最初以 `.d.mts` 作多文件主入口会使 extractor 无法解析无扩展名引用，改为默认 `.d.ts` 主输出捆绑后由插件产生 CJS 副输出；没有自行复制或改写声明。双格式 JS 为 `index.js`/`index.cjs`，两份声明保留中文公共注释。
- ESLint：`pnpm create @eslint/config@2.0.0`，选择 JavaScript、检查语法及问题、ESM、无框架、TypeScript、Node、JavaScript 配置；拒绝自动浮动安装，沿用精确依赖。生成的 flat config 把 Node globals 限制在测试/工具，产品纯类型配置无 DOM/Node，runtime 只声明跨宿主计时器。
- dependency-cruiser：`pnpm exec depcruise --init`，monorepo=yes、ESM=yes、packages、允许根依赖、`tsconfig.base.json`、JSDoc=yes、getBuiltinModule=yes、编译前 TS 依赖=yes。保留官方规则并补充产品包依赖方向规则；关闭初始化孤儿提示，循环提示只分析非 type-only 依赖。
- 薄架构检查使用 unified 11.0.5、remark-parse 11.0.0、unist-util-visit 5.1.0 解析规则链接，dependency-cruiser 是导入图的唯一解析器；没有增加第四包或自研解析器。
- 产品包从 0.1.0 起独立维护，SDK 的协议依赖使用 `workspace:*`；两包 `publishConfig` 指向项目 245，根 `@daqian` registry 仍指工具项目 216，无凭据写入。

### 验证范围

独立手写范围的 lint、完整 typecheck、architecture、unit 和 build 通过；V8 四项 100%，include 覆盖未被测试导入的手写文件，并精确排除 generated、测试与声明。干净副本的 frozen install 与以上命令通过；ProtoGen 的配置校验要求 Git 工作区。受控真实 CLI 负例覆盖 lint、类型错误、未覆盖函数/分支、未被导入手写文件、协议反向导入、生产导入测试、缺 AGENTS、断链和违规目录，均非零阻断。

## Profile 的 DOM lib 裁定

官方固定 Profile 使用 `env=browser`（`proto-gen/plugins/tsclient/profile_digest.go` 与 `internal/tsproto/request.go`），其 conformance 脚本以 `--lib ES2022,DOM` 检查输出。生成的 bytes helper 使用 `globalThis.atob`/`btoa`，最初在无 DOM 的协议包 tsconfig 出现 TS7017；因此只为协议包构建配置增加 `ES2020+DOM`，保持工程 target=ES2020 以及根与产品包的无默认 DOM/Node 配置。类型配置不提供运行时 polyfill。

## pnpm 忽略依赖安装脚本的裁定

锁定 pnpm 10.20.0 默认不运行未批准的依赖安装脚本（[官方 10.x 配置](https://pnpm.io/10.x/settings#ignoredepscripts)、[approve-builds](https://pnpm.io/10.x/cli/approve-builds)）。当前唯一被提示的依赖是 esbuild 0.28.2；其 postinstall 为 `node install.js`，原生执行文件通过同版本平台 optionalDependency 安装。保持默认未批准状态和原始警告，不批准所有脚本，也不隐藏提示或改变 lock。

已在无既有 `node_modules` 的副本中验证 frozen install、tsx 驱动的架构命令、完整测试和构建；额外直接调用锁定 esbuild 的 `transformSync` 编译 TypeScript 并执行结果，确认得到 42。该证据说明本轮 darwin/arm64 环境可使用已安装的平台二进制，postinstall 并非当前流程的必要条件；其他平台或升级版本需要重新核对。

## 测试基础设施依赖

测试设施按既定版本表安装并锁定：Express 5.2.1、Ajv 8.20.0、remark-gfm 4.0.1、unified 11.0.5、remark-parse 11.0.0、miniprogram-automator 0.12.1、Vitest 5.0.0。协议包 `testing/` 下的 Shadow 从 generated metadata 发现路由；E2E 包保存来源化 Fixture、Node/WeApp 薄驱动、用例绑定与 reporter；根脚本提供 Fixture、Scenario 和实际 tarball 检查。生产 exports 与 files 不包含 Shadow 或 E2E。

最小微信宿主用 Vite library mode 生成 CommonJS 内容并以 `protocol-runner.js` 文件名供开发者工具装载；`.generated` 为 gitignored 构建输出。正式 WeApp driver 只调用 miniprogram-automator 的 `launch`、`evaluate` 和 `disconnect`，没有 readiness 探测、重试、版本检查绕过或工具进程控制。

## 跨 workspace 入口门禁

dependency-cruiser 的 `cross-workspace-no-direct-files` 拒绝跨产品 workspace 的本地路径依赖，包含指向公开 index/generated 的相对重导出、type-only、动态 import 和 dist 路径。合法 npm 名称继续由根 TS paths（只映射两包公开 root）或 workspace/package exports 解析；原有公开入口规则同步允许构建后的 `dist/index` 与 `dist/generated`。规则使用工具自身的 dependencyTypes 与解析路径，不另写 import 解析器。真实 CLI 回归覆盖非法来源与合法 root/generated 子入口。

## 本地包测试与正式发布解耦

本地 `pnpm pack`/`pnpm check:package` 仅服务于用户显式发起的包内容、安装、ESM/CommonJS 和声明消费测试；测试 tarball 与摘要不会进入正式发布记录，也不与 registry 产物比较。正式 `release:preflight` 只核对固定项目 245、当前 workspace 包名/版本、SDK 的 `workspace:*` 协议依赖、tag 和源码提交。用户通过 `pnpm sdk-release -- --input <record> --token-env <TOKEN_ENV>` 显式启动正式发布；入口可在本地或其他受控执行器运行，先校验当前 HEAD、tag 与包含未跟踪文件在内的 clean checkout，再从指定环境变量读取 Token。

正式流程只使用产品 workspace 的构建与正常 `pnpm publish`：先检查协议版本，缺失时构建并发布 `@daqian/payment-protocol`，确认可读后再检查、构建和发布 `@daqian/payment-sdk`。构建仅准备当前源码对应的产品 `dist`，不执行或消费本地 `pack/check:package`；已可读取的同版本直接复用，不覆盖，也不与本地 tarball 建立文件身份关系。Token 只进入权限为 0600 的临时 npm 配置，查询与发布命令另以高优先级 scoped 参数固定项目 245，避免仓库工具 `.npmrc` 的项目 216 配置覆盖正式目标。来源预检开始即失效旧成功结果，任一失败只保留 failed checkpoint；所有发布动作、registry 确认及最终完整性检查结束后，才把临时结果原子提升为 `release-result.json`，因此晚期失败不会留下正式成功记录。Pipeline/Runner 与合并保护属于仓库治理，不是该发布能力的前置或交付物。
