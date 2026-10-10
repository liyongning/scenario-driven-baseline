import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 受 git 跟踪的模板文件名：开发者工具会改写生成物，只有模板能进源码摘要。 */
export const projectConfigTemplate = 'project.config.template.json';

/** 由模板生成的开发者工具项目配置；被 `.gitignore` 忽略，不参与源码摘要。 */
export const projectConfigFile = 'project.config.json';

/**
 * 由模板生成开发者工具项目配置（幂等）。
 *
 * 开发者工具打开项目时会改写 `project.config.json`（实测会删掉末尾换行），
 * 该文件若受 git 跟踪就会进入源码摘要：一次完整验收跑完，自己产出的报告就过期了。
 * 因此仓库只跟踪模板，生成物交给 `pnpm weapp:prepare` 与 weapp 的 Vitest globalSetup。
 *
 * @param hostDirectory 小程序宿主项目目录（含模板文件）。
 * @returns 生成的项目配置文件的绝对路径。
 */
export function writeProjectConfig(hostDirectory: string): string {
  const target = join(hostDirectory, projectConfigFile);
  writeFileSync(target, readFileSync(join(hostDirectory, projectConfigTemplate)));
  return target;
}
