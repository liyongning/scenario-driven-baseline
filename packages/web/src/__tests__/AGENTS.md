## 职责

维护 Web 包单测共用的 Scenario 绑定与证据记录辅助。

## 对外入口

`support.ts` 导出 `scenarioTest`，供 `app-unit` 用例登记真实 checkpoint。

## 允许依赖

只依赖 Vitest 测试 API，不依赖产品实现。

## 本地约束

支撑代码只登记证据，不定义业务期望，也不替代用例中的真实断言。

## 子模块

- 无
