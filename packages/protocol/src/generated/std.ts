export type JsonCodec<T> = {
  fromJSON(input: any): T;
  toJSON(value: T): unknown;
};

export type HttpMethod = string;

export type MethodMeta<Req, Resp> = {
  name: string;
  requestType: string;
  responseType: string;
  requestCodec?: JsonCodec<Req>;
  responseCodec: JsonCodec<Resp>;
  annotations: { [key: string]: string[] };
  __req?: Req;
  __resp?: Resp;
};

export type RpcMethodMeta<Req, Resp> = MethodMeta<Req, Resp> & {
  method: HttpMethod;
  path: string;
  // Client-side request deadline (ms) from the proto rpc.timeout_ms option.
  // Undefined ⇒ no deadline. RPC infra owns the AbortController; callers never pass one.
  timeoutMs?: number;
};

export type RequestHandler = <Req, Resp>(meta: RpcMethodMeta<Req, Resp>, req: Req) => Promise<Resp>;

export type GeneratedMethod<Req, Resp> = ((req: Req) => Promise<Resp>) & {
  readonly meta: RpcMethodMeta<Req, Resp>;
};

export type GeneratedMethodSpec<Req, Resp> = {
  readonly meta: MethodMeta<Req, Resp>;
};

let globalHandler: RequestHandler | null = null;

export function config(handler: RequestHandler) {
  globalHandler = handler;
}

export function defineMethodSpec<Req, Resp>(meta: MethodMeta<Req, Resp>): GeneratedMethodSpec<Req, Resp> {
  return Object.freeze({ meta });
}

export function createMethod<Req, Resp>(meta: RpcMethodMeta<Req, Resp>): GeneratedMethod<Req, Resp> {
  const methodFunc = async (req: Req): Promise<Resp> => {
    if (!globalHandler) {
      throw new Error(`[idl2] ${meta.name}: transport not configured — \`@narnia/platform\` 模块加载即注册 bridge handler，看到这条说明 platform barrel 没被导入或 wire 没跑成功`);
    }
    return globalHandler(meta, req);
  };
  return Object.assign(methodFunc, { meta });
}
