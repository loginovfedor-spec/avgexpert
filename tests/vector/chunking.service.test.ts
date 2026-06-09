import test from 'node:test';
import assert from 'node:assert/strict';
import { ChunkingService } from '../../src/modules/ingestion/chunking.service';

test('ChunkingService', async (t) => {
  const chunker = new ChunkingService();

  await t.test('возвращает пустой массив для пустого текста', () => {
    assert.deepEqual(chunker.chunkText(''), []);
    assert.deepEqual(chunker.chunkText('   \n  '), []);
  });

  await t.test('чанкует plain txt с overlap', () => {
    const text = 'абвгд '.repeat(200).trim();
    const chunks = chunker.chunkText(text, { chunkSize: 100, chunkOverlap: 20 });
    assert.ok(chunks.length > 1);
    assert.equal(chunks[0].chunkIndex, 0);
    assert.ok(chunks[0].enrichedText.includes(chunks[0].text));
  });

  await t.test('section-aware: сохраняет путь и обогащает контекстом', () => {
    const md = [
      '# Глава 1. Введение',
      '',
      'Первый абзац главы.',
      '',
      '## 1.1. Подраздел',
      '',
      'Текст подраздела с маркером alpha-beta-gamma.',
    ].join('\n');

    const chunks = chunker.chunkText(md, {
      chunkSize: 500,
      chunkOverlap: 50,
      bookTitle: 'Том 1',
    });

    assert.ok(chunks.length >= 2);
    const sectionChunk = chunks.find(c => c.text.includes('alpha-beta-gamma'));
    assert.ok(sectionChunk);
    assert.ok(sectionChunk!.sectionPath?.includes('Том 1'));
    assert.ok(sectionChunk!.sectionPath?.includes('Глава 1'));
    assert.ok(sectionChunk!.enrichedText.startsWith('Контекст:'));
    assert.equal(sectionChunk!.chapterIndex, 1);
  });
});
