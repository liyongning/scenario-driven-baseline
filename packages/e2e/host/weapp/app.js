const runner = globalThis.__PAYMENT_TEST_RUNNER__ ?? require('./.generated/protocol-runner.js');
const exampleRunner = globalThis.__EXAMPLE_TEST_RUNNER__ ?? require('./.generated/example-runner.js');

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
  runExampleCase(input) {
    return exampleRunner.runExampleCase(input);
  },
});
