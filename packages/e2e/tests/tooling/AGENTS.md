# packages/e2e/tests/tooling/AGENTS.md

## 职责

通过真实 CLI 验证各门禁的正向通过与反例拦截，并维护受控临时根与仓库副本等共享夹具。

## 对外入口

- `SCN-*.spec.ts` 即用例；`helpers.ts`、`scenario-gate-helpers.ts`、`controlled-root.ts`、`repository-copy.ts` 等提供受控根、清单副本与来源镜像。

## 允许依赖

- 依赖根 `scripts/` 的 CLI 与 `packages/e2e/src/` 的工具；受控工具输入不得冒充被测 SDK 的运行证据。

## 本地约束

- 反例在受控临时根中构造，恢复合法输入后必须通过；断言错误信息时指出具体文件或字段。
- 门禁自测的临时根与仓库隔离，不读取仓库实时状态冒充受控输入。

## 子模块

无
