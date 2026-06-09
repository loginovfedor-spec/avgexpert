import { state } from './state.js';
import { $, showToast } from './index.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

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

function formatApiErrors(data, fallback = 'Ошибка') {
  if (data?.errors?.length > 0) {
    const messages = data.errors.map(err => err.message).filter(Boolean);
    if (messages.length > 0) return [...new Set(messages)].join('; ');
  }
  return data?.detail || data?.error?.message || data?.message || fallback;
}

function parseOptionalIntInput(id) {
  const value = $(id)?.value;
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokensToCredits(tokens) {
  return (parseInt(tokens || 0, 10) || 0) / 1000;
}

function formatCreditValue(value) {
  return String(Math.round(Number(value) || 0));
}

function setCreditField(id, tokenValue) {
  const el = $(id);
  if (el) el.value = formatCreditValue(tokensToCredits(tokenValue));
}

let adminCategoriesCache = {};
let adminUsersCache = {};

async function getAdminCategories() {
  try {
    const r = await fetch('/api/admin/categories', { headers: { 'Authorization': 'Bearer ' + state.authToken }});
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
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

function renderAllowedCategories(cats, selected = [], selectFirstWhenEmpty = false) {
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
  return Array.from(document.querySelectorAll('.admin-allowed-cat-chk:checked')).map(chk => chk.value);
}

function populateDefaultCategorySelect(selectedCategory = '') {
  const select = $('admin-default-category');
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
    chk.addEventListener('change', () => populateDefaultCategorySelect());
  });
}

export function initAdminTabs() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.toggle('active', t === tab);
        t.setAttribute('aria-selected', t === tab);
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

  $('admin-user-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.user-item').forEach(item => {
      const name = item.querySelector('.user-item-name').textContent.toLowerCase();
      item.style.display = name.includes(q) ? '' : 'none';
    });
  });
}

export async function loadAdminStats() {
  try {
    const r = await fetch('/api/admin/stats', { headers: { 'Authorization': 'Bearer ' + state.authToken }});
    if (!r.ok) return;
    const stats = await r.json();

    $('stat-total-users').textContent = stats.users.total;
    $('stat-expired-users').textContent = `${stats.users.expired} истекло`;
    $('stat-total-sessions').textContent = stats.sessions.total;
    $('stat-total-categories').textContent = stats.categories;
    
    const uptimeS = stats.system.uptime;
    const h = Math.floor(uptimeS / 3600);
    const m = Math.floor((uptimeS % 3600) / 60);
    const s = uptimeS % 60;
    $('stat-uptime').textContent = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    const memMb = Math.round(stats.system.memory.rss / 1024 / 1024);
    $('stat-memory').textContent = `${memMb} MB RAM`;

    const list = $('system-info-list');
    list.innerHTML = `
      <div class="system-info-item"><span class="system-info-label">Платформа</span><span class="system-info-value">${DOMPurify.sanitize(stats.system.platform)}</span></div>
      <div class="system-info-item"><span class="system-info-label">Node.js</span><span class="system-info-value">${DOMPurify.sanitize(stats.system.node_version)}</span></div>
      <div class="system-info-item"><span class="system-info-label">Свободная память</span><span class="system-info-value">${Math.round(stats.system.os_free_mem / 1024 / 1024)} MB</span></div>
      <div class="system-info-item"><span class="system-info-label">Загрузка (1/5/15)</span><span class="system-info-value">${DOMPurify.sanitize(stats.system.os_load.map(l => l.toFixed(2)).join(' / '))}</span></div>
    `;
  } catch (e) { console.error('Stats load failed', e); }
}

export async function loadAdminUsers() {
  const r = await fetch('/api/admin/users', { headers: { 'Authorization': 'Bearer ' + state.authToken }});
  if (r.ok) {
    const users = await r.json();
    adminUsersCache = users;
    const list = $('admin-user-list');
    list.textContent = '';
    
    Object.entries(users).forEach(([username, u]) => {
      const isExpired = u.expiration_date && new Date(u.expiration_date) < new Date();
      const isBlocked = !!u.is_blocked || (u.tokens_allocated === 0);
      let statusClass, statusLabel;
      if (isBlocked) {
        statusClass = 'status-badge--expired';
        statusLabel = '🔒 Заблокирован';
      } else if (isExpired) {
        statusClass = 'status-badge--expired';
        statusLabel = 'Истек';
      } else {
        statusClass = 'status-badge--active';
        statusLabel = 'Активен';
      }

      const tokensAllocated = u.tokens_allocated || 0;
      const tokensUsed = (u.tokens_input_used || 0) + (u.tokens_output_used || 0);
      const tokensBalance = tokensAllocated - tokensUsed;
      const tokenInfo = tokensAllocated > 0
        ? `Кредиты: ${formatCreditValue(tokensToCredits(tokensBalance))} / ${formatCreditValue(tokensToCredits(tokensAllocated))}`
        : 'Кредиты: не выделены';

      const el = document.createElement('div');
      el.className = 'user-item';
      el.innerHTML = `
        <div class="user-item-info">
          <div class="flex-center-gap">
            <span class="user-item-name">${DOMPurify.sanitize(username)}</span>
            <span class="status-badge ${statusClass}">${statusLabel}</span>
          </div>
          <span class="user-item-cat">${DOMPurify.sanitize(u.email || 'E-mail не задан')} | ${DOMPurify.sanitize(u.category)} | Контекст: ${u.n_ctx || 4096} | ${tokenInfo}</span>
          ${u.expiration_date ? `<span class="user-expiration">Срок до: ${DOMPurify.sanitize(u.expiration_date)}</span>` : ''}
        </div>
        <div class="user-item-actions">
          <button class="nav-btn btn-action-sm edit-usr-btn" data-usr="${DOMPurify.sanitize(username)}" aria-label="Редактировать ${DOMPurify.sanitize(username)}">✏️</button>
          <button class="nav-btn btn-action-sm--danger del-usr-btn" data-usr="${DOMPurify.sanitize(username)}" aria-label="Удалить ${DOMPurify.sanitize(username)}">🗑️</button>
        </div>
      `;
      list.appendChild(el);
    });
    
    document.querySelectorAll('.edit-usr-btn').forEach(b => b.addEventListener('click', e => editAdminUser(e.target.closest('button').dataset.usr, users)));
    document.querySelectorAll('.del-usr-btn').forEach(b => b.addEventListener('click', e => deleteAdminUser(e.target.closest('button').dataset.usr)));
  }
}

async function editAdminUser(username, usersMap) {
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
  } catch(e) {
    if (categoriesContainer) categoriesContainer.textContent = e.message || 'Не удалось загрузить категории';
    showToast('❌ ' + (e.message || 'Не удалось загрузить категории'));
  }

  $('admin-edit-card').classList.remove('hidden');
  $('admin-edit-title').textContent = username ? 'Редактировать ' + username : 'Новый пользователь';
  
  $('admin-username').value = username || '';
  $('admin-username').disabled = !!username;
  $('admin-email').value = username ? user?.email || '' : '';
  $('admin-password').value = '';
  
  if (user) {
    const u = user;
    $('admin-is-admin').checked = !!u.is_admin;
    $('admin-is-blocked').checked = !!u.is_blocked;
    $('admin-expiration').value = u.expiration_date || '';
    $('admin-n-ctx').value = u.n_ctx || 4096;
    $('admin-input-context-credits').value = u.input_context_credits ?? '';
    $('admin-output-generation-credits').value = u.output_generation_credits ?? '';
    $('admin-system-prompt').value = u.system_prompt || '';

    const tokensAllocated = u.tokens_allocated || 0;
    const tokensInputUsed = u.tokens_input_used || 0;
    const tokensOutputUsed = u.tokens_output_used || 0;
    const tokensBalance = tokensAllocated - tokensInputUsed - tokensOutputUsed;
    setCreditField('admin-tokens-allocated', tokensAllocated);
    setCreditField('admin-tokens-input-used', tokensInputUsed);
    setCreditField('admin-tokens-output-used', tokensOutputUsed);
    setCreditField('admin-tokens-balance', tokensBalance);

  } else {
    $('admin-is-admin').checked = false;
    $('admin-is-blocked').checked = false;
    $('admin-expiration').value = '2099-12-31';
    $('admin-n-ctx').value = 4096;
    $('admin-input-context-credits').value = 1000;
    $('admin-output-generation-credits').value = 128;
    $('admin-system-prompt').value = 'Ты — полезный ИИ-ассистент Gemma 4. Отвечай точно и по существу.';
    $('admin-tokens-allocated').value = 0;
    $('admin-tokens-input-used').value = 0;
    $('admin-tokens-output-used').value = 0;
    $('admin-tokens-balance').value = 0;
  }
  $('admin-edit-card').scrollIntoView({ behavior: 'smooth' });
}

$('btn-create-user')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  editAdminUser('', adminUsersCache);
});
$('btn-cancel-user')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('admin-edit-card').classList.add('hidden');
});

// Live balance recalculation when admin changes allocated credits.
$('admin-tokens-allocated')?.addEventListener('input', () => {
  const allocated = parseFloat($('admin-tokens-allocated').value || '0') || 0;
  const inputUsed = parseFloat($('admin-tokens-input-used').value || '0') || 0;
  const outputUsed = parseFloat($('admin-tokens-output-used').value || '0') || 0;
  $('admin-tokens-balance').value = formatCreditValue(allocated - inputUsed - outputUsed);
});

$('btn-save-user')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const username = $('admin-username').value.trim();
  if (!username) return showToast('❌ Имя обязательно');
  
  if (username.length < 3 || username.length > 64 || !USERNAME_RE.test(username)) {
    return showToast('❌ Имя должно быть от 3 до 64 символов (только a-z, A-Z, 0-9, _ и -)');
  }

  const allowed_categories = getCheckedAllowedCategories();
  if (allowed_categories.length === 0) {
    return showToast('❌ Выберите хотя бы одну доступную категорию');
  }
  const defaultCategory = $('admin-default-category')?.value || allowed_categories[0];
  if (!allowed_categories.includes(defaultCategory)) {
    return showToast('❌ Категория по умолчанию должна быть среди доступных категорий');
  }

  const is_admin = $('admin-is-admin').checked;
  const is_blocked = $('admin-is-blocked').checked;
  const tokens_allocated = Math.round(parseFloat($('admin-tokens-allocated').value || '0') * 1000);
  
  const payload = {
    email: $('admin-email').value.trim() || null,
    is_admin: is_admin,
    is_blocked: is_blocked,
    tokens_allocated: tokens_allocated,
    expiration_date: $('admin-expiration').value || null,
    n_ctx: parseOptionalIntInput('admin-n-ctx') ?? 4096,
    input_context_credits: parseOptionalIntInput('admin-input-context-credits'),
    output_generation_credits: parseOptionalIntInput('admin-output-generation-credits'),
    system_prompt: $('admin-system-prompt').value || null,
    category: defaultCategory,
    allowed_categories: allowed_categories
  };
  
  const p = $('admin-password').value;
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
      $('admin-edit-card').classList.add('hidden');
      loadAdminUsers();
    } else {
      const errData = await r.json();
      console.error('[Admin] Save user failed:', errData);
      showToast('❌ Ошибка: ' + formatApiErrors(errData, 'Не удалось сохранить пользователя'));
    }
  } catch (err) {
    console.error('[Admin] Network error during save:', err);
    showToast('❌ Ошибка сети: ' + err.message);
  }
});

async function deleteAdminUser(username) {
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
  const r = await fetch('/api/admin/categories', { headers: { 'Authorization': 'Bearer ' + state.authToken }});
  if (r.ok) {
    const cats = await r.json();
    adminCategoriesCache = cats;
    const list = $('admin-category-list');
    list.textContent = '';
    Object.entries(cats).forEach(([catName, data]) => {
      const providerLabel = data.provider ? data.provider.toUpperCase() : 'llamacpp';
      const tierLabel = data.retrieval_tier || 'consultant';
      const ragLabel = data.rag_enabled ? 'RAG' : 'no-RAG';
      const el = document.createElement('div');
      el.className = 'user-item';
      el.innerHTML = `
        <div class="user-item-info">
          <span class="user-item-name">${DOMPurify.sanitize(catName)}</span>
          <span class="user-item-cat">${DOMPurify.sanitize(providerLabel)} | ${DOMPurify.sanitize(tierLabel)} | ${ragLabel}</span>
        </div>
        <div class="user-item-actions">
          <button class="nav-btn btn-action-sm edit-cat-btn" data-cat="${DOMPurify.sanitize(catName)}" aria-label="Редактировать ${DOMPurify.sanitize(catName)}">✏️</button>
        </div>
      `;
      list.appendChild(el);
    });
    
    document.querySelectorAll('.edit-cat-btn').forEach(b => b.addEventListener('click', e => {
      const c = e.target.closest('button').dataset.cat;
      editAdminCategory(c, cats[c]);
    }));
  }
}

let availableProviders = [];
let currentEditCategory = '';

function parseGroupedInt(value, fallback = 0) {
  const normalized = String(value ?? '').replace(/\s+/g, '');
  const n = parseInt(normalized, 10);
  return Number.isFinite(n) ? n : fallback;
}

function formatGroupedInt(value) {
  const n = parseGroupedInt(value, 0);
  return n.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
}

function bindGroupedNumberInput(id) {
  const el = $(id);
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
    const r = await fetch('/api/providers', { headers: { 'Authorization': 'Bearer ' + state.authToken }});
    if (r.ok) availableProviders = await r.json();
  } catch (e) { console.error('Failed to load providers:', e); }
}

function populateProviderDropdown(selectedId) {
  const sel = $('admin-cat-provider');
  sel.textContent = '';
  availableProviders.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    if (p.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function updateProviderUI(providerId) {
  const cfg = availableProviders.find(p => p.id === providerId) || {};
  const isLlama = cfg.adapter === 'llamacpp' || providerId === 'llamacpp';
  document.querySelectorAll('.llama-only-param').forEach(el => {
    el.classList.toggle('hidden', !isLlama);
  });

  const isResponses = cfg.adapter === 'openai_responses' || providerId === 'openai_responses';

  const sysPromptEl = $('admin-cat-system-prompt');
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

async function editAdminCategory(name, data) {
  await loadProvidersList();
  currentEditCategory = name;
  $('admin-cat-edit-card').classList.remove('hidden');
  $('admin-cat-edit-title').textContent = name ? 'Категория: ' + name : 'Новая категория';
  
  $('admin-cat-name').value = name || '';
  $('admin-cat-name').disabled = !!name;
  $('btn-del-cat').classList.toggle('hidden', !name);

  const providerId = data.provider || 'llamacpp';
  populateProviderDropdown(providerId);
  updateProviderUI(providerId);

  $('admin-cat-system-prompt').value = data.system_prompt || '';
  
  $('admin-cat-sort-index').value = data.sort_index != null ? parseInt(data.sort_index, 10) : 0;
  $('admin-cat-suggested-questions').value = data.suggested_questions || '';

  const extraEl = $('admin-cat-extra-params');
  if (extraEl) {
    extraEl.value = data.extra_params ? JSON.stringify(data.extra_params, null, 2) : '';
  }
  
  const debugEl = $('admin-cat-debug-mode');
  if (debugEl) debugEl.checked = !!(data.debug_mode);

  const ragEl = $('admin-cat-rag-enabled');
  if (ragEl) ragEl.checked = data.rag_enabled !== false && data.rag_enabled !== 0;

  const tierEl = $('admin-cat-retrieval-tier');
  if (tierEl) tierEl.value = data.retrieval_tier || 'consultant';

  const globalKbEl = $('admin-cat-global-kb-enabled');
  if (globalKbEl) {
    const extra = data.extra_params || {};
    globalKbEl.checked = extra.global_kb_enabled !== false && extra.global_kb_enabled !== 0;
  }

  const complexityEl = $('admin-cat-complexity');
  if (complexityEl) complexityEl.value = parseFloat(data.complexity ?? 1.0).toFixed(2);

  bindGroupedNumberInput('admin-cat-input-context-default');
  bindGroupedNumberInput('admin-cat-input-context-max');
  bindGroupedNumberInput('admin-cat-max-tokens');
  $('admin-cat-input-context-default').value = formatGroupedInt(data.input_context_default != null ? data.input_context_default : 1000000);
  $('admin-cat-input-context-max').value = formatGroupedInt(data.input_context_max != null ? data.input_context_max : 1000000);
  $('admin-cat-max-tokens').value = formatGroupedInt(data.max_tokens != null ? data.max_tokens : 1024);

  $('admin-cat-edit-card').scrollIntoView({ behavior: 'smooth' });
}

$('admin-cat-provider')?.addEventListener('change', async (e) => {
  const pid = e.target.value;
  updateProviderUI(pid);
});

$('btn-cancel-cat')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  $('admin-cat-edit-card').classList.add('hidden');
});

$('btn-create-cat')?.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  editAdminCategory('', {});
});

$('btn-del-cat')?.addEventListener('click', async (e) => {
  e.preventDefault();
  if (!currentEditCategory) return;
  if (!confirm(`Удалить категорию ${currentEditCategory}?`)) return;

  const r = await fetch('/api/admin/categories/' + encodeURIComponent(currentEditCategory), {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + state.authToken }
  });
  if (r.ok) {
    showToast('🗑️ Категория удалена');
    $('admin-cat-edit-card').classList.add('hidden');
    loadAdminCategories();
  } else {
    const err = await r.json();
    showToast('❌ Ошибка: ' + (err.detail || 'Ошибка удаления'));
  }
});

$('btn-save-cat')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const catName = $('admin-cat-name').value.trim();
  if (!catName) {
    return showToast('❌ Название категории обязательно');
  }

  const extraParams = {};
  const extraParamsRaw = $('admin-cat-extra-params')?.value?.trim();
  if (extraParamsRaw) {
    try {
      Object.assign(extraParams, JSON.parse(extraParamsRaw));
    } catch (e) {
      showToast('Ошибка в JSON дополнительных параметров');
      return;
    }
  }
  extraParams.global_kb_enabled = !!($('admin-cat-global-kb-enabled')?.checked);

  const payload = {
    provider: $('admin-cat-provider').value || 'llamacpp',
    system_prompt: $('admin-cat-system-prompt').value || null,
    debug_mode: !!($('admin-cat-debug-mode')?.checked),
    rag_enabled: !!($('admin-cat-rag-enabled')?.checked),
    retrieval_tier: $('admin-cat-retrieval-tier')?.value || 'consultant',
    complexity: parseFloat(parseFloat($('admin-cat-complexity')?.value || '1').toFixed(2)) || 1.0,
    input_context_default: parseGroupedInt($('admin-cat-input-context-default')?.value, 1000000),
    input_context_max: parseGroupedInt($('admin-cat-input-context-max')?.value, 1000000),
    max_tokens: parseGroupedInt($('admin-cat-max-tokens')?.value, 1024),
    sort_index: parseInt($('admin-cat-sort-index')?.value || '0', 10),
    suggested_questions: $('admin-cat-suggested-questions')?.value || '',
    extra_params: extraParams,
  };

  const r = await fetch('/api/admin/categories/' + encodeURIComponent(catName), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.authToken },
    body: JSON.stringify(payload)
  });
  if (r.ok) {
    showToast('✅ Категория сохранена');
    $('admin-cat-edit-card').classList.add('hidden');
    loadAdminCategories();
  } else {
    try {
      const errData = await r.json();
      const errMsg = errData.detail || (errData.error && errData.error.message) || errData.message || JSON.stringify(errData);
      showToast('❌ Ошибка сохранения: ' + errMsg);
    } catch (e) {
      showToast('❌ Ошибка сохранения');
    }
  }
});

$('btn-test-cat')?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const catName = $('admin-cat-name').value.trim();
  if (!catName) return showToast('❌ Сначала сохраните категорию');
  const btn = $('btn-test-cat');
  const oldText = btn.textContent;
  btn.textContent = '⏳ Проверка...';
  btn.disabled = true;

  try {
    const payload = {
      provider: $('admin-cat-provider').value,
    };

    const r = await fetch(`/api/admin/categories/${encodeURIComponent(catName)}/test`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.authToken 
      },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (r.ok) {
      showToast('✅ ' + d.message);
    } else {
      showToast('❌ ' + (d.error || 'Ошибка соединения'));
    }
  } catch (e) {
    showToast('❌ Ошибка сети при проверке');
  } finally {
    btn.textContent = oldText;
    btn.disabled = false;
  }
});

export async function loadAuditLogs() {
  const username = $('admin-audit-search')?.value.trim() || '';
  const action = $('admin-audit-action')?.value || '';
  let url = '/api/admin/audit?limit=100';
  if (username) url += '&username=' + encodeURIComponent(username);
  if (action) url += '&action=' + encodeURIComponent(action);

  const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + state.authToken }});
  if (r.ok) {
    const logs = await r.json();
    const list = $('admin-audit-list');
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
        } catch (e) {
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
$('admin-audit-search')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') loadAuditLogs();
});
$('admin-audit-action')?.addEventListener('change', loadAuditLogs);

// ── Debug Log ────────────────────────────────────────────

const debugLogBuffer = [];
const MAX_DEBUG_ENTRIES = 200;

export function appendDebugLog(entry) {
  debugLogBuffer.unshift(entry);
  if (debugLogBuffer.length > MAX_DEBUG_ENTRIES) debugLogBuffer.pop();
  // If debug tab is active, re-render
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
  }).then(r => r.ok ? r.json() : []).then(entries => {
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
