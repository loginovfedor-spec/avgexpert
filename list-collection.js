import fetch from 'node-fetch';
import fs from 'fs';
import 'dotenv/config'; // для .env файла

const COLLECTION_ID = "collection_82226a3f-f5b0-4a74-a818-55f7b3e71fdc";
const GROK_API_KEY = "xai-token-5jFInhgBV90idLOGRJRhQKvUDbhRQmX24Wi32DKxJNLIKpu1rJKKHu2ijVgAKfOVVBomKdH0nXOqq7E3";

if (!GROK_API_KEY) {
    console.error("❌ Укажи GROK_API_KEY в файле .env");
    process.exit(1);
}

async function listCollectionDocuments(paginationToken = null) {
    let url = `https://management-api.x.ai/v1/collections/${COLLECTION_ID}/documents?limit=100`;

    if (paginationToken) {
        url += `&pagination_token=${encodeURIComponent(paginationToken)}`;
    }

    console.log(`📂 Запрос к коллекции ${COLLECTION_ID}...`);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${GROK_API_KEY}`,
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const data = await response.json();

    if (data.documents && data.documents.length > 0) {
        console.log(`✅ Найдено документов: ${data.documents.length}\n`);

        data.documents.forEach((doc, i) => {
            const meta = doc.file_metadata;
            console.log(`${(i + 1).toString().padStart(2, '0')}. 📄 ${meta.name}`);
            console.log(`    File ID : ${meta.file_id}`);
            console.log(`    Тип     : ${meta.content_type || '—'}`);
            console.log(`    Размер  : ${(meta.size_bytes / 1024 / 1024).toFixed(2)} MB`);
            console.log(`    Загружен: ${meta.created_at}`);
            console.log(`    Статус  : ${doc.status}`);
            if (doc.error_message) console.log(`    Ошибка  : ${doc.error_message}`);
            console.log("-".repeat(70));
        });
    } else {
        console.log("Коллекция пуста.");
    }

    if (data.pagination_token) {
        console.log(`\n⚠️  Есть следующая страница. Запусти скрипт снова или добавь токен.`);
        console.log(`Pagination token: ${data.pagination_token}`);
    }
}

// Запуск
listCollectionDocuments().catch(err => {
    console.error("❌ Ошибка:", err.message);
});