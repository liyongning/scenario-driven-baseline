/** 应用装配使用的部署配置。 */
export interface DeploymentConfig {
  /** 接口网关的公开基地址。 */
  apiBaseUrl: string;
}

/** 从部署环境整体解析应用配置，不在产品代码中保留 Mock 分支。 */
export function deploymentConfig(env: Readonly<Record<string, unknown>>): DeploymentConfig {
  const baseUrl = env.VITE_API_BASE_URL;
  return { apiBaseUrl: typeof baseUrl === 'string' && baseUrl !== '' ? baseUrl : '/api' };
}
