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
  requestContext?: Readonly<{
    /** 产品标识。 */
    productId?: string;
    /** 分流标识。 */
    lane?: string;
    /** 宿主应用版本。 */
    appVersion?: string;
  }>;
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
export type ExampleState =
  /** 尚未到达终态。 */
  | 'pending'
  /** 已成功到达终态。 */
  | 'completed'
  /** 已关闭，不再变化。 */
  | 'closed'
  /** 服务端返回未识别的状态。 */
  | 'unknown';

/** 示例操作错误；不暴露交易协议字段。 */
export type ExampleError = Readonly<{
  /** 稳定错误类别。 */
  category:
    /** 输入不合法。 */
    | 'invalid_input'
    /** 鉴权失败。 */
    | 'unauthorized'
    /** 宿主环境错误。 */
    | 'host'
    /** 网络错误。 */
    | 'network'
    /** 请求超时。 */
    | 'timeout'
    /** 服务端错误。 */
    | 'server'
    /** 协议错误。 */
    | 'protocol';
  /** 面向调用方的稳定中文文案。 */
  message: string;
  /** 服务端错误码的十进制形式。 */
  serverCode?: string;
  /** 错误码目录中的稳定描述。 */
  serverDescription?: string;
}>;

/** 创建结果。 */
export type ExampleCreateResult =
  /** 创建成功。 */
  | Readonly<{
      /** 成功判别值。 */
      ok: true;
      /** 已创建资源引用。 */
      reference: ExampleResourceRef;
    }>
  /** 创建失败。 */
  | Readonly<{
      /** 失败判别值。 */
      ok: false;
      /** 中立错误。 */
      error: ExampleError;
    }>;

/** 单次观察调用的控制项。 */
export type ExampleRunOptions = Readonly<{
  /** 取消信号；触发后停止本地等待。 */
  cancellation?: Cancellation;
  /** 单次调用的时间策略覆盖。 */
  policy?: ExamplePolicyOverrides;
}>;

/** 观察最终结果。 */
export type ExampleOutcome = Readonly<{
  /** 观察结束原因。 */
  end:
    /** 资源已完成。 */
    | 'completed'
    /** 资源已关闭。 */
    | 'closed'
    /** 观察窗口用尽。 */
    | 'window_elapsed'
    /** 观察失败。 */
    | 'failed'
    /** 被调用方取消。 */
    | 'cancelled';
  /** 最后一次可信状态。 */
  lastState: ExampleState;
  /** 失败时的中立错误。 */
  error?: ExampleError;
}>;

/** 示例客户端公共入口。 */
export interface ExampleClient {
  /** 创建资源。 */
  create(input: ExampleCreateInput): Promise<ExampleCreateResult>;
  /** 在有界窗口内观察资源状态。 */
  observe(reference: ExampleResourceRef, options?: ExampleRunOptions): Promise<ExampleOutcome>;
}
