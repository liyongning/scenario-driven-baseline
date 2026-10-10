/**
 * SDK 公共入口：本模板只导出标记内的示例客户端。
 * 消费接口声明（`consumed-operations.ts`）是包内实现：协议义务派生按清单登记的路径读源码，
 * 用例也按源码读取，不经根入口导出（避免把内部声明固化成公共 API）。
 */
// template-example:begin
export type * from './example/contracts';
export { createExampleClient, ExampleConfigurationError } from './example/factory';
// template-example:end
