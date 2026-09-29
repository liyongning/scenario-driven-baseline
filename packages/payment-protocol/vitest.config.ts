import { defineProject, mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';
export default mergeConfig(shared, defineProject({ test: { name: 'protocol-unit', include: ['packages/payment-protocol/src/**/*.test.ts', 'packages/payment-protocol/testing/**/*.test.ts'] } }));
