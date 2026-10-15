import { describe, expect, it, vi } from 'vitest';
import { sendShadowStep } from './faults.ts';

function response(socket: { destroy(): void } | null = { destroy: vi.fn() }) {
  const value = {
    socket,
    status: vi.fn(),
    type: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    send: vi.fn(),
    json: vi.fn(),
  };
  value.status.mockReturnValue(value);
  value.type.mockReturnValue(value);
  return value;
}

describe('sendShadowStep', () => {
  it('uses default status/body and default raw content type', async () => {
    const json = response();
    await sendShadowStep(json as never, {});
    expect(json.status).toHaveBeenCalledWith(200);
    expect(json.json).toHaveBeenCalledWith({});

    const raw = response();
    await sendShadowStep(raw as never, { rawBody: '' });
    expect(raw.type).toHaveBeenCalledWith('text/plain');
    expect(raw.send).toHaveBeenCalledWith('');
  });

  it('tolerates a disconnected response without a socket', async () => {
    await expect(
      sendShadowStep(response(null) as never, { disconnect: true }),
    ).resolves.toBeUndefined();
  });

  it('sends a partial JSON response before destroying the socket', async () => {
    const withBody = response();
    withBody.write.mockImplementation((_chunk: string, callback: () => void) => callback());
    await sendShadowStep(withBody as never, {
      body: { state: 'partial' },
      partialThenDisconnect: true,
    });
    expect(withBody.type).toHaveBeenCalledWith('application/json');
    expect(withBody.flushHeaders).toHaveBeenCalledOnce();
    expect(withBody.write).toHaveBeenCalledWith(
      expect.stringMatching(/^\{"state"/),
      expect.any(Function),
    );
    expect(withBody.socket?.destroy).toHaveBeenCalledOnce();

    const missingBody = response(null);
    missingBody.write.mockImplementation((_chunk: string, callback: () => void) => callback());
    await sendShadowStep(missingBody as never, { partialThenDisconnect: true });
    expect(missingBody.write).toHaveBeenCalledWith('{', expect.any(Function));

    const undefinedBody = response(null);
    undefinedBody.write.mockImplementation((_chunk: string, callback: () => void) => callback());
    await sendShadowStep(undefinedBody as never, {
      body: undefined,
      partialThenDisconnect: true,
    });
    expect(undefinedBody.write).toHaveBeenCalledWith('{', expect.any(Function));
  });
});
