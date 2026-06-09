const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 8200,
  path: '/api/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    // We assume the user has a valid admin token or we can just pass some dummy for local
    // For local tests, auth might be required. We'll use a mocked internal user or skip auth if possible
    'Authorization': 'Bearer test_token_if_needed'
  }
};

const payload = JSON.stringify({
  messages: [{ role: 'user', content: 'Say hello world' }],
  stream: true,
  category: 'default' // Or whatever category
});

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(payload);
req.end();
