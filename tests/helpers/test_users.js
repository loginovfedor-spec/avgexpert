const userRepository = require('../../src/modules/auth/user.repository');

async function upsertTestUser(username, fields = {}) {
  const existing = await userRepository.findByUsername(username);
  await userRepository.save(username, {
    category: 'Консультант',
    n_ctx: 4096,
    ...existing,
    ...fields,
  });
}

async function setTestPassword(username, password) {
  const bcrypt = require('bcrypt');
  const hash = bcrypt.hashSync(password, 10);
  await upsertTestUser(username, { password_hash: hash });
}

module.exports = {
  upsertTestUser,
  setTestPassword,
};
