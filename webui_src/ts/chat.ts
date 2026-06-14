import { state, settings } from './state';
import { $, t, showToast } from './index';
import { updateContextBadge, updateTokenInfo, autoResizeTextarea, renderMarkdown, estimateTokens, getTotalDocTokens, showTypingIndicator, renderDocChip, setWelcomeVisible } from './ui';
import { SessionManager } from './sessions';
import { uploadSessionAttachment, hasPendingAttachments, stopAllAttachmentPolling } from './session-attachments';
import { filterSupportedDocumentFiles, parseDocumentFile } from './file-parse';
import { isLargeRequest, confirmLargeRequest } from './billing/large-request';
import type { AttachedDoc, CategoryData, ChatMessage, MessageRole } from './types';

const STREAM_RENDER_INTERVAL_MS = 80;
const STREAM_RENDER_MIN_NEW_CHARS = 80;

function createStreamMarkdownRenderer(el: HTMLElement, onRender?: () => void) {
  let lastRenderAt = 0;
  let lastRenderedLength = 0;
  let pendingText = '';
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let rafPending = false;

  const render = (force = false) => {
    renderTimer = null;
    const newChars = pendingText.length - lastRenderedLength;
    if (!force && newChars < STREAM_RENDER_MIN_NEW_CHARS) {
      renderTimer = setTimeout(() => render(true), STREAM_RENDER_INTERVAL_MS * 2);
      return;
    }
    lastRenderAt = Date.now();
    lastRenderedLength = pendingText.length;
    renderMarkdown(el, pendingText);
    if (onRender && !rafPending) {
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; onRender(); });
    }
  };

  return {
    schedule(text: string) {
      pendingText = text;
      const delay = Math.max(0, STREAM_RENDER_INTERVAL_MS - (Date.now() - lastRenderAt));
      if (!renderTimer) {
        renderTimer = setTimeout(render, delay);
      }
    },
    flush(text = pendingText) {
      pendingText = text;
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }
      render(true);
    }
  };
}

export function newChat(reloadList = true) {
  state.chatHistory = [];
  stopAllAttachmentPolling();
  state.attachedDocs = [];
  state.currentSessionId = null;
  const messagesEl = $('messages');
  const attachedDocsEl = $('attached-docs');
  if (messagesEl) messagesEl.textContent = '';
  if (attachedDocsEl) attachedDocsEl.textContent = '';
  setWelcomeVisible(true);
  import('./ui').then(m => {
    m.updateWelcomeHints();
  });
  updateContextBadge();
  updateTokenInfo();
  if (reloadList) {
    SessionManager.renderList([]);
    if (state.authToken) SessionManager.loadList();
  }
}

export async function handleFiles(fileList: FileList | File[] | null) {
  if (!fileList) return;
  const files = filterSupportedDocumentFiles(fileList);
  const useRag = isRagEffectiveForChat();

  for (const file of files) {
    if (state.attachedDocs.length >= state.maxDocsAllowed) {
      showToast(`Максимум ${state.maxDocsAllowed} документов для вашей категории`);
      break;
    }
    try {
      const text = await parseDocumentFile(file);
      if (!text?.trim()) {
        showToast(`Не удалось извлечь текст из «${file.name}»`, 'error');
        continue;
      }
      if (useRag) {
        const uploaded = await uploadSessionAttachment(file, text);
        if (!uploaded) continue;
      } else {
        const tokens = estimateTokens(text);
        state.attachedDocs.push({ name: file.name, text, tokens });
        renderDocChip({ name: file.name, tokens }, state.attachedDocs.length - 1);
      }
    } catch (e) {
      console.error('File attach error:', e);
      showToast('Не удалось обработать файл', 'error');
    }
  }
  const fileInput = $<HTMLInputElement>('file-input');
  if (fileInput) fileInput.value = '';
  updateTokenInfo();
  checkDocsFitContext();
  updateContextBadge();
}

export async function parseFile(file: File) {
  return parseDocumentFile(file);
}

export function checkDocsFitContext() {
  const docTokens = getTotalDocTokens();
  const sysTokens = estimateTokens(settings.system_prompt);
  const total = docTokens + sysTokens + 200;
  if (total > state.contextSize) {
    showToast(t('doc_too_large', { tokens: total, ctx: state.contextSize }), { variant: 'info', duration: 20000 });
  }
}

function getActiveCategoryData(): CategoryData {
  const categoryName = $<HTMLSelectElement>('chat-session-category')?.value || state.currentUser?.category || '';
  return state.categories?.[categoryName] || {};
}

function isRagEffectiveForChat() {
  const cat = getActiveCategoryData();
  const catAllowed = cat.rag_allowed === true || cat.rag_allowed === 1;
  const userEnabled = state.currentUser?.rag_enabled !== false && state.currentUser?.rag_enabled !== 0;
  return catAllowed && userEnabled;
}

function buildUserContent(text: string) {
  const inlineDocs = state.attachedDocs.filter((d) => d.text && !d.sessionScoped);
  if (inlineDocs.length === 0) return text;
  const docBlock = inlineDocs.map((d, i) => `=== ${state.lang === 'ru' ? 'Документ' : 'Document'} ${i + 1}: ${d.name} ===\n${d.text}`).join('\n\n');
  return docBlock + '\n\n---\n\n' + text;
}

function buildOutgoingMessages(text: string) {
  const userContent = buildUserContent(text);
  const docsToRender = [...state.attachedDocs];
  const previewHistory: ChatMessage[] = [...state.chatHistory, { role: 'user', content: userContent, docs: docsToRender }];
  const messages: ChatMessage[] = [{ role: 'system', content: settings.system_prompt }, ...previewHistory];
  return { userContent, docsToRender, messages };
}

export async function handleSend() {
  const userInput = $<HTMLTextAreaElement>('user-input');
  if (!userInput) return;
  const text = userInput.value.trim();
  if (!text || state.isGenerating) return;
  if (hasPendingAttachments()) {
    showToast('Дождитесь завершения индексации вложений', 'error');
    return;
  }
  if (!state.authToken) {
    const auth = await import('./auth');
    auth.showRegistrationPrompt();
    return;
  }

  const { userContent, docsToRender, messages } = buildOutgoingMessages(text);

  if (isLargeRequest(messages)) {
    const activeCategory = $<HTMLSelectElement>('chat-session-category')?.value || state.currentUser?.category || null;
    const confirmed = await confirmLargeRequest(messages, {
      category: activeCategory,
      n_predict: settings.n_predict,
    });
    if (!confirmed) return;
  }

  setWelcomeVisible(false);
  userInput.value = '';
  autoResizeTextarea();

  addMessageToUI('user', text, docsToRender);
  state.chatHistory.push({ role: 'user', content: userContent, docs: docsToRender });

  if (state.attachedDocs.length > 0) {
    state.attachedDocs = [];
    stopAllAttachmentPolling();
    const attachedDocsEl = $('attached-docs');
    if (attachedDocsEl) attachedDocsEl.textContent = '';
    updateTokenInfo();
  }

  state.isGenerating = true;
  $('send-btn')?.classList.add('hidden');
  $('stop-btn')?.classList.remove('hidden');

  const statusDot = $('status-dot');
  if (statusDot) statusDot.className = 'status-dot generating';

  const catSelect = $<HTMLSelectElement>('chat-session-category');
  let activeCategoryName = '';
  if (catSelect && catSelect.selectedIndex >= 0) {
    activeCategoryName = catSelect.options[catSelect.selectedIndex].text;
  }

  const msgEl = addMessageToUI('assistant', '', [], activeCategoryName);
  const contentEl = msgEl.querySelector('.msg-content') as HTMLElement;
  showTypingIndicator(contentEl);
  const renderStreamMarkdown = createStreamMarkdownRenderer(contentEl, () => {
    const messagesEl = $('messages');
    if (messagesEl) {
      const distFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
      if (distFromBottom < 120) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
  });

  state.abortCtrl = new AbortController();
  let fullText = '';
  let tokenCount = 0;

  try {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.authToken
    };

    const isCreative = $<HTMLInputElement>('feat-creative')?.checked;
    const activeCategory = $<HTMLSelectElement>('chat-session-category')?.value || state.currentUser?.category;

    if (!state.currentSessionId && state.chatHistory.length === 0) {
      state.currentSessionId = crypto.randomUUID();
    }

    const response = await fetch('/api/chat/completions', {
      method: 'POST',
      headers,
      signal: state.abortCtrl.signal,
      body: JSON.stringify({
        messages,
        stream: true,
        category: activeCategory,
        session_id: state.currentSessionId,
        temperature: isCreative ? 1.2 : settings.temperature,
        top_p: settings.top_p,
        top_k: settings.top_k,
        min_p: settings.min_p,
        repeat_penalty: settings.repeat_penalty,
        n_predict: settings.n_predict,
        extra_params: buildExtraParams()
      })
    });

    if (!response.ok) {
      if (response.status === 403) {
        let errorCode = '';
        let detail = t('error_server');
        try {
          const errBody = await response.json() as { error?: { code?: string; message?: string } };
          errorCode = errBody?.error?.code || '';
          detail = errBody?.error?.message || detail;
        } catch { /* ignore */ }

        if (errorCode === 'tokens_exhausted' || errorCode === 'user_blocked' || errorCode === 'no_token_quota') {
          const quotaMessage = '⊘ «Доступ ограничен. Баланс исчерпан.»';
          contentEl.textContent = quotaMessage + ' ';
          const creditsLink = document.createElement('button');
          creditsLink.type = 'button';
          creditsLink.className = 'chat-inline-link';
          creditsLink.textContent = 'Пополнить баланс';
          creditsLink.addEventListener('click', () => $<HTMLButtonElement>('credits-menu-btn')?.click());
          contentEl.appendChild(creditsLink);
          contentEl.className = 'message-content error-text';
          state.chatHistory.push({ role: 'assistant', content: quotaMessage + ' Пополнить баланс' });
          finishGeneration();
          $('send-btn')?.setAttribute('disabled', 'true');
          $('user-input')?.setAttribute('disabled', 'true');
          return;
        }

        throw new Error(detail);
      }
      throw new Error('HTTP ' + response.status);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { completion_tokens?: number };
          };

          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            if (tokenCount === 0) contentEl.textContent = '';
            fullText += token;
            tokenCount++;
            renderStreamMarkdown.schedule(fullText);
          }
          if (parsed.usage) {
            tokenCount = parsed.usage.completion_tokens || tokenCount;
          }
        } catch { /* ignore */ }
      }
    }
  } catch (e) {
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      fullText = fullText || (e instanceof Error ? e.message : t('error_server'));
      renderStreamMarkdown.flush(fullText);
    }
  }

  renderStreamMarkdown.flush(fullText);
  state.chatHistory.push({ role: 'assistant', content: fullText, categoryName: activeCategoryName });
  finishGeneration();

  const dot = $('status-dot');
  if (dot) dot.className = 'status-dot';

  SessionManager.saveCurrent();
}

export function stopGeneration() {
  if (state.abortCtrl) state.abortCtrl.abort();
  finishGeneration();
}

export function finishGeneration() {
  state.isGenerating = false;
  $('send-btn')?.classList.remove('hidden');
  $('stop-btn')?.classList.add('hidden');
  updateContextBadge();
}

export function buildExtraParams(): Record<string, unknown> | null {
  const params: Record<string, unknown> = {};
  if ($<HTMLInputElement>('feat-reasoning')?.checked) params.reasoning = {};
  if ($<HTMLInputElement>('feat-websearch')?.checked) {
    params.tools = [{ type: 'web_search' }];
    params.tool_choice = 'auto';
    params.enable_search = true;
  }
  const rm = $<HTMLSelectElement>('feat-retrieval-mode');
  if (rm) {
    params.retrieval_mode = rm.value;
  }
  return Object.keys(params).length > 0 ? params : null;
}

export function initMessagesDelegation() {
  const messagesEl = $('messages');
  if (!messagesEl || messagesEl.dataset.delegated) return;
  messagesEl.dataset.delegated = '1';

  messagesEl.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as Element;
    const btn = target.closest('.copy-btn');
    if (!btn) return;
    const body = btn.closest('.msg-body') as HTMLElement | null;
    const contentEl = body?.querySelector('.msg-content') as HTMLElement | null;
    if (!contentEl || !body) return;
    let raw = contentEl.dataset.raw || contentEl.textContent || '';
    const catName = body.dataset.categoryName;
    if (catName) raw = catName + ':\n' + raw;
    navigator.clipboard.writeText(raw).then(() => {
      btn.classList.add('copied');
      const span = btn.querySelector('span');
      if (span) span.textContent = t('copied');
      setTimeout(() => {
        btn.classList.remove('copied');
        if (span) span.textContent = t('copy');
      }, 2000);
    });
  });
}

export function addMessageToUI(role: MessageRole, text: string, docs: AttachedDoc[] = [], categoryName = '') {
  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  const avatarText = role === 'user' ? '👤' : '✦';
  const avatarTitle = (role === 'assistant' && categoryName) ? ` title="${DOMPurify.sanitize(categoryName)}"` : '';

  let docsHtml = '';
  if (docs && docs.length > 0) {
    docsHtml = `<div class="msg-attachments">${docs.map(d => `<span class="msg-attachment-badge" title="${DOMPurify.sanitize(d.name)}">📎 ${DOMPurify.sanitize(d.name)}</span>`).join('')}</div>`;
  }

  msg.innerHTML = `<div class="msg-avatar"${avatarTitle}>${avatarText}</div>
    <div class="msg-body"${categoryName ? ` data-category-name="${DOMPurify.sanitize(categoryName)}"` : ''}>
      <div class="msg-content"></div>
      ${docsHtml}
      <div class="msg-actions">
        <button class="msg-action-btn copy-btn" title="${t('copy')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>${t('copy')}</span>
        </button>
      </div>
    </div>`;

  const contentEl = msg.querySelector('.msg-content') as HTMLElement;
  if (text) renderMarkdown(contentEl, text);

  const messagesEl = $('messages');
  if (messagesEl) {
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  return msg;
}
