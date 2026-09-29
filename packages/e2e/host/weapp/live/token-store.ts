export const liveTokenStorageKey = 'payment-sdk:live:access-token';

export type TokenStatus = 'configured' | 'not_configured' | 'storage_failed';
export type StoragePort = Readonly<{
  get(key: string): unknown;
  set(key: string, value: string): void;
  remove(key: string): void;
}>;

/** Token 只保存在测试小程序 Storage；状态投影从不暴露片段或长度。 */
export function createTokenStore(storage: StoragePort) {
  let healthy = true;
  const read = (): string | null => {
    if (!healthy) return null;
    try {
      const value = storage.get(liveTokenStorageKey);
      return typeof value === 'string' && value.trim().length > 0 ? value : null;
    } catch { healthy = false; return null; }
  };
  return {
    status(): TokenStatus {
      if (!healthy) return 'storage_failed';
      try {
        const value = storage.get(liveTokenStorageKey);
        return typeof value === 'string' && value.trim().length > 0 ? 'configured' : 'not_configured';
      } catch { healthy = false; return 'storage_failed'; }
    },
    save(value: string): TokenStatus {
      if (typeof value !== 'string' || value.trim().length === 0) return 'not_configured';
      try { storage.set(liveTokenStorageKey, value); healthy = true; return 'configured'; } catch { healthy = false; return 'storage_failed'; }
    },
    clear(): TokenStatus {
      try { storage.remove(liveTokenStorageKey); healthy = true; return 'not_configured'; } catch { healthy = false; return 'storage_failed'; }
    },
    getAccessToken: read,
  };
}

export type TokenStore = ReturnType<typeof createTokenStore>;
