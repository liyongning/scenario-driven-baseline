## ADDED Requirements

### Requirement: BRW-01 浏览器驱动与执行约定

浏览器平台点位 SHALL 使用 Playwright 库驱动本机 Chromium，由 Vitest 执行用例，并以固定的执行约定保证平台证据可复现。

- **依赖**：根 `package.json` MUST 以精确版本 `1.63.0` 声明 devDependency `playwright`；MUST NOT 引入 `@playwright/test`。用例 SHALL 由 Vitest 的 `browser` 测试项目执行。
- **驱动位置与职责**：驱动 SHALL 位于 `packages/e2e/src/drivers/browser.ts`，只负责启动浏览器、创建上下文与页面并桥接给用例；驱动 MUST NOT 注入或改写请求逻辑（网络请求由被测页面经生产网络适配器发出，见 BRW-03 的同源代理）。
- **默认上下文参数**：每个上下文默认视口 1440×900、`deviceScaleFactor` 1、时区 `Asia/Shanghai`、locale `zh-CN`；用例 SHALL 可以按 case 覆盖这些参数，未覆盖的项保持默认值。
- **生命周期**：每个测试文件 SHALL 只启动一次浏览器（`beforeAll`）并在文件结束时关闭；每个 case MUST 新建独立的浏览器上下文并在 case 结束时关闭，case 之间不共享 Cookie、存储与页面。
- **本机准备与自动化边界**：首次运行前需执行 `pnpm exec playwright install chromium`，该命令 MUST 写入 `packages/e2e/AGENTS.md`。根 AGENTS 执行规则 11 SHALL 扩展为同时约束浏览器：浏览器自动化复用本机浏览器与 Playwright，不开发 UI 自动化框架或工具控制器，不以 CI 环境缺失阻断本地运行。平台证据只代表 Chromium。

#### Scenario: SCN-BROWSER-PLATFORM-001 驱动默认上下文参数与 case 隔离
- **WHEN** 同一测试文件内依次运行三个 case：第一个 case 不覆盖任何参数，在页面中读取视口尺寸、`devicePixelRatio`、`Intl.DateTimeFormat().resolvedOptions().timeZone` 与 `navigator.language`，并写入一个 Cookie 与一项 `localStorage`；第二个 case 不覆盖参数，读取同一 Cookie 与 `localStorage`；第三个 case 只覆盖视口为 390×844
- **THEN** 第一个 case 读到 1440×900、DPR 1、`Asia/Shanghai`、`zh-CN`；第二个 case 读不到第一个 case 写入的 Cookie 与存储；第三个 case 视口为 390×844，其余参数仍为默认值；三个 case 期间浏览器只启动一次，每个 case 各自新建并关闭一个上下文。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "default-context": "未覆盖时上下文为视口 1440×900、DPR 1、时区 Asia/Shanghai、locale zh-CN",
    "override-partial": "按 case 覆盖的参数生效，未覆盖的参数保持默认值",
    "case-isolation": "每个 case 使用新的上下文，前一个 case 的 Cookie 与存储不可见",
    "browser-once-per-file": "同一测试文件只启动一次浏览器，每个 case 新建并关闭一个上下文"
  },
  "cases": [
    {"key": "browser-context", "kind": "behavior", "requiredIn": ["browser"], "checks": ["default-context", "override-partial", "case-isolation"]},
    {"key": "driver-lifecycle", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["default-context", "override-partial", "browser-once-per-file"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-002 浏览器依赖版本与自动化边界登记
- **WHEN** 工程检查读取根 `package.json`、锁文件、`packages/e2e/AGENTS.md`、根 AGENTS 与驱动源码；另分别构造反例副本：`playwright` 写成范围版本（如 `^1.63.0`）、新增 `@playwright/test` 依赖、e2e AGENTS 缺少浏览器安装命令
- **THEN** 正例中 `playwright` 为精确版本 `1.63.0` 且锁文件一致，不存在 `@playwright/test`；e2e AGENTS 写明 `pnpm exec playwright install chromium`；根 AGENTS 执行规则 11 同时覆盖小程序与浏览器；三个反例分别被检查报出并指出对应文件。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "exact-version": "根 devDependency playwright 为精确版本 1.63.0 且与锁文件一致，范围版本被报出",
    "no-playwright-test": "依赖中不存在 @playwright/test，引入时被报出",
    "install-documented": "e2e AGENTS 写明首次运行前的 Chromium 安装命令，缺失时被报出",
    "rule-11-extended": "根 AGENTS 执行规则 11 覆盖浏览器自动化复用本机浏览器与 Playwright"
  },
  "cases": [
    {"key": "browser-dependency-check", "kind": "engineering", "requiredIn": ["integration"], "checks": ["exact-version", "no-playwright-test", "install-documented", "rule-11-extended"]}
  ],
  "blockedBy": []
}
```

### Requirement: BRW-02 协议宿主与应用宿主

浏览器平台 SHALL 提供两个宿主：协议宿主为协议矩阵提供浏览器证据，应用宿主为 Web 应用用例托管产品构建产物。两个宿主都 MUST 只托管已构建的产物，不托管源码。

- **协议宿主**（`packages/e2e/host/browser/`）：由 Vite 托管一个最小页面，对协议种类通用。每个协议包 SHALL 在 `testing/browser-runner.ts` 提供页面内的步骤执行器；执行器 MUST 通过该协议包的**构建产物**（包根入口解析到 `dist`，不是 `src`）导入公共客户端与 `createFetchHttp`，按用例下发的计划步骤执行请求并回传结果。宿主 SHALL 按用例所属绑定（见 GATE-17）找到其协议包并加载该包的 `testing/browser-runner.ts`；宿主与启动器 MUST NOT 按协议种类写分支或内置某种协议的执行逻辑；绑定的协议包缺少该文件时，宿主启动失败并指出协议包目录。请求发往同源路径，由 BRW-03 的代理中间件转发到当次 Shadow。启动前 MUST 通过 BRW-04 的产物新鲜度校验。
- **模板提供的执行器**：模板为 OpenAPI 协议包（`packages/openapi`）与 IDL 协议包（`packages/protocol`）都提供 `testing/browser-runner.ts`。模板门禁中协议宿主服务 `web-openapi-browser` 绑定的 OpenAPI 协议包，协议矩阵的义务证据由 OAS-05 承担，本要求只约束宿主机制；IDL 执行器由 protocol-unit 单测覆盖（见 PC-08），其浏览器证据只在交叉复刻演练中经协议宿主加载该执行器取得，模板门禁不要求 IDL 义务的浏览器证据（见 PC-01）。
- **占位资源入口**：协议宿主的最小页面另提供一个按 Fixture 数据渲染 `<img>` 的入口，供占位资源域名的平台证据使用（见 BRW-05），该入口不依赖 Web 应用包与 Web 示例。
- **应用宿主**（`packages/e2e/host/app/`）：以 `vite preview` 托管产品包的 `dist`，参数 MUST 为 `--host 127.0.0.1 --port 0`，不得在参数前多写 `--`；用例 SHALL 以 `vite preview` 实际打印出的 URL 访问页面，不假定固定端口。启动前 MUST 通过 BRW-04 的 dist 新鲜度校验。
- 宿主启动失败（端口未打印、进程提前退出）时 MUST 让当前测试文件失败并给出宿主输出，不得静默跳过。
- **代码位置**：代理中间件、宿主启动器、预览数据集装载与 `dev:remote` 配置解析等逻辑 MUST 放在 `packages/e2e/src/`（如 `src/hosts/`、`src/preview/`），由 `test-tools-unit` 覆盖；`packages/e2e/host/` 只放宿主入口页面与配置文件。只在 Chromium 页面中执行的宿主入口脚本（如 `host/browser/runner.ts`）按 ENG-07 登记覆盖率排除。
- **宿主配置**：占位资源域名的本地兑现规则、`dev:remote` 的代理前缀列表与默认预览数据集 SHALL 登记在 `packages/e2e/host/web.config.json`，格式由同目录的 `web.config.schema.json` 定义，schema 的每个属性（含嵌套属性）带非空中文 `description`；宿主、驱动与预览启动器 MUST 只从该文件读取这些配置，配置不符合 schema 时启动失败并指出字段。

#### Scenario: SCN-BROWSER-PLATFORM-003 协议宿主按绑定加载执行器，只加载协议包产物并执行下发的计划步骤
- **WHEN** 在 OpenAPI 协议包已构建的前提下，`browser` 项目中 `web-openapi-browser` 绑定的用例启动协议宿主与当次 Shadow，向页面下发一个引擎测试契约（OAS-08）中 `getTrade` 成功的计划步骤（步骤携带描述常量）并等待页面回传结果；另检查宿主页面实际加载的协议模块来源；另在单测中以两条绑定（协议包分别为 `protocolKind: openapi` 与 `idl`）调用协议宿主启动器，再让其中一个协议包缺少 `testing/browser-runner.ts`，并检查宿主与启动器的非测试源码
- **THEN** 请求由真实 Chromium 中的 `createFetchHttp` 发出、经同源代理到达 Shadow，页面把执行结果回传给用例；`verify()` 无问题；页面加载的协议模块全部解析到协议包 `dist`，没有任何模块来自协议包 `src`；启动器为每条绑定加载该绑定协议包的 `testing/browser-runner.ts`，缺少执行器时启动失败并指出协议包目录；宿主与启动器源码中不存在按 `protocolKind` 取值的分支。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "real-fetch-through-proxy": "请求由真实 Chromium 中的 createFetchHttp 发出，经同源代理到达 Shadow，verify 无问题",
    "plan-step-roundtrip": "用例下发的计划步骤在页面内执行，结果回传给用例",
    "dist-only": "宿主页面加载的协议模块全部来自协议包 dist，不来自 src",
    "runner-by-binding": "协议宿主按用例所属绑定的协议包加载其 testing/browser-runner.ts，宿主与启动器不按 protocolKind 分支",
    "runner-missing-rejected": "绑定的协议包缺少 testing/browser-runner.ts 时宿主启动失败并指出协议包目录"
  },
  "cases": [
    {"key": "protocol-host-roundtrip", "kind": "behavior", "requiredIn": ["browser"], "checks": ["real-fetch-through-proxy", "plan-step-roundtrip", "dist-only"]},
    {"key": "protocol-host-runner-selection", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["runner-by-binding", "runner-missing-rejected"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-004 应用宿主以本机回环地址与随机端口托管产物
- **WHEN** 应用宿主启动器为一个已构建且摘要一致的产品包启动 `vite preview`；另分别模拟 `vite preview` 进程在打印 URL 前退出、输出中不含 URL
- **THEN** 启动命令参数为 `--host 127.0.0.1 --port 0` 且不含多余的 `--`；启动器从输出中解析出 `http://127.0.0.1:<端口>/` 并交给用例，浏览器访问该地址得到产品首页；两种异常情况都让启动失败并附带宿主输出。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "preview-args": "vite preview 参数为 --host 127.0.0.1 --port 0，不含多余的 --",
    "printed-url": "用例使用从宿主输出解析出的 127.0.0.1 地址访问，不假定固定端口",
    "page-served": "浏览器经该地址打开产品首页",
    "startup-failure-visible": "进程提前退出或输出无 URL 时启动失败并附带宿主输出"
  },
  "cases": [
    {"key": "app-host-launcher", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["preview-args", "printed-url", "startup-failure-visible"]},
    {"key": "app-host-page", "kind": "behavior", "requiredIn": ["browser"], "checks": ["printed-url", "page-served"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-016 宿主逻辑位于 e2e 源码目录，宿主配置由 schema 约束
- **WHEN** 工程检查读取 `packages/e2e/host/`、`packages/e2e/src/` 与 `packages/e2e/host/web.config.json`、`web.config.schema.json`；另在受控临时根中分别：在 `host/` 下放入代理中间件或宿主启动器一类的逻辑模块；让 `web.config.json` 缺少必需属性或含 schema 之外的属性；删除 schema 中某个属性的中文说明；随后恢复合法输入
- **THEN** 代理中间件、宿主启动器、预览数据集装载与 `dev:remote` 配置解析位于 `packages/e2e/src/` 并出现在 `test-tools-unit` 的覆盖率报告中，`host/` 下只有宿主入口页面、入口脚本与配置文件；模板自身的 `web.config.json` 通过 schema 校验，schema 的每个属性都有中文说明；`host/` 下的逻辑模块被报出，不合规的配置使宿主启动失败并指出字段，缺少说明被报出；恢复后通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "logic-in-src": "代理中间件、宿主启动器、预览数据集装载与 dev:remote 配置解析位于 packages/e2e/src/ 并由 test-tools-unit 覆盖，host/ 只放入口页面、入口脚本与配置",
    "config-schema-valid": "web.config.json 由 web.config.schema.json 校验，schema 每个属性有非空中文说明",
    "config-violation-located": "不合规配置使宿主启动失败并指出字段，host/ 下的逻辑模块与缺少说明的属性被报出",
    "host-layout-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "web-config-loader", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["config-schema-valid", "config-violation-located"]},
    {"key": "host-layout-check", "kind": "engineering", "requiredIn": ["integration"], "checks": ["logic-in-src", "config-schema-valid", "config-violation-located", "host-layout-restorable"]}
  ],
  "blockedBy": []
}
```

### Requirement: BRW-03 共用代理中间件与浏览器网络故障

协议宿主、应用宿主与本地预览（BRW-07）MUST 共用同一个代理中间件，把同源请求（应用宿主与本地预览为 `/api`，协议宿主为 `/__shadow/...`）转发到当次 Shadow；各宿主 MUST NOT 自带另一份转发实现。

- **防透明重发**：中间件 SHALL 先向浏览器发出响应头再转发响应体；上游在发出任何响应之前断开时，中间件 MUST 返回状态 `502` 并带 `content-length: 2`，随后立即销毁与浏览器的连接，使浏览器把该响应判定为"响应不完整"，而不是"空响应可重试"。
- 中间件 MUST 保持请求方法、路径、查询串、请求头（含 `X-Request-Id` 与身份头）与请求体不变地转发，并把上游的响应状态、响应头与响应体原样回传。

Chromium 在复用连接被零字节断开时会静默重发 POST，该重发不受 SDK 控制；"不自动重放"只约束 SDK 自身（见 PC-08）。浏览器网络错误因此设两道防线：

- **主防线**：`browser` 项目中模拟网络错误的用例 MUST 使用 Shadow 的 `partial-then-disconnect` 故障（先发部分响应再断开，见 PC-06）；零字节 `disconnect` 只用于 integration 项目。
- **兜底**：即使用例误用零字节 `disconnect`，共用代理中间件也按上述防透明重发写法返回不完整响应，浏览器 MUST NOT 重发该请求。
- **对照证据**：同一请求经过不带防护的普通代理时，Chromium 会重发 POST、Shadow 记到两次请求；该对照 SHALL 作为平台证据保留，用来证明中间件的必要性，防止其被简化掉。

#### Scenario: SCN-BROWSER-PLATFORM-005 代理中间件原样转发并在上游提前断开时返回不完整响应
- **WHEN** 用一个本地上游服务器驱动代理中间件：上游正常返回 200 与 JSON；上游在发出任何字节前销毁连接；上游先发响应头与部分响应体后断开
- **THEN** 正常情况下方法、路径、查询串、请求头与请求体原样到达上游，响应状态、响应头与响应体原样回到客户端；上游提前断开时客户端收到 `502` 与 `content-length: 2`，随后连接被销毁，客户端读取响应体得到"响应不完整"错误；部分响应后断开时客户端同样得到"响应不完整"错误，而不是完整的空响应。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "transparent-forward": "请求方法、路径、查询串、请求头与请求体原样转发，响应原样回传",
    "early-disconnect-502": "上游未响应即断开时返回 502 与 content-length: 2 并立即销毁连接",
    "partial-incomplete": "上游部分响应后断开时客户端得到响应不完整错误"
  },
  "cases": [
    {"key": "proxy-middleware", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["transparent-forward", "early-disconnect-502", "partial-incomplete"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-006 浏览器网络错误的两道防线与对照证据
- **WHEN** 在 `browser` 项目中，协议宿主页面经 OpenAPI 协议包产物在已复用的连接上发送一次引擎测试契约中的 `createTrade` POST，分三种情况：主防线——经共用代理中间件，Shadow 对该请求使用 `partial-then-disconnect`；兜底——经共用代理中间件，Shadow 对该请求误用零字节 `disconnect`；对照——经用例内构造的、不带防透明重发处理的普通转发代理，Shadow 对该请求使用零字节 `disconnect`
- **THEN** 主防线与兜底两种情况下页面都得到网络错误结果，Shadow 记录中该 POST 恰好到达一次；对照情况下 Shadow 记录到同一 POST 两次（Chromium 传输层的透明重发），证明共用代理中间件的防护是必要的。网络错误结果本身的协议义务证据由 OAS-03 承担，本场景只证明到达次数。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "primary-single-arrival": "经共用代理中间件使用 partial-then-disconnect 时，Shadow 只记录到一次该 POST",
    "fallback-single-arrival": "经共用代理中间件误用零字节 disconnect 时，浏览器得到不完整响应而不重发，Shadow 只记录到一次该 POST",
    "unprotected-proxy-resend": "经不带防护的普通代理使用零字节 disconnect 时，Chromium 重发 POST，Shadow 记录到两次"
  },
  "cases": [
    {"key": "browser-network-error-defenses", "kind": "behavior", "requiredIn": ["browser"], "checks": ["primary-single-arrival", "fallback-single-arrival", "unprotected-proxy-resend"]}
  ],
  "blockedBy": []
}
```

### Requirement: BRW-04 dist 新鲜度校验

应用宿主与协议宿主 MUST 在启动前确认被托管的产物由当前源码构建，避免测到旧产物。

- 应用宿主 SHALL 读取构建时写出的模块清单（`artifacts/build/<产品目录>/bundle-manifest.json`）中记录的产品摘要，并按 WEB-09 的产品摘要口径计算当前产品摘要；两者不一致、或模块清单不存在时，宿主 MUST 以非零状态退出并提示先执行构建，不得托管该产物。产品摘要的范围（只修改测试用例、Fixture 或门禁脚本不使产物过期）由 WEB-09 规定并承担证据。
- 协议宿主 SHALL 同样校验协议包产物：比对构建时记录的协议包源码摘要与当前协议包源码摘要，不一致或记录缺失时同样以非零状态退出并提示先构建。

#### Scenario: SCN-BROWSER-PLATFORM-007 产物摘要不一致时宿主拒绝启动
- **WHEN** 产品包与协议包构建完成后分别：不做修改；修改产品包 `src/` 下的一个文件；修改其协议包源码中的一个文件；删除模块清单。每次之后启动应用宿主；另在协议包构建完成后分别不做修改、修改协议包源码中的一个文件，再启动协议宿主
- **THEN** 未修改时两个宿主都正常启动；修改产品源码、修改协议包源码、模块清单缺失三种情况应用宿主以非零状态退出，提示信息说明产物过期或缺失并给出构建命令，且没有启动 `vite preview`；协议包源码变化后协议宿主同样以非零状态退出并提示先构建。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "fresh-accepted": "摘要一致时应用宿主与协议宿主正常启动",
    "source-change-rejected": "产品源码或其协议包源码变化后应用宿主拒绝启动并提示先构建",
    "manifest-missing-rejected": "模块清单缺失时应用宿主拒绝启动",
    "protocol-host-stale-rejected": "协议包源码变化后协议宿主拒绝启动并提示先构建"
  },
  "cases": [
    {"key": "freshness-host-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["fresh-accepted", "source-change-rejected", "manifest-missing-rejected", "protocol-host-stale-rejected"]},
    {"key": "freshness-host-start", "kind": "engineering", "requiredIn": ["integration"], "checks": ["fresh-accepted", "source-change-rejected", "manifest-missing-rejected", "protocol-host-stale-rejected"]}
  ],
  "blockedBy": []
}
```

### Requirement: BRW-05 浏览器用例组织与驱动辅助

浏览器用例 SHALL 按组合绑定组织，并通过驱动与 harness 提供的辅助访问外部资源和等待请求。

- **用例目录**：浏览器用例 MUST 放在 `packages/e2e/tests/<绑定名>/` 下（模板仓库为 `tests/web-openapi-browser/`）；其 `defineCase` 声明的运行环境 MUST 属于该绑定的 `platforms`。
- **占位资源域名**：Fixture 中引用的资源（图片等）使用占位域名；驱动 SHALL 按 `web.config.json` 登记的兑现规则（见 BRW-02）在浏览器上下文中拦截这些域名的请求，并以仓库内的本地资源兑现。被拦截的请求 MUST NOT 离开本机。配置中登记的本地资源不存在时，驱动 MUST 让当前 case 失败并指出缺失的文件。该能力的平台证据 MUST NOT 依赖 Web 应用包或 Web 示例：由协议宿主最小页面的 `<img>` 渲染入口（见 BRW-02）按 Fixture 数据渲染图片，该 Fixture 归 SCN-BROWSER-PLATFORM-008 所有，图片地址使用 `web.config.json` 登记的占位域名，并按 GATE-16 声明其所在绑定的协议包。
- **等待请求**：`waitForCalls`（等待 Shadow 记录达到指定条件，超时即失败并给出已记录的请求）SHALL 由 `packages/e2e/src/harness.ts` 提供，浏览器与小程序用例共用；用例目录下 MUST NOT 再各自实现一份。
- **浏览器已知行为**：`aria-disabled` 不阻止点击、点击会自动滚动、`fill` 产生真实按键事件、scroll anchoring 等浏览器行为 SHALL 写入 `packages/e2e/AGENTS.md` 的浏览器一节，作为用例编写约定，不做机械化检查。

#### Scenario: SCN-BROWSER-PLATFORM-008 占位资源域名由本地资源兑现
- **WHEN** `browser` 项目中位于 `tests/web-openapi-browser/` 的用例启动协议宿主，以 SCN-BROWSER-PLATFORM-008 自有的 Fixture（图片地址使用 `web.config.json` 登记的占位域名）驱动最小页面的 `<img>` 渲染入口；另以配置指向不存在的本地文件运行同一 case；另检查该用例与 Fixture 的导入与引用
- **THEN** 正例中 `<img>` 加载成功（`naturalWidth` 大于 0），内容来自配置的本地资源，没有任何请求发往占位域名对应的外部网络；反例中 case 失败，错误指出缺失的本地资源文件；用例只依赖协议宿主与自有 Fixture，不引用 Web 应用包或 Web 示例的任何文件，删除 Web 示例后该证据仍然成立。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "placeholder-served-locally": "占位域名资源由配置的本地资源兑现，页面加载成功",
    "no-external-request": "被拦截的占位域名请求没有离开本机",
    "missing-local-resource": "配置的本地资源不存在时 case 失败并指出文件",
    "no-example-dependency": "证据来自协议宿主最小页面的 <img> 渲染入口与 SCN-BROWSER-PLATFORM-008 自有的 Fixture，不引用 Web 应用包或 Web 示例"
  },
  "cases": [
    {"key": "placeholder-assets", "kind": "behavior", "requiredIn": ["browser"], "checks": ["placeholder-served-locally", "no-external-request", "missing-local-resource", "no-example-dependency"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-009 waitForCalls 由 harness 统一提供
- **WHEN** 对 harness 的 `waitForCalls` 分别给出：在超时前达到条件的 Shadow 记录序列；直到超时仍未达到条件的记录序列；另由工程检查扫描 `packages/e2e/tests/` 下是否存在同名或等价的自定义实现
- **THEN** 前者在条件满足时立即返回；后者在超时后失败，错误信息列出已记录的请求；浏览器与小程序用例都从 harness 导入 `waitForCalls`，用例目录下不存在另一份实现，反例副本中新增的自定义实现被报出。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "resolves-on-condition": "条件满足时 waitForCalls 立即返回",
    "timeout-reports-records": "超时失败时错误信息列出已记录的请求",
    "single-implementation": "waitForCalls 只由 harness 提供，用例目录下的自定义实现被报出"
  },
  "cases": [
    {"key": "harness-wait-for-calls", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["resolves-on-condition", "timeout-reports-records"]},
    {"key": "harness-single-source", "kind": "engineering", "requiredIn": ["integration"], "checks": ["single-implementation"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-010 浏览器用例目录与已知行为文档
- **WHEN** 工程检查读取清单绑定、`packages/e2e/tests/` 目录与 `packages/e2e/AGENTS.md`；另构造反例副本：在 `tests/sdk-idl-weapp/` 下放一个声明 `browser` 环境的用例、e2e AGENTS 删除浏览器一节
- **THEN** 正例中 `browser` 用例全部位于 `tests/web-openapi-browser/`，e2e AGENTS 的浏览器一节写明 `aria-disabled`、点击自动滚动、`fill` 产生真实按键、scroll anchoring 四项约定；两个反例分别被报出。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "binding-directory": "浏览器用例位于所属绑定目录，环境不属于目录所在绑定时被报出",
    "known-behaviors-documented": "e2e AGENTS 浏览器一节写明四项浏览器已知行为，缺失时被报出"
  },
  "cases": [
    {"key": "browser-case-layout", "kind": "engineering", "requiredIn": ["integration"], "checks": ["binding-directory", "known-behaviors-documented"]}
  ],
  "blockedBy": []
}
```

### Requirement: BRW-06 browser 测试项目与浏览器命令登记

浏览器平台 MUST 作为清单登记的平台测试项目参与门禁与命令组成。

- `project.manifest.json` 的 `testProjects` SHALL 新增 `{ "name": "browser", "class": "platform", "config": "packages/e2e/vitest.config.browser.ts" }`，不声明 `perFile`。
- `requiredCommands` MUST 包含 `test:e2e:browser`、`preview:local` 与 `dev:remote`；根 `package.json` 的 `test:e2e:browser` 由 `run-by-manifest` 按 `browser` 项目组装，`preview:local` 与 `dev:remote` 的行为见 BRW-07、BRW-08。
- 绑定 `web-openapi-browser` 的 `platforms` SHALL 为 `["browser"]`；`browser` 项目只为该绑定（及使用方登记的其他浏览器绑定）的协议义务与用例提供平台证据，不为 `sdk-idl-weapp` 绑定提供证据。

#### Scenario: SCN-BROWSER-PLATFORM-011 browser 项目按清单登记并被命令与门禁识别
- **WHEN** 读取清单并运行 `run-by-manifest` 的命令组装与场景门禁的项目解析；另构造反例副本：删除 `testProjects` 中的 `browser` 项、`requiredCommands` 分别缺少 `test:e2e:browser`、`preview:local` 或 `dev:remote`、`browser` 项的 `class` 改为 `integration`
- **THEN** 正例中 `browser` 为 platform 类项目、配置路径为 `packages/e2e/vitest.config.browser.ts` 且无 `perFile`；`test:e2e:browser` 执行该配置；`requiredCommands` 含 `test:e2e:browser`、`preview:local`、`dev:remote`；`web-openapi-browser` 绑定的 `platforms` 为 `browser`；各反例分别被清单校验或架构检查报出。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "project-registered": "browser 登记为 platform 类测试项目，配置路径正确且无 perFile",
    "command-composed": "test:e2e:browser、preview:local、dev:remote 都在 requiredCommands 中，test:e2e:browser 执行 browser 项目配置",
    "binding-platform": "web-openapi-browser 绑定的 platforms 为 browser",
    "registration-errors": "缺少项目、缺少命令或类别错误时被报出"
  },
  "cases": [
    {"key": "browser-project-manifest", "kind": "engineering", "requiredIn": ["integration"], "checks": ["project-registered", "command-composed", "binding-platform", "registration-errors"]}
  ],
  "blockedBy": []
}
```

### Requirement: BRW-07 本地预览

本地预览 SHALL 让开发者与用户以预览数据集驱动页面，在本机查看页面与指定状态下的 UI；预览只做序列状态，不模拟业务状态。

- **启动命令**：`pnpm preview:local [--dataset <name>]` MUST 启动预览模式的 Shadow（经 `createPreviewShadowServer` 构造，序列状态与数据集匹配规则见 PC-06）、产品包的 Vite dev server（可热更新，不依赖 dist）与 BRW-03 的共用代理中间件（`/api` → Shadow），并打印可访问的本机地址。
- **启动前校验**：启动任何进程之前，启动器 MUST 依次：未指定 `--dataset` 时取 `web.config.json` 登记的默认数据集；指定的数据集不存在时以非零状态退出并列出可用数据集；对所选数据集执行与 `check:fixtures` 相同的契约校验（经数据集 manifest 声明的 `protocol` 对应的协议适配器做严格同形与业务码校验，见 GATE-16），失败即退出并指出数据集、条目与字段路径；数据集引用的占位域名资源在配置中找不到对应本地资源时报错退出并指出资源。
- **预览数据集**：位于 `packages/e2e/tests/fixtures/_datasets/<name>/`，结构为显式数组 `[{ operationId, pathParams?, responses: [{ status?, body }] }]`（见 GATE-16），MUST NOT 使用 `op:后缀` 之类的自造键。
- **数据不可修补**：宿主与预览代码 MUST NOT 修改数据集中的响应。唯一允许的变换是把资源占位域名替换为本地资源地址；该变换 MUST 在校验之后进行，替换规则 SHALL 登记在 `web.config.json`，不在代码中写死。
- **请求记录**：预览模式下未编排与未注册的请求照常记录并在控制台打印，MUST NOT 让预览退出或判为问题。
- **测试隔离**：preview 模式的 Shadow MUST 只能经预览启动器（`packages/e2e/src/preview/`）构造：启动器导入 Shadow 引擎目录 `packages/e2e/src/shadow/` 下独立模块导出的 `createPreviewShadowServer`（该函数不被引擎入口转导出），由依赖规则按模块限定只有该目录可以导入该模块（见 PC-06）；启动器 MUST NOT 经测试模式的构造入口传入 `mode: 'preview'`。用例 MAY 经启动器 API 取得预览证据（如 SCN-BROWSER-PLATFORM-012），但 MUST NOT 以预览模式产生请求次数证据；浏览器用例的请求次数证据始终来自 test 模式。
- `preview:local` MUST 登记在清单 `requiredCommands` 中（见 BRW-06）。

#### Scenario: SCN-BROWSER-PLATFORM-012 预览模式经共用代理把数据集交付给浏览器
- **WHEN** `browser` 项目的用例经预览启动器（`packages/e2e/src/preview/`）的 API，以浏览器平台自带的数据集（基于 OpenAPI 引擎测试契约、manifest 声明 `contractCarrier: "engine"`，不依赖 Web 示例与产品契约）启动预览模式 Shadow 与协议宿主的最小页面，在浏览器中按序多次请求同一接口；切换到另一个平台数据集重复；再请求一个数据集中未登记的接口与一个未注册的路径
- **THEN** 页面收到的响应由所选数据集决定，按序返回、用完后重复最后一条；请求经同源代理到达预览模式 Shadow；未登记与未注册的请求被记录并在控制台打印，预览继续运行、不判错；用例只经启动器取得预览模式 Shadow（启动器经 `createPreviewShadowServer` 构造）、不直接构造，断言只针对页面收到的响应与控制台输出，不以预览模式的请求记录断言请求次数；删除 Web 示例或替换产品契约后该证据仍然成立。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "dataset-drives-ui": "所选数据集决定浏览器收到的响应，切换数据集即可得到不同状态的数据；证据不依赖 Web 示例",
    "sequence-repeat-last": "响应按序返回，用完后重复最后一条",
    "same-origin-proxy": "页面请求经共用代理中间件同源到达预览模式 Shadow",
    "unscripted-logged-only": "未编排与未注册的请求被记录并打印，不导致预览退出或判错",
    "via-launcher-no-count-evidence": "用例经预览启动器 API 取得预览模式 Shadow（启动器经 createPreviewShadowServer 构造）而不直接构造，不以预览模式的请求记录作请求次数证据"
  },
  "cases": [
    {"key": "local-preview-page", "kind": "behavior", "requiredIn": ["browser"], "checks": ["dataset-drives-ui", "sequence-repeat-last", "same-origin-proxy", "unscripted-logged-only", "via-launcher-no-count-evidence"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-013 预览启动前校验数据集、默认数据集与占位资源
- **WHEN** 预览启动器依次以下列输入启动：不传 `--dataset`；传入合法数据集名；数据集中某条响应含契约之外字段；某条响应业务码不属于该接口；数据集使用 `op:后缀` 键而非显式数组；传入不存在的数据集名称；合法数据集引用了配置中有本地资源的占位域名资源；合法数据集引用了配置中找不到本地资源的占位域名资源
- **THEN** 不传 `--dataset` 时加载 `web.config.json` 登记的默认数据集；合法数据集加载成功，交给 Shadow 的响应除登记的占位域名替换外与文件内容一致；三种非法数据集在启动任何进程之前被拒绝，错误指出数据集、条目与字段路径；不存在的名称以非零状态退出并列出可用数据集；占位域名替换发生在校验之后，规则只来自配置；找不到本地资源时启动报错并指出资源。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "default-dataset": "未传 --dataset 时使用 web.config.json 登记的默认数据集",
    "valid-loaded-unchanged": "合法数据集加载后响应除占位域名替换外与文件内容一致",
    "contract-rejected": "契约之外字段、不属于接口的业务码或非显式数组结构在启动任何进程前被拒绝并指出位置",
    "unknown-dataset": "不存在的数据集名称以非零状态退出并列出可用数据集",
    "replace-after-validate": "占位域名替换在校验之后进行，规则来自配置",
    "missing-local-resource": "占位域名资源在配置中找不到本地资源时启动报错并指出资源"
  },
  "cases": [
    {"key": "preview-launcher-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["default-dataset", "valid-loaded-unchanged", "contract-rejected", "unknown-dataset", "replace-after-validate", "missing-local-resource"]}
  ],
  "blockedBy": []
}
```

### Requirement: BRW-08 开发代理与三种模式

测试、本地预览与开发代理 SHALL 是三种互相独立的模式，只在宿主或代理层切换；产品代码 MUST NOT 感知当前模式。

- **开发代理**：`pnpm dev:remote` 启动产品包的 Vite dev server，并把 `web.config.json` 登记的代理前缀列表转发到真实服务端。目标地址 MUST 只从环境变量 `DEV_REMOTE_TARGET` 读取，MUST NOT 有默认值；该变量缺失或为空时命令 MUST 以非零状态退出并说明需要设置 `DEV_REMOTE_TARGET`。目标地址与凭据 MUST NOT 写入代码、配置文件或日志。`dev:remote` MUST 登记在清单 `requiredCommands` 中（见 BRW-06）。
- **模式切换位置**：产品代码统一请求同源 `/api` 或 `VITE_API_BASE`，不出现 Mock、预览或模式分支；三种模式的差异只体现在宿主与代理的配置上。
- **不提供混合模式**：MUST NOT 提供"部分接口走 Shadow、部分接口走真实服务端"的配置或命令。
- **AGENTS 表述**：根 AGENTS 中"Shadow 只服务测试"MUST 改为"Shadow 服务测试与本地预览，均不进入生产产物"，由 `check:bundle` 的测试设施检查兜底（见 WEB-09）。`x-implemented: false` 的接口在开发代理下返回未实现错误、应改用本地预览查看，这一指南说明由 OAS-05 规定并承担证据。

#### Scenario: SCN-BROWSER-PLATFORM-014 开发代理目标只来自环境变量
- **WHEN** 分别在未设置 `DEV_REMOTE_TARGET`、设置为空字符串、设置为一个本地替身服务器地址三种情况下启动开发代理，并对 `web.config.json` 登记的代理前缀与一个未登记前缀各发一次请求
- **THEN** 前两种情况命令以非零状态退出，提示需要设置 `DEV_REMOTE_TARGET`，且未启动 dev server；第三种情况登记前缀下的请求被转发到该地址，未登记前缀的请求不被转发；启动输出与日志中不出现目标地址之外的凭据信息。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "no-default-target": "目标地址只从 DEV_REMOTE_TARGET 读取，缺失或为空时以非零状态退出并提示该变量名",
    "prefix-forwarded": "只有 web.config.json 登记的代理前缀被转发到 DEV_REMOTE_TARGET 指定的目标",
    "no-secret-leak": "启动输出与日志不包含凭据"
  },
  "cases": [
    {"key": "dev-remote-config", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["no-default-target", "prefix-forwarded", "no-secret-leak"]}
  ],
  "blockedBy": []
}
```

#### Scenario: SCN-BROWSER-PLATFORM-015 三种模式只在宿主与代理层切换且无混合模式
- **WHEN** 工程检查读取产品包源码、测试宿主、本地预览与开发代理的配置，以及根 AGENTS；另构造反例副本：产品源码中按模式分支选择请求地址、代理配置中为单个接口指定走真实服务端而其余走 Shadow、根 AGENTS 仍写"Shadow 只服务测试"
- **THEN** 正例中产品源码只请求同源 `/api` 或 `VITE_API_BASE`，不含模式或 Mock 分支；三种模式各自只配置宿主与代理；不存在按接口混合目标的配置项；根 AGENTS 写明"Shadow 服务测试与本地预览，均不进入生产产物"；三个反例分别被报出。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "product-mode-agnostic": "产品源码不含模式或 Mock 分支，只请求同源 /api 或 VITE_API_BASE",
    "no-mixed-mode": "不存在按接口混合 Shadow 与真实服务端的配置，出现时被报出",
    "agents-statement": "根 AGENTS 写明 Shadow 服务测试与本地预览、均不进入生产产物"
  },
  "cases": [
    {"key": "mode-boundary-check", "kind": "engineering", "requiredIn": ["integration"], "checks": ["product-mode-agnostic", "no-mixed-mode", "agents-statement"]}
  ],
  "blockedBy": []
}
```
