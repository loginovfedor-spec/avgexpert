
const API_URL = 'http://localhost:8200';

async function test() {
    console.log("1. Logging in...");
    const loginRes = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin' })
    });
    
    if (!loginRes.ok) {
        console.error("Login failed:", await loginRes.text());
        return;
    }
    
    const { access_token } = await loginRes.json();
    console.log("Login success. Token obtained:", access_token.substring(0, 20) + "...");

    console.log("\n2. Sending chat request with SEARCH enabled...");
    const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
    };
    console.log("Headers:", JSON.stringify(headers));

    const chatRes = await fetch(`${API_URL}/api/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            messages: [
                { role: 'user', content: 'Какие последние новости в мире технологий на сегодня (май 2026)? Используй поиск.' }
            ],
            stream: false,
            extra_params: {
                tools: [{ type: 'web_search' }],
                tool_choice: 'auto'
            }
        })
    });

    if (!chatRes.ok) {
        console.error("Chat request failed:", await chatRes.text());
        return;
    }

    const result = await chatRes.json();
    console.log("\nResponse from model:");
    console.log("-------------------");
    console.log(result.choices[0].message.content);
    console.log("-------------------");
}

test().catch(console.error);
