import { state, settings } from './state';
import { $, t } from './index';
import type { AttachedDoc, CategoryData, ToastOptions } from './types';

export function showToast(msg: string, options: ToastOptions | string = {}) {
  if (typeof options === 'string') {
    options = { variant: options };
  }
  const duration = Math.max(10000, Number(options.duration) || 10000);
  const variant = options.variant || 'success';

  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = variant === 'success' ? 'toast' : `toast toast--${variant}`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  const fadeDelay = Math.max(0, duration - 500);
  toast.style.animation = `slideUp var(--transition-slow), fadeOut var(--transition-slow) ${fadeDelay}ms forwards`;
  setTimeout(() => toast.remove(), duration);
}

export function estimateTokens(text: string) { return Math.ceil((text || '').length / 3.5); }
export function getTotalDocTokens() {
  return state.attachedDocs.reduce((s, d) => s + (d.sessionScoped ? 0 : (d.tokens || 0)), 0);
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeHtml(value: string) {
  return typeof window.DOMPurify !== 'undefined' ? DOMPurify.sanitize(value) : escapeHtml(value);
}

function renderMarkdownHtml(value: string) {
  if (typeof window.marked !== 'undefined' && typeof window.DOMPurify !== 'undefined') {
    return DOMPurify.sanitize(marked.parse(value) as string);
  }
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function updateContextBadge() {
  const sysTokens = estimateTokens(settings.system_prompt);
  const docTokens = getTotalDocTokens();
  const chatTokens = state.chatHistory.reduce((s, m) => s + estimateTokens(m.content), 0);
  const total = sysTokens + docTokens + chatTokens;
  const pct = Math.min(100, Math.round((total / state.contextSize) * 100));

  const icon = pct < 60 ? '🟢' : pct < 85 ? '🟡' : '🔴';
  const contextUsage = $('context-usage');
  const contextBadge = $('context-badge');
  const sendBtn = $<HTMLButtonElement>('send-btn');

  if (contextUsage) contextUsage.textContent = `${icon} ${pct}%`;
  if (contextBadge) {
    contextBadge.title = `Использовано ${total} из ${state.contextSize} токенов`;
    contextBadge.classList.remove('warn', 'danger');
  }

  const isOverLimit = total > state.contextSize;

  if (isOverLimit) {
    if (contextBadge) contextBadge.classList.add('danger');
    if (contextBadge) contextBadge.title = state.lang === 'ru' ? 'Превышен лимит контекста!' : 'Context limit exceeded!';
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.title = state.lang === 'ru' ? 'Слишком много текста' : 'Too much text';
    }
  } else {
    if (sendBtn) {
      sendBtn.disabled = state.isGenerating;
      sendBtn.title = state.lang === 'ru' ? 'Отправить' : 'Send';
    }
    if (pct >= 85 && contextBadge) contextBadge.classList.add('warn');
  }
}

export function updateTokenInfo() {
  const docTokens = getTotalDocTokens();
  const tokenInfo = $('token-info');
  if (!tokenInfo) return;
  if (docTokens > 0) {
    tokenInfo.textContent = `📎 ~${docTokens} tokens`;
  } else {
    tokenInfo.textContent = '';
  }
}

export function setWelcomeVisible(isVisible: boolean) {
  $('welcome-screen')?.classList.toggle('hidden', !isVisible);
  $('view-chat')?.classList.toggle('welcome-active', isVisible);
}

export function autoResizeTextarea() {
  const userInput = $<HTMLTextAreaElement>('user-input');
  if (!userInput) return;
  const viewportLimit = Math.max(72, Math.floor(window.innerHeight * 0.22));
  const maxHeight = Math.min(160, viewportLimit);
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, maxHeight) + 'px';
}

function preprocessText(text: string) {
  if (text.trim().startsWith('{') || text.includes('"answer"')) {
    const answerMatch = text.match(/"answer"\s*:\s*"([\s\S]*?)"/);
    if (answerMatch) {
      text = answerMatch[1];
    } else {
      const partialMatch = text.match(/"answer"\s*:\s*"([\s\S]*)$/);
      if (partialMatch) text = partialMatch[1];
    }
    text = text.replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  return text;
}

function buildHtml(text: string) {
  let thinkContent = '';
  let mainContent = text;
  const thinkMatch = text.match(/<think>([\s\S]*?)(<\/think>|$)/);
  if (thinkMatch) {
    thinkContent = thinkMatch[1].trim();
    mainContent = text.replace(/<think>[\s\S]*?(<\/think>|$)/, '').trim();
  }

  const contextRegex = /<context_boundary>([\s\S]*?)(?:<\/context_boundary>|$)/g;
  const contextBlocks: string[] = [];
  mainContent = mainContent.replace(contextRegex, (_, content: string) => {
    contextBlocks.push(content.trim());
    return '';
  });

  const toolRegex = /<tool name="([\s\S]*?)">([\s\S]*?)(<\/tool>|$)/g;
  mainContent = mainContent.replace(toolRegex, (_match, name: string, _content: string, closed: string) => {
    const isDone = closed === '</tool>';
    const displayName = name === 'web_search' ? (state.lang === 'ru' ? 'Поиск в сети' : 'Web Search') : name;
    const statusText = isDone
      ? (state.lang === 'ru' ? 'готово' : 'done')
      : (state.lang === 'ru' ? 'выполняется...' : 'running...');
    return `<div class="tool-block ${isDone ? 'done' : ''}"><div class="tool-header"><span class="tool-icon">${isDone ? '✅' : '🔧'}</span><span class="tool-name">${sanitizeHtml(displayName)}</span><span class="tool-status">${sanitizeHtml(statusText)}</span></div></div>`;
  });

  let html = '';
  if (thinkContent) {
    html += `<div class="think-block"><button class="think-toggle" aria-expanded="false" aria-label="Показать/скрыть размышление">💭 ${t('thinking')}… <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg></button><div class="think-content">${renderMarkdownHtml(thinkContent)}</div></div>`;
  }
  if (mainContent) html += renderMarkdownHtml(mainContent);
  if (contextBlocks.length > 0) {
    html += `<div class="citations-block"><strong>Источники контекста:</strong><ul>${contextBlocks.map(c => `<li>${sanitizeHtml(c).replace(/\\n/g, '<br>')}</li>`).join('')}</ul></div>`;
  }
  return { html, mainContent };
}

export function renderMarkdown(el: HTMLElement, text: string) {
  text = preprocessText(text);
  const { html, mainContent } = buildHtml(text);

  el.dataset.raw = mainContent;
  el.innerHTML = html;

  el.querySelectorAll('.think-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      if (!content) return;
      const isOpen = content.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  });

  el.querySelectorAll('pre code:not([data-hl])').forEach(block => {
    const codeBlock = block as HTMLElement;
    if (window.hljs) hljs.highlightElement(codeBlock);
    codeBlock.dataset.hl = '1';
    const pre = codeBlock.parentElement;
    if (!pre || pre.querySelector('.copy-code-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-code-btn';
    btn.textContent = t('copy');
    btn.setAttribute('aria-label', t('copy'));
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(codeBlock.textContent || '').then(() => {
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = t('copy'); }, 1500);
      });
    });
    pre.appendChild(btn);
  });
}

export function showTypingIndicator(el: HTMLElement) {
  el.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
}

export function renderDocChip(docOrName: AttachedDoc | string, tokensOrIndex: number, indexMaybe?: number) {
  const container = $('attached-docs');
  if (!container) return;

  let doc: AttachedDoc;
  let index: number;
  if (typeof docOrName === 'object' && docOrName !== null) {
    doc = docOrName;
    index = tokensOrIndex;
  } else {
    doc = { name: docOrName, tokens: tokensOrIndex };
    index = indexMaybe ?? 0;
  }

  const chip = document.createElement('div');
  chip.className = 'doc-chip';
  const statusHtml = doc.status
    ? `<span class="doc-chip-status doc-chip-status--${doc.status === 'ready' ? 'ready' : (doc.status === 'failed' ? 'failed' : 'pending')}">${doc.status === 'pending' || doc.status === 'processing' ? 'индексируется…' : (doc.status === 'ready' ? 'готов' : 'ошибка')}</span>`
    : (doc.tokens != null ? `(~${doc.tokens})` : '');
  chip.innerHTML = `<span>📎 ${doc.name} ${statusHtml}</span>
                    <button class="remove-doc-btn" data-index="${index}">×</button>`;
  container.appendChild(chip);
  chip.querySelector('.remove-doc-btn')?.addEventListener('click', () => removeDoc(index));
}

export function removeDoc(index: number) {
  state.attachedDocs.splice(index, 1);
  const container = $('attached-docs');
  if (container) {
    container.textContent = '';
    state.attachedDocs.forEach((d, i) => renderDocChip(d, i));
  }
  updateTokenInfo();
  updateContextBadge();
}

function getSuggestedQuestions(categoryData: CategoryData | undefined) {
  if (!categoryData || !categoryData.suggested_questions || !categoryData.suggested_questions.trim()) {
    return [];
  }
  return categoryData.suggested_questions.split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0);
}

function handleHintClick(promptVal: string) {
  const userInput = $<HTMLTextAreaElement>('user-input');
  if (userInput) {
    userInput.value = promptVal;
    userInput.focus();
    autoResizeTextarea();
  }
}

function createHintChip(displayText: string, onClick: () => void, delayIndex?: number) {
  const btn = document.createElement('button');
  btn.className = 'hint-chip';
  btn.style.opacity = '0';
  btn.addEventListener('click', onClick);
  btn.style.animation = 'slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
  if (delayIndex !== undefined) {
    btn.style.animationDelay = `${delayIndex * 0.05}s`;
  }
  btn.innerHTML = `<span>${sanitizeHtml(displayText)}</span>`;
  return btn;
}

function renderHints(container: HTMLElement, questions: string[]) {
  container.textContent = '';

  if (questions.length > 0) {
    questions.forEach((q, i) => {
      const btn = createHintChip(q, () => handleHintClick(q), i);
      container.appendChild(btn);
    });
    return;
  }

  const staticHints = [
    { key: 'explain_code', i18nKey: 'hint_code', fallback: '💡 Помоги разобраться' },
    { key: 'write_text', i18nKey: 'hint_text', fallback: '✍️ Напиши текст' },
    { key: 'analyze_doc', i18nKey: 'hint_doc', fallback: '📄 Анализ документа' },
    { key: 'translate', i18nKey: 'hint_translate', fallback: '🌐 Переведи' }
  ];

  staticHints.forEach((hint, i) => {
    let displayText = hint.fallback;
    if (typeof t === 'function') {
      const i18nText = t(hint.i18nKey);
      if (i18nText && i18nText !== hint.i18nKey) {
        displayText = i18nText;
      }
    }

    const promptVal = typeof t === 'function' ? t('prompt_' + hint.key) : hint.fallback;
    const btn = createHintChip(displayText, () => handleHintClick(promptVal), i);
    btn.dataset.prompt = hint.key;
    btn.innerHTML = `<span data-i18n="${hint.i18nKey}">${sanitizeHtml(displayText)}</span>`;
    container.appendChild(btn);
  });
}

export function updateWelcomeHints(immediate = false) {
  const welcomeScreen = $('welcome-screen');
  if (!welcomeScreen || welcomeScreen.classList.contains('hidden')) return;

  const welcomeHintsContainer = document.querySelector('.welcome-hints');
  if (!welcomeHintsContainer) return;

  const performUpdate = () => {
    const activeCategory = $<HTMLSelectElement>('chat-session-category')?.value || (state.currentUser ? state.currentUser.category : '');
    const categoryData = state.categories?.[activeCategory || ''];
    const questions = getSuggestedQuestions(categoryData);

    renderHints(welcomeHintsContainer as HTMLElement, questions);
    welcomeHintsContainer.classList.remove('updating');
  };

  if (state.welcomeHintsTimeout) {
    clearTimeout(state.welcomeHintsTimeout);
    state.welcomeHintsTimeout = null;
  }

  if (immediate || welcomeHintsContainer.children.length === 0) {
    performUpdate();
  } else {
    welcomeHintsContainer.classList.add('updating');
    state.welcomeHintsTimeout = setTimeout(() => {
      performUpdate();
      state.welcomeHintsTimeout = null;
    }, 250);
  }
}
