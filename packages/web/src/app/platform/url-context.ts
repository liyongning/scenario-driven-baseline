/** Web 示例从页面 URL 读取的宿主上下文。 */
export interface ApplicationContext {
  /** 传给协议执行器的身份 token。 */
  readonly token: string;
  /** 交易列表和创建表单使用的商户编号。 */
  readonly merchantId: number;
}

/** 解析 `?token=…&merchant=…`；缺少字段或商户号非法时立即报错。 */
export function applicationContext(search: string): ApplicationContext {
  const params = new URLSearchParams(search);
  const token = params.get('token');
  if (!token) throw new Error('URL query token is required');
  const merchant = params.get('merchant');
  if (!merchant || !/^\d+$/.test(merchant))
    throw new Error('URL query merchant must be a positive integer');
  return { token, merchantId: Number(merchant) };
}

/** 从浏览器 location 读取宿主上下文，产品模块只消费解析后的端口值。 */
export function browserApplicationContext(
  location: Readonly<{ search: string }>,
): ApplicationContext {
  return applicationContext(location.search);
}

/** 把相对网关配置解析为浏览器可用的绝对同源地址。 */
export function resolveGatewayBaseUrl(value: string, origin: string): string {
  return new URL(value || '/', origin).toString().replace(/\/$/, '');
}
