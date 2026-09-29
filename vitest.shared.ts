import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineProject({root,resolve:{alias:[
  {find:/^@daqian\/payment-protocol$/,replacement:fileURLToPath(new URL('./packages/payment-protocol/src/index.ts',import.meta.url))},
  {find:/^@daqian\/payment-protocol\/generated\/(.*)$/,replacement:fileURLToPath(new URL('./packages/payment-protocol/src/generated/',import.meta.url))+'$1'},
  {find:'@payment-test/protocol',replacement:fileURLToPath(new URL('./packages/payment-protocol/testing/index.ts',import.meta.url))},
]},test:{root,environment:'node',clearMocks:true,restoreMocks:true}});
