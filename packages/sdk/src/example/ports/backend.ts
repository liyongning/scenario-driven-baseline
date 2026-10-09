import type { Cancellation, OperationContext, ProtocolClient } from '@daqian/template-protocol';
import type {
  ExampleCreateInput,
  ExampleError,
  ExampleResourceRef,
  ExampleState,
} from '../contracts';

/** 示例客户端使用的内部运行时端口。 */
export type ExampleRuntimePort = Readonly<{
  nowMs(): number;
  sleepMs(durationMs: number, cancellation?: Cancellation): Promise<void>;
}>;

/** 示例端口的中性创建结果。 */
export type ExampleCreated = Readonly<{ reference: ExampleResourceRef }>;

/** 示例端口的中性查询结果。 */
export type ExampleObserved = Readonly<{ reference: ExampleResourceRef; state: ExampleState }>;

/** 示例端口错误；retryable 只供核心决定是否继续观察。 */
export type ExampleBackendFailure =
  | Readonly<{
      ok: false;
      error: ExampleError;
      retryable?: boolean;
    }>
  | Readonly<{
      ok: false;
      cancelled: true;
      retryable?: false;
    }>;

export type ExampleBackendResult<T> = Readonly<{ ok: true; value: T }> | ExampleBackendFailure;

/** 示例核心与交易适配器之间的唯一端口。 */
export interface ExampleBackend {
  create(
    input: ExampleCreateInput,
    context: OperationContext,
  ): Promise<ExampleBackendResult<ExampleCreated>>;
  query(
    reference: ExampleResourceRef,
    context: OperationContext,
  ): Promise<ExampleBackendResult<ExampleObserved>>;
}

/** 创建交易适配器的输入依赖。 */
export type ExampleTradeBackendOptions = Readonly<{
  protocol: ProtocolClient;
  catalog: Readonly<{ kind: string; itemId: string; itemName: string; unitValue: bigint }>;
}>;
