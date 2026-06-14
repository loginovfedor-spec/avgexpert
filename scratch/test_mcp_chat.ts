// Use built-in fetch
async function test(): Promise<void> {
  const loginRes = await fetch('http://127.0.0.1:8200/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  });

  const { access_token } = (await loginRes.json()) as { access_token: string };
  console.log('Logged in');

  const chatPayload = {
    category: 'Администратор',
    stream: true,
    messages: [{ role: 'user', content: 'Привет! Напиши короткое стихотворение про кота.' }],
  };

  console.log('Sending chat request via MCP...');
  const chatRes = await fetch('http://127.0.0.1:8200/api/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + access_token,
    },
    body: JSON.stringify(chatPayload),
  });

  if (!chatRes.ok) {
    const errText = await chatRes.text();
    console.error('Chat request failed:', chatRes.status, errText);
    process.exit(1);
  }

  console.log('Response status:', chatRes.status);

  const reader = chatRes.body!.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;
        try {
          const data = JSON.parse(dataStr) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = data.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            process.stdout.write(content);
          }
        } catch {
          /* ignore malformed SSE chunks */
        }
      }
    }
  }

  console.log('\n\nSUCCESS: Chat response received via MCP');
  console.log('Content:', fullText);
}

test().catch((err: unknown) => {
  console.error('Error during test:', err);
  process.exit(1);
});
