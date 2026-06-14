import type { ChunkingOptions, RawChunk, SectionContext } from './types';
import { loadChunkingDefaults } from './path-utils';

const HEADER_RE = /^(#{1,4})\s+(.+)$/;
const CHAPTER_RE = /глава\s+(\d+)/i;
const SECTION_NUM_RE = /^(\d+)\.(\d+)(?:\.(\d+))?/;

function cleanHeading(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/\\\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseChapterIndex(title: string): number | undefined {
  const chapterMatch = title.match(CHAPTER_RE);
  if (chapterMatch) return parseInt(chapterMatch[1], 10);
  const sectionMatch = title.match(SECTION_NUM_RE);
  if (sectionMatch) return parseInt(sectionMatch[1], 10);
  return undefined;
}

function parseSectionIndex(title: string): number | undefined {
  const sectionMatch = title.match(SECTION_NUM_RE);
  if (!sectionMatch) return undefined;
  if (sectionMatch[3]) return parseInt(sectionMatch[3], 10);
  return parseInt(sectionMatch[2], 10);
}

function buildSectionPath(ctx: SectionContext, bookTitle?: string): string | undefined {
  const parts: string[] = [];
  if (bookTitle) parts.push(bookTitle);
  if (ctx.partTitle && ctx.partTitle !== ctx.chapterTitle) parts.push(ctx.partTitle);
  if (ctx.chapterTitle) parts.push(ctx.chapterTitle);
  if (ctx.sectionTitle) parts.push(ctx.sectionTitle);
  if (ctx.subsectionTitle) parts.push(ctx.subsectionTitle);
  return parts.length > 0 ? parts.join(' > ') : undefined;
}

function enrichChunkText(text: string, ctx: SectionContext, bookTitle?: string): string {
  const path = buildSectionPath(ctx, bookTitle);
  if (!path) return text;
  return `Контекст: ${path}\n\n${text}`;
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function splitSectionText(
  text: string,
  ctx: SectionContext,
  options: Required<Pick<ChunkingOptions, 'chunkSize' | 'chunkOverlap'>> & { bookTitle?: string },
  startChunkIndex: number
): { chunks: RawChunk[]; nextChunkIndex: number } {
  const chunks: RawChunk[] = [];
  let chunkIndex = startChunkIndex;
  let start = 0;
  const { chunkSize, chunkOverlap, bookTitle } = options;
  const sectionPath = buildSectionPath(ctx, bookTitle);

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    let slice = text.slice(start, end);

    if (end < text.length) {
      const paragraphBreak = slice.lastIndexOf('\n\n');
      const lineBreak = slice.lastIndexOf('\n');
      const preferredBreak = paragraphBreak > chunkSize * 0.5
        ? paragraphBreak
        : lineBreak > chunkSize * 0.7
          ? lineBreak
          : -1;

      if (preferredBreak > 0) {
        end = start + preferredBreak;
        slice = text.slice(start, end);
      }
    }

    const trimmed = slice.trim();
    if (trimmed) {
      chunks.push({
        text: trimmed,
        enrichedText: enrichChunkText(trimmed, ctx, bookTitle),
        chunkIndex,
        sectionPath,
        chapterIndex: ctx.chapterIndex,
        chapterTitle: ctx.chapterTitle,
        sectionIndex: ctx.sectionIndex,
        sectionTitle: ctx.sectionTitle ?? ctx.subsectionTitle,
        tokenCount: estimateTokenCount(trimmed),
      });
      chunkIndex += 1;
    }

    if (end >= text.length) break;
    start = Math.max(end - chunkOverlap, start + 1);
  }

  return { chunks, nextChunkIndex: chunkIndex };
}

function updateSectionContext(level: number, title: string, ctx: SectionContext): void {
  const cleaned = cleanHeading(title);
  if (level === 1) {
    if (/^часть\s/i.test(cleaned) || /^part\s/i.test(cleaned)) {
      ctx.partTitle = cleaned;
      return;
    }
    ctx.chapterTitle = cleaned;
    ctx.chapterIndex = parseChapterIndex(cleaned);
    ctx.sectionTitle = undefined;
    ctx.sectionIndex = undefined;
    ctx.subsectionTitle = undefined;
    return;
  }
  if (level === 2) {
    ctx.sectionTitle = cleaned;
    ctx.sectionIndex = parseSectionIndex(cleaned);
    ctx.subsectionTitle = undefined;
    return;
  }
  ctx.subsectionTitle = cleaned;
}

export class ChunkingService {
  chunkText(text: string, options: ChunkingOptions = {}): RawChunk[] {
    const defaults = loadChunkingDefaults();
    const chunkSize = options.chunkSize ?? defaults.chunkSize;
    const chunkOverlap = options.chunkOverlap ?? defaults.chunkOverlap;
    const bookTitle = options.bookTitle;

    if (!text.trim()) return [];

    const lines = text.split(/\r?\n/);
    const ctx: SectionContext = {};
    let buffer: string[] = [];
    let chunks: RawChunk[] = [];
    let chunkIndex = 0;

    const flushBuffer = () => {
      const sectionText = buffer.join('\n').trim();
      buffer = [];
      if (!sectionText) return;
      const result = splitSectionText(
        sectionText,
        ctx,
        { chunkSize, chunkOverlap, bookTitle },
        chunkIndex
      );
      chunks = chunks.concat(result.chunks);
      chunkIndex = result.nextChunkIndex;
    };

    for (const line of lines) {
      const headerMatch = line.match(HEADER_RE);
      if (headerMatch) {
        flushBuffer();
        updateSectionContext(headerMatch[1].length, headerMatch[2], ctx);
        continue;
      }
      buffer.push(line);
    }

    flushBuffer();

    if (chunks.length === 0 && text.trim()) {
      const result = splitSectionText(
        text.trim(),
        ctx,
        { chunkSize, chunkOverlap, bookTitle },
        0
      );
      chunks = result.chunks;
    }

    return chunks;
  }

  chunkFileContent(content: string, options: ChunkingOptions = {}): RawChunk[] {
    return this.chunkText(content, options);
  }
}

export function createChunkingService(): ChunkingService {
  return new ChunkingService();
}

