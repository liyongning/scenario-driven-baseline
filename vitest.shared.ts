import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineProject({root,resolve:{alias:[
  {find:/^@daqian\/template-protocol$/,replacement:fileURLToPath(new URL('./packages/protocol/src/index.ts',import.meta.url))},
  {find:/^@daqian\/template-protocol\/generated\/(.*)$/,replacement:fileURLToPath(new URL('./packages/protocol/src/generated/',import.meta.url))+'$1'},
  {find:'@template-test/protocol',replacement:fileURLToPath(new URL('./packages/protocol/testing/index.ts',import.meta.url))},
]},test:{root,environment:'node',clearMocks:true,restoreMocks:true}});
