import type { Cancellation } from './context';
import type { CommunicationResult } from '../transport/errors';
export type HttpRequest = Readonly<{
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs: number;
  cancellation?: Cancellation;
}>;
export type HttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: unknown;
}>;
export interface HttpPort {
  send(request: HttpRequest): Promise<CommunicationResult<HttpResponse>>;
}
