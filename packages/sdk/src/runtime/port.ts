import type { Cancellation } from '@daqian/template-protocol';

/** 业务核心与适配器共用的运行辅助端口；只暴露时间、请求标识与可取消等待。 */
export interface RuntimePort {
  nowMs(): number;
  nextRequestId(): string;
  sleepMs(durationMs: number, cancellation?: Cancellation): Promise<void>;
}
