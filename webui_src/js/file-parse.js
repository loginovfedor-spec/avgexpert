const pendingModuleLoads = new Map();

function loadModuleOnce(key, importer) {
  if (pendingModuleLoads.has(key)) return pendingModuleLoads.get(key);
  const p = importer().finally(() => pendingModuleLoads.delete(key));
  pendingModuleLoads.set(key, p);
  return p;
}

export const SUPPORTED_DOCUMENT_EXTENSIONS = ['txt', 'md', 'markdown', 'docx', 'pdf'];

export function isSupportedDocumentFile(name) {
  const ext = name.split('.').pop()?.toLowerCase();
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(ext || '');
}

export function filterSupportedDocumentFiles(fileList) {
  return Array.from(fileList).filter((f) => isSupportedDocumentFile(f.name));
}

export async function parseDocumentFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    return await file.text();
  }
  if (ext === 'docx') {
    const mammoth = await loadModuleOnce('mammoth', () => import('mammoth'));
    const ab = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: ab });
    return result.value || '';
  }
  if (ext === 'pdf') {
    const pdfjsLib = await loadModuleOnce('pdfjs', () => import('pdfjs-dist'));
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
      } catch {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
    }
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(' ') + '\n';
    }
    return text;
  }
  return '';
}
