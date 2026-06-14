import type {
  EntityExtractionInput,
  EntityExtractionResult,
  ExtractedEntity,
  SemanticNodeType,
} from './types';

const GLOSSARY_TERMS = [
  'эзоагностика реальности',
  'реальность',
  'бытийность',
  'инобытийность',
  'локальная бытийность',
  'разумность',
  'метареальность',
  'человечество',
  'социум',
  'эгрегор',
  'лбпо',
  'лпо',
  'традиция',
  'храм',
  'шаман',
  'гармоничность',
  'крестик жизни',
  'пирамидка',
];

const TITLE_TERM_RE =
  /(?:^|[^\p{L}])([А-ЯЁ][\p{L}]{2,}(?:\s+[А-ЯЁ][\p{L}]{2,}){0,4})(?:[^\p{L}]|$)/gu;
const ABBR_RE = /(?:^|[^\p{L}])([А-ЯЁ]{2,8})(?:[^\p{L}]|$)/gu;
const STOPWORDS = new Set([
  'это',
  'как',
  'для',
  'или',
  'при',
  'что',
  'где',
  'том',
  'часть',
  'глава',
  'шаг',
  'основные',
  'концепции',
  'работа',
  'себя',
]);

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim();
}

function pushEntity(
  bucket: Map<string, ExtractedEntity>,
  label: string,
  nodeType: SemanticNodeType,
  source: ExtractedEntity['source']
): void {
  const trimmed = label.replace(/\s+/g, ' ').trim();
  if (trimmed.length < 2) return;

  const canonicalKey = normalizeKey(trimmed);
  if (!canonicalKey || STOPWORDS.has(canonicalKey)) return;

  if (!bucket.has(canonicalKey)) {
    bucket.set(canonicalKey, {
      label: trimmed,
      canonicalKey,
      nodeType,
      source,
    });
  }
}

function extractFromTitles(input: EntityExtractionInput, bucket: Map<string, ExtractedEntity>): void {
  if (input.bookTitle) {
    pushEntity(bucket, input.bookTitle, 'domain', 'metadata');
  }
  if (input.chapterTitle) {
    pushEntity(bucket, input.chapterTitle, 'section', 'metadata');
  }
  if (input.sectionTitle) {
    pushEntity(bucket, input.sectionTitle, 'section', 'metadata');
  }
  if (input.sectionPath) {
    for (const part of input.sectionPath.split('>')) {
      pushEntity(bucket, part.trim(), 'section', 'metadata');
    }
  }
}

function extractFromBody(body: string, bucket: Map<string, ExtractedEntity>): void {
  const text = body.replace(/\*\*/g, ' ');

  for (const term of GLOSSARY_TERMS) {
    const pattern = new RegExp(`(?:^|[^\\p{L}])${term}(?:[^\\p{L}]|$)`, 'iu');
    if (pattern.test(text)) {
      pushEntity(bucket, term, 'concept', 'glossary');
    }
  }

  for (const match of text.matchAll(TITLE_TERM_RE)) {
    pushEntity(bucket, match[1], 'entity', 'body');
  }

  for (const match of text.matchAll(ABBR_RE)) {
    pushEntity(bucket, match[1], 'concept', 'body');
  }
}

function buildDomainTags(entities: ExtractedEntity[], input: EntityExtractionInput): string[] {
  const tags = new Set<string>();

  if (input.bookTitle) tags.add(normalizeKey(input.bookTitle));
  if (input.chapterTitle) tags.add(normalizeKey(input.chapterTitle));

  for (const entity of entities) {
    if (entity.nodeType === 'domain' || entity.nodeType === 'concept') {
      tags.add(entity.canonicalKey);
    }
  }

  return [...tags].filter(Boolean).slice(0, 8);
}

export class EntityExtractionService {
  extract(input: EntityExtractionInput): EntityExtractionResult {
    const bucket = new Map<string, ExtractedEntity>();
    extractFromTitles(input, bucket);
    extractFromBody(input.body, bucket);

    const entities = [...bucket.values()];
    return {
      entities,
      domainTags: buildDomainTags(entities, input),
    };
  }
}

export const entityExtractionService = new EntityExtractionService();

