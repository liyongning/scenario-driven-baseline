import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { checkBundle } from './lib/bundle.ts';

export { checkBundle } from './lib/bundle.ts';

/* v8 ignore start -- 真实 CLI 分支由 SCN-WEB-APP-012～014 执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = checkBundle();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = Math.min(1, result.issues.length);
}
/* v8 ignore stop */
