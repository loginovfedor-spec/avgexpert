import { state } from './state';
import { $, showToast } from './index';
import { formatAdminBalanceSummary, isUserBlocked, readAdminBillingPayload, setAdminBillingFields } from './billing/admin-billing';
import type { AppUser, CategoryData } from './types';

const TOKEN_LIMIT_STEP = 4096;
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

interface ApiErrorBody {
  errors?: Array<{ message?: string }>;
  detail?: string;
  error?: { message?: string };
  message?: string;
}

interface AdminUserRecord extends AppUser {
  expiration_date?: string;
  is_blocked?: boolean | number;
}

interface ProviderInfo {
  id: string;
  name: string;
  adapter?: string;
}

interface DebugLogEntry {
  ts: number;
  level?: string;
  provider?: string;
  message: string;
}

interface AuditLogEntry {
  created_at: string;
  action: string;
  username?: string;
  ip_address?: string;
  details?: string;
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

function formatApiErrors(data: ApiErrorBody | null | undefined, fallback = 'Ошибка') {
  if (data?.errors && data.errors.length > 0) {
    const messages = data.errors.map(err => err.message).filter(Boolean);
    if (messages.length > 0) return [...new Set(messages)].join('; ');
  }
  return data?.detail || data?.error?.message || data?.message || fallback;
}

let adminCategoriesCache: Record<string, CategoryData> = {};
let adminUsersCache: Record<string, AdminUserRecord> = {};

function normalizeTokenLimitMax(value: unknown, fallback: number) {
  const parsed = parseInt(String(value ?? fallback), 10);
  const raw = Number.isFinite(parsed) && parsed >= TOKEN_LIMIT_STEP ? parsed : fallback;
  return Math.max(TOKEN_LIMIT_STEP, Math.floor(raw / TOKEN_LIMIT_STEP) * TOKEN_LIMIT_STEP);
}

function normalizeTokenLimitValue(value: unknown, fallback: number, max: number) {
  const parsed = parseInt(String(value ?? fallback), 10);
  const raw = Number.isFinite(parsed) && parsed >= TOKEN_LIMIT_STEP ? parsed : fallback;
  const clamped = Math.min(max, raw);
  return Math.max(TOKEN_LIMIT_STEP, Math.floor(clamped / TOKEN_LIMIT_STEP) * TOKEN_LIMIT_STEP);
}

function getAdminUserLimitBounds(categoryName: string) {
  const category = adminCategoriesCache[categoryName] || state.categories?.[categoryName] || {};
  const inputMax = normalizeTokenLimitMax(category.input_context_max, 1000000);
  const outputMax = normalizeTokenLimitMax(category.max_tokens, 128000);
  const inputDefault = normalizeTokenLimitValue(category.input_context_default, inputMax, inputMax);
  return { inputMax, outputMax, inputDefault, outputDefault: outputMax };
}

function setTokenLimitInput(id: string, value: number | null | undefined, max: number, fallback: number) {
  const el = $<HTMLInputElement>(id);
  if (!el) return;
  el.min = String(TOKEN_LIMIT_STEP);
  el.step = String(TOKEN_LIMIT_STEP);
  el.max = String(max);
  if (value == null || value === undefined) {
    el.value = String(fallback);
    return;
  }
  el.value = String(normalizeTokenLimitValue(value, fallback, max));
}

function updateAdminUserTokenLimitBounds(keepValues = true) {
  const defaultCategory = $<HTMLSelectElement>('admin-default-category')?.value || '';
  const { inputMax, outputMax, inputDefault, outputDefault } = getAdminUserLimitBounds(defaultCategory);
  const inputEl = $<HTMLInputElement>('admin-input-context-limit');
  const outputEl = $<HTMLInputElement>('admin-output-generation-limit');

  if (inputEl) {
    inputEl.min = String(TOKEN_LIMIT_STEP);
    inputEl.step = String(TOKEN_LIMIT_STEP);
    inputEl.max = String(inputMax);
    if (!keepValues || !inputEl.value) {
      inputEl.value = String(inputDefault);
    }
  }
  if (outputEl) {
    outputEl.min = String(TOKEN_LIMIT_STEP);
    outputEl.step = String(TOKEN_LIMIT_STEP);
    outputEl.max = String(outputMax);
    if (!keepValues || !outputEl.value) {
      outputEl.value = String(outputDefault);
    }
  }
}

function readAdminTokenLimit(id: string, label: string) {
  const el = $<HTMLInputElement>(id);
  if (!el || el.value === '') return null;
  const value = parseInt(el.value, 10);
  const max = parseInt(el.max || '0', 10);
  if (!Number.isFinite(value) || value < TOKEN_LIMIT_STEP) {
    showToast(`❌ ${label} должен быть не меньше ${TOKEN_LIMIT_STEP}`);
    return undefined;
  }
  if (value % TOKEN_LIMIT_STEP !== 0) {
    showToast(`❌ ${label} должен быть кратен ${TOKEN_LIMIT_STEP}`);
    return undefined;
  }
  if (Number.isFinite(max) && max >= TOKEN_LIMIT_STEP && value > max) {
    showToast(`❌ ${label} не может быть больше ${max}`);
    return undefined;
  }
  return value;
}

function readCategoryTokenLimit(id: string, label: string, fallback: number) {
  const el = $<HTMLInputElement>(id);
  const value = parseGroupedInt(el?.value, fallback);
  if (!Number.isFinite(value) || value < TOKEN_LIMIT_STEP) {
    showToast(`❌ ${label} должен быть не меньше ${TOKEN_LIMIT_STEP} токенов`);
    return undefined;
  }
  if (value % TOKEN_LIMIT_STEP !== 0) {
    showToast(`❌ ${label} должен быть кратен ${TOKEN_LIMIT_STEP} токенам`);
    return undefined;
  }
  return value;
}

async function getAdminCategories() {
  try {
    const r = await fetch('/api/admin/categories', { headers: { 'Authorization': 'Bearer ' + state.authToken } });
    if (!r.ok) {
      const data = await r.json().catch(() => ({})) as ApiErrorBody;
      throw new Error(formatApiErrors(data, 'Не удалось загрузить категории'));
    }
    adminCategoriesCache = await r.json();
    return adminCategoriesCache;
  } catch (e) {
    if (Object.keys(adminCategoriesCache).length > 0) return adminCategoriesCache;
    if (state.categories && Object.keys(state.categories).length > 0) return state.categories;
    throw e;
  }
}

function renderAllowedCategories(cats: Record<string, CategoryData>, selected: string[] = [], selectFirstWhenEmpty = false) {
  const container = $('admin-allowed-categories-container');
  if (!container) return;
  container.textContent = '';

  const names = Object.keys(cats || {}).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    container.textContent = 'Категории не найдены';
    return;
  }

  names.forEach(cname => {
    const lbl = document.createElement('label');
    lbl.style.display = 'flex';
    lbl.style.alignItems = 'center';
    lbl.style.gap = '8px';
    lbl.style.cursor = 'pointer';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.value = cname;
    chk.className = 'admin-allowed-cat-chk';
    chk.checked = selected.includes(cname) || (selectFirstWhenEmpty && selected.length === 0 && cname === names[0]);

    lbl.appendChild(chk);
    lbl.appendChild(document.createTextNode(cname));
    container.appendChild(lbl);
  });
}

function getCheckedAllowedCategories() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('.admin-allowed-cat-chk:checked')).map(chk => chk.value);
}

function populateDefaultCategorySelect(selectedCategory = '') {
  const select = $<HTMLSelectElement>('admin-default-category');
  if (!select) return;

  const previousValue = selectedCategory || select.value;
  const allowed = getCheckedAllowedCategories();
  select.textContent = '';

  allowed.forEach(cname => {
    const opt = document.createElement('option');
    opt.value = cname;
    opt.textContent = cname;
    select.appendChild(opt);
  });

  if (allowed.includes(previousValue)) {
    select.value = previousValue;
  } else if (allowed.length > 0) {
    select.value = allowed[0];
  }
}

function bindAllowedCategorySync(selectedCategory = '') {
  populateDefaultCategorySelect(selectedCategory);
  document.querySelectorAll('.admin-allowed-cat-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      populateDefaultCategorySelect();
      updateAdminUserTokenLimitBounds();
    });
  });
  $<HTMLSelectElement>('admin-default-category')?.addEventListener('change', () => updateAdminUserTokenLimitBounds());
}

export function initAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const el = tab as HTMLElement;
      const target = el.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', String(t === tab));
      });
      document.querySelectorAll('.admin-tab-content').forEach(c => {
        c.classList.toggle('active', c.id === `admin-tab-${target}`);
      });
      if (target === 'overview') loadAdminStats();
      else if (target === 'users') loadAdminUsers();
      else if (target === 'categories') loadAdminCategories();
      else if (target === 'audit') loadAuditLogs();
      else if (target === 'debug') loadDebugLogs();
    });
  });

  $('admin-user-search')?.addEventListener('input', (e: Event) => {
    const input = e.target as HTMLInputElement;
    const q = input.value.toLowerCase();
    document.querySelectorAll('.user-item').forEach(item => {
      const nameEl = item.querySelector('.user-item-name');
      const name = nameEl?.textContent?.toLowerCase() || '';
      (item as HTMLElement).style.display = name.includes(q) ? '' : 'none';
    });
  });
}

export async function loadAdminStats() {
  try {
    const headers = { 'Authorization': 'Bearer ' + state.authToken || '' };
    const [statsRes, mvpRes] = await Promise.all([
      fetch('/api/admin/stats', { headers }),
      fetch('/api/admin/dashboard/mvp', { headers }),
    ]);
    if (!statsRes.ok) return;
    const stats = await statsRes.json() as {
      users: { total: number; expired: number };
      sessions: { total: number };
      categories: number;
      system: {
        uptime: number;
        memory: { rss: number };
        platform: string;
        node_version: string;
        os_free_mem: number;
        os_load: number[];
      };
    };
    const mvp = mvpRes.ok ? await mvpRes.json() as {
      rag_metrics?: { rag_latency_ms?: { p95?: number }; degraded_rate?: number; retrieval_count?: number };
      semantic_quality_score?: number;
      feature_flags?: { RAG_V2_ENABLED?: boolean };
    } | null : null;

    if ($('stat-total-users')) $('stat-total-users')!.textContent = String(stats.users.total);
    if ($('stat-expired-users')) $('stat-expired-users')!.textContent = `${stats.users.expired} истекло`;
    if ($('stat-total-sessions')) $('stat-total-sessions')!.textContent = String(stats.sessions.total);
    if ($('stat-total-categories')) $('stat-total-categories')!.textContent = String(stats.categories);

    const uptimeS = stats.system.uptime;
    const h = Math.floor(uptimeS / 3600);
    const m = Math.floor((uptimeS % 3600) / 60);
    const s = uptimeS % 60;
    if ($('stat-uptime')) $('stat-uptime')!.textContent = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    const memMb = Math.round(stats.system.memory.rss / 1024 / 1024);
    if ($('stat-memory')) $('stat-memory')!.textContent = `${memMb} MB RAM`;

    const ragMetrics = mvp?.rag_metrics;
    const ragP95 = ragMetrics?.rag_latency_ms?.p95;
    if ($('stat-rag-latency-p95')) {
      $('stat-rag-latency-p95')!.textContent = ragP95 != null && ragP95 > 0
        ? `${Math.round(ragP95)} ms`
        : '—';
    }
    const degradedRate = ragMetrics?.degraded_rate;
    if ($('stat-rag-degraded')) {
      $('stat-rag-degraded')!.textContent = degradedRate != null
        ? `degraded ${(degradedRate * 100).toFixed(1)}%`
        : 'degraded —';
    }

    const semanticScore = mvp?.semantic_quality_score;
    if ($('stat-semantic-quality')) {
      $('stat-semantic-quality')!.textContent = semanticScore != null
        ? semanticScore.toFixed(3)
        : '—';
    }
    const retrievalCount = ragMetrics?.retrieval_count ?? 0;
    if ($('stat-rag-retrievals')) $('stat-rag-retrievals')!.textContent = `retrievals ${retrievalCount}`;

    const list = $('system-info-list');
    if (list) {
      list.innerHTML = `
      <div class="system-info-item"><span class="system-info-label">Платформа</span><span class="system-info-value">${DOMPurify.sanitize(stats.system.platform)}</span></div>
      <div class="system-info-item"><span class="system-info-label">Node.js</span><span class="system-info-value">${DOMPurify.sanitize(stats.system.node_version)}</span></div>
      <div class="system-info-item"><span class="system-info-label">Свободная память</span><span class="system-info-value">${Math.round(stats.system.os_free_mem / 1024 / 1024)} MB</span></div>
      <div class="system-info-item"><span class="system-info-label">Загрузка (1/5/15)</span><span class="system-info-value">${DOMPurify.sanitize(stats.system.os_load.map(l => l.toFixed(2)).join(' / '))}</span></div>
      ${mvp?.feature_flags?.RAG_V2_ENABLED != null ? `<div class="system-info-item"><span class="system-info-label">RAG v2</span><span class="system-info-value">${mvp.feature_flags.RAG_V2_ENABLED ? 'enabled' : 'disabled'}</span></div>` : ''}
    `;
    }
  } catch (e) { console.error('Stats load failed', e); }
}

export async function loadAdminUsers() {
  const r = await fetch('/api/admin/users', { headers: { 'Authorization': 'Bearer ' + state.authToken } });
  if (r.ok) {
    const users = await r.json() as Record<string, AdminUserRecord>;
    adminUsersCache = users;
    const list = $('admin-user-list');
    if (!list) return;
    list.textContent = '';

    Object.entries(users).forEach(([username, u]) => {
      const isExpired = u.expiration_date && new Date(u.expiration_date) < new Date();
      const blocked = isUserBlocked(u);
      let statusClass: string;
      let statusLabel: string;
      if (blocked) {
        statusClass = 'status-badge--expired';
        statusLabel = '🔒 Заблокирован';
      } else if (isExpired) {
        statusClass = 'status-badge--expired';
        statusLabel = 'Истек';
      } else {
        statusClass = 'status-badge--active';
        statusLabel = 'Активен';
      }

      const billingInfo = formatAdminBalanceSummary(u);

      const el = document.createElement('div');
      el.className = 'user-item';
      el.innerHTML = `
        <div class="user-item-info">
          <div class="flex-center-gap">
            <span class="user-item-name">${DOMPurify.sanitize(username)}</span>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
          <span class="user-item-cat">${DOMPurify.sanitize(u.email || 'E-mail не задан')} | ${DOMPurify.sanitize(u.category || '')} | ${billingInfo}</span>
          ${u.expiration_date ? `<span class="user-expiration">Срок до: ${DOMPurify.sanitize(u.expiration_date)}</span>` : ''}
        </div>
        <div class="user-item-actions">
          <button class="nav-btn btn-action-sm edit-usr-btn" data-usr="${DOMPurify.sanitize(username)}" aria-label="Редактировать ${DOMPurify.sanitize(username)}">✏️</button>
          <button class="nav-btn btn-action-sm--danger del-usr-btn" data-usr="${DOMPurify.sanitize(username)}" aria-label="Удалить ${DOMPurify.sanitize(username)}">🗑️</button>
        </div>
      `;
      list.appendChild(el);
    });

    document.querySelectorAll('.edit-usr-btn').forEach(b => b.addEventListener('click', (e: Event) => {
      const btn = (e.target as Element).closest('button') as HTMLButtonElement;
      editAdminUser(btn.dataset.usr || '', users);
    }));
    document.querySelectorAll('.del-usr-btn').forEach(b => b.addEventListener('click', (e: Event) => {
      const btn = (e.target as Element).closest('button') as HTMLButtonElement;
      deleteAdminUser(btn.dataset.usr || '');
    }));
  }
}

async function editAdminUser(username: string, usersMap: Record<string, AdminUserRecord>) {
  const sourceUsers = Object.keys(usersMap || {}).length > 0 ? usersMap : adminUsersCache;
  const templateUser = !username ? sourceUsers?.user_a || null : null;
  const user = username && sourceUsers[username] ? sourceUsers[username] : templateUser;
  const selectedCategories = user?.allowed_categories || [];
  const categoriesContainer = $('admin-allowed-categories-container');
  if (categoriesContainer) categoriesContainer.textContent = 'Загрузка категорий...';

  try {
    const cats = await getAdminCategories();
    renderAllowedCategories(cats, selectedCategories, !user);
    bindAllowedCategorySync(user?.category || '');
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Не удалось загрузить категории';
    if (categoriesContainer) categoriesContainer.textContent = msg;
    showToast('❌ ' + msg);
  }

  $('admin-edit-card')?.classList.remove('hidden');
  const titleEl = $('admin-edit-title');
  if (titleEl) titleEl.textContent = username ? 'Редактировать ' + username : 'Новый пользователь';

  const usernameEl = $<HTMLInputElement>('admin-username');
  if (usernameEl) {
    usernameEl.value = username || '';
    usernameEl.disabled = !!username;
  }
  const emailEl = $<HTMLInputElement>('admin-email');
  if (emailEl) emailEl.value = username ? user?.email || '' : '';
  const passwordEl = $<HTMLInputElement>('admin-password');
  if (passwordEl) passwordEl.value = '';

  if (user) {
    const u = user;
    const isAdminEl = $<HTMLInputElement>('admin-is-admin');
    if (isAdminEl) isAdminEl.checked = !!u.is_admin;
    const isBlockedEl = $<HTMLInputElement>('admin-is-blocked');
    if (isBlockedEl) isBlockedEl.checked = !!u.is_blocked;
    const expirationEl = $<HTMLInputElement>('admin-expiration');
    if (expirationEl) expirationEl.value = u.expiration_date || '';
    const { inputMax, outputMax, inputDefault, outputDefault } = getAdminUserLimitBounds(u.category || '');
    setTokenLimitInput('admin-input-context-limit', u.input_context_limit, inputMax, inputDefault);
    setTokenLimitInput('admin-output-generation-limit', u.output_generation_limit, outputMax, outputDefault);
    const sysPromptEl = $<HTMLTextAreaElement>('admin-system-prompt');
    if (sysPromptEl) sysPromptEl.value = u.system_prompt || '';

    setAdminBillingFields(u);
  } else {
    const isAdminEl = $<HTMLInputElement>('admin-is-admin');
    if (isAdminEl) isAdminEl.checked = false;
    const isBlockedEl = $<HTMLInputElement>('admin-is-blocked');
    if (isBlockedEl) isBlockedEl.checked = false;
    const expirationEl = $<HTMLInputElement>('admin-expiration');
    if (expirationEl) expirationEl.value = '2099-12-31';
    updateAdminUserTokenLimitBounds(false);
    const sysPromptEl = $<HTMLTextAreaElement>('admin-system-prompt');
    if (sysPromptEl) sysPromptEl.value = 'Ты — полезный ИИ-ассистент Gemma 4. Отвечай точно и по существу.';
    setAdminBillingFields({ balance_usd: 0, credit_limit_usd: 0, cost_usd_used: 0 });
  }
  updateAdminUserTokenLimitBounds();
  $('admin-edit-card')?.scrollIntoView({ behavior: 'smooth' });
}

$('btn-create-user')?.addEventListener('click', (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  editAdminUser('', adminUsersCache);
});
$('btn-cancel-user')?.addEventListener('click', (e: MouseEvent) => {
  e.preventDefault();
  $('admin-edit-card')?.classList.add('hidden');
});

$('btn-save-user')?.addEventListener('click', async (e: MouseEvent) => {
  e.preventDefault();
  const username = $<HTMLInputElement>('admin-username')?.value.trim() || '';
  if (!username) return showToast('❌ Имя обязательно');

  if (username.length < 3 || username.length > 64 || !USERNAME_RE.test(username)) {
    return showToast('❌ Имя должно быть от 3 до 64 символов (только a-z, A-Z, 0-9, _ и -)');
  }

  const allowed_categories = getCheckedAllowedCategories();
  if (allowed_categories.length === 0) {
    return showToast('❌ Выберите хотя бы одну доступную категорию');
  }
  const defaultCategory = $<HTMLSelectElement>('admin-default-category')?.value || allowed_categories[0];
  if (!allowed_categories.includes(defaultCategory)) {
    return showToast('❌ Категория по умолчанию должна быть среди доступных категорий');
  }

  const is_admin = $<HTMLInputElement>('admin-is-admin')?.checked;
  const is_blocked = $<HTMLInputElement>('admin-is-blocked')?.checked;
  const billing = readAdminBillingPayload();
  const inputLimit = readAdminTokenLimit('admin-input-context-limit', 'Входной контекст');
  if (inputLimit === undefined) return;
  const outputLimit = readAdminTokenLimit('admin-output-generation-limit', 'Выходная генерация');
  if (outputLimit === undefined) return;

  const payload: Record<string, unknown> = {
    email: $<HTMLInputElement>('admin-email')?.value.trim() || null,
    is_admin: is_admin,
    is_blocked: is_blocked,
    balance_usd: billing.balance_usd,
    credit_limit_usd: billing.credit_limit_usd,
    expiration_date: $<HTMLInputElement>('admin-expiration')?.value || null,
    input_context_limit: inputLimit,
    output_generation_limit: outputLimit,
    system_prompt: $<HTMLTextAreaElement>('admin-system-prompt')?.value || null,
    category: defaultCategory,
    allowed_categories: allowed_categories
  };

  const p = $<HTMLInputElement>('admin-password')?.value || '';
  if (p) {
    const passwordErrors = getPasswordErrors(p);
    if (passwordErrors.length > 0) return showToast('❌ ' + passwordErrors.join('; '));
    payload.password = p;
  }

  try {
    const r = await fetch('/api/admin/users/' + encodeURIComponent(username), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.authToken },
      body: JSON.stringify(payload)
    });

    if (r.ok) {
      showToast('✅ Пользователь сохранен');
      $('admin-edit-card')?.classList.add('hidden');
      loadAdminUsers();
    } else {
      const errData = await r.json() as ApiErrorBody;
      console.error('[Admin] Save user failed:', errData);
      showToast('❌ Ошибка: ' + formatApiErrors(errData, 'Не удалось сохранить пользователя'));
    }
  } catch (err) {
    console.error('[Admin] Network error during save:', err);
    showToast('❌ Ошибка сети: ' + (err instanceof Error ? err.message : String(err)));
  }
});

async function deleteAdminUser(username: string) {
  if (!confirm('Точно удалить ' + username + '?')) return;
  const r = await fetch('/api/admin/users/' + encodeURIComponent(username), {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  if (r.ok) {
    showToast('🗑️ Пользователь удален');
    loadAdminUsers();
  } else {
    showToast('❌ Ошибка удаления');
  }
}

export async function loadAdminCategories() {
  const r = await fetch('/api/admin/categories', { headers: { 'Authorization': 'Bearer ' + state.authToken } });
  if (r.ok) {
    const cats = await r.json() as Record<string, CategoryData>;
    adminCategoriesCache = cats;
    const list = $('admin-category-list');
    if (!list) return;
    list.textContent = '';
    Object.entries(cats).forEach(([catName, data]) => {
      const providerLabel = data.provider ? data.provider.toUpperCase() : 'llamacpp';
      const tierLabel = data.retrieval_tier || 'consultant';
      const ragLabel = data.rag_allowed ? 'RAG' : 'no-RAG';
      const inputDefault = formatGroupedInt(data.input_context_default ?? TOKEN_LIMIT_STEP);
      const inputMax = formatGroupedInt(data.input_context_max ?? TOKEN_LIMIT_STEP);
      const outputMax = formatGroupedInt(data.max_tokens ?? TOKEN_LIMIT_STEP);
      const el = document.createElement('div');
      el.className = 'user-item';
      el.innerHTML = `
        <div class="user-item-info">
          <span class="user-item-name">${DOMPurify.sanitize(catName)}</span>
          <span class="user-item-cat">${DOMPurify.sanitize(providerLabel)} | ${DOMPurify.sanitize(tierLabel)} | ${ragLabel}</span>
          <span class="user-item-cat">Вход: ${DOMPurify.sanitize(inputDefault)} / ${DOMPurify.sanitize(inputMax)} токенов | Выход: ${DOMPurify.sanitize(outputMax)} токенов</span>
        </div>
        <div class="user-item-actions">
          <button class="nav-btn btn-action-sm edit-cat-btn" data-cat="${DOMPurify.sanitize(catName)}" aria-label="Редактировать ${DOMPurify.sanitize(catName)}">✏️</button>
        </div>
      `;
      list.appendChild(el);
    });

    document.querySelectorAll('.edit-cat-btn').forEach(b => b.addEventListener('click', (e: Event) => {
      const btn = (e.target as Element).closest('button') as HTMLButtonElement;
      const c = btn.dataset.cat || '';
      editAdminCategory(c, cats[c]);
    }));
  }
}

let availableProviders: ProviderInfo[] = [];
let currentEditCategory = '';

function parseGroupedInt(value: string | number | null | undefined, fallback = 0) {
  const normalized = String(value ?? '').replace(/\s+/g, '');
  const n = parseInt(normalized, 10);
  return Number.isFinite(n) ? n : fallback;
}

function formatGroupedInt(value: string | number) {
  const n = parseGroupedInt(value, 0);
  return n.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}

function bindGroupedNumberInput(id: string) {
  const el = $<HTMLInputElement>(id);
  if (!el || el.dataset.groupedNumberBound) return;
  el.dataset.groupedNumberBound = '1';
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D+/g, '');
    el.value = digits ? formatGroupedInt(digits) : '';
  });
  el.addEventListener('blur', () => {
    el.value = el.value ? formatGroupedInt(el.value) : '';
  });
}

async function loadProvidersList() {
  if (availableProviders.length > 0) return;
  try {
    const r = await fetch('/api/providers', { headers: { 'Authorization': 'Bearer ' + state.authToken } });
    if (r.ok) availableProviders = await r.json();
  } catch (e) { console.error('Failed to load providers:', e); }
}

function populateProviderDropdown(selectedId: string) {
  const sel = $<HTMLSelectElement>('admin-cat-provider');
  if (!sel) return;
  sel.textContent = '';
  availableProviders.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateProviderUI(providerId: string) {
  const cfg: ProviderInfo = availableProviders.find(p => p.id === providerId) || { id: providerId, name: providerId };
  const isLlama = cfg.adapter === 'llamacpp' || providerId === 'llamacpp';
  document.querySelectorAll('.llama-only-param').forEach(el => {
    el.classList.toggle('hidden', !isLlama);
  });

  const isResponses = cfg.adapter === 'openai_responses' || providerId === 'openai_responses';

  const sysPromptEl = $<HTMLTextAreaElement>('admin-cat-system-prompt');
  if (sysPromptEl) {
    sysPromptEl.disabled = false;
    sysPromptEl.style.opacity = '1';
    if (isResponses) {
      sysPromptEl.placeholder = 'Опциональный системный промпт (будет передан в OpenAI Responses)...';
    } else {
      sysPromptEl.placeholder = 'Опциональный системный промпт для этой категории...';
    }
  }
}

async function editAdminCategory(name: string, data: CategoryData) {
  await loadProvidersList();
  currentEditCategory = name;
  $('admin-cat-edit-card')?.classList.remove('hidden');
  const titleEl = $('admin-cat-edit-title');
  if (titleEl) titleEl.textContent = name ? 'Категория: ' + name : 'Новая категория';

  const nameEl = $<HTMLInputElement>('admin-cat-name');
  if (nameEl) {
    nameEl.value = name || '';
    nameEl.disabled = !!name;
  }
  $('btn-del-cat')?.classList.toggle('hidden', !name);

  const providerId = data.provider || 'llamacpp';
  populateProviderDropdown(providerId);
  updateProviderUI(providerId);

  const sysPromptEl = $<HTMLTextAreaElement>('admin-cat-system-prompt');
  if (sysPromptEl) sysPromptEl.value = (data as CategoryData & { system_prompt?: string }).system_prompt || '';

  const sortIndexEl = $<HTMLInputElement>('admin-cat-sort-index');
  if (sortIndexEl) sortIndexEl.value = String(data.sort_index != null ? parseInt(String(data.sort_index), 10) : 0);
  const suggestedEl = $<HTMLTextAreaElement>('admin-cat-suggested-questions');
  if (suggestedEl) suggestedEl.value = data.suggested_questions || '';

  const extraEl = $<HTMLTextAreaElement>('admin-cat-extra-params');
  if (extraEl) {
    extraEl.value = data.extra_params ? JSON.stringify(data.extra_params, null, 2) : '';
  }

  const debugEl = $<HTMLInputElement>('admin-cat-debug-mode');
  if (debugEl) debugEl.checked = !!(data.debug_mode);

  const ragEl = $<HTMLInputElement>('admin-cat-rag-allowed');
  if (ragEl) ragEl.checked = data.rag_allowed !== false && data.rag_allowed !== 0;

  const tierEl = $<HTMLSelectElement>('admin-cat-retrieval-tier');
  if (tierEl) tierEl.value = data.retrieval_tier || 'consultant';

  const globalKbEl = $<HTMLInputElement>('admin-cat-global-kb-enabled');
  if (globalKbEl) {
    const extra = data.extra_params || {};
    globalKbEl.checked = extra.global_kb_enabled !== false && extra.global_kb_enabled !== 0;
  }

  const complexityEl = $<HTMLInputElement>('admin-cat-complexity');
  if (complexityEl) complexityEl.value = parseFloat(String(data.complexity ?? 1.0)).toFixed(2);

  const inputDefaultEl = $<HTMLInputElement>('admin-cat-input-context-default');
  if (inputDefaultEl) inputDefaultEl.value = String(data.input_context_default != null ? data.input_context_default : 1000000);
  const inputMaxEl = $<HTMLInputElement>('admin-cat-input-context-max');
  if (inputMaxEl) inputMaxEl.value = String(data.input_context_max != null ? data.input_context_max : 1000000);
  const maxTokensEl = $<HTMLInputElement>('admin-cat-max-tokens');
  if (maxTokensEl) maxTokensEl.value = String(data.max_tokens != null ? data.max_tokens : TOKEN_LIMIT_STEP);

  $('admin-cat-edit-card')?.scrollIntoView({ behavior: 'smooth' });
}

$('admin-cat-provider')?.addEventListener('change', (e: Event) => {
  const pid = (e.target as HTMLSelectElement).value;
  updateProviderUI(pid);
});

$('btn-cancel-cat')?.addEventListener('click', (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  $('admin-cat-edit-card')?.classList.add('hidden');
});

$('btn-create-cat')?.addEventListener('click', (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  editAdminCategory('', {});
});

$('btn-del-cat')?.addEventListener('click', async (e: MouseEvent) => {
  e.preventDefault();
  if (!currentEditCategory) return;
  if (!confirm(`Удалить категорию ${currentEditCategory}?`)) return;

  const r = await fetch('/api/admin/categories/' + encodeURIComponent(currentEditCategory), {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  if (r.ok) {
    showToast('🗑️ Категория удалена');
    $('admin-cat-edit-card')?.classList.add('hidden');
    loadAdminCategories();
  } else {
    const err = await r.json() as { detail?: string };
    showToast('❌ Ошибка: ' + (err.detail || 'Ошибка удаления'));
  }
});

$('btn-save-cat')?.addEventListener('click', async (e: MouseEvent) => {
  e.preventDefault();
  const catName = $<HTMLInputElement>('admin-cat-name')?.value.trim() || '';
  if (!catName) {
    return showToast('❌ Название категории обязательно');
  }

  const extraParams: Record<string, unknown> = {};
  const extraParamsRaw = $<HTMLTextAreaElement>('admin-cat-extra-params')?.value?.trim();
  if (extraParamsRaw) {
    try {
      Object.assign(extraParams, JSON.parse(extraParamsRaw));
    } catch {
      showToast('Ошибка в JSON дополнительных параметров');
      return;
    }
  }
  extraParams.global_kb_enabled = !!($<HTMLInputElement>('admin-cat-global-kb-enabled')?.checked);

  const inputContextDefault = readCategoryTokenLimit('admin-cat-input-context-default', 'Входной контекст по умолчанию', 1000000);
  const inputContextMax = readCategoryTokenLimit('admin-cat-input-context-max', 'Максимум входного контекста', 1000000);
  const maxTokens = readCategoryTokenLimit('admin-cat-max-tokens', 'Максимум выходной генерации', TOKEN_LIMIT_STEP);
  if (inputContextDefault === undefined || inputContextMax === undefined || maxTokens === undefined) return;
  if (inputContextDefault > inputContextMax) {
    return showToast('❌ Входной контекст по умолчанию не может быть больше максимума входного контекста');
  }

  const payload = {
    provider: $<HTMLSelectElement>('admin-cat-provider')?.value || 'llamacpp',
    system_prompt: $<HTMLTextAreaElement>('admin-cat-system-prompt')?.value || null,
    debug_mode: !!($<HTMLInputElement>('admin-cat-debug-mode')?.checked),
    rag_allowed: !!($<HTMLInputElement>('admin-cat-rag-allowed')?.checked),
    retrieval_tier: $<HTMLSelectElement>('admin-cat-retrieval-tier')?.value || 'consultant',
    complexity: parseFloat(parseFloat($<HTMLInputElement>('admin-cat-complexity')?.value || '1').toFixed(2)) || 1.0,
    input_context_default: inputContextDefault,
    input_context_max: inputContextMax,
    max_tokens: maxTokens,
    sort_index: parseInt($<HTMLInputElement>('admin-cat-sort-index')?.value || '0', 10),
    suggested_questions: $<HTMLTextAreaElement>('admin-cat-suggested-questions')?.value || '',
    extra_params: extraParams,
  };

  const r = await fetch('/api/admin/categories/' + encodeURIComponent(catName), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.authToken },
    body: JSON.stringify(payload)
  });
  if (r.ok) {
    showToast('✅ Категория сохранена');
    $('admin-cat-edit-card')?.classList.add('hidden');
    loadAdminCategories();
  } else {
    try {
      const errData = await r.json() as ApiErrorBody;
      const errMsg = errData.detail || (errData.error && errData.error.message) || errData.message || JSON.stringify(errData);
      showToast('❌ Ошибка сохранения: ' + errMsg);
    } catch {
      showToast('❌ Ошибка сохранения');
    }
  }
});

$('btn-test-cat')?.addEventListener('click', async (e: MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  const catName = $<HTMLInputElement>('admin-cat-name')?.value.trim() || '';
  if (!catName) return showToast('❌ Сначала сохраните категорию');
  const btn = $<HTMLButtonElement>('btn-test-cat');
  if (!btn) return;
  const oldText = btn.textContent;
  btn.textContent = '⏳ Проверка...';
  btn.disabled = true;

  try {
    const payload = {
      provider: $<HTMLSelectElement>('admin-cat-provider')?.value,
    };

    const r = await fetch(`/api/admin/categories/${encodeURIComponent(catName)}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.authToken
      },
      body: JSON.stringify(payload)
    });
    const d = await r.json() as { message?: string; error?: string };
    if (r.ok) {
      showToast('✅ ' + d.message);
    } else {
      showToast('❌ ' + (d.error || 'Ошибка соединения'));
    }
  } catch {
    showToast('❌ Ошибка сети при проверке');
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
});

export async function loadAuditLogs() {
  const username = $<HTMLInputElement>('admin-audit-search')?.value.trim() || '';
  const action = $<HTMLSelectElement>('admin-audit-action')?.value || '';
  let url = '/api/admin/audit?limit=100';
  if (username) url += '&username=' + encodeURIComponent(username);
  if (action) url += '&action=' + encodeURIComponent(action);

  const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + state.authToken } });
  if (r.ok) {
    const logs = await r.json() as AuditLogEntry[];
    const list = $('admin-audit-list');
    if (!list) return;
    list.textContent = '';

    if (logs.length === 0) {
      list.innerHTML = '<div class="audit-log-empty">Логов не найдено</div>';
      return;
    }

    logs.forEach(log => {
      const date = new Date(log.created_at).toLocaleString('ru-RU');
      const el = document.createElement('div');
      el.className = 'user-item';
      let detailsHtml = '';
      if (log.details) {
        try {
          const parsed = JSON.parse(log.details);
          detailsHtml = `<div class="audit-log-details">${DOMPurify.sanitize(JSON.stringify(parsed))}</div>`;
        } catch {
          detailsHtml = `<div class="audit-log-details">${DOMPurify.sanitize(log.details)}</div>`;
        }
      }

      el.innerHTML = `
        <div class="user-item-info w-full">
          <div class="audit-log-header">
            <span class="user-item-name audit-log-name">${DOMPurify.sanitize(date)}</span>
            <span class="status-badge audit-log-action-badge">${DOMPurify.sanitize(log.action)}</span>
          </div>
          <div class="audit-log-content">
            <strong>Пользователь:</strong> ${log.username ? DOMPurify.sanitize(log.username) : `<span class="text-secondary">Система/Аноним</span>`}
            ${log.ip_address ? ` | <strong>IP:</strong> ${DOMPurify.sanitize(log.ip_address)}` : ''}
          </div>
          ${detailsHtml}
        </div>
      `;
      list.appendChild(el);
    });
  }
}

$('btn-refresh-audit')?.addEventListener('click', loadAuditLogs);
$('admin-audit-search')?.addEventListener('keypress', (e: KeyboardEvent) => {
  if (e.key === 'Enter') loadAuditLogs();
});
$('admin-audit-action')?.addEventListener('change', loadAuditLogs);

const debugLogBuffer: DebugLogEntry[] = [];
const MAX_DEBUG_ENTRIES = 200;

export function appendDebugLog(entry: DebugLogEntry) {
  debugLogBuffer.unshift(entry);
  if (debugLogBuffer.length > MAX_DEBUG_ENTRIES) debugLogBuffer.pop();
  const tab = document.querySelector('.admin-tab[data-tab="debug"]');
  if (tab && tab.classList.contains('active')) {
    renderDebugLogs();
  }
}

function renderDebugLogs() {
  const list = $('admin-debug-list');
  if (!list) return;
  if (debugLogBuffer.length === 0) {
    list.innerHTML = '<div class="audit-log-empty">Нет записей. Включите режим отладки в настройках категории.</div>';
    return;
  }
  list.innerHTML = '';
  debugLogBuffer.forEach(entry => {
    const el = document.createElement('div');
    el.className = 'user-item';
    const ts = new Date(entry.ts).toLocaleTimeString('ru-RU');
    const levelColor = entry.level === 'error' ? 'var(--color-error)' : entry.level === 'warn' ? 'orange' : 'var(--color-accent)';
    el.innerHTML = `
      <div class="user-item-info w-full">
        <div class="audit-log-header">
          <span class="user-item-name audit-log-name">${DOMPurify.sanitize(ts)}</span>
          <span class="status-badge" style="background:${levelColor}">${DOMPurify.sanitize(entry.level?.toUpperCase() || 'DEBUG')}</span>
          <span class="user-item-cat">${DOMPurify.sanitize(entry.provider || '')}</span>
        </div>
        <div class="audit-log-details" style="font-family:monospace;font-size:0.8em;white-space:pre-wrap">${DOMPurify.sanitize(entry.message)}</div>
      </div>
    `;
    list.appendChild(el);
  });
}

export function loadDebugLogs() {
  fetch('/api/admin/debug/stream', {
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  }).then(r => r.ok ? r.json() : []).then((entries: DebugLogEntry[]) => {
    const list = $('admin-debug-list');
    if (!list) return;
    if (!entries || entries.length === 0) {
      list.innerHTML = '<div class="audit-log-empty">Нет записей. Включите режим отладки в настройках категории.</div>';
      return;
    }
    list.innerHTML = '';
    entries.forEach(entry => {
      const el = document.createElement('div');
      el.className = 'user-item';
      const ts = new Date(entry.ts).toLocaleTimeString('ru-RU');
      const levelColor = entry.level === 'error' ? 'var(--color-error)' : entry.level === 'warn' ? 'orange' : 'var(--color-accent)';
      el.innerHTML = `
        <div class="user-item-info w-full">
          <div class="audit-log-header">
            <span class="user-item-name audit-log-name">${DOMPurify.sanitize(ts)}</span>
            <span class="status-badge" style="background:${levelColor}">${DOMPurify.sanitize(entry.level?.toUpperCase() || 'DEBUG')}</span>
            <span class="user-item-cat">${DOMPurify.sanitize(entry.provider || '')}</span>
          </div>
          <div class="audit-log-details" style="font-family:monospace;font-size:0.8em;white-space:pre-wrap">${DOMPurify.sanitize(entry.message)}</div>
        </div>
      `;
      list.appendChild(el);
    });
  }).catch(e => console.error('Debug log load failed', e));
}

$('btn-refresh-debug')?.addEventListener('click', loadDebugLogs);
$('btn-clear-debug')?.addEventListener('click', async () => {
  await fetch('/api/admin/debug/log', {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  loadDebugLogs();
});
