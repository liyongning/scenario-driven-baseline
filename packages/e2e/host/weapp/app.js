const runner = globalThis.__TEMPLATE_TEST_RUNNER__ ?? require('./.generated/protocol-runner.js');
// template-example:begin
const exampleRunner =
  globalThis.__EXAMPLE_TEST_RUNNER__ ?? require('./.generated/example-runner.js');
// template-example:end

App({
  runProtocolCase(input) {
    return runner.runProtocolCase(input);
  },
  runProtocolSuite(input) {
    return runner.runProtocolSuite(input);
  },
  // template-example:begin
  runExampleCase(input) {
    return exampleRunner.runExampleCase(input);
  },
  // template-example:end
});
