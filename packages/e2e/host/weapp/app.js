const runner = globalThis.__PAYMENT_TEST_RUNNER__ ?? require('./.generated/protocol-runner.js');

App({
  runProtocolCase(input) {
    return runner.runProtocolCase(input);
  },
  runProtocolSuite(input) {
    return runner.runProtocolSuite(input);
  },
  runPaymentCase(input) {
    return runner.runPaymentCase(input);
  },
});
