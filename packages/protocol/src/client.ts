import type { RpcMethodMeta } from './generated/std';
import type { CommunicationResult } from './transport/errors';
import type { OperationContext } from './ports/context';
import type { HttpPort, HttpResponse } from './ports/http';
import { createRequestContext, type ProtocolContextOptions } from './transport/context';

/** 按实例固定的网关、凭据读取与通信依赖；不包含支付语义配置。 */
export type ProtocolClientOptions = ProtocolContextOptions &
  Readonly<{
    gatewayBaseUrl: string;
    http: HttpPort;
  }>;
export type DecodedHttpResponse<T> = Readonly<{
  /** generated codec 解码后的协议消息。 */
  data: T;
  /** 本次已解析 JSON，仅供边界/presence 校验，不可输出诊断。 */
  wire: Readonly<Record<string, unknown>>;
  /** 原始 HTTP 上下文用于先判传输状态，不代表业务成功。 */
  http: HttpResponse;
}>;

/** 实例通信接口；仅表示协议解码结果，业务状态由 SDK 判断。 */
export interface ProtocolClient {
  /** 直接消费生成的 metadata 与 codec；请求预算和取消仅属于本次操作。 */
  request<Req, Resp>(
    meta: RpcMethodMeta<Req, Resp>,
    request: Req,
    context: OperationContext,
  ): Promise<CommunicationResult<DecodedHttpResponse<Resp>>>;
}

/** 按实例绑定配置和通信依赖；只执行 metadata/codec，不解释支付或自动重放。 */
export function createProtocolClient(options: ProtocolClientOptions): ProtocolClient {
  const config: ProtocolClientOptions = {
    ...options,
    runtime: { ...options.runtime },
    requestContext: { ...options.requestContext },
  };
  return {
    async request(meta, request, context) {
      const prepared = await createRequestContext(config, context);
      if (!prepared.ok) return prepared;
      let body: string;
      try {
        if (!meta.requestCodec || (meta.method !== 'POST' && meta.method !== 'GET'))
          return { ok: false, error: { code: 'CODEC_ERROR' } };
        // BaseReq 仅由公共上下文填充，不改写调用方对象；optional 字段交给生成 codec。
        body = JSON.stringify(
          meta.requestCodec.toJSON({ ...request, baseReq: prepared.value.baseReq }),
        );
        if (typeof body !== 'string') return { ok: false, error: { code: 'CODEC_ERROR' } };
      } catch {
        return { ok: false, error: { code: 'CODEC_ERROR' } };
      }
      // 同步 codec 也占用本次预算；发送之前再检查停止和剩余时间。
      if (context.cancellation?.isStopped()) return { ok: false, error: { code: 'CANCELLED' } };
      const timeoutMs = context.deadlineAtMs - config.runtime.nowMs();
      if (timeoutMs <= 0) return { ok: false, error: { code: 'TIMEOUT' } };
      let received: CommunicationResult<HttpResponse>;
      try {
        received = await config.http.send({
          url: config.gatewayBaseUrl.replace(/\/+$/, '') + meta.path,
          method: meta.method,
          headers: prepared.value.headers,
          body,
          timeoutMs,
          ...(context.cancellation ? { cancellation: context.cancellation } : {}),
        });
      } catch {
        return { ok: false, error: { code: 'NETWORK_ERROR' } };
      }
      if (!received.ok) return received;
      const http = received.value;
      try {
        const wire: unknown = typeof http.body === 'string' ? JSON.parse(http.body) : http.body;
        if (wire === null || typeof wire !== 'object' || Array.isArray(wire))
          return { ok: false, error: { code: 'CODEC_ERROR', http } };
        // 外部 HTTP JSON 不允许 raw bigint；不把对象直接当作已经解码的协议。
        JSON.stringify(wire);
        const data = meta.responseCodec.fromJSON(wire);
        return { ok: true, value: { data, wire: wire as Readonly<Record<string, unknown>>, http } };
      } catch {
        return { ok: false, error: { code: 'CODEC_ERROR', http } };
      }
    },
  };
}
