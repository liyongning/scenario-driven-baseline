import { rm } from 'node:fs/promises';
import { build } from 'vite';
// template-example:begin
import { exampleConfig } from './vite.config.ts';
// template-example:end

const configFile = new URL('./vite.config.ts', import.meta.url).pathname;
const generated = new URL('./.generated', import.meta.url);

export default async function setup() {
  await build({ configFile });
  // template-example:begin
  await build({ ...exampleConfig, configFile: false });
  // template-example:end
  return async () => {
    await rm(generated, { force: true, recursive: true });
  };
}
