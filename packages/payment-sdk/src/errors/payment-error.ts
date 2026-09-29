import type { PaymentError } from '../contracts';

const defaultMessages = {
  AUTH_REQUIRED: '登录状态已失效，请重新登录',
  IDENTITY_REQUIRED: '缺少微信支付身份，请先完成绑定',
  CHANNEL_SESSION_REQUIRED: '支付会话已失效，请重新发起支付',
  UNSUPPORTED: '当前环境或支付方式不受支持',
  BUSY: '当前交易正在支付中，请勿重复操作',
  INVALID_INPUT: '支付参数无效',
  HOST_CONTEXT_ERROR: '获取支付上下文失败',
  NETWORK_ERROR: '网络请求失败，请稍后重试',
  PROTOCOL_ERROR: '支付响应格式异常',
  CHANNEL_ERROR: '支付渠道调用失败',
  SERVER_ERROR: '支付服务处理失败',
  CONFLICT: '当前支付操作存在冲突',
  TIMEOUT: '支付请求超时，请稍后确认支付结果',
} satisfies Readonly<Record<PaymentError['code'], string>>;

type ErrorDetails = Readonly<Pick<PaymentError, 'originalCode' | 'retryable' | 'channelMessage'>>;

/** 构造公共错误的唯一入口；默认文案只由 code 决定，渠道原文不参与 SDK 判断。 */
export function createPaymentError(
  code: PaymentError['code'],
  source: PaymentError['source'],
  details: Partial<ErrorDetails> = {},
): PaymentError {
  return {
    code,
    source,
    message: defaultMessages[code],
    ...(details.originalCode === undefined ? {} : { originalCode: details.originalCode }),
    ...(details.retryable === undefined ? {} : { retryable: details.retryable }),
    ...(details.channelMessage === undefined ? {} : { channelMessage: details.channelMessage }),
  };
}
