const { PolicyEngine } = require('../src/modules/policy/policy.engine');

const testCases = [
  {
    name: 'Valid run operation',
    action: { type: 'sandbox_operation', payload: { operation: 'run' } },
    expected: 'require_approval'
  },
  {
    name: 'Valid assign operation',
    action: { type: 'sandbox_operation', payload: { operation: 'assign' } },
    expected: 'require_approval'
  },
  {
    name: 'Valid terminate operation',
    action: { type: 'sandbox_operation', payload: { operation: 'terminate' } },
    expected: 'allow'
  },
  {
    name: 'Empty operation',
    action: { type: 'sandbox_operation', payload: {} },
    expected: 'deny'
  },
  {
    name: 'Invalid operation',
    action: { type: 'sandbox_operation', payload: { operation: 'hack' } },
    expected: 'deny'
  }
];

console.log('Testing Sandbox Policy:');
testCases.forEach(tc => {
  const decision = PolicyEngine.evaluateAction(tc.action);
  const pass = decision.resolution === tc.expected;
  console.log(`${pass ? '✅' : '❌'} ${tc.name}: expected ${tc.expected}, got ${decision.resolution} (${decision.reason})`);
  if (!pass) process.exit(1);
});
console.log('All sandbox policy tests passed!');
