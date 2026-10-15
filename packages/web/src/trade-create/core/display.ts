import type { Outcome, Trade } from '../../runtime/domain';

/** 创建模块可辨识的展示状态。 */
export type CreateDisplayState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'success'; trade: Trade }>
  | Readonly<{ kind: 'transport-failure' }>
  | Readonly<{ kind: 'failure'; outcome: Exclude<Outcome, 'success'> }>;

/** 把创建状态收窄为页面文案，不使用覆盖率忽略注释。 */
export function createDisplayState(state: CreateDisplayState): string {
  if (state.kind === 'idle') return '等待创建';
  if (state.kind === 'success') return `${state.trade.trade_no} ${state.trade.status}`;
  if (state.kind === 'transport-failure') return '加载失败，请稍后重试';
  if (state.outcome === 'amount-limit-exceeded') return '金额超限';
  if (state.outcome === 'invalid-request') return '请求无效';
  if (state.outcome === 'trade-not-found') return '交易不存在';
  return '交易冲突';
}
