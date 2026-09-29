/** SDK 支持的宿主平台选择。 */
export type PaymentRuntime = 'wechat-miniapp';
/** 首期发布的支付方式，不自动替换渠道。 */
export type PaymentMethod = 'wechat-miniapp-virtual-goods';
/** 米大师逐次支付环境的请求选择；不是 SDK 宿主、泳道或服务端实际环境的证明。 */
export type XpayEnv =
  /** 请求沙箱；仅服务端允许时生效。生产部署仍走现网，不能据此保证不扣款。 */
  | 'sandbox'
  /** 请求现网，可能真实扣款；仅在已获准的账号、金额及环境中使用。 */
  | 'prod';
/** 宿主业务已创建的服务端交易引用。 */
export type TradeReference = Readonly<{
  /** 原交易号，不是支付单号或运行标识。 */
  tradeNo: string;
}>;
/** 交易快照状态：服务端查询事实或 UNKNOWN；不同于 SDK 阶段和调用结束原因。 */
export type TradeState =
  /** 服务端返回交易已创建，尚未确认支付。 */
  | 'CREATED'
  /** 服务端返回支付处理中；不能据此认定未扣款。 */
  | 'PAYING'
  /** 服务端查询确认已支付；业务权益是否到账由业务接口确认。 */
  | 'PAID'
  /** 服务端查询确认已关闭；不能用本地计时合成，一期不保证产生。 */
  | 'CLOSED'
  /** 尚无可信查询结果或状态不可识别；不是支付失败。 */
  | 'UNKNOWN';
/** 本次运行收到的渠道信号；渠道成功提示不能代替服务端 PAID。 */
export type ChannelSignal =
  /** 本次未实际调用渠道，包括 prepare 失败、调用前停止和独立 observe。 */
  | 'not_invoked'
  /** 渠道给出成功提示，SDK 继续查询交易事实。 */
  | 'success_hint'
  /** 渠道明确返回用户取消；不同于宿主停止 SDK 等待。 */
  | 'cancelled'
  /** 渠道明确调起失败；未文档化非零数字码同样归入并保留十进制原码；明确会话失效同时使用专属结束原因。 */
  | 'launch_failed'
  /** 渠道返回结果不明，或已调渠道但本地停止时尚无结果；仅前者自动查单。 */
  | 'unknown';
/** 本次 SDK 调用为何结束；不是账务状态，也不是 onPhase 的阶段值。 */
export type EndReason =
  /** 查询取得 PAID 或 CLOSED，具体终态看 snapshot.state。 */
  | 'confirmed'
  /** 渠道明确取消，本次直接结束，不自动查单。 */
  | 'channel_cancelled'
  /** 明确调起失败，本次直接结束且不自动查单；不证明交易关闭。 */
  | 'launch_failed'
  /** 业务凭据缺失/失效；按 interruptedPhase 决定恢复入口。 */
  | 'auth_required'
  /** 服务端明确缺少微信身份绑定，交宿主恢复。 */
  | 'identity_required'
  /** 明确渠道会话失效，交宿主恢复；不能用一般签名错误推断。 */
  | 'channel_session_required'
  /** 当前环境或支付方式不可用，未进入实际支付调用。 */
  | 'unsupported'
  /** 同客户端同交易已有活动 pay，拒绝本次重入。 */
  | 'busy'
  /** 请求/结果确认等待预算耗尽；不覆盖原生收银台等待，不证明未支付。 */
  | 'timed_out'
  /** 宿主显式结束本地等待；不取消渠道支付、不关单。 */
  | 'stopped'
  /** 其他错误导致本次结束，分类与来源见 error。 */
  | 'error'
  /** 交宿主承接 nextAction；首期真实虚拟支付不产生此分支。 */
  | 'action_required';
/** 业务可观察的执行边界；没有 preparing、channel_returned 或 ended 事件。 */
export type PaymentPhase =
  /** 参数校验后、调用端侧渠道前；通知内停止可使实际调用不发生。 */
  | 'channel_invoking'
  /** 进入服务端结果确认、首次查询前；不是已支付或权益到账。 */
  | 'confirming';
/** 每次调用的阶段通知；不携带支付参数或业务上下文。 */
export type PaymentPhaseEvent = Readonly<{
  /** 本次 SDK 运行标识，与最终结果相同；不是交易号或幂等键。 */
  attemptId: string;
  /** 本次新进入的约定执行阶段。 */
  phase: PaymentPhase;
}>;
/** 错误分类与来源；不替代交易快照，不携带支付原文。 */
export type PaymentError = Readonly<{
  /** 稳定错误分类，恢复与重试仍依照阶段矩阵。 */
  code:
    /** 业务凭据缺失或失效，按中断阶段恢复。 */
    | 'AUTH_REQUIRED'
    /** 服务端明确缺少所需微信身份绑定。 */
    | 'IDENTITY_REQUIRED'
    /** 明确渠道会话失效，不从一般签名错误推断。 */
    | 'CHANNEL_SESSION_REQUIRED'
    /** 当前环境或支付方式不可用。 */
    | 'UNSUPPORTED'
    /** 同客户端同交易已有活动 pay。 */
    | 'BUSY'
    /** 本次调用参数或配置覆盖非法。 */
    | 'INVALID_INPUT'
    /** 宿主数据 provider 抛错或提供非法上下文。 */
    | 'HOST_CONTEXT_ERROR'
    /** 平台网络传输失败，不证明服务端无副作用。 */
    | 'NETWORK_ERROR'
    /** 响应信封、关联或支付参数违反消费契约。 */
    | 'PROTOCOL_ERROR'
    /** 端侧渠道错误，不自动推断未支付。 */
    | 'CHANNEL_ERROR'
    /** 服务端业务错误，按精确协议判定可否继续观察。 */
    | 'SERVER_ERROR'
    /** 服务端拒绝当前支付操作的冲突，不等于已支付。 */
    | 'CONFLICT'
    /** 请求或结果观察的时间错误；原生等待没有此上限。 */
    | 'TIMEOUT';
  /** 错误的归一来源，不能据此判断账务状态。 */
  source:
    /** SDK 核心或输入校验。 */
    | 'sdk'
    /** 宿主数据 provider。 */
    | 'host'
    /** 平台网络传输。 */
    | 'network'
    /** 网关及服务端响应边界。 */
    | 'gateway'
    /** 端侧支付渠道。 */
    | 'channel';
  /** SDK 按错误分类提供的稳定中文默认文案；不使用渠道原文生成。 */
  message: string;
  /** 可选原始错误码；渠道明确调起失败保留十进制 errCode，不包含异常原文或完整响应。 */
  originalCode?: string;
  /** 可重试提示，不授权 SDK 自动重放 prepare 或渠道支付。 */
  retryable?: boolean;
  /** 渠道 fail 回调提供的可选字符串原文；仅用于接入方排查，不参与分类、恢复或重试。 */
  channelMessage?: string;
}>;
/** 内部端口及公开单次查询的结果，不等同于交易支付结论。 */
export type PortResult<T> =
  | Readonly<{
      /** 本次端口操作取得有效结果。 */
      ok: true;
      /** 操作返回的领域数据。 */
      value: T;
    }>
  | Readonly<{
      /** 本次端口操作失败，不能推断交易未支付。 */
      ok: false;
      /** 归一错误，按阶段判断恢复动作。 */
      error: PaymentError;
    }>;
/** 原交易的最后可信查询事实或明确不可用占位。 */
export type TradeSnapshot = Readonly<{
  /** 当前快照关联的原交易引用。 */
  reference: TradeReference;
  /** 最后可信服务端状态；未取得可信快照时为 UNKNOWN。 */
  state: TradeState;
  /** SDK 取得快照的时刻，不伪装成服务端事件时间。 */
  observedAtMs: number;
  /** 服务端交易期限，不触发 SDK 自动关单或截断收银台。 */
  expiresAtMs?: number;
  /** server 表示来自有效查询；unavailable 表示无可信查询，state 必为 UNKNOWN。 */
  source:
    /** 有效服务端查询事实，也可能包含不可识别状态。 */
    | 'server'
    /** 无可信查询，此时 state 必须为 UNKNOWN。 */
    | 'unavailable';
}>;
/** 交由宿主承接的后续动作；首期真实虚拟支付不产生。 */
export type PaymentAction =
  | Readonly<{
      /** 需要宿主跳转，不是已付款。 */
      kind: 'redirect';
      /** 后续动作的目标地址。 */
      url: string;
    }>
  | Readonly<{
      /** 需要宿主展示二维码，不是已付款。 */
      kind: 'qr_code';
      /** 后续动作的二维码内容。 */
      content: string;
    }>;
/** 结果确认阶段的查询频率和总预算。 */
export type ObservationPolicy = Readonly<{
  /** 结果确认查询间隔，不约束渠道等待。 */
  intervalMs: number;
  /** 结果确认总预算，不证明交易未支付。 */
  maxWaitMs: number;
}>;
/** 初始化或单次运行的局部策略覆盖，未设置字段保留上层选择。 */
export type PaymentPolicyOverrides = Readonly<{
  /** 单次通信预算，包含宿主 provider 用时。 */
  requestTimeoutMs?: number;
  /** 按字段覆盖结果确认策略。 */
  observation?: Partial<ObservationPolicy>;
}>;
/** 通信协议包拥有的本地停止能力；SDK 转出供宿主使用，不支持支付撤销。 */
export type Cancellation = import('@daqian/payment-protocol').Cancellation;
/** 每次 pay/observe 的控制选项，不携带本次支付环境。 */
export type RunOptions = Readonly<{
  /** 仅本次调用的局部时间策略覆盖。 */
  policy?: PaymentPolicyOverrides;
  /** 宿主显式停止本地等待，不撤销支付。 */
  cancellation?: Cancellation;
  /** 每次调用可选阶段通知；SDK 不等待返回，异常不改变主流程，最终结果仍由 Promise 交付。 */
  onPhase?: (event: PaymentPhaseEvent) => void;
}>;
/** 支付已有交易的逐次请求，不承担业务下单或签名。 */
export type PaymentRequest = Readonly<{
  /** 本次支付关联的原交易引用。 */
  reference: TradeReference;
  /** 本次显式选择的已发布支付方式。 */
  method: PaymentMethod;
  /** 本次米大师环境选择；省略/undefined 由服务端采用部署默认值，SDK 不填 UNSPECIFIED。服务端可覆盖选择，生产部署恒走现网且可能真实扣款。 */
  xpayEnv?: XpayEnv | undefined;
}>;
/** 本次 pay/observe 唯一最终结果；成功、取消、错误、超时和停止均使用此对象。 */
export type PaymentOutcome = Readonly<{
  /** 与本次阶段事件相同的运行标识，用于隔离重复调用。 */
  attemptId: string;
  /** 最后可信交易事实；不由渠道提示或本地结束原因改写。 */
  snapshot: TradeSnapshot;
  /** 本次渠道调用及其返回情况，不代表服务端支付结论。 */
  channelSignal: ChannelSignal;
  /** 本次调用结束的原因；confirmed 仍需区分 PAID/CLOSED。 */
  reason: EndReason;
  /** 准备成功后已知的支付单号；恢复时不比较是否变化。 */
  paymentNo?: string;
  /** 三类身份/会话中断必须携带：prepare 预下单、invoke 渠道调用、query 结果查询；不是过程通知。 */
  interruptedPhase?:
    /** 预下单中断，恢复后显式再次 pay。 */
    | 'prepare'
    /** 渠道调用中断，按渠道会话恢复规则再次 pay。 */
    | 'invoke'
    /** 结果查询中断，恢复后只 query/observe 原交易。 */
    | 'query';
  /** 可选错误分类、来源与原码；不得包含原始支付载荷或凭据。 */
  error?: PaymentError;
  /** 仅 action_required 携带，表示后续动作，不代表付款完成。 */
  nextAction?: PaymentAction;
}>;
/** 宿主提供的公共请求上下文，不是业务支付参数。 */
export type PaymentRequestContext = Readonly<{
  /** 可选产品标识，由协议层写入公共上下文。 */
  productId?: string;
  /** 可选泳道标识，不切换网关环境。 */
  lane?: string;
  /** 可选宿主应用版本。 */
  appVersion?: string;
}>;
/** 只包含关联标识和错误分类的脱敏诊断。 */
export type DiagnosticEvent = Readonly<{
  /** 可选运行关联标识，不是支付幂等键。 */
  attemptId?: string;
  /** 可选单次通信关联标识。 */
  requestId?: string;
  /** 脱敏诊断阶段标识，不是业务阶段回调。 */
  phase: string;
  /** 可选归一错误分类。 */
  code?: PaymentError['code'];
  /** 可选脱敏原始错误码。 */
  originalCode?: string;
}>;
/** 公共工厂所需配置和动态数据 provider，内部网络及端口由 SDK 装配。 */
export type PaymentClientOptions = Readonly<{
  /** SDK 宿主环境选择。 */
  runtime: PaymentRuntime;
  /** 宿主明确选择的网关地址，SDK 不自动切换环境。 */
  gatewayBaseUrl: string;
  /** 服务端关联微信身份与支付应用所需标识。 */
  appId: string;
  /** 显式启用的已发布方式集合。 */
  enabledMethods: readonly PaymentMethod[];
  /** 逐请求读取当前业务凭据，SDK 不缓存或自动刷新。 */
  getAccessToken: () => string | null | Promise<string | null>;
  /** 可选公共请求上下文，不接受设备平台或支付环境。 */
  requestContext?: PaymentRequestContext;
  /** 当前实例的局部时间策略覆盖。 */
  policy?: PaymentPolicyOverrides;
  /** 可选脱敏诊断回调，不提供支付原文。 */
  onDiagnostic?: (event: DiagnosticEvent) => void;
}>;
/** 显式支付、单次查询和有界结果确认的业务接口。 */
export interface PaymentClient {
  /** 支付已有交易，每次调用返回唯一最终结果。 */
  pay(request: PaymentRequest, options?: RunOptions): Promise<PaymentOutcome>;
  /** 只查询原交易，不准备支付或调用渠道。 */
  query(reference: TradeReference): Promise<PortResult<TradeSnapshot>>;
  /** 有界确认原交易，只查询，不重复调起渠道。 */
  observe(reference: TradeReference, options?: RunOptions): Promise<PaymentOutcome>;
}
