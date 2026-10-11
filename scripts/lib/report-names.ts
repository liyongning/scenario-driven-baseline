import { basename } from 'node:path';

/** perFile 项目的单文件报告名：文件名去掉测试后缀，保持 `<文件名>.json` 形态。 */
export function reportNameForFile(file: string): string {
  return basename(file).replace(/\.(?:spec|test)\.[cm]?[jt]s$/, '');
}
