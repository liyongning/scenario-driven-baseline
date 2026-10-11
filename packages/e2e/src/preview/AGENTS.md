# packages/e2e/src/preview/AGENTS.md

## 职责

本地预览启动器与预览数据集接线。该目录是唯一允许导入 `packages/e2e/src/shadow/preview-server` 的位置。

## 对外入口

- 后续预览启动命令经本目录启动预览 Shadow、宿主与代理；当前仅包含预览构造函数边界单测。

## 允许依赖

- 可以导入 `packages/e2e/src/shadow/preview-server`；不得把预览模式用于请求次数证据，次数证据只来自测试模式。

## 本地约束

- 预览构造入口不进入引擎入口，用例、harness 与其他位置不得直接或经入口转导出绕行。

## 子模块

无
