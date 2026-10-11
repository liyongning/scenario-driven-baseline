import type { Cancellation } from '@daqian/template-protocol';

/** 业务核心与适配器共用的运行辅助端口；只暴露时间与可取消等待。 */
export interface RuntimePort {
  nowMs(): number;
  sleepMs(durationMs: number, cancellation?: Cancellation): Promise<void>;
}
