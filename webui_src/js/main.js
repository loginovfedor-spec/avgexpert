// Load npm-bundled libs (marked, hljs, DOMPurify, font).
// Dynamic import with catch: in direct-serve/non-Vite mode bare imports fail —
// the catch() is a no-op because CDN <script> tags in index.html already set window globals.
await import('./vendor-globals.js').catch(() => {});
import { state } from './state.js';
import { $, t, applyLang, showToast } from './index.js';
import { checkAuth, handleLogin, handleRegister, switchView, checkServerHealth, showLogin, showRegistrationPrompt, stopHealthPolling, updateLimitSliderLabels, exportBalanceHistoryCsv } from './auth.js';
import { autoResizeTextarea, updateWelcomeHints, setWelcomeVisible } from './ui.js';
import { newChat, handleSend, stopGeneration, handleFiles, initMessagesDelegation, initLargeRequestModal } from './chat.js';
import { initAdminTabs } from './admin.js';
import { SessionManager } from './sessions.js';
import { initUserDocuments } from './user-documents.js';

function init() {
  applyTheme();
  applyLang();
  bindEvents();
  initMessagesDelegation();
  initLargeRequestModal();
  autoResizeTextarea();
  checkAuth();
  initAdminTabs();
  initUserDocuments();
  
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: (code, lang) => {
        if (lang && window.hljs && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        if (window.hljs) return hljs.highlightAuto(code).value;
        return code;
      }
    });
  }
}

async function saveSettings() {
  localStorage.setItem('gemma_lang', state.lang);
  const payload = {};
  if ($('user-email') && $('user-email').value !== undefined) payload.email = $('user-email').value;
  if ($('user-password') && $('user-password').value) payload.password = $('user-password').value;
  
  const defaultCatSel = $('user-default-category');
  if (defaultCatSel && defaultCatSel.value) {
    payload.category = defaultCatSel.value;
  }
  if ($('user-input-context-credits')) {
    payload.input_context_credits = parseInt($('user-input-context-credits').value || '0', 10);
  }
  if ($('user-output-generation-credits')) {
    payload.output_generation_credits = parseInt($('user-output-generation-credits').value || '0', 10);
  }
  const ragToggle = $('user-rag-enabled');
  if (ragToggle && !ragToggle.disabled) {
    payload.rag_enabled = !!ragToggle.checked;
  }
  
  if (Object.keys(payload).length > 0) {
    try {
      const r = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.authToken },
        body: JSON.stringify(payload)
      });
      if (r.ok) {
        if (payload.password) {
          $('user-password').value = '';
        }
        if (payload.category) {
          state.currentUser.category = payload.category;
          
          // Force update the top select and title
          const chatSessionCat = $('chat-session-category');
          if (chatSessionCat) {
            chatSessionCat.value = payload.category;
          }
          
          const titleEl = $('chat-title-category');
          if (titleEl) {
            titleEl.textContent = payload.category;
          }
        }
        if (payload.input_context_credits !== undefined) state.currentUser.input_context_credits = payload.input_context_credits;
        if (payload.output_generation_credits !== undefined) state.currentUser.output_generation_credits = payload.output_generation_credits;
        if (payload.rag_enabled !== undefined) state.currentUser.rag_enabled = payload.rag_enabled;
      }
    } catch (e) {}
  }
  showToast(t('saved'));
}

function applyTheme(theme = localStorage.getItem('avgexpert_theme') || 'system') {
  const normalizedTheme = ['light-business', 'light-contrast'].includes(theme)
    ? 'light'
    : (['light', 'dark', 'system'].includes(theme) ? theme : 'system');
  if (normalizedTheme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', normalizedTheme);
  }
  localStorage.setItem('avgexpert_theme', normalizedTheme);
  document.querySelectorAll('[data-theme-option]').forEach(btn => {
    const isActive = btn.dataset.themeOption === normalizedTheme;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', String(isActive));
  });
}

function logout() {
  localStorage.removeItem('avgexpert_token');
  state.authToken = null;
  state.currentUser = null;
  stopHealthPolling();
  state.chatHistory = [];
  state.attachedDocs = [];
  if($('messages')) $('messages').textContent = '';
  if($('attached-docs')) $('attached-docs').textContent = '';
  setWelcomeVisible(true);
  showLogin();
}

function closeAppMenu() {
  $('app-menu')?.classList.remove('open');
  $('app-menu-btn')?.setAttribute('aria-expanded', 'false');
}

function closeAdvancedPanel() {
  $('advanced-panel')?.classList.add('hidden');
  $('advanced-toggle-btn')?.classList.remove('active');
  $('input-wrapper')?.classList.remove('advanced-open');
}

function openCreditsModal() {
  if (!state.authToken) {
    closeAppMenu();
    showRegistrationPrompt();
    return;
  }
  $('credits-modal')?.classList.remove('hidden');
  closeAppMenu();
  $('credits-modal-close')?.focus();
}

function closeCreditsModal() {
  $('credits-modal')?.classList.add('hidden');
}

function getPaymentPackageId(amount) {
  const byAmount = {
    200: 'starter',
    2000: 'standard',
    20000: 'pro',
  };
  return byAmount[Number(amount)] || null;
}

async function startCreditsPayment(card) {
  if (!state.authToken) {
    showRegistrationPrompt();
    return;
  }
  const amount = Number(card.dataset.amount);
  const packageId = getPaymentPackageId(amount);
  if (!packageId) {
    showToast('Неизвестный пакет оплаты');
    return;
  }

  card.disabled = true;
  try {
    const response = await fetch('/api/payments/robokassa/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + state.authToken,
      },
      body: JSON.stringify({ package_id: packageId }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || 'Не удалось создать платеж');
    }
    window.location.href = data.payment_url;
  } catch (error) {
    showToast(error.message || 'Ошибка оплаты');
    card.disabled = false;
  }
}

function openAboutModal() {
  $('about-modal')?.classList.remove('hidden');
  closeAppMenu();
  $('about-modal-close')?.focus();
}

function closeAboutModal() {
  $('about-modal')?.classList.add('hidden');
}

async function openHelpModal() {
  const modal = $('help-modal');
  modal?.classList.remove('hidden');
  closeAppMenu();
  $('help-modal-close')?.focus();
  await loadHelpDocument('Help.md');
}

async function loadHelpDocument(fileName) {
  const content = $('help-content');
  if (!content) return;

  const safeFile = String(fileName || 'Help.md').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (content.dataset.loadedFile === safeFile) return;

  document.querySelectorAll('[data-help-file]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.helpFile === safeFile);
  });

  content.innerHTML = '<div class="help-loading"><span class="help-loader"></span><span>Загрузка документа...</span></div>';

  try {
    const response = await fetch(`assets/${safeFile}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    content.innerHTML = DOMPurify.sanitize(marked.parse(markdown));
    content.dataset.loadedFile = safeFile;
    content.scrollTop = 0;
    content.querySelectorAll('a').forEach(link => {
      if (link.hostname && link.hostname !== window.location.hostname) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
    });
  } catch (error) {
    content.innerHTML = `<div class="help-error"><strong>Не удалось загрузить документ.</strong><span>Проверьте файл assets/${DOMPurify.sanitize(safeFile)} и доступность сервера.</span></div>`;
  }
}

function closeHelpModal() {
  $('help-modal')?.classList.add('hidden');
}

function closeBooksModal() {
  $('books-modal')?.classList.add('hidden');
}

function sanitizeBookPath(file) {
  return String(file || '').replace(/^\/+/, '').replace(/\.\.+/g, '').replace(/\\/g, '/');
}

async function openBooksModal() {
  $('books-modal')?.classList.remove('hidden');
  closeAppMenu();
  $('books-modal-close')?.focus();
  await loadBooksCatalog();
}

async function loadBooksCatalog() {
  const list = $('books-list');
  const reader = $('books-reader');
  if (!list || !reader) return;
  if (list.dataset.loaded === 'true') return;

  list.innerHTML = '<div class="help-loading"><span class="help-loader"></span><span>Загрузка каталога...</span></div>';

  try {
    const response = await fetch('assets/books/books.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const catalog = await response.json();
    const books = Array.isArray(catalog.books) ? catalog.books : [];
    books.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.title || '').localeCompare(String(b.title || '')));
    renderBooksList(books);
    list.dataset.loaded = 'true';

    if (catalog.title) {
      const titleEl = $('books-modal-title');
      if (titleEl) titleEl.textContent = catalog.title;
    }

    if (books.length === 0) {
      reader.innerHTML = '<div class="books-empty-state"><span class="books-empty-icon" aria-hidden="true">◆</span><h3>Каталог пуст</h3><p>Добавьте записи в assets/books/books.json и положите Markdown-файлы книг в assets/books.</p></div>';
    }
  } catch (error) {
    list.innerHTML = '<div class="help-error"><strong>Каталог недоступен.</strong><span>Проверьте файл assets/books/books.json.</span></div>';
  }
}

function renderBooksList(books) {
  const list = $('books-list');
  if (!list) return;
  list.textContent = '';

  books.forEach((book, index) => {
    const btn = document.createElement('button');
    btn.className = 'book-list-item';
    btn.type = 'button';
    btn.dataset.bookIndex = String(index);
    btn.innerHTML = `<span class="book-list-title">${DOMPurify.sanitize(book.title || `Книга ${index + 1}`)}</span>
      ${book.subtitle ? `<span class="book-list-subtitle">${DOMPurify.sanitize(book.subtitle)}</span>` : ''}`;
    btn.addEventListener('click', () => loadBook(book, btn));
    list.appendChild(btn);
  });
}

function normalizeAnchorText(value) {
  return String(value || '')
    .replace(/^#/, '')
    .replace(/\\/g, '')
    .replace(/[№.,:;!?()[\]{}'"«»“”]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findBookAnchorTarget(reader, rawAnchor, linkText) {
  const decodedAnchor = decodeURIComponent(String(rawAnchor || ''));
  const escapeSelector = window.CSS?.escape || ((value) => String(value).replace(/["\\#.;?+*~':!^$[\]()=>|/@]/g, '\\$&'));
  const direct = reader.querySelector(`#${escapeSelector(decodedAnchor)}`);
  if (direct) return direct;

  const normalizedAnchor = normalizeAnchorText(decodedAnchor);
  const normalizedLink = normalizeAnchorText(linkText);
  const headings = Array.from(reader.querySelectorAll('.book-reader-body h1, .book-reader-body h2, .book-reader-body h3, .book-reader-body h4'));

  return headings.find(heading => {
    const normalizedHeading = normalizeAnchorText(heading.textContent);
    return normalizedHeading === normalizedAnchor ||
      normalizedHeading === normalizedLink ||
      normalizedHeading.includes(normalizedLink) ||
      normalizedLink.includes(normalizedHeading);
  }) || null;
}

function scrollBookToTarget(reader, target) {
  const readerRect = reader.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = reader.scrollTop + targetRect.top - readerRect.top - 18;
  reader.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function bindBookLinks(reader) {
  reader.querySelectorAll('.book-reader-body a').forEach(link => {
    const href = link.getAttribute('href') || '';

    if (href.startsWith('#')) {
      link.addEventListener('click', event => {
        event.preventDefault();
        const target = findBookAnchorTarget(reader, href.slice(1), link.textContent);
        if (target) scrollBookToTarget(reader, target);
      });
      return;
    }

    if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
  });
}

async function loadBook(book, btn) {
  const reader = $('books-reader');
  if (!reader) return;
  document.querySelectorAll('.book-list-item').forEach(item => item.classList.remove('active'));
  btn?.classList.add('active');

  reader.innerHTML = '<div class="help-loading"><span class="help-loader"></span><span>Загрузка книги...</span></div>';

  try {
    const file = sanitizeBookPath(book.file);
    if (!file) throw new Error('Missing file');
    const response = await fetch(`assets/books/${file}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    const title = DOMPurify.sanitize(book.title || 'Книга');
    const subtitle = book.subtitle ? `<p>${DOMPurify.sanitize(book.subtitle)}</p>` : '';
    reader.innerHTML = `<header class="book-reader-header"><span>Текст автора</span><h3>${title}</h3>${subtitle}</header>
      <div class="book-reader-body">${DOMPurify.sanitize(marked.parse(markdown))}</div>`;
    bindBookLinks(reader);
    reader.scrollTop = 0;
  } catch (error) {
    reader.innerHTML = '<div class="help-error"><strong>Не удалось открыть книгу.</strong><span>Проверьте путь к файлу в books.json и наличие Markdown-файла в assets/books.</span></div>';
  }
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
    closeAppMenu();
    switchView(btn.dataset.view);
  }));
  $('new-chat-btn')?.addEventListener('click', newChat);
  $('save-btn')?.addEventListener('click', () => { saveSettings(); switchView('chat'); });
  $('user-input-context-credits')?.addEventListener('input', updateLimitSliderLabels);
  $('user-output-generation-credits')?.addEventListener('input', updateLimitSliderLabels);
  const loginForm = $('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  } else {
    console.error('Login form not found during bindEvents');
  }
  $('login-submit-btn')?.addEventListener('click', (e) => {
    if (!$('login-form')) handleLogin(e);
  });

  const registerForm = $('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
  
  $('register-submit-btn')?.addEventListener('click', (e) => {
    if (!$('register-form')) handleRegister(e);
  });

  $('show-register-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('login-form')?.classList.add('hidden');
    $('register-form')?.classList.remove('hidden');
    const header = document.querySelector('.login-box h2');
    if (header) header.textContent = 'Регистрация';
  });

  $('show-login-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    $('register-form')?.classList.add('hidden');
    $('login-form')?.classList.remove('hidden');
    const header = document.querySelector('.login-box h2');
    if (header) header.textContent = 'Вход в систему';
  });


  document.querySelectorAll('.pricing-card').forEach(card => {
    card.addEventListener('click', () => {
      startCreditsPayment(card);
    });
  });

  $('credits-menu-btn')?.addEventListener('click', openCreditsModal);
  $('settings-topup-btn')?.addEventListener('click', openCreditsModal);
  $('balance-history-export-btn')?.addEventListener('click', exportBalanceHistoryCsv);
  $('credits-modal-close')?.addEventListener('click', closeCreditsModal);
  $('credits-modal-backdrop')?.addEventListener('click', closeCreditsModal);
  $('about-menu-btn')?.addEventListener('click', openAboutModal);
  $('about-modal-close')?.addEventListener('click', closeAboutModal);
  $('about-modal-backdrop')?.addEventListener('click', closeAboutModal);
  $('help-menu-btn')?.addEventListener('click', openHelpModal);
  $('help-modal-close')?.addEventListener('click', closeHelpModal);
  $('help-modal-backdrop')?.addEventListener('click', closeHelpModal);
  $('help-modal')?.addEventListener('click', (event) => {
    const btn = event.target.closest?.('[data-help-file]');
    if (btn) loadHelpDocument(btn.dataset.helpFile);
  });
  document.querySelectorAll('[data-help-file]').forEach(btn => {
    btn.addEventListener('click', () => loadHelpDocument(btn.dataset.helpFile));
  });
  $('docs-menu-btn')?.addEventListener('click', openBooksModal);
  $('books-modal-close')?.addEventListener('click', closeBooksModal);
  $('books-modal-backdrop')?.addEventListener('click', closeBooksModal);

  $('send-btn')?.addEventListener('click', handleSend);
  $('user-input')?.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
  $('stop-btn')?.addEventListener('click', stopGeneration);

  const fileInput = $('file-input');
  $('attach-btn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', e => handleFiles(e.target.files));

  const wrapper = $('input-wrapper');
  const dropOverlay = $('drop-overlay');
  if(wrapper && dropOverlay) {
      ['dragenter','dragover'].forEach(ev => wrapper.addEventListener(ev, e => { e.preventDefault(); dropOverlay.classList.add('active'); }));
      ['dragleave','drop'].forEach(ev => dropOverlay.addEventListener(ev, e => { e.preventDefault(); dropOverlay.classList.remove('active'); }));
      dropOverlay.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  }

  $('sidebar-toggle')?.addEventListener('click', () => {
    const sidebar = $('sidebar');
    if(!sidebar) return;
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
      sidebar.classList.toggle('collapsed');
    } else {
      sidebar.classList.toggle('open');
      $('sidebar-backdrop')?.classList.toggle('active', sidebar.classList.contains('open'));
    }
  });

  // logo-icon-toggle: acts as expand button when sidebar is collapsed
  $('logo-icon-toggle')?.addEventListener('click', () => {
    const sidebar = $('sidebar');
    if(!sidebar) return;
    if (!sidebar.classList.contains('collapsed')) return; // only act when collapsed
    sidebar.classList.remove('collapsed');
  });

  function openSidebar() {
    $('sidebar')?.classList.add('open');
    $('sidebar-backdrop')?.classList.add('active');
  }
  function closeSidebar() {
    $('sidebar')?.classList.remove('open');
    $('sidebar-backdrop')?.classList.remove('active');
  }
  $('mobile-menu-btn')?.addEventListener('click', openSidebar);
  $('mobile-menu-btn-setup')?.addEventListener('click', openSidebar);
  $('mobile-menu-btn-admin')?.addEventListener('click', openSidebar);
  $('sidebar-backdrop')?.addEventListener('click', closeSidebar);

  $('app-menu-btn')?.addEventListener('click', () => {
    const menu = $('app-menu');
    const isOpen = menu?.classList.toggle('open') || false;
    $('app-menu-btn')?.setAttribute('aria-expanded', String(isOpen));
  });

  document.querySelectorAll('[data-theme-option]').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeOption);
      closeAppMenu();
    });
  });

  $('logout-btn')?.addEventListener('click', logout);

  const aboutPhoto = document.getElementById('about-photo-img');
  if (aboutPhoto) {
    aboutPhoto.addEventListener('error', () => {
      aboutPhoto.parentElement?.classList.add('about-photo-missing');
      aboutPhoto.remove();
    });
  }

  $('user-input')?.addEventListener('input', autoResizeTextarea);

  $('advanced-toggle-btn')?.addEventListener('click', () => {
    const panel = $('advanced-panel');
    const isOpen = panel?.classList.toggle('hidden') === false;
    $('advanced-toggle-btn')?.classList.toggle('active', isOpen);
    $('input-wrapper')?.classList.toggle('advanced-open', isOpen);
  });

  document.addEventListener('click', (e) => {
    const appMenu = $('app-menu');
    if (appMenu && !appMenu.contains(e.target)) closeAppMenu();

    const panel = $('advanced-panel');
    const btn = $('advanced-toggle-btn');
    if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
      closeAdvancedPanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAppMenu();
      closeAdvancedPanel();
      closeCreditsModal();
      closeAboutModal();
      closeHelpModal();
      closeBooksModal();
    }
  });

  $('chat-session-category')?.addEventListener('change', () => {
    const selectedCat = $('chat-session-category')?.value;
    const titleEl = $('chat-title-category');
    if (titleEl && selectedCat) {
      titleEl.textContent = selectedCat;
    }
    SessionManager.saveCurrent();
    if (state.authToken && state.currentUser) checkServerHealth();
    updateWelcomeHints();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
