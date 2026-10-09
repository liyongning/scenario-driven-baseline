import type { Response } from 'express';

export type ShadowStep = Readonly<{
  status?: number;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  delayMs?: number;
  disconnect?: boolean;
  /**
   * 认领一个故意非法的响应体（PC-04）：只有显式声明且 reason 非空时才跳过结构校验，
   * 不存在"不声明即不校验"的路径。
   */
  malformed?: Readonly<{ reason: string }>;
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
