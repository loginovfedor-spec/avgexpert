import { state } from './state';
import { $, showToast } from './index';
import { filterSupportedDocumentFiles, isSupportedDocumentFile, parseDocumentFile } from './file-parse';
import type { UserDocumentsResponse } from './types';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  processing: 'Индексируется…',
  ready: 'Готов',
  failed: 'Ошибка',
};

let pollTimer: ReturnType<typeof setTimeout> | null = null;

function authHeaders(): Record<string, string> {
  return { Authorization: 'Bearer ' + state.authToken! };
}

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderDocuments(data: UserDocumentsResponse | null): void {
  const listEl = $('user-docs-list');
  const metaEl = $('user-docs-meta');
  if (!listEl) return;

  const docs = data?.documents || [];
  const limit = data?.limit ?? state.maxDocsAllowed ?? 3;
  const count = data?.count ?? docs.length;

  if (metaEl) {
    metaEl.textContent = `${count} / ${limit} документов`;
  }

  if (docs.length === 0) {
    listEl.innerHTML = '<div class="user-docs-empty">Загрузите .txt, .md, .pdf или .docx — они будут доступны в RAG при чате.</div>';
    return;
  }

  listEl.innerHTML = docs.map((doc) => {
    const status = STATUS_LABELS[doc.status] || doc.status;
    const statusClass = doc.status === 'ready' ? 'ready' : (doc.status === 'failed' ? 'failed' : 'pending');
    return `
      <div class="user-doc-row" data-doc-id="${doc.id}">
        <div class="user-doc-info">
          <span class="user-doc-name">${escapeHtml(doc.filename)}</span>
          <span class="user-doc-meta">${formatSize(doc.size)} · <span class="user-doc-status user-doc-status--${statusClass}">${status}</span></span>
        </div>
        <button type="button" class="nav-btn btn-action-sm--danger user-doc-delete" data-doc-id="${doc.id}" aria-label="Удалить ${escapeHtml(doc.filename)}">Удалить</button>
      </div>
    `;
  }).join('');
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function needsPolling(docs: UserDocumentsResponse['documents']): boolean {
  return (docs || []).some((d) => d.status === 'pending' || d.status === 'processing');
}

export async function loadUserDocuments(): Promise<void> {
  if (!state.authToken) return;
  try {
    const res = await fetch('/api/user/documents', { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) return;
    const data: UserDocumentsResponse = await res.json();
    renderDocuments(data);
    schedulePoll(data.documents);
  } catch (err) {
    console.error('Failed to load user documents', err);
  }
}

function schedulePoll(docs: UserDocumentsResponse['documents']): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (needsPolling(docs)) {
    pollTimer = setTimeout(() => loadUserDocuments(), 2000);
  }
}

export function stopUserDocumentsPolling(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function uploadFile(file: File): Promise<void> {
  if (!isSupportedDocumentFile(file.name)) {
    showToast('Поддерживаются .txt, .md, .pdf и .docx', 'error');
    return;
  }

  let content: string;
  try {
    content = await parseDocumentFile(file);
  } catch (err) {
    console.error('User document parse error', err);
    showToast(`Не удалось прочитать «${file.name}»`, 'error');
    return;
  }

  if (!content?.trim()) {
    showToast(`Файл «${file.name}» не содержит текста`, 'error');
    return;
  }

  const res = await fetch('/api/user/documents', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, content }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast(data.detail || 'Не удалось загрузить документ', 'error');
    return;
  }

  showToast(`Документ «${file.name}» загружен. Он будет доступен после обработки на сервере.`, { variant: 'info' });
  await loadUserDocuments();
}

async function deleteDocument(docId: string): Promise<void> {
  const res = await fetch(`/api/user/documents/${docId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showToast(data.detail || 'Не удалось удалить документ', 'error');
    return;
  }
  showToast('Документ удалён');
  await loadUserDocuments();
}

export function initUserDocuments(): void {
  $('user-docs-upload-btn')?.addEventListener('click', () => {
    $('user-docs-file-input')?.click();
  });

  $('user-docs-file-input')?.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const files = filterSupportedDocumentFiles(input.files || []);
    for (const file of files) {
      await uploadFile(file);
    }
    input.value = '';
  });

  $('user-docs-list')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.user-doc-delete') as HTMLElement | null;
    if (!btn) return;
    const docId = btn.dataset.docId;
    if (docId) deleteDocument(docId);
  });
}
