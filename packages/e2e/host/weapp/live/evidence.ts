import type { PaymentOutcome, PaymentPhaseEvent, PortResult, TradeSnapshot } from '@daqian/payment-sdk';

export type SafeLiveEvent = Readonly<Record<string, unknown>>;

export function projectTradeCreated(sequence: number, atMs: number, executionId: string, correlationId: string): SafeLiveEvent {
  return { sequence, atMs, executionId, correlationId, kind: 'trade_created' };
}

export function projectPhase(sequence: number, atMs: number, executionId: string, correlationId: string, event: PaymentPhaseEvent): SafeLiveEvent {
  return { sequence, atMs, executionId, correlationId, attemptId: event.attemptId, kind: 'phase', phase: event.phase };
}

export function projectOutcome(sequence: number, atMs: number, executionId: string, correlationId: string, outcome: PaymentOutcome): SafeLiveEvent {
  return {
    sequence, atMs, executionId, correlationId, attemptId: outcome.attemptId, kind: 'outcome', reason: outcome.reason,
    snapshot: { state: outcome.snapshot.state, source: outcome.snapshot.source }, channelSignal: outcome.channelSignal,
    ...(outcome.interruptedPhase ? { interruptedPhase: outcome.interruptedPhase } : {}),
    ...(outcome.error ? { errorCode: outcome.error.code, errorSource: outcome.error.source } : {}),
  };
}

export function projectQuery(sequence: number, atMs: number, executionId: string, correlationId: string, result: PortResult<TradeSnapshot>): SafeLiveEvent {
  return result.ok
    ? { sequence, atMs, executionId, correlationId, kind: 'query', snapshot: { state: result.value.state, source: result.value.source } }
    : { sequence, atMs, executionId, correlationId, kind: 'query_error', errorCode: result.error.code, errorSource: result.error.source };
}

export function exportSafeEvents(events: readonly SafeLiveEvent[]): string {
  return `${JSON.stringify(events)}\n`;
}
