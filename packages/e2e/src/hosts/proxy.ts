import { request as httpRequest } from 'node:http';
import type { RequestHandler, Response } from 'express';

function destroyIncomplete(response: Response): void {
  response.writeHead(502, { 'content-length': '2', connection: 'close' });
  response.flushHeaders();
  response.socket?.end();
}

/** 共用同源代理：透明转发，并把上游提前断开转换成浏览器可识别的不完整响应。 */
export function createSharedProxy(
  options: Readonly<{ target: string; stripPrefix?: string }>,
): RequestHandler {
  const target = new URL(options.target);
  return (request, response) => {
    const original = request.originalUrl;
    const path =
      options.stripPrefix && original.startsWith(options.stripPrefix)
        ? original.slice(options.stripPrefix.length) || '/'
        : original;
    const upstream = httpRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path,
        headers: request.headers,
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
        const abort = () => response.destroy();
        upstreamResponse.once('aborted', abort);
        upstreamResponse.once('error', abort);
        response.once('close', () => upstreamResponse.destroy());
      },
    );
    let responded = false;
    upstream.once('response', () => {
      responded = true;
    });
    upstream.once('error', () => {
      if (!responded && !response.headersSent) destroyIncomplete(response);
      else response.destroy();
    });
    request.pipe(upstream);
    request.once('aborted', () => upstream.destroy());
  };
}
