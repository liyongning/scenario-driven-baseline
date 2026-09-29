import type { Cancellation } from '../contracts';
export interface RuntimePort {
  nowMs(): number;
  nextAttemptId(): string;
  nextRequestId(): string;
  sleepMs(durationMs: number, cancellation?: Cancellation): Promise<void>;
}
