
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Set env for testing
process.env.NODE_ENV = 'test';
process.env.KNOWLEDGE_GATEWAY_ENABLED = 'true';
process.env.AVGEXPERT_SECRET = 'test_secret_32_chars_long_for_validation';

const knowledgeGateway = require('../../src/modules/knowledge/knowledge.gateway');
const ingestionService = require('../../src/modules/knowledge/ingestion.service');
const knowledgeRepository = require('../../src/modules/knowledge/knowledge.repository');
const db = require('../../src/core/sqlite');

test('KnowledgeGateway MVP Integration', async (t) => {
  // Cleanup test DB
  db.prepare('DELETE FROM knowledge_chunks').run();
  db.prepare('DELETE FROM knowledge_sources').run();

  await t.test('1. Ingestion: should process a markdown file', async () => {
    const testFilePath = path.join(__dirname, 'test_doc.md');
    fs.writeFileSync(testFilePath, '# Test Document\n\nAvgExpert is a modular agent platform. It supports RAG and Tooling.\n\nSemantic Protocol v0.2 is used for claim extraction.');
    
    const result = await ingestionService.ingest(testFilePath, {
      title: 'Test Doc',
      metadata: { priority: 'high' }
    });

    assert.strictEqual(result.source.title, 'Test Doc');
    assert.ok(result.chunkCount > 0);
    
    // Cleanup temp file
    fs.unlinkSync(testFilePath);
  });

  await t.test('2. Retrieval: should find relevant chunks using FTS5', async () => {
    const results = await knowledgeGateway.retrieve('agent platform', {
      settings: { rag_mode: 'balanced' }
    });

    assert.strictEqual(results.mode, 'balanced');
    assert.ok(results.chunks.length > 0, 'Should find at least one chunk');
    assert.ok(results.chunks[0].text.includes('agent platform'));
    assert.strictEqual(results.chunks[0].provenance.title, 'Test Doc');
  });

  await t.test('3. Answerability: should apply refusal policy on unanswerable query', async () => {
    const results = await knowledgeGateway.retrieve('quantum physics', {
      settings: { 
        rag_mode: 'balanced',
        rag_answerability_policy: 'refusal'
      }
    });

    // Score should be low or 0
    const maxScore = results.chunks.length > 0 ? Math.max(...results.chunks.map(c => c.score)) : 0;
    if (results.chunks.length === 0 || maxScore < 0.3) {
      assert.strictEqual(results.metadata.shouldRefuse, true);
    }
  });

  await t.test('4. Citation: formatContext should generate traceable markers', () => {
    const results = {
      mode: 'balanced',
      chunks: [
        {
          text: 'Example chunk text',
          score: 0.9,
          provenance: { title: 'Doc A', uri: 'file://a.md' }
        }
      ]
    };
    
    const context = knowledgeGateway.formatContext(results);
    assert.ok(context.includes('<context_boundary index="0">'));
    assert.ok(context.includes('Source: Doc A'));
    assert.ok(context.includes('Example chunk text'));
  });
});
