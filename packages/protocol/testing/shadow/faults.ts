import type { Response } from 'express';

export type ShadowStep = Readonly<{
  status?: number;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  delayMs?: number;
  disconnect?: boolean;
}>;

export async function sendShadowStep(response: Response, step: ShadowStep): Promise<void> {
  if (step.delayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, step.delayMs));
  if (step.disconnect) {
    response.socket?.destroy();
    return;
  }
  response.status(step.status ?? 200);
  if (step.rawBody !== undefined) {
    response.type(step.contentType ?? 'text/plain').send(step.rawBody);
    return;
  }
  response.json(Object.prototype.hasOwnProperty.call(step, 'body') ? step.body : {});
}
