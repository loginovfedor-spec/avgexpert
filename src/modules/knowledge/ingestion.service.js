
const fs = require('fs');
const path = require('path');
const knowledgeRepository = require('./knowledge.repository');
const logger = require('../../core/logger').scoped('Ingestion');

class IngestionService {
  /**
   * Ingests a file or directory.
   * @param {string} targetPath 
   * @param {Object} options 
   */
  async ingest(targetPath, options = {}) {
    const stats = fs.statSync(targetPath);
    
    if (stats.isDirectory()) {
      return this._ingestDirectory(targetPath, options);
    } else {
      return this._ingestFile(targetPath, options);
    }
  }

  async _ingestDirectory(dirPath, options) {
    const files = fs.readdirSync(dirPath);
    const results = [];
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (['.txt', '.md', '.markdown'].includes(ext)) {
          results.push(await this._ingestFile(fullPath, options));
        }
      }
    }
    
    return results;
  }

  async _ingestFile(filePath, options) {
    logger.info('Processing file', { filePath });
    const content = fs.readFileSync(filePath, 'utf-8');
    const title = options.title || path.basename(filePath);
    const uri = options.uri || filePath;
    const type = options.type || this._inferType(filePath);

    // 1. Create Source
    const source = knowledgeRepository.createSource({
      uri,
      title,
      type,
      metadata: {
        originalPath: filePath,
        size: content.length,
        ...options.metadata
      }
    });

    // 2. Chunking (Simple overlap chunking)
    const chunks = this._chunkText(content, {
      chunkSize: options.chunkSize || 1000,
      overlap: options.overlap || 200
    });

    // 3. Store Chunks
    const storedChunks = knowledgeRepository.addChunks(source.id, chunks);

    logger.info('Completed file ingestion', { title: source.title, chunkCount: storedChunks.length });
    return { source, chunkCount: storedChunks.length };
  }

  _inferType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.md' || ext === '.markdown') return 'markdown';
    return 'text';
  }

  _chunkText(text, { chunkSize, overlap }) {
    if (!text) return [];
    
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunkText = text.substring(start, end);
      
      // Try to break at newline if possible to preserve context
      if (end < text.length) {
        const lastNewline = chunkText.lastIndexOf('\n');
        if (lastNewline > chunkSize * 0.8) {
          const actualEnd = start + lastNewline;
          chunkText = text.substring(start, actualEnd);
          start = actualEnd + 1;
        } else {
          start += (chunkSize - overlap);
        }
      } else {
        start = text.length;
      }
      
      if (chunkText.trim()) {
        chunks.push({
          text: chunkText.trim(),
          metadata: {
            length: chunkText.length,
            startOffset: start - chunkText.length // approximate
          }
        });
      }
    }
    
    return chunks;
  }
}

module.exports = new IngestionService();
