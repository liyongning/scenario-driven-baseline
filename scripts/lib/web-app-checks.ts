import { packagesByRole, type ProjectManifest } from './project-manifest.ts';

/** `web-app` 形态包的产物检查骨架；具体规则由 Web 产物边界任务补齐。 */
export function webAppPackageDirectories(manifest: ProjectManifest): string[] {
  return packagesByRole(manifest, 'product')
    .filter((pkg) => pkg.form === 'web-app')
    .map((pkg) => `packages/${pkg.directory}`);
}
