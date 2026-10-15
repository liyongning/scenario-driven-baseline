/** 取消监听器；协议客户端只观察停止状态，不负责撤销业务操作。 */
export type Cancellation = Readonly<{
  /** 当前是否已经停止。 */
  isStopped(): boolean;
  /** 注册停止通知，返回解除订阅函数。 */
  subscribe(listener: () => void): () => void;
}>;

/** 平台无关的 HTTP 请求；方法与请求头由协议客户端生成。 */
export type HttpRequest = Readonly<{
  url: string;
  method: string;
  headers: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs: number;
  cancellation?: Cancellation;
}>;

/** HTTP 端口返回的原始响应；非 2xx 仍是有效响应。 */
export type HttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
}>;

/** HTTP 传输错误码；业务执行器再映射为统一判别联合。 */
export type HttpErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELLED';

/** HTTP 端口结果，不从端口抛异常。 */
export type HttpResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: Readonly<{ code: HttpErrorCode }> }>;

/** 平台网络端口；生产装配只依赖本接口。 */
export interface HttpPort {
  /** 发送一次请求，不自动重放。 */
  send(request: HttpRequest): Promise<HttpResult<HttpResponse>>;
}
