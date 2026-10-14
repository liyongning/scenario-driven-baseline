# packages/openapi/testing/engine/AGENTS.md

## 模板通用规则

### 必读

- [OpenAPI 协议包规则](../../AGENTS.md)、[模板使用指南](../../../../docs/template-guide.md)。

## 职责

保存与产品契约分离的 OpenAPI 引擎证据载体。

## 对外入口

`trade-v1.yaml`、`conventions.ts`、`generated/` 与 `contract.bundle.json` 供引擎用例和协议适配器读取。

## 允许依赖

只依赖 OpenAPI 引擎自身的生成件与测试设施，不依赖产品契约、产品数据集或产品入口。

## 本地约束

- 本目录保存与产品契约分离的引擎测试契约、约定模块及其生成物，只服务 `openapi-contract` 的引擎证据。
- `trade-v1.yaml`、`conventions.ts`、`generated/` 与 `contract.bundle.json` 必须保持同步；生成物不得手工编辑。
- 使用方替换 `packages/openapi/contracts/` 下的产品契约时，不得修改本目录；只有删除整条 OpenAPI 绑定时才随协议包删除。
- 本目录的契约与生成物不得被产品入口、产品 Fixture 或产品数据集引用。

## 子模块

- 无
