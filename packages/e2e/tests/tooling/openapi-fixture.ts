import { existsSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createControlledRoot, type ControlledRoot } from './controlled-root.ts';

const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const openApiDirectory = 'packages/openapi';

type MutableManifest = {
  packages: Array<Record<string, unknown>>;
  bindings: Array<Record<string, unknown>>;
  testProjects: Array<Record<string, unknown>>;
} & Record<string, unknown>;

export const openApiDeclaration = (requestFields = '{}') =>
  [
    "import { createTrade } from '@daqian/template-openapi/generated/operations';",
    `export const consumedOperations = [{ method: createTrade, requestFields: ${requestFields} }];`,
  ].join('\n');

export const openApiCaller = [
  "import { createTrade } from '@daqian/template-openapi/generated/operations';",
  'declare const client: { request(method: unknown, input: unknown): Promise<unknown> };',
  'export const call = () => client.request(createTrade, {});',
].join('\n');

function sourceFiles(directory: string, prefix: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) Object.assign(files, sourceFiles(path, relative));
    else files[relative] = readFileSync(path, 'utf8');
  }
  return files;
}

export function openApiFixtureRoot(
  options: Readonly<{
    declaration?: string;
    caller?: string | null;
    owner?: string;
    prefix?: string;
  }> = {},
): ControlledRoot {
  const manifest = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'project.manifest.json'), 'utf8'),
  ) as MutableManifest;
  const protocol = manifest.packages.find(
    (item) => item.role === 'protocol' && item.protocolKind === 'openapi',
  );
  const testPackage = manifest.packages.find((item) => item.role === 'test');
  if (!protocol || !testPackage)
    throw new Error('OpenAPI fixture requires protocol and test packages');
  manifest.packages = [
    {
      directory: 'web',
      name: '@fixture/web',
      role: 'product',
      form: 'web-app',
      private: false,
      allowedDirectories: ['src'],
      moduleRoots: ['src'],
      consumedOperations: ['packages/web/src/consumed-operations.ts'],
    },
    protocol,
    testPackage,
  ];
  manifest.bindings = [
    {
      name: 'web-openapi-browser',
      product: 'web',
      protocol: String(protocol.directory),
      platforms: [],
    },
  ];
  manifest.testProjects = manifest.testProjects.filter((item) =>
    ['openapi-unit', 'integration'].includes(String(item.name)),
  );
  const owner = options.owner ?? 'SCN-OPENAPI-CONTRACT-015';
  const files: Record<string, string> = {
    'project.manifest.schema.json': readFileSync(
      resolve(repositoryRoot, 'project.manifest.schema.json'),
      'utf8',
    ),
    'scenario-gate.config.json': JSON.stringify({
      scenarioIdPatterns: ['^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
      flowIdPatterns: ['^FLOW-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]{3}$'],
      ownerIdPattern: '^[A-Z][A-Z0-9-]+$',
    }),
    'openspec/specs/openapi/spec.md': openApiSpec(owner),
    'packages/web/src/consumed-operations.ts': options.declaration ?? openApiDeclaration(),
  };
  if (options.caller !== null)
    files['packages/web/src/caller.ts'] = options.caller ?? openApiCaller;
  Object.assign(
    files,
    sourceFiles(
      resolve(repositoryRoot, openApiDirectory, 'src/generated'),
      `${openApiDirectory}/src/generated`,
    ),
    sourceFiles(
      resolve(repositoryRoot, openApiDirectory, 'testing'),
      `${openApiDirectory}/testing`,
    ),
  );
  files['scripts/lib/protocol-adapters.ts'] = readFileSync(
    resolve(repositoryRoot, 'scripts/lib/protocol-adapters.ts'),
    'utf8',
  );
  files['scripts/lib/project-manifest.ts'] = readFileSync(
    resolve(repositoryRoot, 'scripts/lib/project-manifest.ts'),
    'utf8',
  );
  const root = createControlledRoot({
    manifest,
    files,
    protocolAdapters: false,
    prefix: options.prefix ?? 'openapi-tooling-',
  });
  const modules = join(root.root, 'node_modules');
  if (!existsSync(modules)) symlinkSync(resolve(repositoryRoot, 'node_modules'), modules, 'dir');
  return root;
}

export function openApiSpec(owner: string) {
  return [
    '# OpenAPI fixture',
    '',
    '### Requirement: OAS fixture loading',
    '',
    `#### Scenario: ${owner} fixture`,
    '',
    '- **WHEN** 门禁按协议适配器运行',
    '- **THEN** 使用 OpenAPI 契约',
    '',
    '```json verification',
    JSON.stringify({
      formatVersion: 2,
      checkpoints: { fixture: 'fixture' },
      cases: [
        {
          key: 'fixture',
          kind: 'engineering',
          requiredIn: ['integration'],
          checks: ['fixture'],
        },
      ],
      blockedBy: [],
    }),
    '```',
  ].join('\n');
}
