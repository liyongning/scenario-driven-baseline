import type { Cancellation } from '@daqian/payment-protocol';

/** 示例客户端运行环境；示例只演示微信小程序宿主。 */
export type ExampleRuntime = 'wechat-miniapp';

/** 创建示例客户端所需的中立目录条目。 */
export type ExampleCatalog = Readonly<{
  /** 资源类别。 */
  kind: string;
  /** 资源条目标识。 */
  itemId: string;
  /** 资源条目名称。 */
  itemName: string;
  /** 单位值，使用整数避免金额精度丢失。 */
  unitValue: bigint;
}>;

/** 示例客户端的时间策略覆盖。 */
export type ExamplePolicyOverrides = Readonly<{
  /** 单次请求的最大等待时间（毫秒）。 */
  requestTimeoutMs?: number;
  /** 两次观察请求之间的等待时间（毫秒）。 */
  intervalMs?: number;
  /** 观察窗口总时长（毫秒）。 */
  windowMs?: number;
}>;

/** 示例客户端初始化配置。 */
export type ExampleClientOptions = Readonly<{
  /** 宿主运行时。 */
  runtime: ExampleRuntime;
  /** 网关地址，由宿主显式提供。 */
  gatewayBaseUrl: string;
  /** 每次请求前读取访问令牌。 */
  getAccessToken: () => string | null | Promise<string | null>;
  /** 创建资源所需的目录条目。 */
  catalog: ExampleCatalog;
  /** 协议层公共请求上下文。 */
  requestContext?: Readonly<{ productId?: string; lane?: string; appVersion?: string }>;
  /** 初始化级时间策略覆盖。 */
  policy?: ExamplePolicyOverrides;
}>;

/** 创建资源的中立输入。 */
export type ExampleCreateInput = Readonly<{
  /** 资源所有者的十进制 int64 标识。 */
  ownerId: string;
  /** 宿主侧幂等引用。 */
  externalRef: string;
  /** 创建数量，范围为 1 到 999。 */
  units: number;
}>;

/** 已创建资源的中立引用。 */
export type ExampleResourceRef = Readonly<{
  /** 服务端资源标识。 */
  id: string;
  /** 创建时的宿主侧引用。 */
  externalRef: string;
}>;

/** 资源观察状态；未知值按未到终态处理。 */
export type ExampleState = 'pending' | 'completed' | 'closed' | 'unknown';

/** 示例操作错误；不暴露交易协议字段。 */
export type ExampleError = Readonly<{
  /** 稳定错误类别。 */
  category: 'invalid_input' | 'unauthorized' | 'host' | 'network' | 'timeout' | 'server' | 'protocol';
  /** 面向调用方的稳定中文文案。 */
  message: string;
  /** 服务端错误码的十进制形式。 */
  serverCode?: string;
  /** 错误码目录中的稳定描述。 */
  serverDescription?: string;
}>;

/** 创建结果。 */
export type ExampleCreateResult =
  | Readonly<{ ok: true; reference: ExampleResourceRef }>
  | Readonly<{ ok: false; error: ExampleError }>;

/** 单次观察调用的控制项。 */
export type ExampleRunOptions = Readonly<{
  cancellation?: Cancellation;
  policy?: ExamplePolicyOverrides;
}>;

/** 观察最终结果。 */
export type ExampleOutcome = Readonly<{
  /** 观察结束原因。 */
  end: 'completed' | 'closed' | 'window_elapsed' | 'failed' | 'cancelled';
  /** 最后一次可信状态。 */
  lastState: ExampleState;
  /** 失败时的中立错误。 */
  error?: ExampleError;
}>;

/** 示例客户端公共入口。 */
export interface ExampleClient {
  create(input: ExampleCreateInput): Promise<ExampleCreateResult>;
  observe(reference: ExampleResourceRef, options?: ExampleRunOptions): Promise<ExampleOutcome>;
}
