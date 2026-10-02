export type Cancellation = Readonly<{
  isStopped: () => boolean;
  subscribe: (listener: () => void) => () => void;
}>;
export type OperationContext = Readonly<{
  deadlineAtMs: number;
  cancellation?: Cancellation;
}>;
