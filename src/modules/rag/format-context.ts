import type { IRetrievalResult } from '../../types/knowledge.types';

export function formatRetrievalContext(result: IRetrievalResult | null | undefined): string {
  if (!result || !result.chunks || result.chunks.length === 0) return '';

  let output = '\n--- RETRIEVED CONTEXT START ---\n';
  output += `The following information was retrieved from the knowledge base (Mode: ${result.mode}).\n\n`;

  result.chunks.forEach((chunk, index) => {
    output += `<context_boundary index="${index}">\n`;
    output += `Source: ${chunk.provenance.title || 'Untitled'} (${chunk.provenance.uri || 'no-uri'})\n`;
    output += `Relevance: ${(chunk.score * 100).toFixed(1)}%\n`;
    output += '---\n';
    output += chunk.text;
    output += '\n</context_boundary>\n\n';
  });

  output += '--- RETRIEVED CONTEXT END ---\n';
  return output;
}

module.exports = { formatRetrievalContext };
