import test from 'node:test';
import assert from 'node:assert/strict';
import knowledgeRepository = require('../../src/modules/knowledge/knowledge.repository');
import SQLiteFTSRetriever = require('../../src/modules/knowledge/adapters/sqlite_fts.adapter');

const sqliteFTSAdapter = new SQLiteFTSRetriever();

test('SQLite FTS5 RAG Integration Tests', async (t) => {
  await t.test('8.1: should insert and search chunks using FTS5 (Integration)', async () => {
    const text = 'Это тестовый документ для проверки полнотекстового поиска.';
    const source = knowledgeRepository.createSource({
      uri: 'test://fts5/test_doc_1',
      title: 'test_doc_1',
      type: 'test',
      metadata: { category: 'test_cat' }
    });
    knowledgeRepository.addChunks(source.id, [{ text, metadata: { author: 'Test', category: 'test_cat' } }]);
    
    const results = await sqliteFTSAdapter.search('проверки полнотекстового', { limit: 5 });
    assert.ok(results.length > 0);
    assert.match(results[0].text, /тестовый документ/);
  });

  await t.test('8.2: should evaluate Precision/Recall for synthetic data (Evaluation)', async () => {
    // 1. Prepare synthetic docs
    const docs = [
      { id: 'doc_apple', text: 'Яблоко — это сладкий и полезный фрукт, богатый железом. marker_apple' },
      { id: 'doc_banana', text: 'Банан — тропический фрукт, содержит много калия. marker_banana_potassium' },
      { id: 'doc_tomato', text: 'Помидор — это овощ, хотя с точки зрения ботаники это ягода. marker_tomato' }
    ];

    for (const doc of docs) {
      const source = knowledgeRepository.createSource({
        uri: `test://fts5/${doc.id}`,
        title: doc.id,
        type: 'test',
        metadata: { category: 'test_eval' }
      });
      knowledgeRepository.addChunks(source.id, [{ text: doc.text, metadata: { document_id: doc.id, category: 'test_eval' } }]);
    }

    // 2. Query
    const query = 'marker_banana_potassium';
    const results = await sqliteFTSAdapter.search(query, { limit: 1 });

    // 3. Evaluate Precision & Recall
    // True Positive: doc_banana retrieved.
    const retrievedIds = results.map((r: any) => r.provenance.document_id || r.provenance.title);
    const relevantIds = ['doc_banana'];
    
    const truePositives = retrievedIds.filter((id: string) => relevantIds.includes(id)).length;
    const precision = truePositives / retrievedIds.length || 0;
    const recall = truePositives / relevantIds.length || 0;

    assert.strictEqual(precision, 1); // Top 1 must be doc_banana
    assert.strictEqual(recall, 1);    // 1 relevant doc, 1 retrieved
  });
});
