import { cliEvidence } from './scenario-gate-helpers.ts';
import { createEngineeringFormRoot } from './engineering-form-fixture.ts';
import { runEslint, writeAndRestore } from './web-cli-helpers.ts';

const mainPath = 'packages/web-product/src/main.ts';
const appPath = 'packages/web-product/src/app/config.ts';

cliEvidence(
  'SCN-WEB-APP-008',
  'env-lint-cli',
  ['env-whole-in-main', 'env-elsewhere-rejected', 'env-restorable'],
  async (context, check) => {
    const root = createEngineeringFormRoot();
    try {
      await check('env-whole-in-main', () => {
        writeAndRestore(
          `${root.root}/${mainPath}`,
          'export const environment = parseEnvironment(import.meta.env);\n',
          () => {
            const result = runEslint(root, [mainPath]);
            context.expect(result.status, result.output).toBe(0);
          },
        );
      });
      await check('env-elsewhere-rejected', () => {
        writeAndRestore(
          `${root.root}/${mainPath}`,
          'export const environment = import.meta.env.VITE_API_BASE;\n',
          () => {
            const result = runEslint(root, [mainPath]);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('不能读取单个属性');
          },
        );
        writeAndRestore(
          `${root.root}/${appPath}`,
          'export const environment = import.meta.env;\n',
          () => {
            const result = runEslint(root, [appPath]);
            context.expect(result.status, result.output).not.toBe(0);
            context.expect(result.output).toContain('只能出现在 main.ts');
          },
        );
      });
      await check('env-restorable', () => {
        const result = runEslint(root, ['packages/web-product/src/**/*.ts']);
        context.expect(result.status, result.output).toBe(0);
      });
    } finally {
      root.cleanup();
    }
  },
);
