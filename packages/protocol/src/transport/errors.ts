import type { HttpResponse } from '../ports/http';
export type CommunicationError = Readonly<{
  code: 'EMPTY_ACCESS_TOKEN' | 'HOST_CONTEXT_ERROR' | 'NETWORK_ERROR'
    | 'TIMEOUT' | 'CANCELLED' | 'CODEC_ERROR';
  originalCode?: string;
  http?: HttpResponse;
}>;
export type CommunicationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: CommunicationError }>;
