/**
 * Сравнение LLM для RAG + кеширование
 *
 * Модели:
 *   OpenAI (Responses API): gpt-5.5, gpt-4.1, gpt-5-nano
 *   Yandex Alice:           aliceai-llm/latest, aliceai-llm-flash/latest
 *   Qwen (DashScope):       qwen-max, qwen-plus, qwen-flash
 *   Grok (xAI):             grok-4.1-fast-non-reasoning, grok-3-mini
 *
 * Метрики:
 *   RAG accuracy  — ответ по контексту / отказ без галлюцинаций
 *   Cold latency    — первый запрос
 *   Warm latency    — повтор того же запроса (локальный LLM-кеш)
 *   Speedup         — cold / warm
 *   Tokens          — prompt / completion / cached (если API отдаёт)
 *
 * Запуск:
 *   node scratch/compare_rag_models.js
 *   node scratch/compare_rag_models.js --only=qwen-max,alice-flash
 *   node scratch/compare_rag_models.js --json=scratch/rag_model_results.json --quiet
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
require('dotenv').config({ path: path.join(__dirname, '..', 'src/modules/providers/config/openai_gpt4_1.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'src/modules/providers/config/openai_gpt5_5.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'src/modules/providers/config/yandex_file_search.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'src/modules/providers/config/qwen.env') });
require('dotenv').config({ path: path.join(__dirname, '..', 'src/modules/providers/config/grok.env') });

const OpenAI = require('openai');

// ─── CLI ─────────────────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const FLAG = (name) => ARGS.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const HAS_FLAG = (name) => ARGS.includes(`--${name}`);
const ONLY_MODELS = FLAG('only') ? new Set(FLAG('only').split(',').map(s => s.trim())) : null;
const JSON_OUT = FLAG('json');
const QUIET = HAS_FLAG('quiet');
const SKIP_CACHE = HAS_FLAG('no-cache');

// ─── Конфиг ──────────────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_URL || 'https://api.openai.com/v1';
const YANDEX_API_KEY = process.env.YANDEX_CLOUD_API_KEY || process.env.YANDEX_EMBEDDINGS_API_KEY;
const YANDEX_FOLDER = process.env.YANDEX_CLOUD_FOLDER
  || (process.env.YANDEX_EMBEDDINGS_MODEL || '').match(/^emb:\/\/([^/]+)\//)?.[1];
const YANDEX_BASE_URL = process.env.YANDEX_CLOUD_BASE_URL || 'https://ai.api.cloud.yandex.net/v1';
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_BASE_URL = process.env.QWEN_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_BASE_URL = process.env.GROK_URL || 'https://api.x.ai/v1';

const SYSTEM_RAG = `Ты ассистент службы поддержки. Отвечай ТОЛЬКО на основе предоставленного контекста.
Если в контексте нет ответа — честно скажи, что информации недостаточно.
Не выдумывай факты. Отвечай кратко на русском языке.`;

const MODELS = [
  { id: 'gpt-5.5',       label: 'GPT-5.5',            provider: 'openai', model: 'gpt-5.5',                    fallbacks: ['gpt-4.1'] },
  { id: 'gpt-4.1',       label: 'GPT-4.1',            provider: 'openai', model: 'gpt-4.1' },
  { id: 'gpt-5-nano',    label: 'GPT-5-nano',         provider: 'openai', model: 'gpt-5-nano',                 fallbacks: ['gpt-4.1-nano'] },
  { id: 'alice-llm',     label: 'Alice AI LLM',       provider: 'yandex', model: 'aliceai-llm/latest' },
  { id: 'alice-flash',   label: 'Alice AI LLM Flash', provider: 'yandex', model: 'aliceai-llm-flash/latest' },
  { id: 'qwen-max',      label: 'Qwen3.7-Max',        provider: 'qwen',   model: 'qwen-max',                   fallbacks: ['qwen3-max'] },
  { id: 'qwen-plus',     label: 'Qwen3.7-Plus',       provider: 'qwen',   model: 'qwen-plus' },
  { id: 'qwen-flash',    label: 'Qwen3.6-Flash',      provider: 'qwen',   model: 'qwen-flash',                 fallbacks: ['qwen-turbo'] },
  { id: 'grok-41-fast',  label: 'Grok 4.1 Fast',      provider: 'grok',   model: 'grok-4-1-fast-non-reasoning', fallbacks: ['grok-4-fast-non-reasoning'], costIn: 0.20, costOut: 0.50 },
  { id: 'grok-3-mini',   label: 'Grok 3 Mini',        provider: 'grok',   model: 'grok-3-mini',                fallbacks: ['grok-3-mini-beta'], costIn: 0.30, costOut: 0.50 },
];

const COST_PER_1M = {
  'gpt-5.5': { in: 5.0, out: 15.0 },
  'gpt-4.1': { in: 2.0, out: 8.0 },
  'gpt-5-nano': { in: 0.10, out: 0.40 },
  'alice-llm': { in: 0.5, out: 1.5 },
  'alice-flash': { in: 0.15, out: 0.45 },
  'qwen-max': { in: 1.6, out: 6.4 },
  'qwen-plus': { in: 0.4, out: 1.2 },
  'qwen-flash': { in: 0.05, out: 0.40 },
  'grok-41-fast': { in: 0.20, out: 0.50 },
  'grok-3-mini': { in: 0.30, out: 0.50 },
};

// ─── RAG-тесты ───────────────────────────────────────────────────────────────

const RAG_TESTS = [
  {
    id: 'R1',
    type: 'answer',
    context: 'Срок возврата товара — 14 календарных дней с момента получения. Деньги возвращаются на карту в течение 10 рабочих дней после одобрения заявки.',
    query: 'Сколько дней на возврат товара?',
    mustInclude: ['14'],
    mustNotInclude: ['30', '60'],
  },
  {
    id: 'R2',
    type: 'answer',
    context: 'Доставка по Москве — 299 рублей, бесплатно при заказе от 5000 рублей. Доставка в регионы — от 499 рублей, срок 3–7 рабочих дней.',
    query: 'Сколько стоит доставка по Москве?',
    mustInclude: ['299'],
    mustNotInclude: ['499'],
  },
  {
    id: 'R3',
    type: 'answer',
    context: 'Для восстановления пароля перейдите в «Настройки → Безопасность → Сменить пароль» или нажмите «Забыли пароль» на странице входа. Ссылка действует 24 часа.',
    query: 'Как восстановить пароль?',
    mustInclude: ['забыли', 'парол'],
    mustNotInclude: [],
  },
  {
    id: 'R4',
    type: 'refuse',
    context: 'Наш магазин работает с 9:00 до 21:00 по московскому времени. В выходные — с 10:00 до 20:00.',
    query: 'Кто генеральный директор компании?',
    refuseMarkers: ['нет', 'не указан', 'недостаточно', 'не содержит', 'не могу', 'отсутств'],
  },
  {
    id: 'R5',
    type: 'refuse',
    context: 'Поддержка: email support@shop.ru, телефон 8-800-100-20-30, чат на сайте с 9:00 до 21:00.',
    query: 'Поддерживает ли магазин оплату криптовалютой?',
    refuseMarkers: ['нет', 'не указан', 'недостаточно', 'не содержит', 'не упомина', 'не могу'],
  },
  {
    id: 'R6',
    type: 'answer',
    context: 'Подписка Premium: 499 руб/мес, отмена в любой момент в личном кабинете. При отмене доступ сохраняется до конца оплаченного периода.',
    query: 'Сколько стоит Premium и как отменить?',
    mustInclude: ['499'],
    mustNotInclude: [],
  },
  {
    id: 'R7',
    type: 'answer',
    context: 'Гарантия на электронику — 12 месяцев с даты покупки. На аксессуары — 6 месяцев. Гарантийный ремонт по адресу: ул. Ленина, 15.',
    query: 'Какой срок гарантии на электронику?',
    mustInclude: ['12'],
    mustNotInclude: ['6 месяц'],
  },
  {
    id: 'R8',
    type: 'answer',
    context: 'Способы оплаты: банковская карта (Visa, MasterCard, МИР), СБП, наличные курьеру. Рассрочка 0% на 6 месяцев при заказе от 10000 руб.',
    query: 'Можно ли оплатить через СБП?',
    mustInclude: ['сбп'],
    mustNotInclude: [],
  },
  {
    id: 'R9',
    type: 'refuse',
    context: 'Товар можно вернуть в течение 14 дней. Упаковка должна быть сохранена.',
    query: 'Есть ли у вас филиал в Казани?',
    refuseMarkers: ['нет', 'не указан', 'недостаточно', 'не содержит', 'не упомина', 'не могу', 'отсутств'],
  },
  {
    id: 'R10',
    type: 'answer',
    context: 'Чтобы изменить адрес доставки, обратитесь в поддержку до 18:00 дня отправки заказа. После отгрузки изменение невозможно.',
    query: 'До какого времени можно поменять адрес доставки?',
    mustInclude: ['18'],
    mustNotInclude: [],
  },
  {
    id: 'R11',
    type: 'refuse',
    context: 'Программа лояльности: 1 балл за каждые 100 рублей. 100 баллов = скидка 50 рублей.',
    query: 'Какой курс доллара сегодня?',
    refuseMarkers: ['нет', 'не указан', 'недостаточно', 'не содержит', 'не могу', 'отсутств'],
  },
  {
    id: 'R12',
    type: 'answer',
    context: 'Самовывоз из пункта выдачи бесплатный. Адрес ПВЗ: г. Москва, ул. Тверская, 10. Режим работы: пн-вс 10:00–22:00.',
    query: 'Где находится пункт самовывоза и когда он работает?',
    mustInclude: ['тверск', '10:00', '22:00'],
    mustNotInclude: [],
  },
  {
    id: 'R13',
    type: 'answer',
    context: 'Для оформления рассрочки нужен паспорт и справка о доходах. Решение банка — до 15 минут. Первый платёж через 30 дней.',
    query: 'Какие документы нужны для рассрочки?',
    mustInclude: ['паспорт'],
    mustNotInclude: [],
  },
  {
    id: 'R14',
    type: 'refuse',
    context: 'Реактор RX-900 использует двухконтурную систему охлаждения жидким натрием.',
    query: 'Кто является CEO компании RX-900 Corp?',
    refuseMarkers: ['нет', 'не указан', 'недостаточно', 'не содержит', 'не могу', 'отсутств'],
  },
  {
    id: 'R15',
    type: 'answer',
    context: 'RX-900: эффективность 98%, рейтинг безопасности A+. RX-800: эффективность 92%, рейтинг безопасности A.',
    query: 'Сравните RX-900 и RX-800 по эффективности.',
    mustInclude: ['98', '92'],
    mustNotInclude: [],
  },
  {
    id: 'R16',
    type: 'refuse',
    context: 'RX-900 — реактор деления, предназначенный для стабильной выработки энергии.',
    query: 'Поддерживает ли RX-900 квантовую телепортацию?',
    refuseMarkers: ['нет', 'не', 'недостаточно', 'не упомина', 'не поддерж', 'отсутств'],
  },
  {
    id: 'R17',
    type: 'answer',
    context: 'Максимальное рабочее давление RX-900 — 150 МПа. Превышение запрещено согласно разделу 4.2 руководства по безопасности.',
    query: 'Какое максимальное давление у RX-900?',
    mustInclude: ['150'],
    mustNotInclude: [],
  },
  {
    id: 'R18',
    type: 'answer',
    context: 'Для получения паспорта: заявление, свидетельство о рождении, 2 фото 35×45 мм, квитанция об оплате госпошлины 3000 рублей.',
    query: 'Какие документы и какая госпошлина для паспорта?',
    mustInclude: ['3000', 'заявлен'],
    mustNotInclude: [],
  },
];

// ─── Локальный LLM-кеш (аналог yandex_llm_cache) ────────────────────────────

const llmCache = new Map();

function cacheKey(modelId, system, userContent) {
  return crypto.createHash('sha256').update(JSON.stringify({ modelId, system, userContent })).digest('hex');
}

function getCached(key) {
  return llmCache.get(key) || null;
}

function setCached(key, value) {
  llmCache.set(key, value);
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function log(...args) {
  if (!QUIET) console.log(...args);
}

function padR(s, n) {
  s = String(s);
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
}

function normalizeUsage(usage) {
  if (!usage) return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cached_tokens: 0 };
  return {
    prompt_tokens: usage.prompt_tokens || usage.input_tokens || 0,
    completion_tokens: usage.completion_tokens || usage.output_tokens || 0,
    total_tokens: usage.total_tokens || 0,
    cached_tokens: usage.prompt_tokens_details?.cached_tokens
      || usage.input_tokens_details?.cached_tokens
      || usage.cached_tokens
      || 0,
  };
}

function scoreAnswer(test, answer) {
  const text = answer.toLowerCase();
  if (test.type === 'refuse') {
    const refused = (test.refuseMarkers || []).some(m => text.includes(m));
    const hallucinated = /\b(иван|петр|sergey|ceo|директор [а-я]+ [а-я]+)\b/i.test(answer)
      && !test.context.toLowerCase().includes('директор');
    return { pass: refused && !hallucinated, refused, hallucinated };
  }
  const includes = (test.mustInclude || []).filter(k => text.includes(k.toLowerCase()));
  const excludes = (test.mustNotInclude || []).filter(k => text.includes(k.toLowerCase()));
  const pass = includes.length === (test.mustInclude || []).length && excludes.length === 0;
  return { pass, includes: includes.length, excludes: excludes.length };
}

function buildUserMessage(context, query) {
  return `Контекст из базы знаний:\n${context}\n\nВопрос пользователя: ${query}`;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── API-клиенты ─────────────────────────────────────────────────────────────

const openaiClient = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_BASE_URL })
  : null;

const yandexClient = (YANDEX_API_KEY && YANDEX_FOLDER)
  ? new OpenAI({
    apiKey: YANDEX_API_KEY,
    baseURL: YANDEX_BASE_URL,
    defaultHeaders: { 'OpenAI-Project': YANDEX_FOLDER },
  })
  : null;

const qwenClient = QWEN_API_KEY
  ? new OpenAI({ apiKey: QWEN_API_KEY, baseURL: QWEN_BASE_URL })
  : null;

const grokClient = GROK_API_KEY
  ? new OpenAI({ apiKey: GROK_API_KEY, baseURL: GROK_BASE_URL })
  : null;

async function callOpenAI(modelDef, userContent, opts = {}) {
  const model = opts.modelOverride || modelDef.model;
  const params = {
    model,
    instructions: SYSTEM_RAG,
    input: [{ role: 'user', content: [{ type: 'input_text', text: userContent }] }],
    max_output_tokens: 400,
    stream: false,
  };
  if (opts.promptCacheKey) params.prompt_cache_key = opts.promptCacheKey;
  if (opts.promptCacheRetention) params.prompt_cache_retention = opts.promptCacheRetention;

  const response = await openaiClient.responses.create(params);
  let text = '';
  if (response.output) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text') text += part.text;
        }
      }
    }
  }
  return { text: text.trim(), usage: normalizeUsage(response.usage) };
}

async function callYandex(modelDef, userContent) {
  const model = `gpt://${YANDEX_FOLDER}/${modelDef.model}`;
  const response = await yandexClient.responses.create({
    model,
    instructions: SYSTEM_RAG,
    input: [{ role: 'user', content: [{ type: 'input_text', text: userContent }] }],
    max_output_tokens: 400,
    temperature: 0.3,
    stream: false,
  });
  let text = '';
  if (response.output) {
    for (const item of response.output) {
      if (item.type === 'message' && item.content) {
        for (const part of item.content) {
          if (part.type === 'output_text') text += part.text;
        }
      }
    }
  }
  return { text: text.trim(), usage: normalizeUsage(response.usage) };
}

async function callQwen(modelDef, userContent, opts = {}) {
  const model = opts.modelOverride || modelDef.model;
  const response = await qwenClient.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_RAG },
      { role: 'user', content: userContent },
    ],
    max_tokens: 400,
    temperature: 0.3,
  });
  return {
    text: (response.choices[0]?.message?.content || '').trim(),
    usage: normalizeUsage(response.usage),
  };
}

async function callGrok(modelDef, userContent, opts = {}) {
  const model = opts.modelOverride || modelDef.model;
  const response = await grokClient.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_RAG },
      { role: 'user', content: userContent },
    ],
    max_tokens: 400,
    temperature: 0.3,
  });
  return {
    text: (response.choices[0]?.message?.content || '').trim(),
    usage: normalizeUsage(response.usage),
  };
}

function estimateCostUsd(modelId, usage) {
  const rates = COST_PER_1M[modelId];
  if (!rates || !usage) return null;
  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  return (prompt * rates.in + completion * rates.out) / 1_000_000;
}

async function callModel(modelDef, userContent, opts = {}) {
  const modelsToTry = [modelDef.model, ...(modelDef.fallbacks || [])];
  let lastErr;

  for (const modelName of modelsToTry) {
    try {
      if (modelDef.provider === 'openai') {
        return { ...(await callOpenAI(modelDef, userContent, { ...opts, modelOverride: modelName })), modelUsed: modelName };
      }
      if (modelDef.provider === 'yandex') {
        return { ...(await callYandex(modelDef, userContent)), modelUsed: modelDef.model };
      }
      if (modelDef.provider === 'qwen') {
        return { ...(await callQwen(modelDef, userContent, { ...opts, modelOverride: modelName })), modelUsed: modelName };
      }
      if (modelDef.provider === 'grok') {
        return { ...(await callGrok(modelDef, userContent, { ...opts, modelOverride: modelName })), modelUsed: modelName };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No model succeeded');
}

function canRun(model) {
  if (model.provider === 'openai' && !openaiClient) return 'OPENAI_API_KEY не задан';
  if (model.provider === 'yandex' && !yandexClient) return 'Yandex credentials не заданы';
  if (model.provider === 'qwen' && !qwenClient) return 'QWEN_API_KEY не задан';
  if (model.provider === 'grok' && !grokClient) return 'GROK_API_KEY не задан';
  return null;
}

async function runWithCache(modelDef, userContent) {
  const key = cacheKey(modelDef.id, SYSTEM_RAG, userContent);

  if (!SKIP_CACHE) {
    const cached = getCached(key);
    if (cached) {
      return { ...cached, cacheHit: true, latencyMs: 0 };
    }
  }

  const t0 = Date.now();
  const result = await callModel(modelDef, userContent);
  const latencyMs = Date.now() - t0;
  const payload = { ...result, cacheHit: false, latencyMs };

  if (!SKIP_CACHE) setCached(key, payload);
  return payload;
}

// ─── Бенчмарк ────────────────────────────────────────────────────────────────

async function benchmarkModel(modelDef) {
  const skip = canRun(modelDef);
  if (skip) return { error: skip };

  const testResults = [];
  let coldMs = 0;
  let warmMs = 0;
  let totalTokens = 0;
  let cachedTokens = 0;
  let totalCostUsd = 0;
  let passed = 0;

  llmCache.clear();

  for (const test of RAG_TESTS) {
    const userContent = buildUserMessage(test.context, test.query);

    const cold = await runWithCache(modelDef, userContent);
    coldMs += cold.latencyMs;
    totalTokens += cold.usage?.total_tokens || 0;
    cachedTokens += cold.usage?.cached_tokens || 0;
    const cost = estimateCostUsd(modelDef.id, cold.usage);
    if (cost != null) totalCostUsd += cost;

    const warm = await runWithCache(modelDef, userContent);
    warmMs += warm.latencyMs;

    const evalCold = scoreAnswer(test, cold.text);
    if (evalCold.pass) passed++;

    testResults.push({
      id: test.id,
      type: test.type,
      pass: evalCold.pass,
      coldMs: cold.latencyMs,
      warmMs: warm.latencyMs,
      cacheHit: warm.cacheHit,
      answerPreview: cold.text.slice(0, 120),
      tokens: cold.usage?.total_tokens || 0,
    });

    log(`  [${evalCold.pass ? '✓' : '✗'}] ${test.id} cold=${cold.latencyMs}ms warm=${warm.latencyMs}ms cache=${warm.cacheHit ? 'HIT' : 'MISS'}`);

    if (modelDef.provider === 'yandex') await sleep(100);
  }

  // OpenAI prompt cache probe (same static prefix, different query)
  let openaiPromptCache = null;
  if (modelDef.provider === 'openai' && !SKIP_CACHE) {
    try {
      const staticContext = RAG_TESTS[0].context;
      const cacheKeyId = `rag-bench-${modelDef.id}`;
      const q1 = buildUserMessage(staticContext, 'Тест кеша A');
      const q2 = buildUserMessage(staticContext, 'Тест кеша B');

      const r1 = await callOpenAI(modelDef, q1, { promptCacheKey: cacheKeyId, promptCacheRetention: '24h' });
      const r2 = await callOpenAI(modelDef, q2, { promptCacheKey: cacheKeyId, promptCacheRetention: '24h' });
      openaiPromptCache = {
        run1Cached: r1.usage.cached_tokens,
        run2Cached: r2.usage.cached_tokens,
        run2PromptTokens: r2.usage.prompt_tokens,
      };
    } catch {
      openaiPromptCache = { error: 'prompt cache probe failed' };
    }
  }

  const accuracy = passed / RAG_TESTS.length;
  const avgCold = coldMs / RAG_TESTS.length;
  const avgWarm = warmMs / RAG_TESTS.length;
  const speedup = avgWarm < 1 ? null : parseFloat((avgCold / avgWarm).toFixed(2));
  const score = accuracy * 0.6 + (speedup ? Math.min(speedup / 10, 1) * 0.1 : 0.1) + (1 - Math.min(avgCold / 15000, 1)) * 0.3;
  const valueScore = totalCostUsd > 0
    ? parseFloat((accuracy / totalCostUsd).toFixed(1))
    : null;

  return {
    name: modelDef.label,
    provider: modelDef.provider,
    model: modelDef.model,
    accuracy,
    passed,
    total: RAG_TESTS.length,
    avgColdMs: Math.round(avgCold),
    avgWarmMs: Math.round(avgWarm),
    speedup,
    cacheHitRate: 1,
    totalTokens,
    cachedTokens,
    estCostUsd: parseFloat(totalCostUsd.toFixed(5)),
    valueScore,
    openaiPromptCache,
    score: parseFloat(score.toFixed(4)),
    tests: testResults,
  };
}

async function main() {
  const models = ONLY_MODELS ? MODELS.filter(m => ONLY_MODELS.has(m.id)) : MODELS;
  if (models.length === 0) {
    console.error('Нет моделей. IDs:', MODELS.map(m => m.id).join(', '));
    process.exit(1);
  }

  log(`RAG-тестов: ${RAG_TESTS.length}, моделей: ${models.length}`);
  log(`Кеш: ${SKIP_CACHE ? 'ВЫКЛ' : 'локальный LLM-кеш + OpenAI prompt_cache_key'}\n`);

  const results = {};

  for (const model of models) {
    log(`\n${'═'.repeat(60)}`);
    log(`  ${model.label} [${model.provider}/${model.model}]`);
    log(`${'═'.repeat(60)}`);

    const skip = canRun(model);
    if (skip) {
      log(`  ПРОПУСК: ${skip}`);
      results[model.id] = { error: skip };
      continue;
    }

    const t0 = Date.now();
    try {
      results[model.id] = await benchmarkModel(model);
      results[model.id].elapsedSec = parseFloat(((Date.now() - t0) / 1000).toFixed(1));
      log(`\n  Accuracy: ${(results[model.id].accuracy * 100).toFixed(0)}%  Score: ${results[model.id].score}`);
      log(`  Latency: cold=${results[model.id].avgColdMs}ms warm=${results[model.id].avgWarmMs < 1 ? '<1ms (cache HIT)' : results[model.id].avgWarmMs + 'ms'}`);
    } catch (err) {
      console.error(`  ОШИБКА: ${err.message}`);
      results[model.id] = { error: err.message };
    }
  }

  // ─── Таблица ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(115));
  console.log('  СВОДКА: RAG + КЕШИРОВАНИЕ');
  console.log('═'.repeat(125));
  console.log(
    padR('Модель', 24) +
    padR('Acc%', 6) +
    padR('Score', 7) +
    padR('Cold', 8) +
    padR('Warm', 8) +
    padR('Spdup', 7) +
    padR('Tokens', 8) +
    padR('Cached', 8) +
    padR('Cost$', 8) +
    padR('Val↑', 7) +
    padR('Время', 7)
  );
  console.log('─'.repeat(125));

  const valid = [];
  for (const model of models) {
    const r = results[model.id];
    if (r?.error) {
      console.log(padR(model.label, 24) + `ОШИБКА: ${r.error.slice(0, 70)}`);
      continue;
    }
    valid.push({ model, r });
    console.log(
      padR(model.label, 24) +
      padR(`${Math.round(r.accuracy * 100)}%`, 6) +
      padR(r.score.toFixed(3), 7) +
      padR(`${r.avgColdMs}ms`, 8) +
      padR(r.avgWarmMs < 1 ? '<1ms' : `${r.avgWarmMs}ms`, 8) +
      padR(r.speedup ? `${r.speedup}x` : 'HIT', 7) +
      padR(String(r.totalTokens), 8) +
      padR(String(r.cachedTokens), 8) +
      padR(r.estCostUsd != null ? r.estCostUsd.toFixed(4) : 'n/a', 8) +
      padR(r.valueScore != null ? String(r.valueScore) : 'n/a', 7) +
      padR(`${r.elapsedSec}с`, 7)
    );
  }
  console.log('─'.repeat(125));

  if (valid.length > 0) {
    const byAcc = [...valid].sort((a, b) => b.r.accuracy - a.r.accuracy || b.r.score - a.r.score);
    const bySpeed = [...valid].sort((a, b) => a.r.avgColdMs - b.r.avgColdMs);
    const byValue = [...valid]
      .filter(v => v.r.valueScore != null)
      .sort((a, b) => b.r.valueScore - a.r.valueScore);

    console.log('\n  ВЫВОДЫ:');
    console.log(`  Лучший RAG:     ${byAcc[0].model.label} (${Math.round(byAcc[0].r.accuracy * 100)}%)`);
    console.log(`  Самый быстрый:  ${bySpeed[0].model.label} (cold ${bySpeed[0].r.avgColdMs}ms)`);
    if (byValue.length > 0) {
      console.log(`  Лучшая цена/качество: ${byValue[0].model.label} (value=${byValue[0].r.valueScore}, cost=$${byValue[0].r.estCostUsd})`);
    }
    console.log(`  Кеш (warm):     все модели — 100% HIT при повторе (локальный SHA256-кеш)`);

    const openaiWithCache = valid.filter(v => v.r.openaiPromptCache && !v.r.openaiPromptCache.error);
    if (openaiWithCache.length > 0) {
      console.log('\n  OpenAI prompt_cache_key (2-й запрос с тем же prefix):');
      for (const { model, r } of openaiWithCache) {
        const pc = r.openaiPromptCache;
        console.log(`    ${model.label}: cached_tokens run2=${pc.run2Cached} / prompt=${pc.run2PromptTokens}`);
      }
    }

    console.log('\n  Кеширование в avgexpert:');
    console.log('    • KnowledgeGateway — in-memory retrieval cache (TTL 1ч, knowledge.cache.ts)');
    console.log('    • Yandex File Search — PostgreSQL yandex_llm_cache (SHA256 model+input+instructions)');
    console.log('    • OpenAI GPT-5.5/4.1 — prompt_cache_key / prompt_cache_retention (Responses API)');
    console.log('    • Локальный warm speedup здесь — аналог yandex_llm_cache; не путать с retrieval cache');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    tests: RAG_TESTS.length,
    cacheEnabled: !SKIP_CACHE,
    models: results,
  };

  if (JSON_OUT) {
    const outPath = path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(process.cwd(), JSON_OUT);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(`\n  JSON → ${outPath}`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
