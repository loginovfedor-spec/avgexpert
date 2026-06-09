import { state, settings } from './state.js';
import { $, t, showToast } from './index.js';
import { updateContextBadge, updateTokenInfo, autoResizeTextarea, renderMarkdown, estimateTokens, getTotalDocTokens, showTypingIndicator, renderDocChip, removeDoc, setWelcomeVisible } from './ui.js';
import { SessionManager } from './sessions.js';
import { uploadSessionAttachment, hasPendingAttachments, stopAllAttachmentPolling } from './session-attachments.js';

const STREAM_RENDER_INTERVAL_MS = 80;
const LARGE_REQUEST_CHARS = 100_000;
const TOKENS_PER_CREDIT = 1000;
const _creditsFmt = new Intl.NumberFormat('ru-RU');

let largeRequestModalReady = false;
let largeRequestResolver = null;
// Minimum number of new characters before triggering an intermediate re-render.
// Avoids O(n²) cost on long responses by batching small token additions.
const STREAM_RENDER_MIN_NEW_CHARS = 80;
const pendingModuleLoads = new Map();

function loadModuleOnce(key, importer) {
  if (pendingModuleLoads.has(key)) return pendingModuleLoads.get(key);
  const p = importer().finally(() => pendingModuleLoads.delete(key));
  pendingModuleLoads.set(key, p);
  return p;
}

function createStreamMarkdownRenderer(el, onRender) {
  let lastRenderAt = 0;
  let lastRenderedLength = 0;
  let pendingText = '';
  let renderTimer = null;
  let rafPending = false;

  const render = (force = false) => {
    renderTimer = null;
    const newChars = pendingText.length - lastRenderedLength;
    if (!force && newChars < STREAM_RENDER_MIN_NEW_CHARS) {
      // Not enough new content yet — defer until either the interval fires again
      // or flush() is called.
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
    schedule(text) {
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
  if(messagesEl) messagesEl.textContent = '';
  if(attachedDocsEl) attachedDocsEl.textContent = '';
  setWelcomeVisible(true);
  import('./ui.js').then(m => {
    m.updateWelcomeHints();
  });
  updateContextBadge();
  updateTokenInfo();
  if (reloadList) {
    SessionManager.renderList([]);
    if (state.authToken) SessionManager.loadList();
  }
}

export async function handleFiles(fileList) {
  const files = Array.from(fileList).filter(f => /\.(txt|md|markdown|docx|pdf)$/i.test(f.name));
  for (const file of files) {
    if (state.attachedDocs.length >= state.maxDocsAllowed) { showToast(`Максимум ${state.maxDocsAllowed} документов для вашей категории`); break; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['txt', 'md', 'markdown'].includes(ext)) {
      try {
        const text = await file.text();
        const uploaded = await uploadSessionAttachment(file, text);
        if (!uploaded) continue;
      } catch (e) {
        console.error('Session attachment error:', e);
        showToast('Не удалось загрузить вложение', 'error');
      }
      continue;
    }
    try {
      const text = await parseFile(file);
      const tokens = estimateTokens(text);
      state.attachedDocs.push({ name: file.name, text, tokens });
      renderDocChip({ name: file.name, tokens }, state.attachedDocs.length - 1);
    } catch (e) { console.error('File parse error:', e); }
  }
  const fileInput = $('file-input');
  if(fileInput) fileInput.value = '';
  updateTokenInfo();
  checkDocsFitContext();
  updateContextBadge();
}

export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt' || ext === 'md') return await file.text();
  if (ext === 'docx') {
    const mammoth = await loadModuleOnce('mammoth', () => import('mammoth'));
    const ab = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: ab });
    return result.value;
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
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
  }
  return '';
}

export function checkDocsFitContext() {
  const docTokens = getTotalDocTokens();
  const sysTokens = estimateTokens(settings.system_prompt);
  const total = docTokens + sysTokens + 200;
  if (total > state.contextSize) {
    showToast(t('doc_too_large', { tokens: total, ctx: state.contextSize }), { variant: 'info', duration: 20000 });
  }
}

function formatNumber(value) {
  return _creditsFmt.format(Math.max(0, Number(value) || 0));
}

function formatCredits(value) {
  return formatNumber(value);
}

function getActiveCategoryName() {
  return $('chat-session-category')?.value || state.currentUser?.category || '';
}

function getActiveCategoryData() {
  return state.categories?.[getActiveCategoryName()] || {};
}

function getRequestCharSize(messages) {
  return JSON.stringify(messages).length;
}

function isLargeRequest(messages) {
  if (getRequestCharSize(messages) > LARGE_REQUEST_CHARS) return true;
  return messages.some((m) => (m.content || '').length > LARGE_REQUEST_CHARS);
}

function tokensToCredits(tokens) {
  return Math.round((Number(tokens) || 0) / TOKENS_PER_CREDIT);
}

function getUserBalanceCredits() {
  const allocated = state.currentUser?.tokens_allocated || 0;
  const inputUsed = state.currentUser?.tokens_input_used || 0;
  const outputUsed = state.currentUser?.tokens_output_used || 0;
  return Math.max(0, tokensToCredits(allocated - inputUsed - outputUsed));
}

function estimateOutputTokens() {
  const categoryData = getActiveCategoryData();
  const categoryMax = parseInt(categoryData.max_tokens, 10) || Number.MAX_SAFE_INTEGER;
  const userOutputCredits = parseInt(state.currentUser?.output_generation_credits, 10);
  const userOutputCap = Number.isFinite(userOutputCredits) ? userOutputCredits * TOKENS_PER_CREDIT : Number.MAX_SAFE_INTEGER;
  const requested = parseInt(settings.n_predict, 10) || 1024;
  return Math.min(requested, categoryMax, userOutputCap);
}

function estimateRequestCredits(messages) {
  const categoryData = getActiveCategoryData();
  const complexity = Math.max(0.01, parseFloat(categoryData.complexity) || 1.0);
  const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content || ''), 0);
  const outputTokens = estimateOutputTokens();
  const weightedInput = Math.round(inputTokens * complexity);
  const weightedOutput = Math.round(outputTokens * complexity);
  const totalTokens = weightedInput + weightedOutput;
  return {
    requestChars: getRequestCharSize(messages),
    inputTokens,
    outputTokens,
    inputCredits: tokensToCredits(weightedInput),
    outputCredits: tokensToCredits(weightedOutput),
    totalCredits: tokensToCredits(totalTokens),
    balanceCredits: getUserBalanceCredits(),
    complexity,
  };
}

function closeLargeRequestModal(result) {
  $('large-request-modal')?.classList.add('hidden');
  if (largeRequestResolver) {
    const resolve = largeRequestResolver;
    largeRequestResolver = null;
    resolve(result);
  }
}

function renderLargeRequestEstimate(estimate) {
  const container = $('large-request-estimate');
  if (!container) return;

  const rows = [
    { label: t('large_request_size', { chars: formatNumber(estimate.requestChars) }), className: '' },
    { label: t('large_request_input', { credits: formatCredits(estimate.inputCredits) }), className: '' },
    { label: t('large_request_output', { tokens: formatNumber(estimate.outputTokens), credits: formatCredits(estimate.outputCredits) }), className: '' },
    { label: t('large_request_total', { credits: formatCredits(estimate.totalCredits) }), className: 'is-total' },
    { label: t('large_request_balance', { credits: formatCredits(estimate.balanceCredits) }), className: 'is-balance' },
  ];

  if (estimate.totalCredits > estimate.balanceCredits) {
    rows.push({ label: t('large_request_insufficient'), className: 'is-warning' });
  }

  container.innerHTML = rows.map((row) =>
    `<div class="large-request-estimate-row ${row.className}"><span>${row.label}</span></div>`
  ).join('');

  const confirmBtn = $('large-request-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = estimate.totalCredits > estimate.balanceCredits;
  }
}

export function initLargeRequestModal() {
  if (largeRequestModalReady) return;
  largeRequestModalReady = true;

  $('large-request-confirm')?.addEventListener('click', () => closeLargeRequestModal(true));
  $('large-request-cancel')?.addEventListener('click', () => closeLargeRequestModal(false));
  $('large-request-modal-close')?.addEventListener('click', () => closeLargeRequestModal(false));
  $('large-request-modal-backdrop')?.addEventListener('click', () => closeLargeRequestModal(false));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if ($('large-request-modal')?.classList.contains('hidden')) return;
    closeLargeRequestModal(false);
  });
}

function confirmLargeRequest(estimate) {
  initLargeRequestModal();
  renderLargeRequestEstimate(estimate);
  $('large-request-modal')?.classList.remove('hidden');
  $('large-request-confirm')?.focus();

  return new Promise((resolve) => {
    largeRequestResolver = resolve;
  });
}

function buildUserContent(text) {
  const inlineDocs = state.attachedDocs.filter((d) => d.text && !d.sessionScoped);
  if (inlineDocs.length === 0) return text;
  const docBlock = inlineDocs.map((d, i) => `=== ${state.lang === 'ru' ? 'Документ' : 'Document'} ${i + 1}: ${d.name} ===\n${d.text}`).join('\n\n');
  return docBlock + '\n\n---\n\n' + text;
}

function buildOutgoingMessages(text) {
  const userContent = buildUserContent(text);
  const docsToRender = [...state.attachedDocs];
  const previewHistory = [...state.chatHistory, { role: 'user', content: userContent, docs: docsToRender }];
  const messages = [{ role: 'system', content: settings.system_prompt }, ...previewHistory];
  return { userContent, docsToRender, messages };
}

export async function handleSend() {
  const userInput = $('user-input');
  if(!userInput) return;
  const text = userInput.value.trim();
  if (!text || state.isGenerating) return;
  if (hasPendingAttachments()) {
    showToast('Дождитесь завершения индексации вложений', 'error');
    return;
  }
  if (!state.authToken) {
    const auth = await import('./auth.js');
    auth.showRegistrationPrompt();
    return;
  }

  const { userContent, docsToRender, messages } = buildOutgoingMessages(text);

  if (isLargeRequest(messages)) {
    const estimate = estimateRequestCredits(messages);
    const confirmed = await confirmLargeRequest(estimate);
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
    if(attachedDocsEl) attachedDocsEl.textContent = '';
    updateTokenInfo();
  }

  state.isGenerating = true;
  $('send-btn')?.classList.add('hidden');
  $('stop-btn')?.classList.remove('hidden');

  // Light up indicator green — generation in progress
  const statusDot = $('status-dot');
  if (statusDot) statusDot.className = 'status-dot generating';

  const catSelect = $('chat-session-category');
  let activeCategoryName = '';
  if (catSelect && catSelect.selectedIndex >= 0) {
    activeCategoryName = catSelect.options[catSelect.selectedIndex].text;
  }

  const msgEl = addMessageToUI('assistant', '', [], activeCategoryName);
  const contentEl = msgEl.querySelector('.msg-content');
  showTypingIndicator(contentEl);
  const renderStreamMarkdown = createStreamMarkdownRenderer(contentEl, () => {
    const messagesEl = $('messages');
    if (messagesEl) {
      // Only auto-scroll when the user is already near the bottom (within 120px).
      // This avoids hijacking scroll position if the user scrolled up to read earlier text.
      const distFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
      if (distFromBottom < 120) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }
  });

  state.abortCtrl = new AbortController();
  let fullText = '';
  let tokenCount = 0;
  const startTime = Date.now();

  try {
    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.authToken
    };

    const isCreative = $('feat-creative') && $('feat-creative').checked;
    const activeCategory = $('chat-session-category')?.value || state.currentUser?.category;

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
          const errBody = await response.json();
          errorCode = errBody?.error?.code || '';
          detail = errBody?.error?.message || detail;
        } catch {}

        if (errorCode === 'tokens_exhausted' || errorCode === 'user_blocked' || errorCode === 'no_token_quota') {
          const quotaMessage = '⊘ «Доступ ограничен. Лимит кредитов исчерпан.»';
          contentEl.textContent = quotaMessage + ' ';
          const creditsLink = document.createElement('button');
          creditsLink.type = 'button';
          creditsLink.className = 'chat-inline-link';
          creditsLink.textContent = 'Пополнить кредиты';
          creditsLink.addEventListener('click', () => $('credits-menu-btn')?.click());
          contentEl.appendChild(creditsLink);
          contentEl.className = 'message-content error-text';
          state.chatHistory.push({ role: 'assistant', content: quotaMessage + ' Пополнить кредиты' });
          finishGeneration();
          $('send-btn')?.setAttribute('disabled', 'true');
          $('user-input')?.setAttribute('disabled', 'true');
          return;
        }

        throw new Error(detail);
      }
      throw new Error('HTTP ' + response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          
          const token = parsed.choices?.[0]?.delta?.content || '';
          if (token) {
            if (tokenCount === 0) contentEl.textContent = '';
            fullText += token;
            tokenCount++;
            renderStreamMarkdown.schedule(fullText);
          }
          if (parsed.usage) {
            tokenCount = parsed.usage.completion_tokens;
          }
        } catch {}
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      fullText = fullText || e.message || t('error_server');
      renderStreamMarkdown.flush(fullText);
    }
  }

  renderStreamMarkdown.flush(fullText);
  state.chatHistory.push({ role: 'assistant', content: fullText, categoryName: activeCategoryName });
  finishGeneration();
  
  // Restore connection dot to gray (connected/idle) after generation
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

export function buildExtraParams() {
  const params = {};
  if ($('feat-reasoning')?.checked) params.reasoning = {};
  if ($('feat-websearch')?.checked) {
    params.tools = [{ type: 'web_search' }];
    params.tool_choice = 'auto';
    // For Qwen/DashScope native grounding
    params.enable_search = true;
  }
  const rm = $('feat-retrieval-mode');
  if (rm) {
    params.retrieval_mode = rm.value;
  }
  return Object.keys(params).length > 0 ? params : null;
}

// Delegated copy handler — installed once on the #messages container (see initMessagesDelegation).
// Messages store their raw text and categoryName as data attributes on .msg-body.
export function initMessagesDelegation() {
  const messagesEl = $('messages');
  if (!messagesEl || messagesEl.dataset.delegated) return;
  messagesEl.dataset.delegated = '1';

  messagesEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.copy-btn');
    if (!btn) return;
    const body = btn.closest('.msg-body');
    const contentEl = body?.querySelector('.msg-content');
    if (!contentEl) return;
    let raw = contentEl.dataset.raw || contentEl.textContent;
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

export function addMessageToUI(role, text, docs = [], categoryName = '') {
  const msg = document.createElement('div');
  msg.className = 'msg ' + role;
  const avatarText = role === 'user' ? '👤' : '✦';
  const avatarTitle = (role === 'assistant' && categoryName) ? ` title="${DOMPurify.sanitize(categoryName)}"` : '';

  let docsHtml = '';
  if (docs && docs.length > 0) {
    docsHtml = `<div class="msg-attachments">${docs.map(d => `<span class="msg-attachment-badge" title="${DOMPurify.sanitize(d.name)}">📎 ${DOMPurify.sanitize(d.name)}</span>`).join('')}</div>`;
  }

  // categoryName stored as data attribute for the delegated copy handler
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

  const contentEl = msg.querySelector('.msg-content');
  if (text) renderMarkdown(contentEl, text);

  const messagesEl = $('messages');
  if (messagesEl) {
    messagesEl.appendChild(msg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  return msg;
}
