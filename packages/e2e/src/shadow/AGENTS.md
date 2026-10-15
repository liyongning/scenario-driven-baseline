# packages/e2e/src/shadow/AGENTS.md

## 职责

测试用的 Shadow 网关引擎：按 Fixture 编排响应与故障，只服务测试，不保存业务场景。

## 对外入口

- `index.ts` 是引擎入口；`server.ts` 导出测试模式 `createShadowServer` 与 `ShadowEnvironmentClass`，`preview-server.ts` 独立导出预览构造函数且不被入口转导出；`routes.ts`、`faults.ts`、`requests.ts` 提供中立路由、步骤与请求核对。

## 允许依赖

- 非测试引擎文件不得导入任一协议包的 `src/generated/` 或 `testing/`（依赖规则 `shadow-engine-no-generated`）；协议来源转换留在各协议包的 `testing/` 路由构造器中。
- 测试依赖不得进入生产导入图与 tarball。

## 本地约束

- 路由由 E2E 用例从协议 testing 入口取得后经 `createShadowServer({ routes })` 注入；测试模式必须传入 `environmentClass`。预览模式只允许 `packages/e2e/src/preview/` 导入独立构造函数，且不产生请求次数证据。
- 只执行用例提供的步骤与故障，不解释业务场景；请求记录由场景断言逐字段核验，不写死动态请求 ID。

## 子模块

无
