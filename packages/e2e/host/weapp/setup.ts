import { rm } from 'node:fs/promises';
import { build } from 'vite';

const configFile = new URL('./vite.config.ts', import.meta.url).pathname;
const generated = new URL('./.generated', import.meta.url);

export default async function setup() {
  await build({ configFile });
  return async () => { await rm(generated, { force: true, recursive: true }); };
}
