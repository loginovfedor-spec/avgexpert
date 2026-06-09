import { state } from './state.js';

export const I18N = {
  ru: {
    new_chat:"Новый чат", chat:"Чат", setup:"Настройки",
    status_online:"Подключено", status_offline:"Нет связи", status_connecting:"Подключение...",
    chat_title:"ИИ чат", placeholder:"Введите сообщение...",
    welcome_title:"Добро пожаловать!", welcome_subtitle:"Я ИИ-ассистент AVG Expert: задавайте вопросы и анализируйте документы. Задайте мне вопрос или загрузите документ для анализа.",
    hint_code:"💡 Помоги разобраться", hint_text:"✍️ Напиши текст", hint_doc:"📄 Анализ документа", hint_translate:"🌐 Переведи",
    drop_files:"Перетащите файлы сюда",
    setup_title:"Настройки", lang_section:"Язык интерфейса", user_profile:"Профиль пользователя",
    system_prompt_label:"Системный промпт", system_prompt_placeholder:"Инструкции для модели...",
    gen_params:"Параметры генерации",
    hint_temperature:"Креативность ответов", hint_top_p:"Ядерная выборка", hint_top_k:"Количество кандидатов",
    hint_min_p:"Минимальная вероятность", hint_repeat_penalty:"Штраф за повторения", hint_max_tokens:"Макс. длина ответа",
    max_tokens_label:"Макс. токенов", optional:"(опционально)", save_btn:"Сохранить настройки",
    copy:"Копировать", copied:"Скопировано!", thinking:"Размышление",
    doc_too_large:"⚠️ Документы (~{tokens} токенов) превышают лимит входного контекста ({ctx} токенов). Обратитесь к администратору для увеличения лимита.",
    max_docs:"Максимум 10 документов", saved:"Настройки сохранены!",
    error_server:"Ошибка: не удалось связаться с сервером.",
    stats_time:"Время: {s}с", stats_tokens:"Токены: {t}", stats_speed:"Скорость: {ts} т/с",
    prompt_explain_code:"Проконсультируй меня: ", prompt_write_text:"Напиши краткий текст на тему: ",
    prompt_analyze_doc:"Проанализируй загруженный документ и дай краткое изложение.", prompt_translate:"Переведи следующий текст на английский: ",
    rename:"Переименовать", delete:"Удалить", save:"Сохранить в CSV", delete_all:"Удалить всё", save_all:"Сохранить всё в CSV",
    confirm_delete:"Удалить этот чат?", confirm_delete_group:"Удалить все чаты в этой группе?",
    rename_prompt:"Введите новое название чата:", export_failed:"Ошибка экспорта", delete_failed:"Ошибка удаления",
    load_failed:"Ошибка загрузки чата", rename_failed:"Ошибка переименования",
    large_request_title:"Большой запрос",
    large_request_desc:"Размер запроса превышает 100 000 символов. Ниже — ориентировочная стоимость в кредитах.",
    large_request_note:"Оценка приблизительная. Фактический расход зависит от длины ответа модели.",
    large_request_confirm:"Отправить",
    large_request_cancel:"Отмена",
    large_request_size:"Размер запроса: {chars} символов",
    large_request_input:"Входной контекст: ~{credits} кредитов",
    large_request_output:"Генерация ответа (до {tokens} токенов): ~{credits} кредитов",
    large_request_total:"Итого (оценка): ~{credits} кредитов",
    large_request_balance:"Ваш баланс: {credits} кредитов",
    large_request_insufficient:"Недостаточно кредитов для этого запроса"
  },
  en: {
    new_chat:"New Chat", chat:"Chat", setup:"Settings",
    status_online:"Connected", status_offline:"Disconnected", status_connecting:"Connecting...",
    chat_title:"AI Chat", placeholder:"Type a message...",
    welcome_title:"Welcome!", welcome_subtitle:"I'm AVG Expert — a local AI assistant. Ask me a question or upload a document for analysis.",
    hint_code:"💡 Help me understand", hint_text:"✍️ Write text", hint_doc:"📄 Analyze document", hint_translate:"🌐 Translate",
    drop_files:"Drop files here",
    setup_title:"Settings", lang_section:"Interface Language", user_profile:"User Profile",
    system_prompt_label:"System Prompt", system_prompt_placeholder:"Instructions for the model...",
    gen_params:"Generation Parameters",
    hint_temperature:"Response creativity", hint_top_p:"Nucleus sampling", hint_top_k:"Number of candidates",
    hint_min_p:"Minimum probability", hint_repeat_penalty:"Repetition penalty", hint_max_tokens:"Max response length",
    max_tokens_label:"Max Tokens", optional:"(optional)", save_btn:"Save Settings",
    copy:"Copy", copied:"Copied!", thinking:"Thinking",
    doc_too_large:"⚠️ Documents (~{tokens} tokens) exceed the input context limit ({ctx} tokens). Contact your administrator to increase the limit.",
    max_docs:"Maximum 10 documents", saved:"Settings saved!",
    error_server:"Error: could not connect to the server.",
    stats_time:"Time: {s}s", stats_tokens:"Tokens: {t}", stats_speed:"Speed: {ts} t/s",
    prompt_explain_code:"Explain how this code works: ", prompt_write_text:"Write a short text about: ",
    prompt_analyze_doc:"Analyze the uploaded document and provide a summary.", prompt_translate:"Translate the following text to Russian: ",
    rename:"Rename", delete:"Delete", save:"Export CSV", delete_all:"Delete All", save_all:"Export All CSV",
    confirm_delete:"Delete this chat?", confirm_delete_group:"Delete all chats in this group?",
    rename_prompt:"Enter new chat title:", export_failed:"Export failed", delete_failed:"Delete failed",
    load_failed:"Failed to load chat", rename_failed:"Failed to rename chat",
    large_request_title:"Large Request",
    large_request_desc:"This request exceeds 100,000 characters. Estimated credit cost is shown below.",
    large_request_note:"This is an estimate. Actual usage depends on the model response length.",
    large_request_confirm:"Send",
    large_request_cancel:"Cancel",
    large_request_size:"Request size: {chars} characters",
    large_request_input:"Input context: ~{credits} credits",
    large_request_output:"Response generation (up to {tokens} tokens): ~{credits} credits",
    large_request_total:"Estimated total: ~{credits} credits",
    large_request_balance:"Your balance: {credits} credits",
    large_request_insufficient:"Insufficient credits for this request"
  }
};

export function t(key, replacements) {
  let s = I18N[state.lang]?.[key] || I18N.en[key] || key;
  if (replacements) Object.entries(replacements).forEach(([k,v]) => s = s.replace(`{${k}}`, v));
  return s;
}

export function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.documentElement.lang = state.lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === state.lang));
}
