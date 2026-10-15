import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { useApplicationStore } from '../../store';
import AppRoot from './AppRoot.vue';

describe('AppRoot', () => {
  it('shows the unconfigured state before deployment configuration', () => {
    setActivePinia(createPinia());
    const wrapper = mount(AppRoot);
    expect(wrapper.get('[data-testid="app-root"]').text()).toContain('应用未配置');
  });

  it('shows the configured state after the store receives an API base URL', () => {
    setActivePinia(createPinia());
    useApplicationStore().configure('https://api.example.test');
    const wrapper = mount(AppRoot);
    expect(wrapper.get('[data-testid="app-root"]').text()).toContain('应用已配置');
  });
});
