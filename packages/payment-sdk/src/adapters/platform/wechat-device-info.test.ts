import { afterEach, expect, test, vi } from 'vitest';
import * as subject from './wechat-device-info';
afterEach(()=>vi.unstubAllGlobals());
test.each([['ios','ios'],['android','android'],['ohos','harmony'],['ohos_pc','harmony'],['windows','unknown'],['devtools','unknown'],['PC','unknown'],[undefined,'unknown']])('平台 %s 仅映射已确认的 client_platform', (platform, expected)=>{
  expect(subject).toHaveProperty('createWechatDeviceInfo');
  vi.stubGlobal('wx',{getDeviceInfo:()=>({platform,get other(){throw new Error('must not collect');}})});
  expect(subject.createWechatDeviceInfo().clientPlatform()).toBe(expected);
});
test.each([undefined,{}, {getDeviceInfo:()=>{throw new Error('device failure');}}, {getDeviceInfo:()=>null}])('缺能力/采集异常时 unknown，创建不访问平台 %j', wx=>{
 expect(subject).toHaveProperty('createWechatDeviceInfo');
 vi.stubGlobal('wx',wx); const device=subject.createWechatDeviceInfo(); expect(device.clientPlatform()).toBe('unknown');
});
