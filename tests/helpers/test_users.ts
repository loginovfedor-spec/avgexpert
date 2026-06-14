import bcrypt from 'bcrypt';
import userRepository from '../../src/modules/auth/user.repository';

export async function upsertTestUser(
  username: string,
  fields: Record<string, unknown> = {}
): Promise<void> {
  const existing = await userRepository.findByUsername(username);
  await userRepository.save(username, {
    category: 'Консультант',
    n_ctx: 4096,
    password_hash: 'dummy_hash',
    ...existing,
    ...fields,
  });
}

export async function setTestPassword(username: string, password: string): Promise<void> {
  const hash = bcrypt.hashSync(password, 10);
  await upsertTestUser(username, { password_hash: hash });
}
