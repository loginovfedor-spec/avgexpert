// Use built-in fetch
async function test() {
  // 1. Login
  const loginRes = await fetch('http://127.0.0.1:8200/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  
  const { access_token } = await loginRes.json();
  console.log('Logged in');

  // 2. Chat with "Администратор" category (which uses MCP)
  // We use the stream endpoint if available, but let's try the regular chat endpoint.
  // Actually AvgExpert usually uses /api/chat which returns a stream of SSE.
  
  const chatPayload = {
    category: 'Администратор',
    stream: true,
    messages: [{ role: 'user', content: 'Привет! Напиши короткое стихотворение про кота.' }]
  };

  console.log('Sending chat request via MCP...');
  const chatRes = await fetch('http://127.0.0.1:8200/api/chat/completions', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + access_token
    },
    body: JSON.stringify(chatPayload)
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    console.error('Chat request failed:', chatRes.status, errText);
    process.exit(1);
  }

  console.log('Response status:', chatRes.status);
  
  // Read the stream
  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    // Parse SSE lines
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;
        try {
          const data = JSON.parse(dataStr);
          const content = data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content;
          if (content) {
            fullText += content;
            process.stdout.write(content);
          }
        } catch (e) {}
      }
    }
  }

  console.log('\n\nSUCCESS: Chat response received via MCP');
  console.log('Content:', fullText);
}

test().catch(err => {
  console.error('Error during test:', err);
  process.exit(1);
});
