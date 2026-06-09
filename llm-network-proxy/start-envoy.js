const { spawn } = require('child_process');
const path = require('path');

// Run envoy from system PATH
// Pass all arguments or default to -c envoy.yaml
const args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['-c', 'envoy.yaml'];

console.log(`Starting Envoy with arguments: ${args.join(' ')}`);

const envoy = spawn('envoy', args, {
  stdio: 'inherit',
  shell: true // Allows resolving binary from PATH easily across environments
});

envoy.on('error', (err) => {
  console.error('Failed to start Envoy process:', err);
  process.exit(1);
});

envoy.on('close', (code) => {
  console.log(`Envoy process exited with code ${code}`);
  process.exit(code);
});
