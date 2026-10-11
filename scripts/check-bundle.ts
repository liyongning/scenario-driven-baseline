import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadProjectManifest } from './lib/project-manifest.ts';
import { webAppPackageDirectories } from './lib/web-app-checks.ts';

/** check:bundle 的当前骨架输出；没有 web-app 包时按空检查通过。 */
export function checkBundle(root = process.cwd()) {
  const checked = webAppPackageDirectories(loadProjectManifest(root));
  return { checked, issues: [] as string[] };
}

/* v8 ignore start -- 真实 CLI 分支由受控临时根工程用例执行。 */
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = checkBundle();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = Math.min(1, result.issues.length);
}
/* v8 ignore stop */
