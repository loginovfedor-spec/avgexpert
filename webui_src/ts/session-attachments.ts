import { state } from './state';
import { $, showToast } from './index';
import { renderDocChip, updateContextBadge, updateTokenInfo } from './ui';
import type { AttachedDoc } from './types';

const POLL_INTERVAL_MS = 2000;
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();

function authHeaders(): Record<string, string> {
  return { Authorization: 'Bearer ' + state.authToken };
}

export async function ensureChatSessionId(): Promise<string | null> {
  if (!state.authToken) return null;

  const sessionId = state.currentSessionId || crypto.randomUUID();
  state.currentSessionId = sessionId;

  const activeCategory = $<HTMLSelectElement>('chat-session-category')?.value
    || state.currentUser?.category
    || null;

  await fetch('/api/sessions', {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: sessionId,
      title: 'Новый чат',
      messages: state.chatHistory || [],
      category: activeCategory,
      updatedAt: Date.now(),
    }),
  });

  return sessionId;
}

function stopPolling(docId: string): void {
  const timer = pollTimers.get(docId);
  if (timer) {
    clearTimeout(timer);
    pollTimers.delete(docId);
  }
}

function statusLabel(status: string | undefined): string {
  if (status === 'pending' || status === 'processing') return 'индексируется…';
  if (status === 'ready') return 'готов';
  if (status === 'failed') return 'ошибка';
  return status || '';
}

function updateDocChip(doc: AttachedDoc, index: number): void {
  const container = document.getElementById('attached-docs');
  if (!container) return;
  const chips = container.querySelectorAll('.doc-chip');
  const chip = chips[index];
  if (!chip) return;
  const label = statusLabel(doc.status);
  const statusClass = doc.status === 'ready' ? 'ready' : (doc.status === 'failed' ? 'failed' : 'pending');
  chip.innerHTML = `<span>📎 ${doc.name} <span class="doc-chip-status doc-chip-status--${statusClass}">${label}</span></span>
                    <button class="remove-doc-btn" data-index="${index}">×</button>`;
  chip.querySelector('.remove-doc-btn')?.addEventListener('click', () => removeSessionAttachment(index));
}

export async function removeSessionAttachment(index: number): Promise<void> {
  const doc = state.attachedDocs[index];
  if (doc?.id && state.currentSessionId) {
    stopPolling(doc.id);
    try {
      await fetch(`/api/chat/sessions/${state.currentSessionId}/attachments/${doc.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    } catch (err) {
      console.error('Failed to delete session attachment', err);
    }
  } else if (doc?.id) {
    stopPolling(doc.id);
  }
  state.attachedDocs.splice(index, 1);
  const container = document.getElementById('attached-docs');
  if (container) {
    container.textContent = '';
    state.attachedDocs.forEach((d, i) => renderDocChip(d, i));
  }
  updateTokenInfo();
  updateContextBadge();
}

async function pollAttachmentStatus(sessionId: string, docId: string, index: number): Promise<void> {
  try {
    const res = await fetch(`/api/chat/sessions/${sessionId}/attachments/${docId}`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (!res.ok) return;
    const data = await res.json();
    const doc = state.attachedDocs[index];
    if (!doc || doc.id !== docId) return;

    doc.status = data.status;
    if (data.status === 'ready') {
      doc.indexed = true;
      stopPolling(docId);
      showToast(`Документ «${doc.name}» проиндексирован`, 'success');
    } else if (data.status === 'failed') {
      stopPolling(docId);
      showToast(`Не удалось проиндексировать «${doc.name}»`, 'error');
    } else {
      const timer = setTimeout(() => pollAttachmentStatus(sessionId, docId, index), POLL_INTERVAL_MS);
      pollTimers.set(docId, timer);
    }
    updateDocChip(doc, index);
    updateContextBadge();
  } catch (err) {
    console.error('Attachment poll failed', err);
  }
}

export function hasPendingAttachments(): boolean {
  return state.attachedDocs.some((d) => d.id && (d.status === 'pending' || d.status === 'processing'));
}

export async function uploadSessionAttachment(file: File, content: string): Promise<boolean> {
  if (!state.authToken) return false;

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['txt', 'md', 'markdown', 'pdf', 'docx'].includes(ext || '')) {
    showToast('Поддерживаются .txt, .md, .pdf и .docx', 'error');
    return false;
  }

  if (state.attachedDocs.length >= state.maxDocsAllowed) {
    showToast(`Максимум ${state.maxDocsAllowed} документов для вашей категории`);
    return false;
  }

  const sessionId = await ensureChatSessionId();
  if (!sessionId) return false;

  const res = await fetch(`/api/chat/sessions/${sessionId}/attachments`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, content }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast(data.detail || 'Не удалось загрузить вложение', 'error');
    return false;
  }

  const index = state.attachedDocs.length;
  state.attachedDocs.push({
    id: data.id,
    name: data.filename || file.name,
    status: data.status || 'pending',
    indexed: false,
    sessionScoped: true,
  });
  renderDocChip(state.attachedDocs[index], index);
  updateTokenInfo();
  updateContextBadge();

  if (data.status === 'pending' || data.status === 'processing') {
    const timer = setTimeout(() => pollAttachmentStatus(sessionId, data.id, index), POLL_INTERVAL_MS);
    pollTimers.set(data.id, timer);
  }

  return true;
}

export function stopAllAttachmentPolling(): void {
  for (const docId of pollTimers.keys()) {
    stopPolling(docId);
  }
}

export function getAttachmentStatusLabel(status: string | undefined): string {
  return statusLabel(status);
}
