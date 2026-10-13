# packages/e2e/src/preview/AGENTS.md

## 职责

本地预览启动器与预览数据集接线。该目录是唯一允许导入 `packages/e2e/src/shadow/preview-server` 的位置。

## 对外入口

- 预览启动命令经本目录先校验数据集，再启动预览 Shadow、Vite 与共用代理。
- 开发代理经本目录读取 `DEV_REMOTE_TARGET` 与宿主配置后启动产品包的 Vite dev server。

## 允许依赖

- 可以导入 `packages/e2e/src/shadow/preview-server`；不得把预览模式用于请求次数证据，次数证据只来自测试模式。

## 本地约束

- 预览构造入口不进入引擎入口，用例、harness 与其他位置不得直接或经入口转导出绕行。

## 子模块

- `preview-launcher.ts`：数据集加载、占位资源替换、预览 Shadow 与 Vite 宿主接线。
- `dev-remote.ts`：真实服务端开发代理的目标校验与代理接线。
