const http = require('http');

async function testSSRF() {
  const adminCredentials = JSON.stringify({ username: 'admin', password: 'admin' });

  // 1. Login
  const loginRes = await request('POST', '/api/auth/login', adminCredentials);
  const token = JSON.parse(loginRes).access_token;
  console.log('Logged in, token received.');

  // 2. Update Category to Malicious URL
  // Provider: openai (considered external), endpoint: 127.0.0.1 (private)
  const catUpdate = JSON.stringify({
    provider: 'openai',
    endpoint_url: 'http://127.0.0.1:8080/v1',
    model_name: 'gpt-3.5-turbo',
    api_key: 'sk-fake'
  });
  
  await request('POST', '/api/admin/categories/%D0%90%D0%B4%D0%BC%D0%B8%D0%BD%D0%B8%D1%81%D1%82%D1%80%D0%B0%D1%82%D0%BE%D1%80', catUpdate, token);
  console.log('Category updated with local endpoint.');

  // 3. Try to chat with Malicious External
  const chatReq = JSON.stringify({
    messages: [{ role: 'user', content: 'test' }],
    stream: false
  });

  try {
    await request('POST', '/api/chat/completions', chatReq, token);
    console.log('FAIL: Malicious external chat succeeded (should have been blocked).');
  } catch (err) {
    console.log('SUCCESS: Malicious external chat failed as expected:', err.message);
  }

  // 4. Update Category to Local Provider (llamacpp) with local endpoint
  const localCatUpdate = JSON.stringify({
    provider: 'llamacpp',
    endpoint_url: 'http://127.0.0.1:8201/v1',
    model_name: 'local-model',
    api_key: ''
  });
  await request('POST', '/api/admin/categories/%D0%90%D0%B4%D0%BC%D0%B8%D0%BD%D0%B8%D1%81%D1%82%D1%80%D0%B0%D1%82%D0%BE%D1%80', localCatUpdate, token);
  console.log('Category updated with local provider and local endpoint.');

  // 5. Try to chat with Local Provider
  try {
    const chatRes = await request('POST', '/api/chat/completions', chatReq, token);
    console.log('SUCCESS: Local provider chat allowed (as expected).');
  } catch (err) {
    console.log('FAIL: Local provider chat blocked:', err.message);
    if (err.body) console.log('Response Body:', err.body);
  }
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8200,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body || '')
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          const error = new Error(`Request failed with status ${res.statusCode}`);
          error.status = res.statusCode;
          error.body = data;
          reject(error);
        } else {
          resolve(data);
        }
      });
    });

    req.on('error', (e) => reject(e));
    if (body) req.write(body);
    req.end();
  });
}

testSSRF().catch(console.error);
