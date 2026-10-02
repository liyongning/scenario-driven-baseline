export type * from './ports/context';
export type * from './ports/http';
export type * from './transport/errors';
export type * from './client';
import { createWechatMiniappHttp as createWechatMiniappHttpImplementation } from './adapters/network/wechat-miniapp';
export { paymentBusinessErrors, paymentBusinessErrorsIdlCommit, getPaymentBusinessError } from './errors/business-codes';
export type { PaymentBusinessErrorDescriptor } from './errors/business-codes';
export { createProtocolClient } from './client';

/**
 * 创建微信小程序 HTTP 端口，供协议客户端在生产装配时发送请求。
 *
 * @returns 复用既有微信网络适配器的 HttpPort；只有调用 send 时才读取 wx。
 * 工厂本身不处理登录、凭据刷新或请求重放。
 */
export const createWechatMiniappHttp = createWechatMiniappHttpImplementation;
