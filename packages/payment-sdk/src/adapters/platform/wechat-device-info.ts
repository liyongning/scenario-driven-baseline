import type { DeviceInfoPort } from '../../ports/device-info';

declare const wx: {getDeviceInfo?: ()=>{platform?:string}|null}|undefined;

/** 只在实际采集时读取微信平台，不保留其他设备信息或读取宿主扩展属性。 */
export function createWechatDeviceInfo():DeviceInfoPort {
  return {clientPlatform(){
    try {
      const platform=typeof wx==='undefined'?undefined:wx?.getDeviceInfo?.()?.platform;
      switch(platform){
        case 'ios': return 'ios';
        case 'android': return 'android';
        case 'ohos': case 'ohos_pc': return 'harmony';
        default: return 'unknown';
      }
    } catch { return 'unknown'; }
  }};
}
