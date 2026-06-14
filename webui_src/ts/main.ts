await import('./vendor-globals').catch(() => {});
import { state } from './state';
import { $, t, applyLang, showToast } from './index';
import { checkAuth, handleLogin, handleRegister, switchView, checkServerHealth, showLogin, showRegistrationPrompt, stopHealthPolling, updateLimitSliderLabels, exportBalanceHistoryCsv } from './auth';
import { autoResizeTextarea, updateWelcomeHints, setWelcomeVisible } from './ui';
import { newChat, handleSend, stopGeneration, handleFiles, initMessagesDelegation } from './chat';
import { initAdminTabs } from './admin';
import { SessionManager } from './sessions';
import { initUserDocuments } from './user-documents';
import { initPaymentModal, openCreditsModal, closeCreditsModal } from './billing/payment-modal';
import { initLargeRequestModal } from './billing/large-request';
import type { BookEntry } from './types';

const TOKEN_LIMIT_STEP = 4096;

function init() {
  applyTheme();
  applyLang();
  bindEvents();
  initMessagesDelegation();
  initLargeRequestModal();
  initPaymentModal();
  autoResizeTextarea();
  checkAuth();
  initAdminTabs();
  initUserDocuments();

  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: (code: string, lang?: string) => {
        if (lang && window.hljs && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        if (window.hljs) return hljs.highlightAuto(code).value;
        return code;
      }
    } as Parameters<typeof marked.setOptions>[0]);
  }
}

async function saveSettings() {
  localStorage.setItem('gemma_lang', state.lang);
  const payload: Record<string, unknown> = {};
  const emailEl = $<HTMLInputElement>('user-email');
  if (emailEl && emailEl.value !== undefined) payload.email = emailEl.value;
  const passwordEl = $<HTMLInputElement>('user-password');
  if (passwordEl && passwordEl.value) payload.password = passwordEl.value;

  const defaultCatSel = $<HTMLSelectElement>('user-default-category');
  if (defaultCatSel && defaultCatSel.value) {
    payload.category = defaultCatSel.value;
  }

  const readTokenLimit = (elementId: string, label: string): number | null => {
    const el = $<HTMLInputElement>(elementId);
    if (!el) return null;
    const value = parseInt(el.value || '0', 10);
    const max = parseInt(el.max || '0', 10);
    if (!Number.isFinite(value) || value < TOKEN_LIMIT_STEP) {
      showToast(`${label} должен быть не меньше ${TOKEN_LIMIT_STEP}`, { variant: 'error' });
      return null;
    }
    if (value % TOKEN_LIMIT_STEP !== 0) {
      showToast(`${label} должен быть кратен ${TOKEN_LIMIT_STEP}`, { variant: 'error' });
      return null;
    }
    if (Number.isFinite(max) && max >= TOKEN_LIMIT_STEP && value > max) {
      showToast(`${label} не может быть больше ${max}`, { variant: 'error' });
      return null;
    }
    return value;
  };

  const inputLimit = readTokenLimit('user-input-context-limit', 'Входной контекст');
  if (inputLimit === null) return;
  payload.input_context_limit = inputLimit;

  const outputLimit = readTokenLimit('user-output-generation-limit', 'Выходная генерация');
  if (outputLimit === null) return;
  payload.output_generation_limit = outputLimit;

  const ragToggle = $<HTMLInputElement>('user-rag-enabled');
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
      if (!r.ok) {
        const data = await r.json().catch(() => ({})) as { detail?: string; error?: string };
        showToast(data.detail || data.error || 'Не удалось сохранить настройки', { variant: 'error' });
        return;
      }

      if (state.currentUser) {
        if (payload.password) {
          const pwd = $<HTMLInputElement>('user-password');
          if (pwd) pwd.value = '';
        }
        if (payload.category) {
          state.currentUser.category = payload.category as string;

          const chatSessionCat = $<HTMLSelectElement>('chat-session-category');
          if (chatSessionCat) {
            chatSessionCat.value = payload.category as string;
          }

          const titleEl = $('chat-title-category');
          if (titleEl) {
            titleEl.textContent = payload.category as string;
          }
        }
        if (payload.input_context_limit !== undefined) {
          state.currentUser.input_context_limit = payload.input_context_limit as number;
          state.contextSize = payload.input_context_limit as number;
        }
        if (payload.output_generation_limit !== undefined) state.currentUser.output_generation_limit = payload.output_generation_limit as number;
        if (payload.rag_enabled !== undefined) state.currentUser.rag_enabled = payload.rag_enabled as boolean;
      }
    } catch { /* ignore */ }
  }
  showToast(t('saved'));
}

function applyTheme(theme: string = localStorage.getItem('avgexpert_theme') || 'system') {
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
    const el = btn as HTMLElement;
    const isActive = el.dataset.themeOption === normalizedTheme;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-checked', String(isActive));
  });
}

function logout() {
  localStorage.removeItem('avgexpert_token');
  state.authToken = null;
  state.currentUser = null;
  stopHealthPolling();
  state.chatHistory = [];
  state.attachedDocs = [];
  if ($('messages')) $('messages')!.textContent = '';
  if ($('attached-docs')) $('attached-docs')!.textContent = '';
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

function openAboutModal() {
  $('about-modal')?.classList.remove('hidden');
  closeAppMenu();
  $<HTMLButtonElement>('about-modal-close')?.focus();
}

function closeAboutModal() {
  $('about-modal')?.classList.add('hidden');
}

async function openHelpModal() {
  const modal = $('help-modal');
  modal?.classList.remove('hidden');
  closeAppMenu();
  $<HTMLButtonElement>('help-modal-close')?.focus();
  await loadHelpDocument('Help.md');
}

async function loadHelpDocument(fileName: string) {
  const content = $('help-content');
  if (!content) return;

  const safeFile = String(fileName || 'Help.md').replace(/[^a-zA-Z0-9_.-]/g, '');
  if (content.dataset.loadedFile === safeFile) return;

  document.querySelectorAll('[data-help-file]').forEach(btn => {
    const el = btn as HTMLElement;
    el.classList.toggle('active', el.dataset.helpFile === safeFile);
  });

  content.innerHTML = '<div class="help-loading"><span class="help-loader"></span><span>Загрузка документа...</span></div>';

  try {
    const response = await fetch(`assets/${safeFile}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    content.innerHTML = DOMPurify.sanitize(marked.parse(markdown) as string);
    content.dataset.loadedFile = safeFile;
    content.scrollTop = 0;
    content.querySelectorAll('a').forEach(link => {
      if (link.hostname && link.hostname !== window.location.hostname) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
    });
  } catch {
    content.innerHTML = `<div class="help-error"><strong>Не удалось загрузить документ.</strong><span>Проверьте файл assets/${DOMPurify.sanitize(safeFile)} и доступность сервера.</span></div>`;
  }
}

function closeHelpModal() {
  $('help-modal')?.classList.add('hidden');
}

function closeBooksModal() {
  $('books-modal')?.classList.add('hidden');
}

function sanitizeBookPath(file: string) {
  return String(file || '').replace(/^\/+/, '').replace(/\.\.+/g, '').replace(/\\/g, '/');
}

async function openBooksModal() {
  $('books-modal')?.classList.remove('hidden');
  closeAppMenu();
  $<HTMLButtonElement>('books-modal-close')?.focus();
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
    const catalog = await response.json() as { books?: BookEntry[]; title?: string };
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
  } catch {
    list.innerHTML = '<div class="help-error"><strong>Каталог недоступен.</strong><span>Проверьте файл assets/books/books.json.</span></div>';
  }
}

function renderBooksList(books: BookEntry[]) {
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

function normalizeAnchorText(value: string) {
  return String(value || '')
    .replace(/^#/, '')
    .replace(/\\/g, '')
    .replace(/[№.,:;!?()[\]{}'"«»“”]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findBookAnchorTarget(reader: HTMLElement, rawAnchor: string, linkText: string) {
  const decodedAnchor = decodeURIComponent(String(rawAnchor || ''));
  const escapeSelector = window.CSS?.escape || ((value: string) => String(value).replace(/["\\#.;?+*~':!^$[\]()=>|/@]/g, '\\$&'));
  const direct = reader.querySelector(`#${escapeSelector(decodedAnchor)}`);
  if (direct) return direct;

  const normalizedAnchor = normalizeAnchorText(decodedAnchor);
  const normalizedLink = normalizeAnchorText(linkText);
  const headings = Array.from(reader.querySelectorAll('.book-reader-body h1, .book-reader-body h2, .book-reader-body h3, .book-reader-body h4'));

  return headings.find(heading => {
    const normalizedHeading = normalizeAnchorText(heading.textContent || '');
    return normalizedHeading === normalizedAnchor ||
      normalizedHeading === normalizedLink ||
      normalizedHeading.includes(normalizedLink) ||
      normalizedLink.includes(normalizedHeading);
  }) || null;
}

function scrollBookToTarget(reader: HTMLElement, target: Element) {
  const readerRect = reader.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = reader.scrollTop + targetRect.top - readerRect.top - 18;
  reader.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function bindBookLinks(reader: HTMLElement) {
  reader.querySelectorAll('.book-reader-body a').forEach(link => {
    const anchor = link as HTMLAnchorElement;
    const href = anchor.getAttribute('href') || '';

    if (href.startsWith('#')) {
      anchor.addEventListener('click', event => {
        event.preventDefault();
        const target = findBookAnchorTarget(reader, href.slice(1), anchor.textContent || '');
        if (target) scrollBookToTarget(reader, target);
      });
      return;
    }

    if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
      anchor.target = '_blank';
      anchor.rel = 'noopener';
    }
  });
}

async function loadBook(book: BookEntry, btn?: HTMLElement) {
  const reader = $('books-reader');
  if (!reader) return;
  document.querySelectorAll('.book-list-item').forEach(item => item.classList.remove('active'));
  btn?.classList.add('active');

  reader.innerHTML = '<div class="help-loading"><span class="help-loader"></span><span>Загрузка книги...</span></div>';

  try {
    const file = sanitizeBookPath(book.file || '');
    if (!file) throw new Error('Missing file');
    const response = await fetch(`assets/books/${file}`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    const title = DOMPurify.sanitize(book.title || 'Книга');
    const subtitle = book.subtitle ? `<p>${DOMPurify.sanitize(book.subtitle)}</p>` : '';
    reader.innerHTML = `<header class="book-reader-header"><span>Текст автора</span><h3>${title}</h3>${subtitle}</header>
      <div class="book-reader-body">${DOMPurify.sanitize(marked.parse(markdown) as string)}</div>`;
    bindBookLinks(reader);
    reader.scrollTop = 0;
  } catch {
    reader.innerHTML = '<div class="help-error"><strong>Не удалось открыть книгу.</strong><span>Проверьте путь к файлу в books.json и наличие Markdown-файла в assets/books.</span></div>';
  }
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => {
    closeAppMenu();
    switchView((btn as HTMLElement).dataset.view || 'chat');
  }));
  $('new-chat-btn')?.addEventListener('click', () => newChat());
  $('save-btn')?.addEventListener('click', () => { saveSettings(); switchView('chat'); });
  $('user-input-context-limit')?.addEventListener('input', updateLimitSliderLabels);
  $('user-output-generation-limit')?.addEventListener('input', updateLimitSliderLabels);
  const loginForm = $('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  } else {
    console.error('Login form not found during bindEvents');
  }
  $('login-submit-btn')?.addEventListener('click', (e: MouseEvent) => {
    if (!$('login-form')) handleLogin(e);
  });

  const registerForm = $('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }

  $('register-submit-btn')?.addEventListener('click', (e: MouseEvent) => {
    if (!$('register-form')) handleRegister(e);
  });

  $('show-register-link')?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    $('login-form')?.classList.add('hidden');
    $('register-form')?.classList.remove('hidden');
    const header = document.querySelector('.login-box h2');
    if (header) header.textContent = 'Регистрация';
  });

  $('show-login-link')?.addEventListener('click', (e: MouseEvent) => {
    e.preventDefault();
    $('register-form')?.classList.add('hidden');
    $('login-form')?.classList.remove('hidden');
    const header = document.querySelector('.login-box h2');
    if (header) header.textContent = 'Вход в систему';
  });

  $('credits-menu-btn')?.addEventListener('click', () => {
    closeAppMenu();
    openCreditsModal();
  });
  $('settings-topup-btn')?.addEventListener('click', () => openCreditsModal());
  $('balance-history-export-btn')?.addEventListener('click', exportBalanceHistoryCsv);
  $('about-menu-btn')?.addEventListener('click', openAboutModal);
  $('about-modal-close')?.addEventListener('click', closeAboutModal);
  $('about-modal-backdrop')?.addEventListener('click', closeAboutModal);
  $('help-menu-btn')?.addEventListener('click', openHelpModal);
  $('help-modal-close')?.addEventListener('click', closeHelpModal);
  $('help-modal-backdrop')?.addEventListener('click', closeHelpModal);
  $('help-modal')?.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as Element;
    const btn = target.closest?.('[data-help-file]') as HTMLElement | null;
    if (btn) loadHelpDocument(btn.dataset.helpFile || 'Help.md');
  });
  document.querySelectorAll('[data-help-file]').forEach(btn => {
    btn.addEventListener('click', () => loadHelpDocument((btn as HTMLElement).dataset.helpFile || 'Help.md'));
  });
  $('docs-menu-btn')?.addEventListener('click', openBooksModal);
  $('books-modal-close')?.addEventListener('click', closeBooksModal);
  $('books-modal-backdrop')?.addEventListener('click', closeBooksModal);

  $('send-btn')?.addEventListener('click', handleSend);
  $('user-input')?.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });
  $('stop-btn')?.addEventListener('click', stopGeneration);

  const fileInput = $<HTMLInputElement>('file-input');
  $('attach-btn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', (e: Event) => {
    const input = e.target as HTMLInputElement;
    handleFiles(input.files);
  });

  const wrapper = $('input-wrapper');
  const dropOverlay = $('drop-overlay');
  if (wrapper && dropOverlay) {
    ['dragenter', 'dragover'].forEach(ev => wrapper.addEventListener(ev, (e: Event) => { e.preventDefault(); dropOverlay.classList.add('active'); }));
    ['dragleave', 'drop'].forEach(ev => dropOverlay.addEventListener(ev, (e: Event) => { e.preventDefault(); dropOverlay.classList.remove('active'); }));
    dropOverlay.addEventListener('drop', (e: DragEvent) => {
      if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    });
  }

  $('sidebar-toggle')?.addEventListener('click', () => {
    const sidebar = $('sidebar');
    if (!sidebar) return;
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop) {
      sidebar.classList.toggle('collapsed');
    } else {
      sidebar.classList.toggle('open');
      $('sidebar-backdrop')?.classList.toggle('active', sidebar.classList.contains('open'));
    }
  });

  $('logo-icon-toggle')?.addEventListener('click', () => {
    const sidebar = $('sidebar');
    if (!sidebar) return;
    if (!sidebar.classList.contains('collapsed')) return;
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
      applyTheme((btn as HTMLElement).dataset.themeOption || 'system');
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

  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as Node;
    const appMenu = $('app-menu');
    if (appMenu && !appMenu.contains(target)) closeAppMenu();

    const panel = $('advanced-panel');
    const btn = $('advanced-toggle-btn');
    if (panel && btn && !panel.contains(target) && !btn.contains(target)) {
      closeAdvancedPanel();
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
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
    const selectedCat = $<HTMLSelectElement>('chat-session-category')?.value;
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
