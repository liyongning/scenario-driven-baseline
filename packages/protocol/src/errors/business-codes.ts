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
  /** 服务端描述的重试属性；不授权 SDK 自动重放。 */
  retryable: boolean;
}>;
/** 本副本直接核对 error_code.go / error_contract.go 的完整来源提交。 */
export const paymentBusinessErrorsIdlCommit = '5539be8f09323709fa65f6568efe22896ec35d24';

function entry(statusCode: bigint, canonicalCode: C, bizCodeName: string, source: string, retryable: boolean): PaymentBusinessErrorDescriptor {
  return Object.freeze({ statusCode, canonicalCode, bizCodeName, source, retryable });
}
/** 手写维护的 7 项 Go 原始错误；目录及记录冻结，跨客户端不可改写。 */
export const paymentBusinessErrors = Object.freeze({
  /** 网关参数拒绝，不推断业务登录态。 */
  ErrGatewayProxyInvalidParameter: entry(20200002001010n, C.CANONICAL_ERROR_CODE_INVALID_PARAMETER, 'BIZ_GATEWAY_INVALID_PARAMETER', 'infra-gateway', false),
  /** 网关业务鉴权失败。 */
  ErrGatewayProxyUnauthorized: entry(20200002001020n, C.CANONICAL_ERROR_CODE_UNAUTHORIZED, 'BIZ_GATEWAY_UNAUTHORIZED', 'infra-gateway', false),
  /** 网关未找到目标，不合成交易事实。 */
  ErrGatewayProxyNotFound: entry(20200002001030n, C.CANONICAL_ERROR_CODE_NOT_FOUND, 'BIZ_GATEWAY_NOT_FOUND', 'infra-gateway', false),
  /** 原交易查询鉴权失败，不推断内部副作用。 */
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
