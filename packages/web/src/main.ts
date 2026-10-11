import { createPinia } from 'pinia';
import { createApp } from 'vue';
import AppRoot from './app/AppRoot/AppRoot.vue';
import { deploymentConfig } from './app/deployment-config';
import { useApplicationStore } from './store';

const app = createApp(AppRoot);
const pinia = createPinia();
const config = deploymentConfig(import.meta.env);

app.use(pinia);
useApplicationStore(pinia).configure(config.apiBaseUrl);

app.mount('#app');
