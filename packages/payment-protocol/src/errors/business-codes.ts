import { CanonicalErrorCode as C } from '../generated/idl/common/v1/enums';

/** 原始 IDL 错误描述，不包含 SDK 的结果分类或恢复动作。 */
export type PaymentBusinessErrorDescriptor = Readonly<{
  /** 完整服务端业务错误码，保留 int64 精度。 */
  statusCode: bigint;
  /** IDL 通用错误分类；不能代替完整错误码识别具体场景。 */
  canonicalCode: C;
  /** IDL DescribeErrorCode 给出的业务错误名称。 */
  bizCodeName: string;
  /** 原始描述中的服务来源；不同于 SDK PaymentError.source。 */
  source: string;
  /** 服务端描述的重试属性；不授权 SDK 自动重放预下单。 */
  retryable: boolean;
}>;
/** 本副本直接核对 error_code.go / error_contract.go 的完整来源提交。 */
export const paymentBusinessErrorsIdlCommit = '5539be8f09323709fa65f6568efe22896ec35d24';

function entry(statusCode: bigint, canonicalCode: C, bizCodeName: string, source: string, retryable: boolean): PaymentBusinessErrorDescriptor {
  return Object.freeze({ statusCode, canonicalCode, bizCodeName, source, retryable });
}
/** 手写维护的 17 项 Go 原始错误；目录及记录冻结，跨客户端不可改写。 */
export const paymentBusinessErrors = Object.freeze({
  /** 网关参数拒绝，不推断业务登录态。 */
  ErrGatewayProxyInvalidParameter: entry(20200002001010n, C.CANONICAL_ERROR_CODE_INVALID_PARAMETER, 'BIZ_GATEWAY_INVALID_PARAMETER', 'infra-gateway', false),
  /** 网关业务鉴权失败。 */
  ErrGatewayProxyUnauthorized: entry(20200002001020n, C.CANONICAL_ERROR_CODE_UNAUTHORIZED, 'BIZ_GATEWAY_UNAUTHORIZED', 'infra-gateway', false),
  /** 网关未找到目标，不合成交易事实。 */
  ErrGatewayProxyNotFound: entry(20200002001030n, C.CANONICAL_ERROR_CODE_NOT_FOUND, 'BIZ_GATEWAY_NOT_FOUND', 'infra-gateway', false),
  /** 支付准备鉴权失败，不证明内部 RPC 没有副作用。 */
  ErrInfraTradeCreateTradePayUnauthorized: entry(10100801002020n, C.CANONICAL_ERROR_CODE_UNAUTHORIZED, 'BIZ_INFRA_TRADE_UNAUTHORIZED', 'infra-trade', false),
  /** 交易不存在或不属于当前用户。 */
  ErrInfraTradeCreateTradePayNotFound: entry(10100801002030n, C.CANONICAL_ERROR_CODE_NOT_FOUND, 'BIZ_INFRA_TRADE_NOT_FOUND', 'infra-trade', false),
  /** 渠道未开放；与普通暂不可用不同，不可重试。 */
  ErrInfraTradeCreateTradePayChannelUnavailable: entry(10100801002080n, C.CANONICAL_ERROR_CODE_UNAVAILABLE, 'BIZ_INFRA_TRADE_CHANNEL_UNAVAILABLE', 'infra-trade', false),
  /** 服务端支付冲突，不等于已支付。 */
  ErrInfraTradeCreateTradePayConflict: entry(10100801002040n, C.CANONICAL_ERROR_CODE_CONFLICT, 'BIZ_INFRA_TRADE_CONFLICT', 'infra-trade', false),
  /** 支付准备参数非法。 */
  ErrInfraTradeCreateTradePayInvalidParameter: entry(10100801002010n, C.CANONICAL_ERROR_CODE_INVALID_PARAMETER, 'BIZ_INFRA_TRADE_INVALID_PARAMETER', 'infra-trade', false),
  /** 渠道策略拒绝，不等于会话失效。 */
  ErrInfraTradeCreateTradePayChannelPolicyInvalidParameter: entry(10100801002090n, C.CANONICAL_ERROR_CODE_INVALID_PARAMETER, 'BIZ_INFRA_TRADE_CHANNEL_POLICY_INVALID_PARAMETER', 'infra-trade', false),
  /** 明确渠道会话失效；只能用此精确码识别该语义。 */
  ErrInfraTradeCreateTradePaySessionExpiredInvalidParameter: entry(10100801002100n, C.CANONICAL_ERROR_CODE_INVALID_PARAMETER, 'BIZ_INFRA_TRADE_SESSION_EXPIRED_INVALID_PARAMETER', 'infra-trade', false),
  /** 渠道一般拒绝，不推断签名会话过期。 */
  ErrInfraTradeCreateTradePayChannelRejectedInvalidParameter: entry(10100801002110n, C.CANONICAL_ERROR_CODE_INVALID_PARAMETER, 'BIZ_INFRA_TRADE_CHANNEL_REJECTED_INVALID_PARAMETER', 'infra-trade', false),
  /** 当前用户在 appId 下缺微信绑定，与普通 NotFound 分开。 */
  ErrInfraTradeCreateTradePayWxIdentityNotFound: entry(10100801002120n, C.CANONICAL_ERROR_CODE_NOT_FOUND, 'BIZ_INFRA_TRADE_WX_IDENTITY_NOT_FOUND', 'infra-trade', false),
  /** 支付准备服务暂不可用；重试提示不授权自动重放。 */
  ErrInfraTradeCreateTradePayUnavailable: entry(10100801002070n, C.CANONICAL_ERROR_CODE_UNAVAILABLE, 'BIZ_INFRA_TRADE_UNAVAILABLE', 'infra-trade', true),
  /** 原交易查询鉴权失败；恢复仍只查询。 */
  ErrInfraTradeQueryTradeUnauthorized: entry(10100801003020n, C.CANONICAL_ERROR_CODE_UNAUTHORIZED, 'BIZ_INFRA_TRADE_UNAUTHORIZED', 'infra-trade', false),
  /** 原交易查询参数非法。 */
  ErrInfraTradeQueryTradeInvalidParameter: entry(10100801003010n, C.CANONICAL_ERROR_CODE_INVALID_PARAMETER, 'BIZ_INFRA_TRADE_INVALID_PARAMETER', 'infra-trade', false),
  /** 查询未找到或不可访问，不能合成未支付。 */
  ErrInfraTradeQueryTradeNotFound: entry(10100801003030n, C.CANONICAL_ERROR_CODE_NOT_FOUND, 'BIZ_INFRA_TRADE_NOT_FOUND', 'infra-trade', false),
  /** 查询服务暂不可用，保留服务端可重试事实。 */
  ErrInfraTradeQueryTradeUnavailable: entry(10100801003070n, C.CANONICAL_ERROR_CODE_UNAVAILABLE, 'BIZ_INFRA_TRADE_UNAVAILABLE', 'infra-trade', true),
});

/** 按完整 int64 查找原始描述；未知码不按位段、文案或通用类别猜测。 */
export function getPaymentBusinessError(statusCode: bigint): PaymentBusinessErrorDescriptor | undefined {
  return Object.values(paymentBusinessErrors).find(error => error.statusCode === statusCode);
}
