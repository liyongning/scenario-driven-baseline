# packages/protocol/testing/idl/AGENTS.md

## 职责

IDL 协议专用的声明解析、义务派生、调用扫描与响应同形校验。

## 对外入口

- `declarations.ts` 解析消费接口声明与业务错误；`fields.ts` 派生字段义务；`response-shape.ts` 提供同形校验；`ast.ts` 提供 IDL 描述解析辅助函数。

## 允许依赖

- 可读取 generated 类型描述与仓库工具类型，不得导入 E2E。
- 测试依赖不得进入生产导入图与 tarball。

## 本地约束

- 动态类型必须报告待定；字段路径、编码与 oneof 规则与 PC-01、PC-04 保持一致。

## 子模块

无
