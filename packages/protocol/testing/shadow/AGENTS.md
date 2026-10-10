# packages/protocol/testing/shadow/AGENTS.md

## 职责

测试用的 Shadow 网关引擎：按 Fixture 编排响应与故障，只服务测试，不保存业务场景。

## 对外入口

- `server.ts` 导出 `createShadowServer` 与 `ShadowEnvironmentClass`；`routes.ts`、`idl-routes.ts`、`declared-routes.ts` 提供路由构造与发现；`faults.ts`、`requests.ts` 提供步骤与请求核对。

## 允许依赖

- 引擎不导入 ProtoGen 生成代码（依赖规则 `shadow-engine-no-generated`）；生成描述只出现在 `idl-routes.ts` 与 `example/`。
- 测试依赖不得进入生产导入图与 tarball。

## 本地约束

- 路由来自协议来源：新增业务路由时从该来源发现方法，并经 `createShadowServer({ routes })` 注入；`environmentClass` 只在使用有界轮询时要求。
- 只执行用例提供的步骤与故障，不解释业务场景；请求记录由场景断言逐字段核验，不写死动态请求 ID。

## 子模块

- `example/`：示例协议的路由来源。
