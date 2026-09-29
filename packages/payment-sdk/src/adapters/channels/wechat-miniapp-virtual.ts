import type { PaymentError, PortResult } from '../../contracts';
import type { PreparedPayment } from '../../ports/backend';
import type { ChannelAdapter, ChannelInvocation } from '../../ports/channel';
import { createPaymentError } from '../../errors/payment-error';

type VirtualPaymentFailure = Readonly<{ errCode?: unknown; errMsg?: unknown }>;
type VirtualPaymentOptions = Readonly<{
  mode: 'short_series_goods';
  signData: string;
  paySig: string;
  signature: string;
  success: () => void;
  fail: (error: VirtualPaymentFailure) => void;
}>;
type WechatPlatform = Readonly<{
  canIUse?: (capability: string) => unknown;
  requestVirtualPayment?: (options: VirtualPaymentOptions) => void;
}>;

declare const wx: WechatPlatform | undefined;

const method = 'wechat-miniapp-virtual-goods';

function error(
  code: PaymentError['code'], source: PaymentError['source'], originalCode?: string, channelMessage?: string,
): PortResult<never> {
  return { ok: false, error: createPaymentError(code, source, {
    ...(originalCode === undefined ? {} : { originalCode }),
    ...(channelMessage === undefined ? {} : { channelMessage }),
  }) };
}

function signal(value: 'success_hint' | 'cancelled' | 'unknown' | 'launch_failed'): PortResult<ChannelInvocation> {
  return { ok: true, value: { kind: 'signal', signal: value } };
}

function stopped(): PortResult<ChannelInvocation> {
  return { ok: true, value: { kind: 'stopped' } };
}

function readPlatform(): ((options: VirtualPaymentOptions) => void) | undefined {
  try {
    if (typeof wx === 'undefined') return undefined;
    const requestVirtualPayment = wx.requestVirtualPayment;
    if (typeof requestVirtualPayment !== 'function' || typeof wx.canIUse !== 'function') return undefined;
    if (wx.canIUse('requestVirtualPayment') !== true) return undefined;
    return requestVirtualPayment.bind(wx);
  } catch {
    return undefined;
  }
}

function validPayment(payment: PreparedPayment, params: PreparedPayment['payParams'] | undefined): boolean {
  return payment?.method === method
    && params?.kind === 'wechat_virtual'
    && params.mode === 'short_series_goods'
    && typeof params.signData === 'string' && params.signData.length > 0
    && typeof params.paySig === 'string' && params.paySig.length > 0
    && typeof params.signature === 'string' && params.signature.length > 0;
}

function mapFailure(failure: VirtualPaymentFailure): PortResult<ChannelInvocation> {
  const code = failure?.errCode;
  const channelMessage = typeof failure?.errMsg === 'string' ? failure.errMsg : undefined;
  // 微信取消、结果未知与会话失效分别保留语义；errMsg 只作为可选原文透传，不能推断恢复动作。
  if (code === -2) return signal('cancelled');
  if (code === -5) return signal('unknown');
  if (code === -15007) return error('CHANNEL_SESSION_REQUIRED', 'channel', '-15007', channelMessage);
  // 渠道明确拒绝（含官方未文档化码）保留十进制原码；只有无可用数字错误码才回退结果未知。
  if (typeof code === 'number' && Number.isSafeInteger(code) && code !== 0) return error('CHANNEL_ERROR', 'channel', String(code), channelMessage);
  return signal('unknown');
}

/** 首期微信小程序虚拟商品渠道；仅消费已校验的内部四字段模型。 */
export function createWechatMiniappVirtualChannel(): ChannelAdapter {
  return {
    method,
    available: () => readPlatform() !== undefined,
    invoke(payment, context) {
      const requestVirtualPayment = readPlatform();
      const params = payment?.payParams;
      if (!validPayment(payment, params)) return Promise.resolve(error('PROTOCOL_ERROR', 'gateway'));
      if (!requestVirtualPayment) return Promise.resolve(error('UNSUPPORTED', 'sdk'));

      return new Promise(resolve => {
        let settled = false;
        let unsubscribe: (() => void) | undefined = undefined;
        const settle = (result: PortResult<ChannelInvocation>) => {
          if (settled) return;
          settled = true;
          unsubscribe?.();
          resolve(result);
        };
        const options: VirtualPaymentOptions = {
          mode: params.mode,
          signData: params.signData,
          paySig: params.paySig,
          signature: params.signature,
          success: () => settle(signal('success_hint')),
          fail: failure => settle(mapFailure(failure)),
        };

        // 已停止的调用不发阶段通知；订阅只结束本地等待，不调用不存在的渠道 abort。
        if (context.cancellation?.isStopped()) {
          settle(stopped());
          return;
        }
        unsubscribe = context.cancellation?.subscribe(() => settle(stopped()));
        if (settled) {
          unsubscribe?.();
          return;
        }
        if (!context.beforeInvoke()) {
          settle(stopped());
          return;
        }
        // 通知后必须再次检查宿主停止；此时尚未标记，核心仍交付 not_invoked。
        if (context.cancellation?.isStopped()) {
          settle(stopped());
          return;
        }
        if (!context.markInvoked()) {
          settle(stopped());
          return;
        }
        try {
          // markInvoked=true 后紧接已取得的平台方法，中间没有 await、通知或再次停止检查。
          requestVirtualPayment(options);
        } catch {
          // 同步抛错发生在实际调用标记之后，属于渠道调起失败，不能恢复为 not_invoked。
          settle(error('CHANNEL_ERROR', 'channel'));
        }
      });
    },
  };
}
