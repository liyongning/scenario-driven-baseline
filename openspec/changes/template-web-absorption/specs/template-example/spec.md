## MODIFIED Requirements

### Requirement: EX-10 示例删除的自动化验收

模板 SHALL 以 SCN-TEMPLATE-ENGINEERING-008 自动证明 ENG-06 的保证：按白名单删除示例后确定性门禁仍然通过。模板同时包含 `template-example` 与 `web-example` 时，这条证据 SHALL 在副本中同时按两份白名单删除两个示例。这条证据只在示例存在时有意义，属于模板自身的维护证据，因此登记在本能力中：它的用例 `packages/e2e/tests/tooling/SCN-TEMPLATE-ENGINEERING-008.spec.ts`、Fixture `packages/e2e/tests/fixtures/SCN-TEMPLATE-ENGINEERING-008/`，以及会创建副本的用例排除列表中的对应条目，MUST 属于 `template-example` 的删除白名单（排除列表条目以 `template-example` 标记包裹），随 `template-example` 一起删除。删除 `template-example` 后的仓库 MUST NOT 残留这条用例或指向它的配置；此后单独删除 `web-example` 没有这条自动化证据，由使用方按指南执行并以完整门禁确认。Scenario ID 沿用原编号。

#### Scenario: SCN-TEMPLATE-ENGINEERING-008 按白名单删除模板示例后门禁仍全绿
- **WHEN** 以当前交付的 Change 为作用域（经 `SCENARIO_GATE_CHANGES` 传入），按 ENG-06 规定的方式构造隔离副本（`git ls-files -co --exclude-standard` 复制、`git init` 并提交、在副本中 `pnpm install --offline --frozen-lockfile`、以副本中固定版本的 OpenSpec CLI 归档作用域内的 active Change、移除其余 active Change、归档后清除 `SCENARIO_GATE_CHANGES`、设置 `TEMPLATE_COPY=1`），再同时按两份白名单删除 `template-example` 与 `web-example` 的全部示例内容（整目录与整文件、全部 `template-example:begin/end` 与 `web-example:begin/end` 标记之间的片段、协议矩阵 Fixture 中的示例键并刷新摘要、`coverageExclusions` 中指向已删除文件的条目），不修改任何门禁代码、门禁配置或其他能力的 Spec，然后在副本内运行 `pnpm check:fast` 与 `pnpm check:scenarios --inventory`（清单模式，只核对格式、绑定、Fixture 与协议义务等静态部分，不要求平台报告）；另在副本中尝试再次创建副本
- **THEN** 副本中 `@daqian/template-sdk` 与 `@daqian/template-web` 的 realpath 位于副本内，不指向原仓库；归档全部成功，没有因本 Change 的 `template-example` 或 `web-example` delta 产生悬空修改；归档后副本内运行环境中不再有 `SCENARIO_GATE_CHANGES`，场景门禁不因"Change 不存在"报错；删除只涉及两份白名单内的内容，OpenAPI 示例契约与应用包、OpenAPI 协议包的骨架保留，空的消费接口声明合法；`check:fast` 退出码为 0，其中 IDL 与 OpenAPI 的协议矩阵用例在消费接口声明为空时都断言按消费接口派生的义务为空并结束；场景门禁清单模式的问题集合恰好等于"副本中不可能产生绑定的用例所对应的缺失绑定或缺失证据"，即被 `TEMPLATE_COPY=1` 排除的会创建副本的用例（从根 `vitest.config.ts` 的排除列表推导），加上 `requiredIn` 中清单 `class` 为 `platform` 的测试项目（含 weapp 与 browser；清单模式不要求平台报告）。该集合由排除列表与清单推导，不手写；多一条或少一条均为失败，除此之外问题数为 0，没有指向已删除示例的悬空 Scenario、FLOW、Fixture、预览数据集或用例绑定，协议义务派生、注释门禁、组件树、产物检查与覆盖率完整性检查不因缺少示例而失败；副本中会创建副本的用例被排除，创建副本的 helper 在 `TEMPLATE_COPY=1` 下拒绝执行。

```json verification
{
  "formatVersion": 2,
  "checkpoints": {
    "copy-construction": "副本由 git ls-files -co --exclude-standard 复制、git init 并提交、在副本中 pnpm install --offline --frozen-lockfile 安装依赖（不链接原仓库 node_modules），副本中 @daqian/template-sdk 与 @daqian/template-web 的 realpath 位于副本内；以副本 node_modules 中精确版本的 OpenSpec CLI 归档作用域内的 active Change、移除其余 active Change，归档后清除 SCENARIO_GATE_CHANGES，再删除示例",
    "whitelist-only-removal": "删除只涉及 template-example 与 web-example 两份白名单内的整目录、整文件、标记片段与对应 coverageExclusions 条目，OpenAPI 示例契约、应用包与 OpenAPI 协议包骨架保留，门禁代码、门禁配置与其他能力的 Spec 不被修改",
    "fast-gates-green": "同时删除两个示例后 check:fast 退出码为 0",
    "empty-declaration-matrix": "消费接口声明为空时 IDL 与 OpenAPI 协议矩阵用例都断言按消费接口派生的义务为空并结束，不因缺少示例路由失败；IDL 业务错误码义务仍存在且由 SCN-PROTOCOL-CONTRACT-003 承担证据",
    "scenario-gate-green": "同时删除两个示例后 check:scenarios --inventory 的问题集合恰好等于由 vitest.config.ts 排除列表推导出的、被 TEMPLATE_COPY 排除用例的缺失绑定或证据，加上由清单 class=platform 测试项目（weapp、browser）派生的缺失绑定，除此之外问题数为 0，没有指向示例的悬空引用；含平台报告的完整 pnpm verify 由复刻验收演练承担",
    "no-recursive-copy": "副本中设置 TEMPLATE_COPY=1，根 vitest.config.ts 排除会创建副本的用例，创建副本的 helper 在该变量已设置时拒绝执行"
  },
  "cases": [
    {"key": "example-removal-fast", "kind": "engineering", "requiredIn": ["integration"], "checks": ["copy-construction", "whitelist-only-removal", "fast-gates-green", "empty-declaration-matrix", "no-recursive-copy"]},
    {"key": "example-removal-scenarios", "kind": "engineering", "requiredIn": ["integration"], "checks": ["copy-construction", "whitelist-only-removal", "scenario-gate-green"]}
  ],
  "blockedBy": []
}
```
