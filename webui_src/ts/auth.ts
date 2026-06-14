import { state, settings } from './state';
import { $, t, I18N } from './index';
import { SessionManager } from './sessions';
import { updateContextBadge, updateWelcomeHints } from './ui';
import { loadAdminStats, loadAdminUsers, loadAdminCategories } from './admin';
import { refreshBalancePanel, exportBalanceHistoryCsv, updateBalanceDisplay } from './billing/balance-panel';
import type { AppUser } from './types';

export { exportBalanceHistoryCsv };

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

interface ApiErrorBody {
  errors?: Array<{ message?: string }>;
  detail?: string;
  error?: { message?: string };
}

function getUsernameErrors(username: string, minLength = 8) {
  const errors: string[] = [];
  if (username.length < minLength) errors.push(`Имя пользователя должно содержать не менее ${minLength} символов`);
  if (username.length > 64) errors.push('Имя пользователя должно содержать не более 64 символов');
  if (username && !USERNAME_RE.test(username)) errors.push('Имя пользователя может содержать только английские буквы, цифры, _ и -');
  return errors;
}

function getPasswordErrors(password: string) {
  const errors: string[] = [];
  if (password.length < 8) errors.push('Пароль должен содержать не менее 8 символов');
  if (password.length > 128) errors.push('Пароль должен содержать не более 128 символов');
  if (!/[A-Z]/.test(password)) errors.push('Пароль должен содержать хотя бы одну заглавную букву');
  if (!/[a-z]/.test(password)) errors.push('Пароль должен содержать хотя бы одну строчную букву');
  if (!/[0-9]/.test(password)) errors.push('Пароль должен содержать хотя бы одну цифру');
  if (!/[\W_]/.test(password)) errors.push('Пароль должен содержать хотя бы один специальный символ');
  return errors;
}

function formatApiErrors(data: ApiErrorBody | null | undefined, fallback: string) {
  if (data?.errors && data.errors.length > 0) {
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
      state.currentUser = await r.json() as AppUser;
      completeLogin();
    } else {
      localStorage.removeItem('avgexpert_token');
      state.authToken = null;
      state.currentUser = null;
      stopHealthPolling();
      await updateAnonymousUI();
    }
  } catch {
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

function showAuthModal(mode: 'login' | 'register' = 'login') {
  $('app')?.classList.remove('hidden');
  $('login-screen')?.classList.add('active');
  const isRegister = mode === 'register';
  $('login-form')?.classList.toggle('hidden', isRegister);
  $('register-form')?.classList.toggle('hidden', !isRegister);
  const header = document.querySelector('.login-box h2');
  if (header) header.textContent = isRegister ? 'Регистрация' : 'Вход в систему';
  const firstField = isRegister ? $<HTMLInputElement>('register-user') : $<HTMLInputElement>('login-user');
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
  const chatSessionCat = $<HTMLSelectElement>('chat-session-category');
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

  const chatSessionCat = $<HTMLSelectElement>('chat-session-category');
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

function isCategoryRagAllowed(categoryName: string) {
  const cat = state.categories?.[categoryName];
  return cat?.rag_allowed === true || cat?.rag_allowed === 1;
}

export function updateUserRagToggleState() {
  const categoryName = $<HTMLSelectElement>('user-default-category')?.value || state.currentUser?.category || '';
  const allowed = isCategoryRagAllowed(categoryName);
  const toggle = $<HTMLInputElement>('user-rag-enabled');
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
  const categoryName = $<HTMLSelectElement>('user-default-category')?.value || state.currentUser?.category;
  const category = state.categories?.[categoryName || ''] || {};
  const inputCategoryTokens = parseInt(String(category.input_context_max ?? 1000000), 10) || 1000000;
  const outputCategoryTokens = parseInt(String(category.max_tokens ?? 128000), 10) || 128000;
  const inputMax = Math.min(1000, Math.ceil(inputCategoryTokens / 1000));
  const outputMax = Math.min(128, Math.ceil(outputCategoryTokens / 1000));
  const inputDefault = Math.ceil((parseInt(String(category.input_context_default ?? inputCategoryTokens), 10) || inputCategoryTokens) / 1000);
  const outputDefault = Math.ceil(outputCategoryTokens / 1000);
  const inputValue = Math.min(inputMax, parseInt(String(state.currentUser?.input_context_credits ?? inputDefault), 10) || 0);
  const outputValue = Math.min(outputMax, parseInt(String(state.currentUser?.output_generation_credits ?? outputDefault), 10) || 0);

  const inputEl = $<HTMLInputElement>('user-input-context-credits');
  const outputEl = $<HTMLInputElement>('user-output-generation-credits');
  if (inputEl) {
    inputEl.max = String(inputMax);
    inputEl.value = String(inputValue);
  }
  if (outputEl) {
    outputEl.max = String(outputMax);
    outputEl.value = String(outputValue);
  }
  const inputMaxEl = $('user-input-context-max');
  if (inputMaxEl) inputMaxEl.textContent = String(inputMax);
  const outputMaxEl = $('user-output-generation-max');
  if (outputMaxEl) outputMaxEl.textContent = String(outputMax);
  const inputValEl = $('user-input-context-value');
  if (inputValEl) inputValEl.textContent = String(inputValue);
  const outputValEl = $('user-output-generation-value');
  if (outputValEl) outputValEl.textContent = String(outputValue);
  updateUserRagToggleState();
}

export function updateLimitSliderLabels() {
  const inputCredits = $<HTMLInputElement>('user-input-context-credits');
  const outputCredits = $<HTMLInputElement>('user-output-generation-credits');
  if ($('user-input-context-value') && inputCredits) {
    $('user-input-context-value')!.textContent = inputCredits.value;
  }
  if ($('user-output-generation-value') && outputCredits) {
    $('user-output-generation-value')!.textContent = outputCredits.value;
  }
}

export async function completeLogin() {
  if (!state.currentUser) return;

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

  const emailEl = $<HTMLInputElement>('user-email');
  if (emailEl) emailEl.value = state.currentUser.email || '';

  const ragToggle = $<HTMLInputElement>('user-rag-enabled');
  if (ragToggle) {
    ragToggle.checked = state.currentUser.rag_enabled !== false && state.currentUser.rag_enabled !== 0;
  }

  updateBalanceDisplay(state.currentUser.balance_usd ?? 0);

  try {
    const catRes = await fetch('/api/users/categories', {
      headers: { 'Authorization': 'Bearer ' + state.authToken || '' }
    });
    if (catRes.ok) {
      state.categories = await catRes.json();
    }
  } catch (e) {
    console.error('Failed to load categories', e);
  }

  const defaultCatSel = $<HTMLSelectElement>('user-default-category');
  const chatSessionCat = $<HTMLSelectElement>('chat-session-category');
  const allowed = state.currentUser.allowed_categories || [];
  const allowedCopy = [...allowed];
  if (allowedCopy.length === 0 && state.currentUser.category) {
    allowedCopy.push(state.currentUser.category);
  }

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
      if (c === state.currentUser!.category) opt.selected = true;
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
      if (c === state.currentUser!.category) opt.selected = true;
      chatSessionCat.appendChild(opt);
    });
  }

  updateContextBadge();
  updateWelcomeHints();
  refreshBalancePanel();
  startHealthPolling();
  SessionManager.loadList();

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

  state.inactivityTimeout = setTimeout(() => {
    state.isInactive = true;
    checkServerHealth();
  }, 180000);
}

export async function handleLogin(e: Event) {
  e.preventDefault();
  const u = $<HTMLInputElement>('login-user')!.value;
  const p = $<HTMLInputElement>('login-pass')!.value;
  const errEl = $('login-error')!;
  errEl.classList.add('hidden');

  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    let d: { access_token?: string; detail?: string; error?: { message?: string } } = {};
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
    if (r.ok && d.access_token) {
      state.authToken = d.access_token;
      localStorage.setItem('avgexpert_token', state.authToken);
      await checkAuth();
    } else {
      errEl.textContent = d.detail || d.error?.message || `Ошибка сервера (${r.status})`;
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = 'Ошибка сети — проверьте, что сервер запущен';
    errEl.classList.remove('hidden');
  }
}

export async function handleRegister(e: Event) {
  e.preventDefault();
  const u = $<HTMLInputElement>('register-user')!.value.trim();
  const em = $<HTMLInputElement>('register-email')!.value;
  const p = $<HTMLInputElement>('register-pass')!.value;
  const pc = $<HTMLInputElement>('register-pass-confirm')!.value;
  const category = $<HTMLSelectElement>('chat-session-category')?.value || '';
  const errEl = $('register-error')!;
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
    const d = await r.json() as ApiErrorBody;
    if (r.ok) {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      });
      const loginData = await loginResponse.json() as { access_token?: string; detail?: string };
      if (!loginResponse.ok) {
        throw new Error(loginData.detail || 'Регистрация успешна, но автоматический вход не выполнен');
      }
      if (loginData.access_token) {
        state.authToken = loginData.access_token;
        localStorage.setItem('avgexpert_token', state.authToken);
        checkAuth();
      }
    } else {
      errEl.textContent = formatApiErrors(d, 'Ошибка регистрации');
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = err instanceof Error ? err.message : 'Ошибка сети';
    errEl.classList.remove('hidden');
  }
}

export async function checkServerHealth() {
  if (!state.authToken || !state.currentUser) return;
  const statusDot = $('status-dot');
  const statusText = $('status-text');
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    const activeCategory = $<HTMLSelectElement>('chat-session-category')?.value || (state.currentUser ? state.currentUser.category : '');
    const queryParam = activeCategory ? `?category=${encodeURIComponent(activeCategory)}` : '';

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
      if (!state.isGenerating) {
        if (statusDot) statusDot.className = 'status-dot';
        if (statusText) statusText.textContent = state.currentUser ? (state.currentUser.username || t('status_online')) : t('status_online');
      }
    } else {
      if (!state.isGenerating) {
        if (statusDot) statusDot.className = 'status-dot';
        if (statusText) statusText.textContent = state.currentUser ? (state.currentUser.username || t('status_online')) : t('status_online');
      }
    }
  } catch {
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

export async function switchView(name: string) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('view-' + name)?.classList.add('active');
  document.querySelector(`.nav-btn[data-view="${name}"]`)?.classList.add('active');
  $('sidebar')?.classList.remove('open');
  $('sidebar-backdrop')?.classList.remove('active');

  if (name === 'setup' && state.authToken) {
    try {
      const r = await fetch('/api/users/me', { headers: { 'Authorization': 'Bearer ' + state.authToken } });
      if (r.ok) {
        state.currentUser = await r.json() as AppUser;
        updateBalanceDisplay(state.currentUser.balance_usd ?? 0);
        refreshBalancePanel();
        const ragToggle = $<HTMLInputElement>('user-rag-enabled');
        if (ragToggle && state.currentUser) {
          ragToggle.checked = state.currentUser.rag_enabled !== false && state.currentUser.rag_enabled !== 0;
        }
        syncLimitSliders();
      }
    } catch { /* ignore */ }
    const docs = await import('./user-documents');
    docs.loadUserDocuments();
  } else {
    const docs = await import('./user-documents');
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
