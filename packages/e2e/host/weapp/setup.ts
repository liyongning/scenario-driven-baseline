import { rm } from 'node:fs/promises';
import { build } from 'vite';
import { exampleConfig } from './vite.config.ts';

const configFile = new URL('./vite.config.ts', import.meta.url).pathname;
const generated = new URL('./.generated', import.meta.url);

export default async function setup() {
  await build({ configFile });
  await build({ ...exampleConfig, configFile: false });
  return async () => {
    await rm(generated, { force: true, recursive: true });
  };
}
