/**
 * SDK 公共入口：本模板只导出标记内的示例客户端。
 * 消费接口声明（`consumed-operations.ts`）是包内实现：协议义务派生按清单登记的路径读源码，
 * 用例也按源码读取，不经根入口导出（避免把内部声明固化成公共 API）。
 * 删除模板示例后入口没有公共导出，仍以空导出块保持模块身份：按根入口发现导出集合的门禁与
 * 用例（如 PC-05 的根入口检查）不因示例被删除而失效。
 */
export {};
// template-example:begin
export type * from './example/contracts';
export { createExampleClient, ExampleConfigurationError } from './example/factory';
// template-example:end
