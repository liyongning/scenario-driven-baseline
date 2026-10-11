// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { deploymentConfig } from './deployment-config';

describe('deploymentConfig', () => {
  it('uses the deployment value when present', () => {
    expect(deploymentConfig({ VITE_API_BASE_URL: 'https://api.example.test' })).toEqual({
      apiBaseUrl: 'https://api.example.test',
    });
  });

  it('uses the same-origin fallback when absent or empty', () => {
    expect(deploymentConfig({})).toEqual({ apiBaseUrl: '/api' });
    expect(deploymentConfig({ VITE_API_BASE_URL: '' })).toEqual({ apiBaseUrl: '/api' });
  });
});
