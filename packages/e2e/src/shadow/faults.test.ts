import { describe, expect, it, vi } from 'vitest';
import { sendShadowStep } from './faults.ts';

function response(socket: { destroy(): void } | null = { destroy: vi.fn() }) {
  const value = {
    socket,
    status: vi.fn(),
    type: vi.fn(),
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
});
