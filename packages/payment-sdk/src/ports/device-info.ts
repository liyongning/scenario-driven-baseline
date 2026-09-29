/** SDK 内部设备信息端口；仅描述下单端系统，不决定支付渠道或环境。 */
export interface DeviceInfoPort {
  /** ios/android 原值映射；ohos/ohos_pc 为 harmony；其他及采集异常为 unknown。 */
  clientPlatform(): 'ios' | 'android' | 'harmony' | 'unknown';
}
