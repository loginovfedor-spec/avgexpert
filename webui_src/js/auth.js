import { state, settings } from './state.js';
import { $, t, I18N, showToast } from './index.js';
import { SessionManager } from './sessions.js';
import { updateContextBadge, updateWelcomeHints } from './ui.js';
import { loadAdminStats, loadAdminUsers, loadAdminCategories } from './admin.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

function getUsernameErrors(username, minLength = 8) {
  const errors = [];
  if (username.length < minLength) errors.push(`Имя пользователя должно содержать не менее ${minLength} символов`);
  if (username.length > 64) errors.push('Имя пользователя должно содержать не более 64 символов');
  if (username && !USERNAME_RE.test(username)) errors.push('Имя пользователя может содержать только английские буквы, цифры, _ и -');
  return errors;
}

function getPasswordErrors(password) {
  const errors = [];
  if (password.length < 8) errors.push('Пароль должен содержать не менее 8 символов');
  if (password.length > 128) errors.push('Пароль должен содержать не более 128 символов');
  if (!/[A-Z]/.test(password)) errors.push('Пароль должен содержать хотя бы одну заглавную букву');
  if (!/[a-z]/.test(password)) errors.push('Пароль должен содержать хотя бы одну строчную букву');
  if (!/[0-9]/.test(password)) errors.push('Пароль должен содержать хотя бы одну цифру');
  if (!/[\W_]/.test(password)) errors.push('Пароль должен содержать хотя бы один специальный символ');
  return errors;
}

function formatApiErrors(data, fallback) {
  if (data?.errors?.length > 0) {
    return [...new Set(data.errors.map(err => err.message).filter(Boolean))].join('; ');
  }
  return data?.detail || fallback;
}

export async function checkAuth() {
  $('app')?.classList.remove('hidden');
  if (!state.authToken) {
    state.currentUser = null;
    await updateAnonymousUI();
    return;
  }

  try {
    const r = await fetch('/api/users/me', { headers: { 'Authorization': 'Bearer ' + state.authToken } });
    if (r.ok) {
      state.currentUser = await r.json();
      completeLogin();
    } else {
      localStorage.removeItem('avgexpert_token');
      state.authToken = null;
      state.currentUser = null;
      stopHealthPolling();
      await updateAnonymousUI();
    }
  } catch (e) {
    stopHealthPolling();
    await updateAnonymousUI();
  }
}

export function showLogin() {
  showAuthModal('login');
}

export function showRegistrationPrompt() {
  showAuthModal('register');
}

function showAuthModal(mode = 'login') {
  $('app')?.classList.remove('hidden');
  $('login-screen')?.classList.add('active');
  const isRegister = mode === 'register';
  $('login-form')?.classList.toggle('hidden', isRegister);
  $('register-form')?.classList.toggle('hidden', !isRegister);
  const header = document.querySelector('.login-box h2');
  if (header) header.textContent = isRegister ? 'Регистрация' : 'Вход в систему';
  const firstField = isRegister ? $('register-user') : $('login-user');
  setTimeout(() => firstField?.focus(), 0);
}

async function updateAnonymousUI() {
  stopHealthPolling();
  $('login-screen')?.classList.remove('active');
  $('app')?.classList.remove('hidden');
  const titleEl = $('chat-title-category');
  const statusText = $('status-text');
  if (statusText) statusText.textContent = 'Гость';
  const statusDot = $('status-dot');
  if (statusDot) statusDot.className = 'status-dot';
  $('nav-admin')?.classList.add('hidden');
  $('user-docs-card')?.classList.add('hidden');
  await loadPublicCategories();
  const chatSessionCat = $('chat-session-category');
  if (titleEl) titleEl.textContent = chatSessionCat?.value || 'Gemma AI';
  updateContextBadge();
  updateWelcomeHints();
}

async function loadPublicCategories() {
  try {
    const catRes = await fetch('/api/users/public/categories');
    if (catRes.ok) {
      state.categories = await catRes.json();
    }
  } catch (e) {
    console.error('Failed to load public categories', e);
  }

  const chatSessionCat = $('chat-session-category');
  if (!chatSessionCat) return;
  const categoryNames = Object.keys(state.categories || {});
  categoryNames.sort((a, b) => {
    const idxA = state.categories?.[a]?.sort_index ?? 0;
    const idxB = state.categories?.[b]?.sort_index ?? 0;
    if (idxA !== idxB) return idxA - idxB;
    return a.localeCompare(b);
  });
  chatSessionCat.innerHTML = '';
  categoryNames.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    chatSessionCat.appendChild(opt);
  });
}

function isCategoryRagAllowed(categoryName) {
  const cat = state.categories?.[categoryName];
  return cat?.rag_allowed === true || cat?.rag_allowed === 1;
}

export function updateUserRagToggleState() {
  const categoryName = $('user-default-category')?.value || state.currentUser?.category || '';
  const allowed = isCategoryRagAllowed(categoryName);
  const toggle = $('user-rag-enabled');
  const label = $('user-rag-toggle-label');
  const hint = $('user-rag-hint');
  const block = $('user-rag-admin-block');
  const catSpan = $('user-rag-admin-category');

  if (toggle) toggle.disabled = !allowed;
  if (label) label.classList.toggle('is-disabled', !allowed);
  if (hint) hint.classList.toggle('hidden', !allowed);
  if (block) block.classList.toggle('hidden', allowed);
  if (catSpan) catSpan.textContent = categoryName;
}

function syncLimitSliders() {
  const categoryName = $('user-default-category')?.value || state.currentUser?.category;
  const category = state.categories?.[categoryName] || {};
  const inputCategoryTokens = parseInt(category.input_context_max ?? 1000000, 10) || 1000000;
  const outputCategoryTokens = parseInt(category.max_tokens ?? 128000, 10) || 128000;
  const inputMax = Math.min(1000, Math.ceil(inputCategoryTokens / 1000));
  const outputMax = Math.min(128, Math.ceil(outputCategoryTokens / 1000));
  const inputDefault = Math.ceil((parseInt(category.input_context_default ?? inputCategoryTokens, 10) || inputCategoryTokens) / 1000);
  const outputDefault = Math.ceil(outputCategoryTokens / 1000);
  const inputValue = Math.min(inputMax, parseInt(state.currentUser?.input_context_credits ?? inputDefault, 10) || 0);
  const outputValue = Math.min(outputMax, parseInt(state.currentUser?.output_generation_credits ?? outputDefault, 10) || 0);

  const inputEl = $('user-input-context-credits');
  const outputEl = $('user-output-generation-credits');
  if (inputEl) {
    inputEl.max = inputMax;
    inputEl.value = inputValue;
  }
  if (outputEl) {
    outputEl.max = outputMax;
    outputEl.value = outputValue;
  }
  if ($('user-input-context-max')) $('user-input-context-max').textContent = inputMax;
  if ($('user-output-generation-max')) $('user-output-generation-max').textContent = outputMax;
  if ($('user-input-context-value')) $('user-input-context-value').textContent = inputValue;
  if ($('user-output-generation-value')) $('user-output-generation-value').textContent = outputValue;
  updateUserRagToggleState();
}

export function updateLimitSliderLabels() {
  if ($('user-input-context-value') && $('user-input-context-credits')) {
    $('user-input-context-value').textContent = $('user-input-context-credits').value;
  }
  if ($('user-output-generation-value') && $('user-output-generation-credits')) {
    $('user-output-generation-value').textContent = $('user-output-generation-credits').value;
  }
}

const _creditsFmt = new Intl.NumberFormat('ru-RU');
const _dateFmt = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

function formatCredits(value) {
  return _creditsFmt.format(Math.max(0, Number(value) || 0));
}

function formatOperationDate(timestamp) {
  return _dateFmt.format(new Date(Number(timestamp) || Date.now()));
}

function renderBalanceHistory(operations = []) {
  const list = $('balance-history-list');
  const empty = $('balance-history-empty');
  if (!list || !empty) return;

  empty.classList.toggle('hidden', operations.length > 0);

  if (operations.length === 0) {
    list.textContent = '';
    return;
  }

  const parts = [];
  for (const op of operations) {
    const spentClass = op.spent > 0 ? 'is-usage' : 'is-muted';
    const spentText  = op.spent > 0 ? formatCredits(op.spent) : '—';
    const recvClass  = op.received > 0 ? 'is-positive' : 'is-muted';
    const recvText   = op.received > 0 ? formatCredits(op.received) : '—';
    parts.push(
      '<div class="balance-history-row" role="row">' +
        '<div class="balance-history-date" role="cell">' + formatOperationDate(op.date) + '</div>' +
        '<div class="balance-history-operation" role="cell">' + op.title + '</div>' +
        '<div class="balance-history-received ' + recvClass + '" role="cell">' + recvText + '</div>' +
        '<div class="balance-history-change ' + spentClass + '" role="cell">' + spentText + '</div>' +
        '<div class="balance-history-balance" role="cell">' + formatCredits(op.balance) + '</div>' +
      '</div>'
    );
  }
  list.innerHTML = parts.join('');
}

async function refreshBalancePanel() {
  if (!state.authToken) return;
  try {
    const response = await fetch('/api/users/me/balance', {
      headers: { 'Authorization': 'Bearer ' + state.authToken },
      cache: 'no-store'
    });
    if (!response.ok) return;
    const data = await response.json();
    if ($('user-tokens-balance')) {
      $('user-tokens-balance').textContent = formatCredits(data.balance);
    }
    renderBalanceHistory(data.operations || []);
  } catch (error) {
    console.error('Failed to load balance history', error);
  }
}

export async function exportBalanceHistoryCsv() {
  if (!state.authToken) return;
  try {
    const response = await fetch('/api/users/me/balance/export', {
      headers: { 'Authorization': 'Bearer ' + state.authToken },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('export failed');

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || 'balance-history.csv';

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to export balance history', error);
    showToast('Не удалось выгрузить историю операций', 'error');
  }
}

export async function completeLogin() {
  $('login-screen')?.classList.remove('active');
  $('app')?.classList.remove('hidden');
  
  const titleEl = $('chat-title-category');
  if (titleEl) titleEl.textContent = state.currentUser.category || 'Gemma AI';
  
  const TOKENS_PER_CREDIT = 1000;
  state.contextSize = state.currentUser.input_context_credits != null
    ? state.currentUser.input_context_credits * TOKENS_PER_CREDIT
    : (state.currentUser.n_ctx || 4096);
  
  if (state.currentUser.category === 'Консультант') state.maxDocsAllowed = 3;
  else if (state.currentUser.category === 'Эксперт') state.maxDocsAllowed = 5;
  else state.maxDocsAllowed = 10;
  
  const navAdmin = $('nav-admin');
  if (navAdmin) {
    if (state.currentUser.is_admin) navAdmin.classList.remove('hidden');
    else navAdmin.classList.add('hidden');
  }

  $('user-docs-card')?.classList.remove('hidden');
  
  const defaultPrompt = (I18N && I18N[state.lang]) ? I18N[state.lang].system_prompt_placeholder : '';
  settings.system_prompt = state.currentUser.system_prompt || defaultPrompt;
  
  if ($('user-email')) $('user-email').value = state.currentUser.email || '';

  const ragToggle = $('user-rag-enabled');
  if (ragToggle) {
    ragToggle.checked = state.currentUser.rag_enabled !== false && state.currentUser.rag_enabled !== 0;
  }

  // Populate token quota fields in Settings
  const tokensAllocated = state.currentUser.tokens_allocated || 0;
  const tokensInputUsed = state.currentUser.tokens_input_used || 0;
  const tokensOutputUsed = state.currentUser.tokens_output_used || 0;
  const tokensBalance = tokensAllocated - tokensInputUsed - tokensOutputUsed;
  const balEl = $('user-tokens-balance');
  if (balEl) balEl.textContent = formatCredits(Math.round(tokensBalance / 1000));

  // Fetch safe categories list for user
  try {
    const catRes = await fetch('/api/users/categories', {
      headers: { 'Authorization': 'Bearer ' + state.authToken }
    });
    if (catRes.ok) {
      state.categories = await catRes.json();
    }
  } catch (e) {
    console.error('Failed to load categories', e);
  }

  const defaultCatSel = $('user-default-category');
  const chatSessionCat = $('chat-session-category');
  const allowed = state.currentUser.allowed_categories || [];
  const allowedCopy = [...allowed];
  if (allowedCopy.length === 0 && state.currentUser.category) {
    allowedCopy.push(state.currentUser.category);
  }

  // Sort allowedCopy by category sort_index ASC, name ASC
  allowedCopy.sort((a, b) => {
    const idxA = state.categories?.[a]?.sort_index ?? 0;
    const idxB = state.categories?.[b]?.sort_index ?? 0;
    if (idxA !== idxB) return idxA - idxB;
    return a.localeCompare(b);
  });
  
  if (defaultCatSel) {
    defaultCatSel.innerHTML = '';
    allowedCopy.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === state.currentUser.category) opt.selected = true;
      defaultCatSel.appendChild(opt);
    });
    defaultCatSel.onchange = syncLimitSliders;
    updateUserRagToggleState();
  }

  if (chatSessionCat) {
    chatSessionCat.innerHTML = '';
    allowedCopy.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === state.currentUser.category) opt.selected = true;
      chatSessionCat.appendChild(opt);
    });
  }

  updateContextBadge();
  updateWelcomeHints();
  refreshBalancePanel();
  startHealthPolling();
  SessionManager.loadList();
  
  // Set up inactivity tracking
  state.isInactive = false;
  resetInactivityTimer();
  bindActivityListeners();
}

function bindActivityListeners() {
  if (state.activityListenersBound) return;

  ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
  state.activityListenersBound = true;
}

export function resetInactivityTimer() {
  if (!state.authToken || !state.currentUser) return;

  if (state.isInactive) {
    state.isInactive = false;
    checkServerHealth();
  }
  
  if (state.inactivityTimeout) {
    clearTimeout(state.inactivityTimeout);
  }
  
  // 3 minutes (180000ms) default timeout
  state.inactivityTimeout = setTimeout(() => {
    state.isInactive = true;
    checkServerHealth();
  }, 180000);
}

export async function handleLogin(e) {
  e.preventDefault();
  const u = $('login-user').value;
  const p = $('login-pass').value;
  const errEl = $('login-error');
  errEl.classList.add('hidden');
  
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    let d = {};
    try {
      d = await r.json();
    } catch {
      if (r.status === 404) {
        const port = window.location.port;
        errEl.textContent = port === '5173'
          ? 'API не найден. Запустите npm start (порт 8200) — Vite проксирует /api автоматически.'
          : 'API не найден (404). Откройте приложение на http://127.0.0.1:8200 и выполните npm start.';
      } else {
        errEl.textContent = r.ok
          ? 'Сервер вернул некорректный ответ'
          : `Ошибка сервера (${r.status})`;
      }
      errEl.classList.remove('hidden');
      return;
    }
    if (r.ok) {
      state.authToken = d.access_token;
      localStorage.setItem('avgexpert_token', state.authToken);
      await checkAuth();
    } else {
      errEl.textContent = d.detail || d.error?.message || `Ошибка сервера (${r.status})`;
      errEl.classList.remove('hidden');
    }
  } catch (e) {
    errEl.textContent = 'Ошибка сети — проверьте, что сервер запущен';
    errEl.classList.remove('hidden');
  }
}

export async function handleRegister(e) {
  e.preventDefault();
  const u = $('register-user').value.trim();
  const em = $('register-email').value;
  const p = $('register-pass').value;
  const pc = $('register-pass-confirm').value;
  const category = $('chat-session-category')?.value || '';
  const errEl = $('register-error');
  errEl.classList.add('hidden');

  const errors = [
    ...getUsernameErrors(u, 8),
    ...getPasswordErrors(p)
  ];
  
  if (p !== pc) {
    errors.push('Пароли не совпадают');
  }

  if (errors.length > 0) {
    errEl.textContent = [...new Set(errors)].join('; ');
    errEl.classList.remove('hidden');
    return;
  }
  
  try {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, email: em, password: p, password_confirm: pc, category })
    });
    const d = await r.json();
    if (r.ok) {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const loginData = await loginResponse.json();
      if (!loginResponse.ok) {
        throw new Error(loginData.detail || 'Регистрация успешна, но автоматический вход не выполнен');
      }
      state.authToken = loginData.access_token;
      localStorage.setItem('avgexpert_token', state.authToken);
      checkAuth();
    } else {
      errEl.textContent = formatApiErrors(d, 'Ошибка регистрации');
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = err.message || 'Ошибка сети';
    errEl.classList.remove('hidden');
  }
}

export async function checkServerHealth() {
  if (!state.authToken || !state.currentUser) return;
  const statusDot = $('status-dot');
  const statusText = $('status-text');
  let timeoutId = null;
  try {
    const activeCategory = $('chat-session-category')?.value || (state.currentUser ? state.currentUser.category : '');
    const queryParam = activeCategory ? `?category=${encodeURIComponent(activeCategory)}` : '';
    
    // Safer timeout for older browsers
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 10000);

    const r = await fetch(`/api/providers/health${queryParam}`, {
      headers: { 'Authorization': 'Bearer ' + state.authToken },
      signal: controller.signal
    });
    
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;

    if (r.status === 401) {
      localStorage.removeItem('avgexpert_token');
      state.authToken = null;
      state.currentUser = null;
      stopHealthPolling();
      await updateAnonymousUI();
      return;
    }

    if (r.ok) {
      // Server responded — connection is alive.
      // Gray (default) = connected/idle. Don't override green if generation is active.
      if (!state.isGenerating) {
        if (statusDot) statusDot.className = 'status-dot';
        if (statusText) statusText.textContent = state.currentUser ? state.currentUser.username : t('status_online');
      }
    } else {
      // Server returned error (e.g. 401, 500) — still reachable, not truly offline
      if (!state.isGenerating) {
        if (statusDot) statusDot.className = 'status-dot';
        if (statusText) statusText.textContent = state.currentUser ? state.currentUser.username : t('status_online');
      }
    }
  } catch (err) {
    // Network error or timeout — server truly unreachable or extremely busy
    if (!state.isGenerating) {
      if (statusDot) statusDot.className = 'status-dot offline';
      if (statusText) statusText.textContent = t('status_offline');
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function startHealthPolling() {
  stopHealthPolling();
  checkServerHealth();
  state.healthInterval = setInterval(checkServerHealth, 30000);
}

export function stopHealthPolling() {
  if (state.healthInterval) {
    clearInterval(state.healthInterval);
    state.healthInterval = null;
  }
  if (state.inactivityTimeout) {
    clearTimeout(state.inactivityTimeout);
    state.inactivityTimeout = null;
  }

  syncLimitSliders();
}

export async function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('view-' + name)?.classList.add('active');
  document.querySelector(`.nav-btn[data-view="${name}"]`)?.classList.add('active');
  $('sidebar')?.classList.remove('open');
  $('sidebar-backdrop')?.classList.remove('active');

  if (name === 'setup' && state.authToken) {
    try {
      const r = await fetch('/api/users/me', { headers: { 'Authorization': 'Bearer ' + state.authToken }});
      if (r.ok) {
        state.currentUser = await r.json();
        const alloc = state.currentUser.tokens_allocated || 0;
        const inUsed = state.currentUser.tokens_input_used || 0;
        const outUsed = state.currentUser.tokens_output_used || 0;
        if ($('user-tokens-balance')) $('user-tokens-balance').textContent = formatCredits(Math.round((alloc - inUsed - outUsed) / 1000));
        refreshBalancePanel();
        const ragToggle = $('user-rag-enabled');
        if (ragToggle) {
          ragToggle.checked = state.currentUser.rag_enabled !== false && state.currentUser.rag_enabled !== 0;
        }
        syncLimitSliders();
      }
    } catch(e) {}
    const docs = await import('./user-documents.js');
    docs.loadUserDocuments();
  } else {
    const docs = await import('./user-documents.js');
    docs.stopUserDocumentsPolling();
  }

  if (name === 'admin' && state.currentUser?.is_admin) {
    loadAdminStats();
    loadAdminUsers();
    loadAdminCategories();
    if (state.adminStatsInterval) clearInterval(state.adminStatsInterval);
    state.adminStatsInterval = setInterval(loadAdminStats, 10000);
  } else {
    if (state.adminStatsInterval) {
      clearInterval(state.adminStatsInterval);
      state.adminStatsInterval = null;
    }
  }
}
