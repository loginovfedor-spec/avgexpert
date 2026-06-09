/**
 * Сравнение качества эмбеддингов для русского текста (RAG-бенчмарк)
 *
 * Модели:
 *   OpenAI  — text-embedding-3-large / small
 *   Yandex  — text-search-doc, text-search-query, text-embeddings-v2-doc
 *             + yandex-rag (query→doc, как в production RAG)
 *   Qwen    — text-embedding-v4 (512/768/1024 dims)
 *
 * Метрики:
 *   closeAvg / farAvg / margin — параwise семантика
 *   rankCorrect — порядок good > mediocre > bad
 *   rankGap     — средний (sim_good − sim_bad) по ranking-тестам
 *   score       — композит для рекомендации
 *
 * Запуск:
 *   node scratch/compare_embeddings.js
 *   node scratch/compare_embeddings.js --only=openai-small,yandex-rag
 *   node scratch/compare_embeddings.js --json=scratch/embed_results.json --quiet
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
require('dotenv').config({
  path: path.join(__dirname, '..', 'src/modules/providers/config/yandex_file_search.env'),
});
const OpenAI = require('openai');
const fetch = require('node-fetch');

// ─── CLI ─────────────────────────────────────────────────────────────────────

const ARGS = process.argv.slice(2);
const FLAG = (name) => ARGS.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const HAS_FLAG = (name) => ARGS.includes(`--${name}`);

const ONLY_MODELS = FLAG('only') ? new Set(FLAG('only').split(',').map(s => s.trim())) : null;
const JSON_OUT = FLAG('json');
const QUIET = HAS_FLAG('quiet');

// ─── Конфигурация ───────────────────────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const YANDEX_API_KEY = process.env.YANDEX_CLOUD_API_KEY || process.env.YANDEX_EMBEDDINGS_API_KEY;
const YANDEX_FOLDER  = process.env.YANDEX_CLOUD_FOLDER
  || (process.env.YANDEX_EMBEDDINGS_MODEL || '').match(/^emb:\/\/([^/]+)\//)?.[1];
const YANDEX_EMB_URL = process.env.YANDEX_EMBEDDINGS_BASE_URL
  || 'https://ai.api.cloud.yandex.net/foundationModels/v1/textEmbedding';
const QWEN_API_KEY   = process.env.QWEN_API_KEY;
const QWEN_BASE_URL  = process.env.QWEN_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

const YANDEX_DOC_SUFFIX   = 'text-search-doc/latest';
const YANDEX_QUERY_SUFFIX = 'text-search-query/latest';

const MODELS = [
  { id: 'openai-large',        provider: 'openai',  name: 'OpenAI text-embedding-3-large',     dims: 3072, apiModel: 'text-embedding-3-large' },
  { id: 'openai-small',        provider: 'openai',  name: 'OpenAI text-embedding-3-small',     dims: 1536, apiModel: 'text-embedding-3-small' },
  { id: 'yandex-search-doc',   provider: 'yandex',  name: 'Yandex text-search-doc',            modelSuffix: YANDEX_DOC_SUFFIX,   role: 'doc' },
  { id: 'yandex-search-query', provider: 'yandex',  name: 'Yandex text-search-query',          modelSuffix: YANDEX_QUERY_SUFFIX, role: 'query' },
  { id: 'yandex-v2-doc',       provider: 'yandex',  name: 'Yandex text-embeddings-v2-doc',     modelSuffix: 'text-embeddings-v2-doc/latest', role: 'doc' },
  { id: 'yandex-rag',          provider: 'yandex-rag', name: 'Yandex RAG (query→doc)',          dims: 256 },
  { id: 'qwen-8b',             provider: 'qwen',    name: 'Qwen3-Embedding-8B (v4, 1024d)',    dims: 1024 },
  { id: 'qwen-4b',             provider: 'qwen',    name: 'Qwen3-Embedding-4B (v4, 768d)',     dims: 768 },
  { id: 'qwen-06b',            provider: 'qwen',    name: 'Qwen3-Embedding-0.6B (v4, 512d)',   dims: 512 },
];

const COST_PER_1M = {
  'openai-large':        0.13,
  'openai-small':        0.02,
  'yandex-search-doc':   0.0014,
  'yandex-search-query': 0.0014,
  'yandex-v2-doc':       0.0014,
  'yandex-rag':          0.0014,
  'qwen-8b':             0.07,
  'qwen-4b':             0.07,
  'qwen-06b':            0.07,
};

// ─── Тестовые данные ─────────────────────────────────────────────────────────

const CLOSE_PAIRS = [
  ['Как оформить возврат товара?', 'Какой порядок возврата продукции?'],
  ['Сколько стоит доставка?', 'Какова цена доставки заказа?'],
  ['Где находится ближайший офис?', 'Подскажите адрес ближайшего отделения.'],
  ['Как сбросить пароль?', 'Не могу вспомнить пароль, как восстановить доступ?'],
  ['Какие документы нужны для регистрации?', 'Перечень документов для оформления регистрации.'],
  ['Когда будет доставлен заказ?', 'Сроки доставки моего заказа.'],
  ['Как связаться с поддержкой?', 'Телефон и email службы поддержки.'],
  ['Можно ли изменить адрес доставки?', 'Хочу поменять адрес, куда привезут заказ.'],
  ['Какие способы оплаты доступны?', 'Варианты оплаты заказа.'],
  ['Как отменить подписку?', 'Хочу отказаться от подписки, как это сделать?'],
];

const FAR_PAIRS = [
  ['Как приготовить борщ?', 'Квантовая запутанность частиц.'],
  ['Ремонт автомобильного двигателя', 'История древнего Египта.'],
  ['Программирование на JavaScript', 'Рецепт шарлотки с яблоками.'],
  ['Архитектура микросервисов', 'Правила ухода за комнатными растениями.'],
  ['Финансовый анализ предприятия', 'Погода в Мурманске зимой.'],
  ['Машинное обучение и нейросети', 'Расписание поездов Москва-Казань.'],
  ['Правовое регулирование труда', 'Состав атмосферы Юпитера.'],
  ['Стратегии маркетинга в интернете', 'Анатомия человеческого сердца.'],
];

const RANKING_TESTS = [
  {
    query: 'Как оформить возврат товара в интернет-магазине?',
    good:      'Для возврата товара заполните заявку в личном кабинете, укажите номер заказа и причину возврата. Деньги вернутся в течение 10 рабочих дней.',
    mediocre:  'Наш магазин осуществляет продажу товаров с доставкой по всей России. У нас широкий ассортимент.',
    bad:       'Погода сегодня солнечная, температура воздуха +22 градуса, ожидается небольшой ветер.',
  },
  {
    query: 'Какие документы нужны для получения паспорта?',
    good:      'Для получения паспорта необходимо предоставить: заявление установленного образца, свидетельство о рождении, две фотографии 35×45 мм и квитанцию об оплате госпошлины.',
    mediocre:  'Документы можно подать в электронном виде через портал государственных услуг Российской Федерации.',
    bad:       'Рецепт приготовления пиццы: тесто, томатный соус, моцарелла, базилик, оливковое масло.',
  },
  {
    query: 'Почему не работает интернет?',
    good:      'Проверьте подключение кабеля к роутеру, перезагрузите маршрутизатор. Если индикатор не горит, обратитесь в техническую поддержку по номеру 8-800.',
    mediocre:  'Наша компания предоставляет услуги широкополосного доступа в интернет на скорости до 500 Мбит/с.',
    bad:       'Великая Китайская стена была построена для защиты от набегов кочевников в III веке до нашей эры.',
  },
  {
    query: 'Как продлить страховой полис ОСАГО?',
    good:      'Продление ОСАГО: за 20 дней до окончания полиса подайте заявку через личный кабинет страховой компании или на сайте РСА, оплатите премию.',
    mediocre:  'Страхование автогражданской ответственности обязательно для всех владельцев транспортных средств в РФ.',
    bad:       'Классический балет «Лебединое озеро» впервые был поставлен в 1877 году.',
  },
];

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a?.length} vs ${b?.length}`);
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function padR(s, n) {
  s = String(s);
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
}

function log(...args) {
  if (!QUIET) console.log(...args);
}

function collectBenchmarkTexts() {
  /** @type {{ text: string, role: 'query'|'doc'|'any' }[]} */
  const items = [];

  for (const [a, b] of CLOSE_PAIRS) {
    items.push({ text: a, role: 'query' });
    items.push({ text: b, role: 'query' });
  }
  for (const [a, b] of FAR_PAIRS) {
    items.push({ text: a, role: 'any' });
    items.push({ text: b, role: 'any' });
  }
  for (const rt of RANKING_TESTS) {
    items.push({ text: rt.query, role: 'query' });
    items.push({ text: rt.good, role: 'doc' });
    items.push({ text: rt.mediocre, role: 'doc' });
    items.push({ text: rt.bad, role: 'doc' });
  }

  return items;
}

function dedupeTexts(items) {
  const unique = [];
  const indexByKey = new Map();

  for (const item of items) {
    const key = `${item.role}\0${item.text}`;
    if (!indexByKey.has(key)) {
      indexByKey.set(key, unique.length);
      unique.push(item);
    }
  }

  return { unique, indexByKey };
}

function compositeScore({ margin, rankCorrect, rankTotal, rankGap, farAvg }) {
  const rankRate = rankCorrect / rankTotal;
  const separation = Math.max(0, 1 - farAvg);
  return margin * 0.35 + rankRate * 0.25 + rankGap * 0.25 + separation * 0.15;
}

// ─── Провайдеры ──────────────────────────────────────────────────────────────

const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const qwenClient   = QWEN_API_KEY ? new OpenAI({ apiKey: QWEN_API_KEY, baseURL: QWEN_BASE_URL }) : null;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getYandexEmbedding(text, modelSuffix, retries = 3) {
  if (!YANDEX_API_KEY || !YANDEX_FOLDER) {
    throw new Error('YANDEX_CLOUD_API_KEY и YANDEX_CLOUD_FOLDER обязательны');
  }
  const modelUri = `emb://${YANDEX_FOLDER}/${modelSuffix}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const resp = await fetch(YANDEX_EMB_URL, {
      method: 'POST',
      headers: {
        Authorization: `Api-Key ${YANDEX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ modelUri, text }),
    });
    const data = await resp.json();

    if (resp.ok) {
      const emb = data.embedding;
      if (!Array.isArray(emb)) throw new Error(`Yandex [${modelSuffix}]: invalid response`);
      return emb;
    }

    const msg = data.message || JSON.stringify(data);
    const rateLimited = resp.status === 429 || /rate quota limit/i.test(msg);
    if (rateLimited && attempt < retries) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    throw new Error(`Yandex [${modelSuffix}]: ${msg}`);
  }
}

async function embedYandexSequential(uniqueItems, modelSuffix) {
  const results = [];
  for (let i = 0; i < uniqueItems.length; i++) {
    if (i > 0) await sleep(120);
    results.push(await getYandexEmbedding(uniqueItems[i].text, modelSuffix));
  }
  return results;
}

async function embedYandexRagBatch(uniqueItems) {
  const results = [];
  for (let i = 0; i < uniqueItems.length; i++) {
    if (i > 0) await sleep(120);
    const item = uniqueItems[i];
    const suffix = item.role === 'query' ? YANDEX_QUERY_SUFFIX : YANDEX_DOC_SUFFIX;
    results.push(await getYandexEmbedding(item.text, suffix));
  }
  return results;
}

async function getBatchEmbeddings(uniqueItems, model) {
  const { provider } = model;

  if (provider === 'openai') {
    if (!openaiClient) throw new Error('OPENAI_API_KEY не задан');
    const res = await openaiClient.embeddings.create({
      model: model.apiModel,
      input: uniqueItems.map(i => i.text),
    });
    return res.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
  }

  if (provider === 'qwen') {
    if (!qwenClient) throw new Error('QWEN_API_KEY не задан');
    const texts = uniqueItems.map(i => i.text);
    const allEmbs = [];
    const BATCH = 10;
    for (let i = 0; i < texts.length; i += BATCH) {
      const chunk = texts.slice(i, i + BATCH);
      const res = await qwenClient.embeddings.create({
        model: 'text-embedding-v4',
        input: chunk,
        dimensions: model.dims,
        encoding_format: 'float',
      });
      allEmbs.push(...res.data.sort((a, b) => a.index - b.index).map(d => d.embedding));
      if (i + BATCH < texts.length) await sleep(300);
    }
    return allEmbs;
  }

  if (provider === 'yandex') {
    return embedYandexSequential(uniqueItems, model.modelSuffix);
  }

  if (provider === 'yandex-rag') {
    return embedYandexRagBatch(uniqueItems);
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function buildEmbMap(uniqueItems, embeddings, indexByKey) {
  const embMap = new Map();
  for (const item of uniqueItems) {
    const key = `${item.role}\0${item.text}`;
    const idx = indexByKey.get(key);
    embMap.set(key, embeddings[idx]);
  }
  return embMap;
}

function getEmb(embMap, text, role = 'any') {
  return embMap.get(`${role}\0${text}`) || embMap.get(`any\0${text}`);
}

function canRunModel(model) {
  if (model.provider === 'openai' && !openaiClient) return 'OPENAI_API_KEY не задан';
  if (model.provider === 'qwen' && !qwenClient) return 'QWEN_API_KEY не задан';
  if ((model.provider === 'yandex' || model.provider === 'yandex-rag') && (!YANDEX_API_KEY || !YANDEX_FOLDER)) {
    return 'YANDEX_CLOUD_API_KEY / YANDEX_CLOUD_FOLDER не заданы';
  }
  return null;
}

// ─── Оценка ──────────────────────────────────────────────────────────────────

function evaluateModel(embMap) {
  const closeScores = CLOSE_PAIRS.map(([a, b]) =>
    cosineSim(getEmb(embMap, a, 'query'), getEmb(embMap, b, 'query'))
  );
  const farScores = FAR_PAIRS.map(([a, b]) =>
    cosineSim(getEmb(embMap, a, 'any'), getEmb(embMap, b, 'any'))
  );

  let rankCorrect = 0;
  const rankGaps = [];
  const rankDetails = [];

  for (const rt of RANKING_TESTS) {
    const qEmb = getEmb(embMap, rt.query, 'query');
    const simGood     = cosineSim(qEmb, getEmb(embMap, rt.good, 'doc'));
    const simMediocre = cosineSim(qEmb, getEmb(embMap, rt.mediocre, 'doc'));
    const simBad      = cosineSim(qEmb, getEmb(embMap, rt.bad, 'doc'));
    const correctOrder = simGood > simMediocre && simMediocre > simBad;
    if (correctOrder) rankCorrect++;
    rankGaps.push(simGood - simBad);
    rankDetails.push({ query: rt.query, simGood, simMediocre, simBad, correctOrder });
  }

  const closeAvg = mean(closeScores);
  const farAvg = mean(farScores);
  const margin = closeAvg - farAvg;
  const rankGap = mean(rankGaps);
  const rankTotal = RANKING_TESTS.length;

  return {
    closeAvg, closeMin: Math.min(...closeScores), closeMax: Math.max(...closeScores), closeStd: stddev(closeScores),
    farAvg, farMin: Math.min(...farScores), farMax: Math.max(...farScores), farStd: stddev(farScores),
    margin,
    rankCorrect, rankTotal, rankGap,
    rankDetails,
    score: compositeScore({ margin, rankCorrect, rankTotal, rankGap, farAvg }),
  };
}

// ─── Основной тест ───────────────────────────────────────────────────────────

async function runBenchmark() {
  const allItems = collectBenchmarkTexts();
  const { unique, indexByKey } = dedupeTexts(allItems);
  const models = ONLY_MODELS
    ? MODELS.filter(m => ONLY_MODELS.has(m.id))
    : MODELS;

  if (models.length === 0) {
    console.error('Нет моделей для запуска. Доступные id:', MODELS.map(m => m.id).join(', '));
    process.exit(1);
  }

  log(`Уникальных текстов: ${unique.length} (из ${allItems.length} с учётом role)`);
  log(`Моделей: ${models.length}\n`);

  const results = {};

  for (const model of models) {
    log(`\n${'═'.repeat(70)}`);
    log(`  Модель: ${model.name}  [${model.provider}]`);
    log(`${'═'.repeat(70)}`);

    const skipReason = canRunModel(model);
    if (skipReason) {
      log(`  ПРОПУСК: ${skipReason}`);
      results[model.id] = { error: skipReason };
      continue;
    }

    const t0 = Date.now();
    log(`  Эмбеддинги: ${unique.length} уникальных текстов...`);

    let embeddings;
    try {
      embeddings = await getBatchEmbeddings(unique, model);
    } catch (err) {
      console.error(`  ОШИБКА: ${err.message}`);
      results[model.id] = { error: err.message };
      continue;
    }

    const embMap = buildEmbMap(unique, embeddings, indexByKey);
    const metrics = evaluateModel(embMap);
    const elapsed = (Date.now() - t0) / 1000;
    const dims = embeddings[0]?.length ?? '?';

    log(`  Время: ${elapsed.toFixed(1)} с, dims=${dims}\n`);
    log(`  Close↑ avg=${metrics.closeAvg.toFixed(4)} σ=${metrics.closeStd.toFixed(4)}`);
    log(`  Far↓   avg=${metrics.farAvg.toFixed(4)} σ=${metrics.farStd.toFixed(4)}`);
    log(`  Margin=${metrics.margin.toFixed(4)}  Rank=${metrics.rankCorrect}/${metrics.rankTotal}  Gap=${metrics.rankGap.toFixed(4)}  Score=${metrics.score.toFixed(4)}`);

    if (!QUIET) {
      log('\n  Ранжирование:');
      for (const rd of metrics.rankDetails) {
        const mark = rd.correctOrder ? '✓' : '✗';
        log(`  [${mark}] g=${rd.simGood.toFixed(4)} m=${rd.simMediocre.toFixed(4)} b=${rd.simBad.toFixed(4)}  «${rd.query.slice(0, 50)}»`);
      }
    }

    results[model.id] = {
      name: model.name,
      provider: model.provider,
      dims,
      elapsed: parseFloat(elapsed.toFixed(1)),
      apiCalls: unique.length,
      costPer1M: COST_PER_1M[model.id],
      ...metrics,
      rankDetails: undefined,
    };
  }

  // ─── Сводная таблица ──────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(110));
  console.log('  СВОДНАЯ ТАБЛИЦА');
  console.log('═'.repeat(110));
  console.log(
    padR('Модель', 38) +
    padR('Dims', 6) +
    padR('Close↑', 8) +
    padR('Far↓', 8) +
    padR('Margin', 8) +
    padR('Rank', 7) +
    padR('Gap↑', 8) +
    padR('Score↑', 8) +
    padR('Время', 7)
  );
  console.log('─'.repeat(110));

  const valid = [];
  for (const model of models) {
    const r = results[model.id];
    if (r?.error) {
      console.log(padR(model.name, 38) + `ОШИБКА: ${r.error.slice(0, 60)}`);
      continue;
    }
    valid.push({ model, r });
    console.log(
      padR(r.name, 38) +
      padR(String(r.dims), 6) +
      padR(r.closeAvg.toFixed(4), 8) +
      padR(r.farAvg.toFixed(4), 8) +
      padR(r.margin.toFixed(4), 8) +
      padR(`${r.rankCorrect}/${r.rankTotal}`, 7) +
      padR(r.rankGap.toFixed(4), 8) +
      padR(r.score.toFixed(4), 8) +
      padR(`${r.elapsed}с`, 7)
    );
  }
  console.log('─'.repeat(110));

  if (valid.length > 0) {
    const byScore = [...valid].sort((a, b) => b.r.score - a.r.score);
    const best = byScore[0];

    console.log('\n  АНАЛИЗ (композитный Score = margin×0.35 + rank×0.25 + gap×0.25 + (1−far)×0.15):');
    console.log(`  ★ Лучший баланс:  ${best.r.name} (score=${best.r.score.toFixed(4)})`);

    const prodDefault = results['yandex-rag'];
    if (prodDefault && !prodDefault.error) {
      console.log(`  Production RAG (yandex-rag): margin=${prodDefault.margin.toFixed(4)}, rank=${prodDefault.rankCorrect}/${prodDefault.rankTotal}, score=${prodDefault.score.toFixed(4)}`);
    }

    console.log('\n  Топ-3 по Score:');
    for (const { r } of byScore.slice(0, 3)) {
      const cost = r.costPer1M != null ? `$${r.costPer1M}/1M tok` : 'n/a';
      console.log(`    ${r.name.padEnd(42)} score=${r.score.toFixed(4)}  ${cost}`);
    }

    console.log('\n  Заметки:');
    console.log('    • yandex-rag — query через text-search-query, документы через text-search-doc (как в avgexpert)');
    console.log('    • Высокий Close у Yandex doc/query — артефакт симметричного теста; для RAG смотрите yandex-rag');
    console.log('    • Qwen 0.6B/4B — лучшее far-разделение при меньшей стоимости, чем OpenAI large');
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    uniqueTexts: unique.length,
    totalTexts: allItems.length,
    models: results,
  };

  if (JSON_OUT) {
    const outPath = path.isAbsolute(JSON_OUT) ? JSON_OUT : path.join(process.cwd(), JSON_OUT);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
    console.log(`\n  JSON → ${outPath}`);
  }

  return payload;
}

runBenchmark().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
