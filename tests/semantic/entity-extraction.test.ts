import test from 'node:test';
import assert from 'node:assert/strict';
import { entityExtractionService } from '../../src/modules/semantic/entity-extraction.service';

test('entity extraction: glossary and metadata terms', () => {
  const result = entityExtractionService.extract({
    body: 'Бытийность и Реальность связаны через ЛБПО и Традицию.',
    bookTitle: 'Том 1',
    chapterTitle: 'Глава 8. Вложенность: Вселенная, Мир, МетаРеальность, Реальность',
    sectionPath: 'Том 1 > Глава 8 > Вложенность',
  });

  const keys = result.entities.map((item) => item.canonicalKey);
  assert.ok(keys.includes('бытийность'));
  assert.ok(keys.includes('реальность'));
  assert.ok(keys.includes('лбпо'));
  assert.ok(keys.includes('том 1'));
  assert.ok(result.domainTags.length > 0);
});

test('entity extraction: deduplicates repeated concepts', () => {
  const result = entityExtractionService.extract({
    body: 'Реальность описывает Реальность и реальность как феномен.',
    bookTitle: 'Том 2',
  });

  const reality = result.entities.filter((item) => item.canonicalKey === 'реальность');
  assert.equal(reality.length, 1);
});
