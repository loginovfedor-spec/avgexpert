import { state } from './state.js';
import { $, t } from './index.js';
import { newChat, addMessageToUI } from './chat.js';
import { updateContextBadge, showToast, setWelcomeVisible } from './ui.js';

export const SessionManager = {

  async loadList() {
    try {
      const r = await fetch('/api/sessions', {
        headers: { 'Authorization': 'Bearer ' + state.authToken }
      });
      if (r.ok) {
        const sessions = await r.json();
        this.renderList(sessions);
        localStorage.setItem(
          `avgexpert_${state.currentUser?.username}_sessions_cache`,
          JSON.stringify(sessions)
        );
      } else if (r.status === 401) {
        return;
      }
    } catch (err) {
      console.error('Failed to load sessions', err);
      const cached = localStorage.getItem(`avgexpert_${state.currentUser?.username}_sessions_cache`);
      if (cached) this.renderList(JSON.parse(cached));
    }
  },

  async loadSession(id) {
    if (state.isGenerating) return;
    try {
      const r = await fetch('/api/sessions/' + id, {
        headers: { 'Authorization': 'Bearer ' + state.authToken }
      });
      if (r.ok) {
        const data = await r.json();
        state.currentSessionId = data.id;
        state.chatHistory = data.messages || [];
        state.attachedDocs = [];
        const messagesEl = $('messages');
        if (messagesEl) messagesEl.textContent = '';
        setWelcomeVisible(false);
        state.chatHistory.forEach(m => addMessageToUI(m.role, m.content, m.docs || [], m.categoryName || ''));
        
        const chatSessionCat = $('chat-session-category');
        if (chatSessionCat) {
          chatSessionCat.value = data.category || state.currentUser?.category;
        }

        updateContextBadge();
        this.loadList();
      }
    } catch (err) {
      showToast(t('load_failed'));
    }
  },

  async saveCurrent() {
    if (state.chatHistory.length === 0) return;
    if (!state.currentSessionId) state.currentSessionId = crypto.randomUUID();

    const currentTitle = $('sessions-list')
      ?.querySelector(`.session-item[data-id="${state.currentSessionId}"] .session-title`)
      ?.textContent;
    let title = currentTitle;

    if (!title || title === t('new_chat') || state.chatHistory.length <= 2) {
      const firstMsg = state.chatHistory.find(m => m.role === 'user')?.content || '';
      title = firstMsg.slice(0, 40).trim() + (firstMsg.length > 40 ? '...' : '') || t('new_chat');
    }

    try {
      const syncEl = $('sync-indicator');
      if (syncEl) syncEl.classList.remove('hidden');

      const activeCategory = $('chat-session-category')?.value || state.currentUser?.category;

      await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + state.authToken
        },
        body: JSON.stringify({
          id: state.currentSessionId,
          title,
          messages: state.chatHistory,
          category: activeCategory,
          updatedAt: Date.now()
        })
      });
      this.loadList();
      if (syncEl) setTimeout(() => syncEl.classList.add('hidden'), 500);
    } catch (err) {
      console.error('Failed to save session', err);
      $('sync-indicator')?.classList.add('hidden');
    }
  },

  async renameSession(id, newTitle) {
    if (!newTitle) return;
    try {
      const syncEl = $('sync-indicator');
      if (syncEl) syncEl.classList.remove('hidden');

      const r = await fetch('/api/sessions/' + id, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + state.authToken
        },
        body: JSON.stringify({ title: newTitle })
      });

      if (r.ok) {
        console.log('Session renamed:', id);
        await this.loadList();
      } else {
        showToast(t('rename_failed'));
      }
      if (syncEl) setTimeout(() => syncEl.classList.add('hidden'), 500);
    } catch (err) {
      console.error('Rename error:', err);
      showToast(t('rename_failed'));
      $('sync-indicator')?.classList.add('hidden');
    }
  },

  // ── FIX: renamed event param to "ev" to avoid conflict with catch block ──
  async deleteSession(id, ev) {
    if (ev) ev.stopPropagation();
    if (!confirm(t('confirm_delete'))) return;

    try {
      const r = await fetch('/api/sessions/' + id, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + state.authToken }
      });
      if (r.ok) {
        console.log('Session deleted:', id);
        if (state.currentSessionId === id) {
          state.currentSessionId = null;
          newChat(false);
        }
        await this.loadList();
      }
    } catch (err) {
      console.error('Delete error:', err);
      showToast(t('delete_failed'));
    }
  },

  // ── Build messages from session API ──
  async _fetchMessages(id) {
    const r = await fetch('/api/sessions/' + id, {
      headers: { 'Authorization': 'Bearer ' + state.authToken }
    });
    if (!r.ok) return null;
    return await r.json();
  },

  // ── CSV export: date-time, question, answer ──
  _buildCsv(sessionData) {
    const rows = [['Дата-Время', 'Вопрос', 'Ответ']];
    const msgs = sessionData.messages || [];

    // Pair consecutive user/assistant messages
    for (let i = 0; i < msgs.length; i++) {
      if (msgs[i].role === 'user') {
        const question = msgs[i].content || '';
        const answer = (msgs[i + 1] && msgs[i + 1].role === 'assistant')
          ? msgs[i + 1].content || ''
          : '';

        // Use updatedAt of session or timestamp if available, otherwise current date
        const ts = msgs[i].timestamp
          ? new Date(msgs[i].timestamp)
          : new Date(sessionData.updatedAt || Date.now());

        const dateStr = ts.toLocaleDateString('ru-RU');
        const timeStr = ts.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const dtStr = `${dateStr} ${timeStr}`;

        rows.push([dtStr, question, answer]);
        if (answer) i++; // skip assistant message
      }
    }

    return rows.map(r =>
      r.map(cell => '"' + String(cell).replace(/"/g, '""').replace(/\n/g, ' ') + '"')
        .join(';')
    ).join('\r\n');
  },

  _downloadCsv(filename, csvContent) {
    // BOM for correct Cyrillic in Excel
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  async exportSession(id, ev) {
    if (ev) ev.stopPropagation();
    try {
      const data = await this._fetchMessages(id);
      if (!data) { showToast(t('export_failed')); return; }
      const safeName = (data.title || 'chat').replace(/[<>:"/\\|?*]/g, '_');
      const csv = this._buildCsv(data);
      this._downloadCsv(`${safeName}.csv`, csv);
    } catch (err) {
      console.error('Export error:', err);
      showToast(t('export_failed'));
    }
  },

  async deleteGroup(groupName, items) {
    if (!confirm(t('confirm_delete_group'))) return;
    let currentDeleted = false;
    try {
      for (const s of items) {
        const r = await fetch('/api/sessions/' + s.id, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + state.authToken }
        });
        if (r.ok && state.currentSessionId === s.id) currentDeleted = true;
      }
      if (currentDeleted) {
        state.currentSessionId = null;
        newChat(false);
      }
      await this.loadList();
    } catch (err) {
      console.error('Group delete error:', err);
      showToast(t('delete_failed'));
    }
  },

  async exportGroup(groupName, items) {
    try {
      // Collect all rows across chats in this group
      const allRows = [['Дата-Время', 'Чат', 'Вопрос', 'Ответ']];

      for (const s of items) {
        const data = await this._fetchMessages(s.id);
        if (!data) continue;
        const msgs = data.messages || [];

        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].role === 'user') {
            const question = msgs[i].content || '';
            const answer = (msgs[i + 1] && msgs[i + 1].role === 'assistant')
              ? msgs[i + 1].content || ''
              : '';

            const ts = msgs[i].timestamp
              ? new Date(msgs[i].timestamp)
              : new Date(data.updatedAt || Date.now());
            const dtStr = `${ts.toLocaleDateString('ru-RU')} ${ts.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;

            allRows.push([dtStr, data.title || s.id, question, answer]);
            if (answer) i++;
          }
        }
      }

      const csvContent = allRows.map(r =>
        r.map(cell => '"' + String(cell).replace(/"/g, '""').replace(/\n/g, ' ') + '"')
          .join(';')
      ).join('\r\n');

      const safeName = groupName.replace(/\s+/g, '_');
      this._downloadCsv(`chats_${safeName}.csv`, csvContent);
    } catch (err) {
      console.error('Group export error:', err);
      showToast(t('export_failed'));
    }
  },

  renderList(sessions) {
    const list = $('sessions-list');
    if (!list) return;
    list.textContent = '';

    if (sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sessions-empty';
      empty.textContent = 'Нет истории чатов';
      list.appendChild(empty);
      return;
    }

    const groups = {
      'Сегодня': [],
      'Вчера': [],
      'На этой неделе': [],
      'В этом месяце': [],
      'Ранее': []
    };

    const now = new Date();
    sessions.forEach(s => {
      const date = new Date(s.updatedAt);
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) groups['Сегодня'].push(s);
      else if (diffDays === 1) groups['Вчера'].push(s);
      else if (diffDays < 7) groups['На этой неделе'].push(s);
      else if (diffDays < 30) groups['В этом месяце'].push(s);
      else groups['Ранее'].push(s);
    });

    Object.entries(groups).forEach(([groupName, items]) => {
      if (items.length === 0) return;

      // ── Group header with bulk actions ──
      const groupHeader = document.createElement('div');
      groupHeader.className = 'session-group-header';

      const label = document.createElement('div');
      label.className = 'session-group-label';
      label.textContent = groupName;

      const groupActions = document.createElement('div');
      groupActions.className = 'session-group-actions';

      const saveAllBtn = document.createElement('button');
      saveAllBtn.className = 'group-action-btn';
      saveAllBtn.title = t('save_all');
      saveAllBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>`;
      saveAllBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.exportGroup(groupName, items); });

      const delAllBtn = document.createElement('button');
      delAllBtn.className = 'group-action-btn delete';
      delAllBtn.title = t('delete_all');
      delAllBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>`;
      delAllBtn.addEventListener('click', (ev) => { ev.stopPropagation(); this.deleteGroup(groupName, items); });

      groupActions.appendChild(saveAllBtn);
      groupActions.appendChild(delAllBtn);
      groupHeader.appendChild(label);
      groupHeader.appendChild(groupActions);
      list.appendChild(groupHeader);

      // ── Session items ──
      items.forEach(s => {
        const item = document.createElement('div');
        item.className = 'session-item' + (state.currentSessionId === s.id ? ' active' : '');
        item.dataset.id = s.id;

        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('width', '14');
        iconSvg.setAttribute('height', '14');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('fill', 'none');
        iconSvg.setAttribute('stroke', 'currentColor');
        iconSvg.setAttribute('stroke-width', '2');
        iconSvg.setAttribute('class', 'session-icon');
        iconSvg.innerHTML = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'session-title';
        titleSpan.title = s.title;
        titleSpan.textContent = s.title;

        const actions = document.createElement('div');
        actions.className = 'session-actions';

        // Export to CSV
        const saveBtn = document.createElement('button');
        saveBtn.className = 'session-action-btn';
        saveBtn.title = t('save');
        saveBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>`;
        saveBtn.addEventListener('click', (ev) => this.exportSession(s.id, ev));

        // Rename
        const renBtn = document.createElement('button');
        renBtn.className = 'session-action-btn';
        renBtn.title = t('rename');
        renBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>`;
        renBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const newTitle = prompt(t('rename_prompt'), s.title);
          if (newTitle && newTitle.trim() && newTitle.trim() !== s.title) {
            this.renameSession(s.id, newTitle.trim());
          }
        });

        // Delete
        const delBtn = document.createElement('button');
        delBtn.className = 'session-action-btn delete';
        delBtn.title = t('delete');
        delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>`;
        delBtn.addEventListener('click', (ev) => this.deleteSession(s.id, ev));

        actions.appendChild(saveBtn);
        actions.appendChild(renBtn);
        actions.appendChild(delBtn);

        item.appendChild(iconSvg);
        item.appendChild(titleSpan);
        item.appendChild(actions);

        item.addEventListener('click', () => this.loadSession(s.id));
        list.appendChild(item);
      });
    });
  }
};

window.addEventListener('storage', (ev) => {
  if (ev.key === 'avgexpert_token' && !ev.newValue) {
    window.location.reload();
  }
});
