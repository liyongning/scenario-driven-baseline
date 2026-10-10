import { matchesGlob } from 'node:path';
import { projectManifestFile, type ProjectManifest } from './project-manifest.ts';
import type { AffectedSelection } from './affected-types.ts';

const matchesAny = (path: string, patterns: ReadonlyArray<string>): boolean =>
  patterns.some((pattern) => matchesGlob(path, pattern));

/**
 * 全量触发（GATE-13 第 1 条）：命中清单、协议来源、工具配置、构建输入、
 * 平台适配目录、宿主目录或驱动目录时退化为全量 `check:fast`。
 */
export function fullTriggers(
  manifest: ProjectManifest,
  changed: ReadonlyArray<string>,
  testDirectory: string,
): string[] {
  const toolConfig =
    /(^|\/)(?:vitest\.config[^/]*\.ts|vitest\.shared\.ts|\.dependency-cruiser\.cjs|eslint\.config\.js)$/;
  const reasons: string[] = [];
  for (const path of changed) {
    if (path === projectManifestFile) reasons.push(`${path} 是清单文件（全量触发）`);
    else if (matchesAny(path, manifest.fingerprints.protocolInputs))
      reasons.push(`${path} 命中协议来源输入（全量触发）`);
    else if (toolConfig.test(path)) reasons.push(`${path} 是工具配置（全量触发）`);
    else if (matchesAny(path, manifest.fingerprints.buildInputs))
      reasons.push(`${path} 命中构建输入（全量触发）`);
    else if (path.includes('/adapters/network/'))
      reasons.push(`${path} 在平台适配目录（全量触发）`);
    else if (path.startsWith(`${testDirectory}/host/`))
      reasons.push(`${path} 在宿主目录（全量触发）`);
    else if (path.startsWith(`${testDirectory}/src/drivers/`))
      reasons.push(`${path} 在驱动目录（全量触发）`);
  }
  return reasons;
}

/** Fixture 改动：目录名即 owner ID（GATE-13 第 3 条）。 */
export function fixtureSelections(
  changed: ReadonlyArray<string>,
  testDirectory: string,
): AffectedSelection[] {
  const prefix = `${testDirectory}/tests/fixtures/`;
  const selections: AffectedSelection[] = [];
  for (const path of changed) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    const [owner, ...tail] = rest.split('/');
    if (!owner || tail.length === 0 || !/^(?:SCN|FLOW)-/.test(owner)) continue;
    selections.push({ id: owner, reason: `Fixture ${owner} 目录下的文件变化` });
  }
  return selections;
}
