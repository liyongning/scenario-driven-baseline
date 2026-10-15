import { expect, test } from 'vitest';
import {
  applicationContext,
  browserApplicationContext,
  resolveGatewayBaseUrl,
} from './url-context';

test('applicationContext reads token and merchant from the page URL query', () => {
  const context = applicationContext('?token=first-token&merchant=42');
  expect(context).toEqual({ token: 'first-token', merchantId: 42 });
  expect(applicationContext('?token=second-token&merchant=7')).toEqual({
    token: 'second-token',
    merchantId: 7,
  });
  expect(browserApplicationContext({ search: '?token=adapter-token&merchant=8' })).toEqual({
    token: 'adapter-token',
    merchantId: 8,
  });
  expect(() => applicationContext('?merchant=8')).toThrow(/token/);
  expect(() => applicationContext('?token=t&merchant=bad')).toThrow(/merchant/);
});

test('resolveGatewayBaseUrl turns a deployment config into a same-origin absolute URL', () => {
  expect(resolveGatewayBaseUrl('/api', 'http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173/api');
  expect(resolveGatewayBaseUrl('https://gateway.example.test/root', 'http://127.0.0.1')).toBe(
    'https://gateway.example.test/root',
  );
  expect(resolveGatewayBaseUrl('', 'http://127.0.0.1:4173')).toBe('http://127.0.0.1:4173');
});
