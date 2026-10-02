import { describe, expect, it } from 'vitest';
import { inspectPackageConsumer } from './package-consumer.ts';

const protocolPackageName = '@daqian/payment-protocol';

describe('inspectPackageConsumer', () => {
  it('accepts exact protocol dependencies and production-only files', () => {
    expect(inspectPackageConsumer({ protocolPackageName, packageJson: { name: '@daqian/payment-sdk', dependencies: { '@daqian/payment-protocol': '0.1.0' } }, files: ['package/dist/index.js', 'package/dist/index.d.ts'] })).toEqual([]);
  });

  it('rejects Shadow leakage and workspace, latest, wildcard, range, or recorded-version mismatch', () => {
    expect(inspectPackageConsumer({ protocolPackageName, packageJson: { name: '@daqian/payment-sdk', dependencies: { '@daqian/payment-protocol': 'workspace:*' } }, files: ['package/testing/shadow/server.js'], expectedProtocolVersion: '0.1.0' })).toEqual([
      'package contains test-only path package/testing/shadow/server.js',
      '@daqian/payment-protocol dependency must be exact, received workspace:*',
      '@daqian/payment-protocol dependency does not match recorded 0.1.0',
    ]);
    for (const version of ['latest', '*', '^0.1.0', '~0.1.0']) {
      expect(inspectPackageConsumer({ protocolPackageName, packageJson: { dependencies: { '@daqian/payment-protocol': version } }, files: [] })).toContain(`@daqian/payment-protocol dependency must be exact, received ${version}`);
    }
    expect(inspectPackageConsumer({ protocolPackageName, packageJson: { name: '@daqian/payment-sdk' }, files: [] })).toContain('@daqian/payment-protocol dependency must be exact, received <missing>');
  });

  it('does not apply SDK dependency rules to the protocol package', () => {
    expect(inspectPackageConsumer({ protocolPackageName, packageJson: { name: '@daqian/payment-protocol' }, files: ['package/dist/index.js'], expectedProtocolVersion: '9.9.9' })).toEqual([]);
  });
});
