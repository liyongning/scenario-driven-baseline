# template-engineering Specification

## Purpose
工程能力约定三包边界、架构与质量门禁、公共类型注释、统一发布入口与使用指南，使模板可被使用方机械验收。
## Requirements
### Requirement: ENG-01 三包边界与产品交付

工程 SHALL 由产品包、协议包和私有 E2E 包组成。依赖方向只能是产品包依赖协议包，两者都不得依赖 E2E。产品包与协议包 MUST 交付 ESM、CommonJS 双格式及类型声明：协议包根入口提供平台网络工厂；产品包根入口不转导出协议包的网络工厂；产品包打包后对协议包的依赖固定为精确版本，使用方只安装产品包即可运行。测试设施（testing、tests、fixtures、e2e）不得进入任何产品包产物。本要求验证工程边界；产品包的业务导出由其所属能力（例如 `template-example` 的 EX-01）另行验证。

#### Scenario: SCN-TEMPLATE-ENGINEERING-001 产品包与协议包的产物边界与消费
- **WHEN** 打包协议包与产品包，分别在临时的 ESM、CommonJS、TypeScript 消费工程中安装并导入协议包网络工厂；只安装产品包的消费工程安装运行；检查产物清单与源码依赖图
- **THEN** 三种方式都能导入协议包网络工厂；产品包根入口不导出网络工厂；只安装产品包的工程能解析到精确版本的协议包；产物中不包含测试设施；产物与当前源码及依赖图一致。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "protocol-network-export": "协议包根入口的网络工厂可以通过 ESM、CJS、类型声明三种方式消费",
    "sdk-export-boundary": "产品包根入口不转导出协议包网络工厂",
    "dependency-release-contract": "只安装产品包即可解析到精确版本的协议包依赖",
    "production-package-clean": "产品包产物不包含 testing、tests、fixtures、e2e 等测试设施",
    "source-and-graph-current": "产物与当前源码及依赖图一致"
  },
  "cases": [
    {"key": "protocol-network-esm-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "protocol-network-commonjs-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "protocol-network-types-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["protocol-network-export"]},
    {"key": "sdk-does-not-reexport-network", "kind": "engineering", "requiredIn": ["integration"], "checks": ["sdk-export-boundary"]},
    {"key": "sdk-only-consumer", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dependency-release-contract"]},
    {"key": "package-boundaries", "kind": "engineering", "requiredIn": ["integration"], "checks": ["production-package-clean", "source-and-graph-current"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-02 架构与质量门禁

静态、架构、产物与覆盖率等机器门禁 MUST 对可以机械检测的违规非零退出，并指出违规位置。违规包括：缺少必需的 AGENTS 入口；产品代码反向依赖；生产入口夹带 Shadow 等测试设施；场景测试目录越界；lint 或类型违规；存在未被测试导入的手写文件。恢复合法输入后门禁 SHALL 通过。削减门禁规则时必须留有维护者评审记录；机器只校验记录的结构、关联版本与新鲜度，不判断语义。代码托管平台的合并保护不属于本要求。

#### Scenario: SCN-TEMPLATE-ENGINEERING-002 架构与质量门禁缺失或违规
- **WHEN** 分别引入缺少 AGENTS 入口、反向依赖、生产入口夹带 Shadow、场景目录越界、lint 违规、类型违规、未被测试导入的手写文件等违规，或在没有评审记录的情况下削减门禁
- **THEN** 对应的门禁命令逐项非零退出并指出违规；恢复合法输入后门禁通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "machine-gates": "静态、架构、产物和覆盖命令对可机械检测的违规非零退出",
    "boundary-enforcement": "反向依赖、生产夹带 Shadow、场景目录越界和未测手写文件被拒绝",
    "rules-restorable": "恢复合法输入后机器门禁通过",
    "review-record": "规则减项必须有维护者评审记录；机器只校验记录结构、关联版本与新鲜度，不判断语义"
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

### Requirement: ENG-03 公共类型中文注释随双格式声明交付

产品包公共入口导出的手写公共类型、字段和状态值 MUST 在源码中带中文 JSDoc，并且这些注释 SHALL 原样保留在 ESM 与 CommonJS 两套类型声明产物中。检查对象为产品包当前公共入口导出的类型（本模板为示例的公共类型）。缺少注释，或注释在构建中被移除时，检查 SHALL 失败。注释语义是否准确由评审负责，机器只检查结构。

#### Scenario: SCN-TEMPLATE-ENGINEERING-003 公共类型注释随源码与声明交付
- **WHEN** 检查产品包公共入口导出的类型源码与双格式声明产物；另构造一个缺少注释的公共类型作为反例
- **THEN** 正常情况下源码与两套声明中都有对应的中文注释；反例被检查拒绝。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "source-comment-structure": "公共入口导出的类型、字段、状态值在源码中都有中文 JSDoc",
    "dual-declaration-structure": "ESM 与 CJS 两套声明产物都保留这些注释"
  },
  "cases": [
    {"key": "source-and-dual-declarations", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-comment-structure", "dual-declaration-structure"]},
    {"key": "missing-comment-rejected", "kind": "engineering", "requiredIn": ["integration"], "checks": ["source-comment-structure", "dual-declaration-structure"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-04 统一发布入口的预检

发布 SHALL 通过由用户显式触发的统一入口完成。入口只接收一份记录源码修订与各包版本组合的发布记录。发布目标 registry 与 tag 前缀 MUST 来自项目清单的发布设置；清单中的 registry 仍是模板占位值（含 `<PROJECT_ID>`）时，预检 SHALL 拒绝发布，防止复制模板后误发到不相关的项目。预检 MUST 在任何上传之前校验记录与清单、各 workspace 包的版本一致；registry 或 tag 与清单不符、版本漂移或交付组合不合法时拒绝。发布计划 SHALL 按依赖顺序先构建、再发布：先协议包，后产品包。预检与计划生成都不执行本地打包检查，也不读取本地测试 tarball。

#### Scenario: SCN-TEMPLATE-ENGINEERING-004 发布预检与发布顺序
- **WHEN** 分别提供合法的发布记录、版本漂移或交付组合不合法的记录、registry 仍为占位值的清单，并生成发布计划
- **THEN** 合法记录通过预检且不依赖 tarball；不合法的记录被拒绝；registry 为占位值时预检拒绝；发布计划只有一份，按依赖顺序先构建后发布。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "plan-validated": "合法的发布记录通过预检，且预检不依赖本地 tarball",
    "drift-rejected": "版本漂移或交付组合不合法时预检拒绝",
    "placeholder-registry-rejected": "清单 registry 仍为模板占位值时预检拒绝发布",
    "dependency-order-publish": "发布计划只有一份，按依赖顺序先构建后发布"
  },
  "cases": [
    {"key": "preflight-valid-plan", "kind": "engineering", "requiredIn": ["integration"], "checks": ["plan-validated"]},
    {"key": "preflight-rejects-drift", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "preflight-rejects-placeholder", "kind": "engineering", "requiredIn": ["integration"], "checks": ["placeholder-registry-rejected"]},
    {"key": "publish-order", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dependency-order-publish"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-05 项目清单驱动工程门禁

项目形态 MUST 由根目录 `project.manifest.json` 统一登记，格式唯一权威是 `project.manifest.schema.json`，其中每个属性（含嵌套属性）SHALL 带非空中文 `description`。清单登记：各包的目录、包名、角色（product、protocol、test 各一个）、是否私有与允许的目录；必需命令；测试项目及其类别（unit、integration、platform）；参与源码摘要的目录；发布设置。

工程门禁 SHALL 从清单读取上述事实，门禁脚本（`scripts/` 下的非测试文件）MUST NOT 以字面量写死产品包与协议包的目录名和包名、与测试项目类别不同名的测试项目名，以及发布 registry。测试包是门禁赖以运行的测试基础设施（门禁导入它的工具代码、读取它的 Fixture 目录），其固定路径 `packages/e2e/` 不在此限，测试包也不作为可改名的替换点。具体要求：
- 架构检查按清单校验包目录集合、包名、私有标记、协议包不得依赖产品包与测试包、允许目录与必需命令；
- 场景门禁按清单校验 `requiredIn` 只引用已登记的测试项目，`verification.schema.json` 与 `flow.schema.json` 不枚举具体项目名；
- IDL 协议义务的运行环境取自清单：路由、字段与共享方法义务取全部 integration 与 platform 类项目，错误码义务取全部 integration 类项目；
- 源码摘要的输入目录取自清单；
- 包消费检查（含测试包中的包消费工具）与发布脚本按角色从清单取包名。

使用方按清单改名、删除 platform 类项目或删除发布设置后，只需同步清单与相应文件，门禁无需修改即可工作。

#### Scenario: SCN-TEMPLATE-ENGINEERING-005 门禁按项目清单工作
- **WHEN** 在临时副本中分别：按清单把某个包改名并同步目录与 package.json；放入清单未登记的包目录；让 package.json 包名与清单不一致；删除清单要求的命令；让某个 case 的 `requiredIn` 引用清单未登记的测试项目；从清单删除 platform 类项目；检查门禁脚本中是否残留清单登记的名称字面量
- **THEN** 改名后的副本门禁通过；未登记目录、包名不一致、缺少命令、未登记的测试项目被逐项指出并非零退出；删除 platform 类项目后全部协议义务只要求 integration 类环境；门禁脚本中没有清单登记名称的字面量；清单 schema 的每个属性都有中文说明。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "manifest-schema": "清单通过 schema 校验，schema 的每个属性都有非空中文说明",
    "rename-by-manifest": "只按清单与对应文件改名后，架构检查通过，无需修改门禁代码",
    "architecture-violations": "未登记目录、包名不一致、缺少必需命令被逐项指出并非零退出",
    "projects-by-manifest": "requiredIn 只能引用清单登记的测试项目，未登记的项目被指出",
    "obligation-environments": "路由、字段与共享方法义务的运行环境等于清单中全部 integration 与 platform 类项目，错误码义务等于全部 integration 类项目",
    "source-roots-by-manifest": "源码摘要只覆盖清单登记的目录",
    "no-hardcoded-topology": "门禁脚本的非测试文件中不含产品包与协议包的目录名和包名、与类别不同名的测试项目名和 registry 字面量"
  },
  "cases": [
    {"key": "manifest-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["manifest-schema", "projects-by-manifest", "obligation-environments", "source-roots-by-manifest"]},
    {"key": "rename-by-manifest-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["rename-by-manifest"]},
    {"key": "architecture-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["architecture-violations"]},
    {"key": "unregistered-project-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["projects-by-manifest"]},
    {"key": "no-hardcoded-topology", "kind": "engineering", "requiredIn": ["integration"], "checks": ["no-hardcoded-topology"]}
  ],
  "blockedBy": []
}
```

### Requirement: ENG-06 使用指南与替换点地图

模板 MUST 提供使用指南 `docs/template-guide.md`，作为使用方（含 Agent）基于模板演进的入口。指南 SHALL 包含以下章节：能力地图（每项能力的承载文件与验证方式）、从方案到验收的流程、初始化方式（使用方在自己仓库中以第一个 Change 完成删改增，并以同一套门禁验收）、替换点地图。替换点地图 SHALL 覆盖可替换的实现点"协议来源"与"运行平台"，以及可删除模块"包发布"；每项列出涉及的文件、清单中需要修改的项与验收所用门禁。根 AGENTS.md 与 README.md SHALL 链接该指南。架构检查 MUST 校验：指南存在；根 AGENTS.md 与 README.md 都链接它；规定章节齐全；指南中的相对链接都能解析。指南中可机械核对的事实 MUST 与仓库一致：出现的 Scenario ID 都已在有效 Spec 中登记；以行内代码书写的 `pnpm <命令>` 中，非 pnpm 内置命令都存在于根 `package.json` 的 scripts；以行内代码 `manifest.<字段路径>` 引用的清单字段都存在于 `project.manifest.schema.json`。描述是否准确、照着能否完成操作，由评审与指南演练验收负责。

#### Scenario: SCN-TEMPLATE-ENGINEERING-006 使用指南缺失或不完整
- **WHEN** 在临时副本中分别删除指南、删除根 AGENTS.md 或 README.md 中指向指南的链接、删除某个规定章节、在指南中加入无法解析的相对链接、引用未登记的 Scenario ID、引用不存在的 `pnpm` 命令、引用不存在的清单字段
- **THEN** 架构检查逐项指出缺失、断链或不一致的事实并非零退出；恢复后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "guide-present-and-linked": "指南存在，且根 AGENTS.md 与 README.md 都链接它",
    "guide-sections": "指南包含能力地图、从方案到验收、初始化方式、替换点地图（协议来源、运行平台、包发布）全部章节",
    "guide-links-resolve": "指南中的相对链接都能解析",
    "guide-facts-consistent": "指南引用的 Scenario ID 已登记、pnpm 命令存在于根 package.json、清单字段存在于清单 schema",
    "guide-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "guide-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["guide-present-and-linked", "guide-sections", "guide-links-resolve", "guide-facts-consistent"]},
    {"key": "guide-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["guide-present-and-linked", "guide-sections", "guide-links-resolve", "guide-facts-consistent", "guide-restorable"]}
  ],
  "blockedBy": []
}
```

