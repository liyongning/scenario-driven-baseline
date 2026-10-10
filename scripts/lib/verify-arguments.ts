import { changeScopeHelp, parseChangeArguments } from './spec-sources.ts';
import type { VerifyOptions } from '../verify.ts';

/** `pnpm verify` 的命令帮助。 */
export const verifyHelp = [
  'verify 依次执行 check:fast、platform 项目的 test:e2e:<name> 与 check:scenarios。',
  '用法：pnpm verify [--run-id <id>] [--from <command>] [--change <name>[,<name>]] [--help]',
  '  --run-id <id>  指定 run id；缺省为 <分支名>-<YYYYMMDDTHHmmssZ>，分支名的 / 替换为 -。',
  '  --from <命令>  从该步骤续跑，跳过此前步骤并复用 run id：check:fast、test:e2e:<平台项目名>、check:scenarios。',
  changeScopeHelp,
].join('\n');

export type ParsedVerifyArguments = Readonly<{
  options: VerifyOptions;
  issues: ReadonlyArray<string>;
  help: boolean;
}>;

/** 解析 CLI 参数；未识别的参数与缺值都记入 issues，由调用方决定退出码。 */
export function parseVerifyArguments(argv: ReadonlyArray<string>): ParsedVerifyArguments {
  const issues: string[] = [];
  let runId: string | undefined;
  let from: string | undefined;
  let help = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }
    if (argument === '--run-id' || argument === '--from') {
      const value = argv[index + 1];
      index += 1;
      if (value === undefined || value === '' || value.startsWith('-')) {
        issues.push(`${argument} 需要取值`);
        continue;
      }
      if (argument === '--run-id') runId = value;
      else from = value;
      continue;
    }
    if (argument === '--change') {
      index += 1;
      continue;
    }
    issues.push(`未知参数 ${argument}`);
  }
  const changes = parseChangeArguments(argv);
  issues.push(...changes.issues);
  return {
    help,
    issues,
    options: {
      ...(runId === undefined ? {} : { runId }),
      ...(from === undefined ? {} : { from }),
      ...(changes.specified ? { changes: [...new Set(changes.names)] } : {}),
    },
  };
}
