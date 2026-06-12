import userRepository from '../src/modules/auth/user.repository';
// @ts-expect-error legacy sqlite module removed after PG migration
import db from '../src/core/sqlite';

async function test(): Promise<void> {
  console.log('--- Current status of admin ---');
  const before = await userRepository.getTokenBalance('admin');
  console.log(before);

  console.log('\nRecording usage of 500 input and 200 output tokens for admin with complexity 1.0...');
  const result = await userRepository.addTokenUsage('admin', 500, 200, 1.0);
  console.log(result);

  console.log('\n--- Checking status after update ---');
  const after = await userRepository.getTokenBalance('admin');
  console.log(after);

  console.log('\nRestoring admin token stats to 0 used...');
  db.prepare("UPDATE users SET tokens_input_used = 0, tokens_output_used = 0 WHERE username = 'admin'").run();
  console.log('Restored.');
}

test().catch(console.error);
