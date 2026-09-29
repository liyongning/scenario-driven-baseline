import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';
export default mergeConfig(shared, defineProject({ test: { name: 'sdk-unit', include: ['packages/payment-sdk/src/**/*.test.ts', 'packages/payment-sdk/testing/**/*.test.ts'] } }));
