## ADDED Requirements

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

发布 SHALL 通过由用户显式触发的统一入口完成。入口只接收一份记录源码修订与各包版本组合的发布记录。预检 MUST 在任何上传之前校验记录与各 workspace 包的版本一致；版本漂移或交付组合不合法时拒绝。发布计划 SHALL 按依赖顺序先构建、再发布：先协议包，后产品包。预检与计划生成都不执行本地打包检查，也不读取本地测试 tarball。

#### Scenario: SCN-TEMPLATE-ENGINEERING-004 发布预检与发布顺序
- **WHEN** 分别提供合法的发布记录、版本漂移或交付组合不合法的记录，并生成发布计划
- **THEN** 合法记录通过预检且不依赖 tarball；不合法的记录被拒绝；发布计划只有一份，按依赖顺序先构建后发布。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "plan-validated": "合法的发布记录通过预检，且预检不依赖本地 tarball",
    "drift-rejected": "版本漂移或交付组合不合法时预检拒绝",
    "dependency-order-publish": "发布计划只有一份，按依赖顺序先构建后发布"
  },
  "cases": [
    {"key": "preflight-valid-plan", "kind": "engineering", "requiredIn": ["integration"], "checks": ["plan-validated"]},
    {"key": "preflight-rejects-drift", "kind": "engineering", "requiredIn": ["integration"], "checks": ["drift-rejected"]},
    {"key": "publish-order", "kind": "engineering", "requiredIn": ["integration"], "checks": ["dependency-order-publish"]}
  ],
  "blockedBy": []
}
```
