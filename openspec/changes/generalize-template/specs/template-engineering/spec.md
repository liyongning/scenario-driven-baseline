## ADDED Requirements

### Requirement: ENG-05 项目清单驱动工程门禁

项目形态 MUST 由根目录 `project.manifest.json` 统一登记，格式唯一权威是 `project.manifest.schema.json`，其中每个属性（含嵌套属性）SHALL 带非空中文 `description`。清单登记：各包的目录、包名、角色（product、protocol、test 各一个）、是否私有与允许的目录；必需命令；测试项目及其类别（unit、integration、platform）；参与源码摘要的目录；发布设置。

工程门禁 SHALL 从清单读取上述事实，门禁脚本（`scripts/` 下的非测试文件）MUST NOT 以字面量写死清单登记的包目录名、包名、测试项目名（与测试项目类别同名者除外，类别名是门禁概念）或发布 registry。具体要求：
- 架构检查按清单校验包目录集合、包名、私有标记、协议包不得依赖产品包与测试包、允许目录与必需命令；
- 场景门禁按清单校验 `requiredIn` 只引用已登记的测试项目，`verification.schema.json` 与 `flow.schema.json` 不枚举具体项目名；
- IDL 协议义务的运行环境取清单中全部 integration 与 platform 类项目；
- 源码摘要的输入目录取自清单；
- 包消费检查与发布脚本按角色从清单取包名。

使用方按清单改名、删除 platform 类项目或删除发布设置后，只需同步清单与相应文件，门禁无需修改即可工作。

#### Scenario: SCN-TEMPLATE-ENGINEERING-005 门禁按项目清单工作
- **WHEN** 在临时副本中分别：按清单把某个包改名并同步目录与 package.json；放入清单未登记的包目录；让 package.json 包名与清单不一致；删除清单要求的命令；让某个 case 的 `requiredIn` 引用清单未登记的测试项目；从清单删除 platform 类项目；检查门禁脚本中是否残留清单登记的名称字面量
- **THEN** 改名后的副本门禁通过；未登记目录、包名不一致、缺少命令、未登记的测试项目被逐项指出并非零退出；删除 platform 类项目后协议义务只要求 integration 类环境；门禁脚本中没有清单登记名称的字面量；清单 schema 的每个属性都有中文说明。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "manifest-schema": "清单通过 schema 校验，schema 的每个属性都有非空中文说明",
    "rename-by-manifest": "只按清单与对应文件改名后，架构检查通过，无需修改门禁代码",
    "architecture-violations": "未登记目录、包名不一致、缺少必需命令被逐项指出并非零退出",
    "projects-by-manifest": "requiredIn 只能引用清单登记的测试项目，未登记的项目被指出",
    "obligation-environments": "协议义务的运行环境等于清单中 integration 与 platform 类项目",
    "source-roots-by-manifest": "源码摘要只覆盖清单登记的目录",
    "no-hardcoded-topology": "门禁脚本的非测试文件中不含清单登记的包目录名、包名、与类别不同名的测试项目名和 registry 字面量"
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

模板 MUST 提供使用指南 `docs/template-guide.md`，作为使用方（含 Agent）基于模板演进的入口。指南 SHALL 包含以下章节：能力地图（每项能力的承载文件与验证方式）、从方案到验收的流程、初始化方式（使用方在自己仓库中以第一个 Change 完成删改增，并以同一套门禁验收）、替换点地图。替换点地图 SHALL 覆盖可替换的实现点"协议来源"与"运行平台"，以及可删除模块"包发布"；每项列出涉及的文件、清单中需要修改的项与验收所用门禁。根 AGENTS.md 与 README.md SHALL 链接该指南。架构检查 MUST 校验：指南存在；根 AGENTS.md 与 README.md 都链接它；规定章节齐全；指南中的相对链接都能解析。章节内容是否准确由评审负责。

#### Scenario: SCN-TEMPLATE-ENGINEERING-006 使用指南缺失或不完整
- **WHEN** 在临时副本中分别删除指南、删除根 AGENTS.md 或 README.md 中指向指南的链接、删除某个规定章节、在指南中加入无法解析的相对链接
- **THEN** 架构检查逐项指出缺失或断链并非零退出；恢复后检查通过。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "guide-present-and-linked": "指南存在，且根 AGENTS.md 与 README.md 都链接它",
    "guide-sections": "指南包含能力地图、从方案到验收、初始化方式、替换点地图（协议来源、运行平台、包发布）全部章节",
    "guide-links-resolve": "指南中的相对链接都能解析",
    "guide-restorable": "恢复合法输入后检查通过"
  },
  "cases": [
    {"key": "guide-rules", "kind": "module", "requiredIn": ["test-tools-unit"], "checks": ["guide-present-and-linked", "guide-sections", "guide-links-resolve"]},
    {"key": "guide-violations-cli", "kind": "engineering", "requiredIn": ["integration"], "checks": ["guide-present-and-linked", "guide-sections", "guide-links-resolve", "guide-restorable"]}
  ],
  "blockedBy": []
}
```

## MODIFIED Requirements

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
