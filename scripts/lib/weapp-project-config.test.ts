import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  projectConfigFile,
  projectConfigTemplate,
  writeProjectConfig,
} from './weapp-project-config.ts';

test('writeProjectConfig 由受跟踪的模板生成项目配置，并可重复覆盖', () => {
  const root = mkdtempSync(join(tmpdir(), 'weapp-project-config-'));
  try {
    const host = join(root, 'host');
    mkdirSync(host);
    const template = '{\n  "appid": "wxfixture",\n  "miniprogramRoot": "./"\n}\n';
    writeFileSync(join(host, projectConfigTemplate), template);

    const target = writeProjectConfig(host);
    expect(target).toBe(join(host, projectConfigFile));
    expect(readFileSync(target, 'utf8')).toBe(template);

    // 开发者工具改写生成物后，再次生成必须覆盖回模板内容。
    writeFileSync(target, '{"rewritten":true}');
    expect(readFileSync(writeProjectConfig(host), 'utf8')).toBe(template);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
