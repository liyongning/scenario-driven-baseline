import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { writeProjectConfig } from '../../../../scripts/lib/weapp-project-config.ts';
// template-example:begin
import { exampleConfig } from './vite.config.ts';
// template-example:end

const configFile = new URL('./vite.config.ts', import.meta.url).pathname;
const generated = new URL('./.generated', import.meta.url);

export default async function setup() {
  // 手工 `pnpm test:e2e:weapp`（不经 weapp:prepare）时也要有项目配置：这里由模板补生成一份。
  writeProjectConfig(fileURLToPath(new URL('.', import.meta.url)));
  await build({ configFile });
  // template-example:begin
  await build({ ...exampleConfig, configFile: false });
  // template-example:end
  return async () => {
    await rm(generated, { force: true, recursive: true });
  };
}
