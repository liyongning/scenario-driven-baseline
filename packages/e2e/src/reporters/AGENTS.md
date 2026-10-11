# packages/e2e/src/reporters/AGENTS.md

## 职责

分别收集 unit 与 integration/weapp 报告，汇总为场景门禁可读的格式。

## 对外入口

- `scenario-reporter.ts` 导出 Vitest reporter；按需运行的报告带 `partial` 标记，场景门禁据此拒收。

## 允许依赖

- 依赖 Vitest reporter 类型与根 `scripts/check-scenarios.ts` 的项目类型。

## 本地约束

- 报告携带同次运行、源码/Spec/IDL/实际 Fixture 摘要及项目；module 无外部 Fixture 时明确 `null`，不豁免测试源码 freshness。
- 就近维护 `*.test.ts`，纳入四项 100% 覆盖。

## 子模块

无
