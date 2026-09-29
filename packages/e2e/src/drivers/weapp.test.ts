import { describe, expect, it, vi } from 'vitest';
import { runWeappFunction } from './weapp.ts';

describe('runWeappFunction', () => {
  it('executes the function registered on the mini-program App instance', async () => {
    const previousGetApp = (globalThis as { getApp?: unknown }).getApp;
    (globalThis as { getApp?: unknown }).getApp = () => ({ runProtocolCase: (args: unknown) => ({ via: 'app', args }) });
    const miniProgram = {
      evaluate: vi.fn(async (callback: (name: string, args: unknown) => unknown, name: string, args: unknown) => callback(name, args)),
      disconnect: vi.fn(),
    };
    try {
      await expect(runWeappFunction({ automator: { launch: async () => miniProgram as never }, projectPath: '/host', functionName: 'runProtocolCase', args: 7 }))
        .resolves.toEqual({ via: 'app', args: 7 });
    } finally {
      (globalThis as { getApp?: unknown }).getApp = previousGetApp;
    }
  });

  it('uses the automator launch/evaluate/close lifecycle as a thin function bridge', async () => {
    const miniProgram = { evaluate: vi.fn(async (_function: unknown, name: string, args: unknown) => ({ name, args })), disconnect: vi.fn() };
    const automator = { launch: vi.fn(async () => miniProgram) };
    const result = await runWeappFunction({ automator, projectPath: '/host', cliPath: '/cli', functionName: 'runProtocolCase', args: { caseKey: 'omitted' } });
    expect(result).toEqual({ name: 'runProtocolCase', args: { caseKey: 'omitted' } });
    expect(automator.launch).toHaveBeenCalledWith({ projectPath: '/host', cliPath: '/cli', trustProject: true });
    expect(miniProgram.disconnect).toHaveBeenCalledOnce();
  });

  it('still closes the tool connection after a host function fails', async () => {
    const miniProgram = { evaluate: vi.fn(async () => { throw new Error('host failed'); }), disconnect: vi.fn() };
    await expect(runWeappFunction({ automator: { launch: async () => miniProgram as never }, projectPath: '/host', functionName: 'run', args: undefined })).rejects.toThrow('host failed');
    expect(miniProgram.disconnect).toHaveBeenCalledOnce();
  });

});
