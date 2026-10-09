/** SDK 公共入口：产品包消费的接口声明，以及标记内的示例客户端。 */
export { consumedOperations } from './consumed-operations';
export type {
  ConsumedMethod,
  ConsumedOperation,
  ConsumedRequestField,
} from './consumed-operations';
// template-example:begin
export type * from './example/contracts';
export { createExampleClient, ExampleConfigurationError } from './example/factory';
// template-example:end
