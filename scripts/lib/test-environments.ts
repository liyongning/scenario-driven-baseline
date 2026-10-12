import type { ProjectManifest, TestProjectClass } from './project-manifest.ts';

/** 按类别取去重后的逻辑环境名；物理拆分项目不会重复进入场景义务。 */
export function testEnvironmentsByClass(
  manifest: ProjectManifest,
  classes: ReadonlyArray<TestProjectClass>,
): string[] {
  return [
    ...new Set(
      manifest.testProjects
        .filter((item) => classes.includes(item.class))
        .map((item) => item.environment ?? item.name),
    ),
  ];
}
