import { createPinia } from 'pinia';
import { createApp } from 'vue';
import AppRoot from './app/AppRoot/AppRoot.vue';
import { deploymentConfig } from './app/deployment-config';
// web-example:begin
import { createFetchHttp, createRestClient } from '@daqian/template-openapi';
import {
  applicationContext,
  browserClock,
  browserVisibility,
  createBrowserCancellation,
  createOpenApiPorts,
  resolveGatewayBaseUrl,
} from './app/platform';
// web-example:end
import { useApplicationStore } from './store';

const config = deploymentConfig(import.meta.env);
// web-example:begin
config.apiBaseUrl = resolveGatewayBaseUrl(config.apiBaseUrl, window.location.origin);
// web-example:end
const apiBaseUrl = config.apiBaseUrl;
// web-example:begin
const context = applicationContext(window.location.search);
const client = createRestClient({
  gatewayBaseUrl: apiBaseUrl,
  http: createFetchHttp(),
  identity: { scheme: 'accessToken', token: context.token },
  securitySchemes: {
    accessToken: { type: 'apiKey', in: 'header', name: 'X-Access-Token' },
  },
});
const ports = createOpenApiPorts(client);
// web-example:end
const app = createApp(
  AppRoot,
  // web-example:begin
  {
    context,
    ...ports,
    runtime: {
      clock: browserClock(),
      visibility: browserVisibility(),
      createCancellation: createBrowserCancellation,
    },
  },
  // web-example:end
);
const pinia = createPinia();

app.use(pinia);
useApplicationStore(pinia).configure(apiBaseUrl);

app.mount('#app');
