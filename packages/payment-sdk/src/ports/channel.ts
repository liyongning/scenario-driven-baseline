import type { Cancellation, ChannelSignal, PaymentAction, PortResult } from '../contracts';
import type { PreparedPayment } from './backend';
export type ChannelContext = Readonly<{
  attemptId: string;
  cancellation?: Cancellation;
  /** 核心同步通知点：适配器校验通过后调用；false 表示已停止，禁止实际平台调用。 */
  beforeInvoke: () => boolean;
  /** 紧邻实际平台调用前同步登记；true 仅返回一次，false 时禁止调用。不是业务阶段通知。 */
  markInvoked: () => boolean;
}>;
export type ChannelInvocation =
  | Readonly<{ kind: 'signal'; signal: ChannelSignal }>
  | Readonly<{ kind: 'action'; action: PaymentAction }>
  | Readonly<{ kind: 'stopped' }>; // 本地停止，不是渠道取消或渠道 abort
export interface ChannelAdapter {
  readonly method: string;
  available(): boolean;
  invoke(payment: PreparedPayment, context: ChannelContext): Promise<PortResult<ChannelInvocation>>;
}
