# packages/sdk/src/example/AGENTS.md

## 职责

演示 SDK 的分层装配：工厂校验配置，核心编排流程，端口定义边界，适配器映射协议。它是可整体删除的模板示例。

## 对外入口

- `factory.ts` 导出 `createExampleClient` 与 `ExampleConfigurationError`；`contracts.ts` 导出示例公共类型，两者由 `src/index.ts` 在示例标记内转发。
- `core/`、`ports/`、`adapters/` 只被本模块与测试导入，不进入产品包其他导出。

## 允许依赖

- 依赖协议包公开入口（`@daqian/template-protocol`）与生成的 IDL 类型；`adapters/` 是本模块唯一接触 generated 的位置。
- 核心与端口不依赖平台全局（wx/DOM/Node）与 Node 内置模块；时间与等待经 `../runtime/` 端口注入。

## 本地约束

- 分层固定为 `core/` 编排 `ports/`、`ports/` 定义边界、`adapters/` 做协议映射；各层不互相越位。
- 每个手写文件就近维护 `*.test.ts`，module case 用 Vitest meta 绑定检查点，不新增 SDK 公共测试导出。

## 子模块

- `core/`：示例核心编排与默认策略。
- `ports/`：示例内部端口与中性结果类型。
- `adapters/`：调用协议包 client 的生产适配。
