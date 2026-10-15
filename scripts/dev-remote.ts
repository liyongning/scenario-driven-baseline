import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { startDevRemote } from '../packages/e2e/src/preview/dev-remote.ts';

/* v8 ignore start -- 真实代理启动与进程信号由开发代理命令承担。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  startDevRemote({ root: process.cwd(), env: process.env })
    .then((session) => {
      process.once('SIGINT', () => void session.close());
      process.once('SIGTERM', () => void session.close());
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
/* v8 ignore stop */
