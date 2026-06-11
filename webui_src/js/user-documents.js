import { state } from './state.js';
import { $, showToast } from './index.js';
import { filterSupportedDocumentFiles, isSupportedDocumentFile, parseDocumentFile } from './file-parse.js';

const STATUS_LABELS = {
  pending: 'Ожидает',
  processing: 'Индексируется…',
  ready: 'Готов',
  failed: 'Ошибка',
};

let pollTimer = null;

function authHeaders() {
  return { Authorization: 'Bearer ' + state.authToken };
}

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderDocuments(data) {
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function needsPolling(docs) {
  return (docs || []).some((d) => d.status === 'pending' || d.status === 'processing');
}

export async function loadUserDocuments() {
  if (!state.authToken) return;
  try {
    const res = await fetch('/api/user/documents', { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    renderDocuments(data);
    schedulePoll(data.documents);
  } catch (err) {
    console.error('Failed to load user documents', err);
  }
}

function schedulePoll(docs) {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (needsPolling(docs)) {
    pollTimer = setTimeout(() => loadUserDocuments(), 2000);
  }
}

export function stopUserDocumentsPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

async function uploadFile(file) {
  if (!isSupportedDocumentFile(file.name)) {
    showToast('Поддерживаются .txt, .md, .pdf и .docx', 'error');
    return;
  }

  let content;
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

async function deleteDocument(docId) {
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

export function initUserDocuments() {
  $('user-docs-upload-btn')?.addEventListener('click', () => {
    $('user-docs-file-input')?.click();
  });

  $('user-docs-file-input')?.addEventListener('change', async (e) => {
    const input = e.target;
    const files = filterSupportedDocumentFiles(input.files || []);
    for (const file of files) {
      await uploadFile(file);
    }
    input.value = '';
  });

  $('user-docs-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.user-doc-delete');
    if (!btn) return;
    const docId = btn.dataset.docId;
    if (docId) deleteDocument(docId);
  });
}
