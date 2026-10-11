// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useApplicationStore } from './index';

describe('application store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('updates configured state only through its action', () => {
    const applicationStore = useApplicationStore();
    expect(applicationStore.configured).toBe(false);
    applicationStore.configure('https://api.example.test');
    expect(applicationStore.configured).toBe(true);
  });
});
