# packages/e2e/src/cases/AGENTS.md

## 职责

把 Spec/verification 的 case 绑定到测试文件，并校验、装载 Fixture 与核对协议结果。

## 对外入口

- `define-case.ts` 导出 `defineCase`；`fixture-loader.ts` 导出 Fixture 校验与装载；`protocol-result.ts` 导出协议结果核对。

## 允许依赖

- 依赖根 `scripts/lib/` 的清单与场景工具以及 Vitest；不绕过 SDK/协议包公共入口读取被测内部实现。

## 本地约束

- 测试期望来自有效 Spec、IDL 与 Design，不从实现、返回值或 Fixture 反推。
- 使用稳定 caseId 与具体检查点绑定；就近维护 `*.test.ts`，纳入四项 100% 覆盖。

## 子模块

无
