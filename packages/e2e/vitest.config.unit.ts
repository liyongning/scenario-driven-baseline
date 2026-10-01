import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';
export default mergeConfig(shared, defineProject({ test: { name: 'test-tools-unit', include: ["scripts/**/*.test.ts", "packages/e2e/src/**/*.test.ts"] } }));
