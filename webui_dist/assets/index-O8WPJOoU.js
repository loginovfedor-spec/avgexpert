const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/vendor-globals-BvmuRZts.js","assets/vendor-C5LnkM67.js","assets/rolldown-runtime-CMxvf4Kt.js","assets/vendor-Z5exjX_n.css","assets/vendor-globals-CeC4BA70.css"])))=>i.map(i=>d[i]);
import{c as e,f as t,g as n,h as r,m as i,s as a,t as o,v as s}from"./ts-kwE7-3-9.js";import{C as c,S as l,_ as u,a as d,b as f,c as p,d as m,f as h,g as ee,h as g,i as _,m as v,n as y,s as b,t as x,u as S,v as C,w,x as te,y as T}from"./auth-4FqY7Iz-.js";import{t as E}from"./preload-helper-zJ_50EbN.js";import{t as D}from"./user-documents-cjyi6BdM.js";(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var O=90,k=!1,A=1e3,j=100,M=2e4;function N(e){return Math.round(e).toLocaleString(`ru-RU`)}function P(){let e=document.createElement(`div`);e.className=`form-container payment-form-wrap w-full mx-auto`,e.innerHTML=`
    <div class="modern-card payment-form bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
    <!-- Header -->
    <div class="payment-form__header">
        <div class="flex items-center justify-between">
            <h1 class="font-display text-2xl font-semibold tracking-tight">Пополнение баланса</h1>
            <button id="payment-modal-close-btn" type="button" aria-label="Закрыть" class="payment-modal-close-btn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
        </div>
        <p class="text-slate-400">Мгновенное зачисление кредитов</p>
    </div>
    <div class="payment-form__body">
        <!-- Amount Section -->
        <div>
            <div class="flex items-baseline justify-between">
                <div>
                    <div class="payment-form__amount-label">Сумма пополнения</div>
                    <div class="payment-form__amount-row flex items-baseline gap-x-2">
                        <div id="amount-display" class="amount-display font-display font-semibold tracking-tighter text-emerald-400 tabular-nums">
                            1 000
                        </div>
                        <div class="amount-currency font-medium text-emerald-400/90">₽</div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-y-2">
                    <div id="custom-amount-btn" class="payment-form__custom-btn cursor-pointer flex items-center gap-x-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-300 transition-colors">
                        <i class="fa-solid fa-pen text-[10px]"></i>
                        <span>Ввести</span>
                    </div>
                    <div id="bonus-row" class="hidden w-full">
                        <div class="ml-auto inline-flex items-center gap-x-1.5 px-3 py-1 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <i class="fa-solid fa-gift text-sm"></i>
                            <span class="text-xs font-semibold">+<span id="bonus-percent">0</span>% бонус</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Slider -->
            <div class="payment-form__slider">
                <input type="range" id="amount-slider" min="100" max="20000" step="50" value="1000" class="slider w-full accent-indigo-500 cursor-pointer">
                <div class="flex justify-between text-[10px] text-slate-500 px-0.5 mt-1">
                    <div>100 ₽</div>
                    <div>20 000 ₽</div>
                </div>
            </div>

            <!-- Preset buttons -->
            <div class="payment-form__presets">
                <button type="button" class="preset-btn payment-form__preset-btn active:scale-[0.985] text-center" data-val="500">500 ₽</button>
                <button type="button" class="preset-btn payment-form__preset-btn active:scale-[0.985] text-center" data-val="2000">2 000 ₽</button>
                <button type="button" class="preset-btn payment-form__preset-btn active:scale-[0.985] text-center" data-val="5000">5 000 ₽</button>
                <button type="button" class="preset-btn payment-form__preset-btn active:scale-[0.985] text-center" data-val="max">Макс.</button>
            </div>
        </div>

        <!-- Credits received -->
        <div class="payment-form__credits">
            <div class="flex items-center justify-between">
                <div>
                    <div class="section-label text-slate-400">По курсу ЦБ вы получите</div>
                    <div class="flex items-baseline gap-x-2 mt-3">
                        <div id="credits-amount" class="credit-value font-display text-4xl font-semibold tracking-tighter text-white">0</div>
                        <div class="text-xl text-slate-300 font-medium">кредитов</div>
                    </div>
                </div>
                <div class="flex-shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400/10 to-teal-400/10 border border-emerald-400/20 flex items-center justify-center">
                    <div class="w-9 h-9 rounded-xl bg-emerald-400/10 flex items-center justify-center">
                        <i class="fa-solid fa-gem text-emerald-400 text-3xl"></i>
                    </div>
                </div>
            </div>
            
            <div class="payment-form__credits-note">
                <i class="fa-solid fa-info-circle"></i>
                <span>1 кредит ≈ 1 USD по курсу ЦБ на день оплаты</span>
            </div>
        </div>

        <!-- Pay Button -->
        <div class="payment-form__pay">
            <button id="pay-button" class="pay-button payment-form__pay-btn w-full rounded-3xl text-white font-semibold text-base tracking-tight flex items-center justify-center gap-x-2 shadow-xl active:scale-[0.985]">
                <span id="pay-text">Оплатить 1 000 ₽</span>
                <i class="fa-solid fa-arrow-right-long text-xl"></i>
            </button>
            <div class="flex items-center justify-center gap-x-2 mt-2">
                <div class="text-[0.9rem] text-center">
                    <span class="text-emerald-400">•</span> 
                    <span class="text-slate-400">Безопасная оплата через</span> 
                    <span class="font-semibold text-white">Robokassa</span>
                </div>
            </div>
        </div>
    </div>
    
    
</div>
<!-- Trust footer -->
<div class="payment-form__trust text-center">
    <div class="inline-flex items-center gap-x-2 text-slate-500">
        <i class="fa-solid fa-shield-halved text-emerald-500"></i>
        <span>Защищено SSL • Robokassa • 256-bit шифрование</span>
    </div>
</div>
<!-- Custom amount modal -->
    <div id="custom-modal" class="hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
        <div id="custom-modal-content" class="w-full max-w-[456px] bg-slate-900 border border-slate-700 rounded-3xl p-7 relative">
            <div class="flex justify-between items-center mb-5">
                <div class="font-semibold text-xl">Введите сумму</div>
                <button type="button" id="close-custom-modal" class="payment-modal-close-btn" aria-label="Закрыть">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
            </div>
            <div class="relative">
                <input type="text" id="custom-amount-input" class="custom-amount-input" placeholder="5000" inputmode="numeric">
                <div class="absolute right-6 top-1/2 -translate-y-1/2 text-3xl text-slate-400 font-medium">₽</div>
            </div>
            <div class="text-xs text-slate-400 mt-2 px-1">От 100 до 20 000 ₽</div>
            <div class="grid grid-cols-2 gap-3 mt-6">
                <button type="button" id="cancel-custom-modal" class="custom-modal-cancel-btn">Отмена</button>
                <button type="button" id="apply-custom-modal" class="pay-button py-3.5 rounded-2xl text-white text-sm font-semibold">Применить</button>
            </div>
        </div>
    </div>
  `;let t=e.querySelector(`#amount-display`),n=e.querySelector(`#amount-slider`),r=e.querySelector(`#credits-amount`),i=e.querySelector(`#pay-text`),a=e.querySelector(`#pay-button`),o=e.querySelectorAll(`.preset-btn`),s=e.querySelector(`#custom-modal`),c=e.querySelector(`#custom-amount-input`);function l(a=!0){t.textContent=N(A),a&&(t.style.transform=`scale(1.04)`,setTimeout(()=>{t.style.transform=`scale(1)`},120)),n.value=A.toString();let s=Math.min(Math.floor(A/M*20),20),c=1+s/100,l=(A/O*c).toFixed(2);r.style.transition=`none`,r.textContent=l,r.offsetWidth,r.style.transition=`all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)`;let u=e.querySelector(`#bonus-row`),d=e.querySelector(`#bonus-percent`);s>0?(u.classList.remove(`hidden`),u.classList.add(`flex`),d.textContent=s.toString()):(u.classList.remove(`flex`),u.classList.add(`hidden`)),i.textContent=`Оплатить ${N(A)} ₽`,o.forEach(e=>{e.classList.remove(`active`,`border-indigo-500`),e.classList.add(`border-slate-700`);let t=e.dataset.val;(t===`max`&&A===M||t&&parseInt(t)===A)&&(e.classList.add(`active`,`border-indigo-500`),e.classList.remove(`border-slate-700`))})}n.addEventListener(`input`,()=>{A=parseInt(n.value,10),l(!1)}),o.forEach(e=>{e.addEventListener(`click`,t=>{let n=t.target.dataset.val;n===`max`?A=M:n&&(A=parseInt(n,10)),l(!0),e.style.transform=`scale(0.96)`,setTimeout(()=>{e.style.transform=``},100)})}),e.querySelector(`#custom-amount-btn`)?.addEventListener(`click`,()=>{c.value=A.toString(),s.classList.remove(`hidden`),s.classList.add(`flex`),setTimeout(()=>{c.focus(),c.select()},50)});let u=()=>{s.classList.remove(`flex`),s.classList.add(`hidden`)};e.querySelector(`#close-custom-modal`)?.addEventListener(`click`,u),e.querySelector(`#cancel-custom-modal`)?.addEventListener(`click`,u),s.addEventListener(`click`,e=>{e.target===s&&u()});let d=()=>{let e=parseInt(c.value.replace(/\s/g,``),10);(!e||isNaN(e))&&(e=j),e<j&&(e=j),e>M&&(e=M),A=e,l(!0),u()};return e.querySelector(`#apply-custom-modal`)?.addEventListener(`click`,d),c.addEventListener(`keydown`,e=>{e.key===`Enter`&&d(),e.key===`Escape`&&u()}),a.addEventListener(`click`,()=>{R(a,{amount_rub:A})}),l(!1),e.querySelector(`#payment-modal-close-btn`)?.addEventListener(`click`,L),e}function F(){n(`credits-modal-close`)?.addEventListener(`click`,L),n(`credits-modal-backdrop`)?.addEventListener(`click`,L),n(`payment-modal-close`)?.addEventListener(`click`,L)}async function I(){if(!s.authToken){p();return}let e=n(`payment-modal`);e?e.classList.remove(`hidden`):n(`credits-modal`)?.classList.remove(`hidden`),n(`credits-modal-close`)?.focus(),n(`payment-modal-close`)?.focus();let t=n(`payment-container`);if(t&&!k){t.innerHTML=`<div class="help-loading"><span class="help-loader"></span><span>Загрузка курса ЦБ...</span></div>`;try{let e=await w();e.rate&&(O=e.rate),t.innerHTML=``,t.appendChild(P()),k=!0}catch{t.innerHTML=`<div class="help-error"><strong>Не удалось загрузить данные</strong></div>`}}}function L(){n(`credits-modal`)?.classList.add(`hidden`),n(`payment-modal`)?.classList.add(`hidden`)}async function R(t,n){if(!s.authToken){p();return}t.disabled=!0;let r=t.innerHTML;t.innerHTML=`<span class="flex items-center gap-x-3"><i class="fa-solid fa-spinner fa-spin"></i> <span>Подготовка...</span></span>`;try{let e=await c(n);if(e.payment_url){window.location.href=e.payment_url;return}throw Error(`Не удалось создать платёж`)}catch(n){e(n instanceof Error?n.message:`Ошибка оплаты`,`error`),t.innerHTML=r,t.disabled=!1}}await E(()=>import(`./vendor-globals-BvmuRZts.js`),__vite__mapDeps([0,1,2,3,4])).catch(()=>{});var z=4096;function B(){H(),i(),le(),T(),l(),F(),o(),x(),g(),D(),typeof marked<`u`&&marked.setOptions({breaks:!0,gfm:!0,highlight:(e,t)=>t&&window.hljs&&hljs.getLanguage(t)?hljs.highlight(e,{language:t}).value:window.hljs?hljs.highlightAuto(e).value:e})}async function V(){localStorage.setItem(`gemma_lang`,s.lang);let t={},i=n(`user-email`);i&&i.value!==void 0&&(t.email=i.value);let a=n(`user-password`);a&&a.value&&(t.password=a.value);let o=n(`user-default-category`);o&&o.value&&(t.category=o.value);let c=(t,r)=>{let i=n(t);if(!i)return null;let a=parseInt(i.value||`0`,10),o=parseInt(i.max||`0`,10);return!Number.isFinite(a)||a<z?(e(`${r} должен быть не меньше ${z}`,{variant:`error`}),null):a%z===0?Number.isFinite(o)&&o>=z&&a>o?(e(`${r} не может быть больше ${o}`,{variant:`error`}),null):a:(e(`${r} должен быть кратен ${z}`,{variant:`error`}),null)},l=c(`user-input-context-limit`,`Входной контекст`);if(l===null)return;t.input_context_limit=l;let u=c(`user-output-generation-limit`,`Выходная генерация`);if(u===null)return;t.output_generation_limit=u;let d=n(`user-rag-enabled`);if(d&&!d.disabled&&(t.rag_enabled=!!d.checked),Object.keys(t).length>0)try{let r=await fetch(`/api/users/me`,{method:`PATCH`,headers:{"Content-Type":`application/json`,Authorization:`Bearer `+s.authToken},body:JSON.stringify(t)});if(!r.ok){let t=await r.json().catch(()=>({}));e(t.detail||t.error||`Не удалось сохранить настройки`,{variant:`error`});return}if(s.currentUser){if(t.password){let e=n(`user-password`);e&&(e.value=``)}if(t.category){s.currentUser.category=t.category;let e=n(`chat-session-category`);e&&(e.value=t.category);let r=n(`chat-title-category`);r&&(r.textContent=t.category)}t.input_context_limit!==void 0&&(s.currentUser.input_context_limit=t.input_context_limit,s.contextSize=t.input_context_limit),t.output_generation_limit!==void 0&&(s.currentUser.output_generation_limit=t.output_generation_limit),t.rag_enabled!==void 0&&(s.currentUser.rag_enabled=t.rag_enabled)}}catch{}e(r(`saved`))}function H(e=localStorage.getItem(`avgexpert_theme`)||`system`){let t=[`light-business`,`light-contrast`].includes(e)?`light`:[`light`,`dark`,`system`].includes(e)?e:`system`;t===`system`?document.documentElement.removeAttribute(`data-theme`):document.documentElement.setAttribute(`data-theme`,t),localStorage.setItem(`avgexpert_theme`,t),document.querySelectorAll(`[data-theme-option]`).forEach(e=>{let n=e,r=n.dataset.themeOption===t;n.classList.toggle(`active`,r),n.setAttribute(`aria-checked`,String(r))})}function U(){localStorage.removeItem(`avgexpert_token`),s.authToken=null,s.currentUser=null,S(),s.chatHistory=[],s.attachedDocs=[],n(`messages`)&&(n(`messages`).textContent=``),n(`attached-docs`)&&(n(`attached-docs`).textContent=``),a(!0),b()}function W(){n(`app-menu`)?.classList.remove(`open`),n(`app-menu-btn`)?.setAttribute(`aria-expanded`,`false`)}function G(){n(`advanced-panel`)?.classList.add(`hidden`),n(`advanced-toggle-btn`)?.classList.remove(`active`),n(`input-wrapper`)?.classList.remove(`advanced-open`)}function K(){n(`about-modal`)?.classList.remove(`hidden`),W(),n(`about-modal-close`)?.focus()}function q(){n(`about-modal`)?.classList.add(`hidden`)}async function J(){n(`help-modal`)?.classList.remove(`hidden`),W(),n(`help-modal-close`)?.focus(),await Y(`Help.md`)}async function Y(e){let t=n(`help-content`);if(!t)return;let r=String(e||`Help.md`).replace(/[^a-zA-Z0-9_.-]/g,``);if(t.dataset.loadedFile!==r){document.querySelectorAll(`[data-help-file]`).forEach(e=>{let t=e;t.classList.toggle(`active`,t.dataset.helpFile===r)}),t.innerHTML=`<div class="help-loading"><span class="help-loader"></span><span>Загрузка документа...</span></div>`;try{let e=await fetch(`assets/${r}`,{cache:`no-cache`});if(!e.ok)throw Error(`HTTP ${e.status}`);let n=await e.text();t.innerHTML=DOMPurify.sanitize(marked.parse(n)),t.dataset.loadedFile=r,t.scrollTop=0,t.querySelectorAll(`a`).forEach(e=>{e.hostname&&e.hostname!==window.location.hostname&&(e.target=`_blank`,e.rel=`noopener`)})}catch{t.innerHTML=`<div class="help-error"><strong>Не удалось загрузить документ.</strong><span>Проверьте файл assets/${DOMPurify.sanitize(r)} и доступность сервера.</span></div>`}}}function X(){n(`help-modal`)?.classList.add(`hidden`)}function Z(){n(`books-modal`)?.classList.add(`hidden`)}function Q(e){return String(e||``).replace(/^\/+/,``).replace(/\.\.+/g,``).replace(/\\/g,`/`)}async function ne(){n(`books-modal`)?.classList.remove(`hidden`),W(),n(`books-modal-close`)?.focus(),await re()}async function re(){let e=n(`books-list`),t=n(`books-reader`);if(!(!e||!t)&&e.dataset.loaded!==`true`){e.innerHTML=`<div class="help-loading"><span class="help-loader"></span><span>Загрузка каталога...</span></div>`;try{let r=await fetch(`assets/books/books.json`,{cache:`no-cache`});if(!r.ok)throw Error(`HTTP ${r.status}`);let i=await r.json(),a=Array.isArray(i.books)?i.books:[];if(a.sort((e,t)=>(e.order??0)-(t.order??0)||String(e.title||``).localeCompare(String(t.title||``))),ie(a),e.dataset.loaded=`true`,i.title){let e=n(`books-modal-title`);e&&(e.textContent=i.title)}a.length===0&&(t.innerHTML=`<div class="books-empty-state"><span class="books-empty-icon" aria-hidden="true">◆</span><h3>Каталог пуст</h3><p>Добавьте записи в assets/books/books.json и положите Markdown-файлы книг в assets/books.</p></div>`)}catch{e.innerHTML=`<div class="help-error"><strong>Каталог недоступен.</strong><span>Проверьте файл assets/books/books.json.</span></div>`}}}function ie(e){let t=n(`books-list`);t&&(t.textContent=``,e.forEach((e,n)=>{let r=document.createElement(`button`);r.className=`book-list-item`,r.type=`button`,r.dataset.bookIndex=String(n),r.innerHTML=`<span class="book-list-title">${DOMPurify.sanitize(e.title||`Книга ${n+1}`)}</span>
      ${e.subtitle?`<span class="book-list-subtitle">${DOMPurify.sanitize(e.subtitle)}</span>`:``}`,r.addEventListener(`click`,()=>ce(e,r)),t.appendChild(r)}))}function $(e){return String(e||``).replace(/^#/,``).replace(/\\/g,``).replace(/[№.,:;!?()[\]{}'"«»“”]/g,``).replace(/-/g,` `).replace(/\s+/g,` `).trim().toLowerCase()}function ae(e,t,n){let r=decodeURIComponent(String(t||``)),i=window.CSS?.escape||(e=>String(e).replace(/["\\#.;?+*~':!^$[\]()=>|/@]/g,`\\$&`)),a=e.querySelector(`#${i(r)}`);if(a)return a;let o=$(r),s=$(n);return Array.from(e.querySelectorAll(`.book-reader-body h1, .book-reader-body h2, .book-reader-body h3, .book-reader-body h4`)).find(e=>{let t=$(e.textContent||``);return t===o||t===s||t.includes(s)||s.includes(t)})||null}function oe(e,t){let n=e.getBoundingClientRect(),r=t.getBoundingClientRect(),i=e.scrollTop+r.top-n.top-18;e.scrollTo({top:Math.max(0,i),behavior:`smooth`})}function se(e){e.querySelectorAll(`.book-reader-body a`).forEach(t=>{let n=t,r=n.getAttribute(`href`)||``;if(r.startsWith(`#`)){n.addEventListener(`click`,t=>{t.preventDefault();let i=ae(e,r.slice(1),n.textContent||``);i&&oe(e,i)});return}(/^https?:\/\//i.test(r)||r.startsWith(`mailto:`))&&(n.target=`_blank`,n.rel=`noopener`)})}async function ce(e,t){let r=n(`books-reader`);if(r){document.querySelectorAll(`.book-list-item`).forEach(e=>e.classList.remove(`active`)),t?.classList.add(`active`),r.innerHTML=`<div class="help-loading"><span class="help-loader"></span><span>Загрузка книги...</span></div>`;try{let t=Q(e.file||``);if(!t)throw Error(`Missing file`);let n=await fetch(`assets/books/${t}`,{cache:`no-cache`});if(!n.ok)throw Error(`HTTP ${n.status}`);let i=await n.text();r.innerHTML=`<header class="book-reader-header"><span>Текст автора</span><h3>${DOMPurify.sanitize(e.title||`Книга`)}</h3>${e.subtitle?`<p>${DOMPurify.sanitize(e.subtitle)}</p>`:``}</header>
      <div class="book-reader-body">${DOMPurify.sanitize(marked.parse(i))}</div>`,se(r),r.scrollTop=0}catch{r.innerHTML=`<div class="help-error"><strong>Не удалось открыть книгу.</strong><span>Проверьте путь к файлу в books.json и наличие Markdown-файла в assets/books.</span></div>`}}}function le(){document.querySelectorAll(`[data-view]`).forEach(e=>e.addEventListener(`click`,()=>{W(),m(e.dataset.view||`chat`)})),n(`new-chat-btn`)?.addEventListener(`click`,()=>f()),n(`save-btn`)?.addEventListener(`click`,()=>{V(),m(`chat`)}),n(`user-input-context-limit`)?.addEventListener(`input`,h),n(`user-output-generation-limit`)?.addEventListener(`input`,h);let e=n(`login-form`);e?e.addEventListener(`submit`,_):console.error(`Login form not found during bindEvents`),n(`login-submit-btn`)?.addEventListener(`click`,e=>{n(`login-form`)||_(e)});let r=n(`register-form`);r&&r.addEventListener(`submit`,d),n(`register-submit-btn`)?.addEventListener(`click`,e=>{n(`register-form`)||d(e)}),n(`show-register-link`)?.addEventListener(`click`,e=>{e.preventDefault(),n(`login-form`)?.classList.add(`hidden`),n(`register-form`)?.classList.remove(`hidden`);let t=document.querySelector(`.login-box h2`);t&&(t.textContent=`Регистрация`)}),n(`show-login-link`)?.addEventListener(`click`,e=>{e.preventDefault(),n(`register-form`)?.classList.add(`hidden`),n(`login-form`)?.classList.remove(`hidden`);let t=document.querySelector(`.login-box h2`);t&&(t.textContent=`Вход в систему`)}),n(`credits-menu-btn`)?.addEventListener(`click`,()=>{W(),I()}),n(`settings-topup-btn`)?.addEventListener(`click`,()=>I()),n(`balance-history-export-btn`)?.addEventListener(`click`,v),n(`about-menu-btn`)?.addEventListener(`click`,K),n(`about-modal-close`)?.addEventListener(`click`,q),n(`about-modal-backdrop`)?.addEventListener(`click`,q),n(`help-menu-btn`)?.addEventListener(`click`,J),n(`help-modal-close`)?.addEventListener(`click`,X),n(`help-modal-backdrop`)?.addEventListener(`click`,X),n(`help-modal`)?.addEventListener(`click`,e=>{let t=e.target.closest?.(`[data-help-file]`);t&&Y(t.dataset.helpFile||`Help.md`)}),document.querySelectorAll(`[data-help-file]`).forEach(e=>{e.addEventListener(`click`,()=>Y(e.dataset.helpFile||`Help.md`))}),n(`docs-menu-btn`)?.addEventListener(`click`,ne),n(`books-modal-close`)?.addEventListener(`click`,Z),n(`books-modal-backdrop`)?.addEventListener(`click`,Z),n(`send-btn`)?.addEventListener(`click`,C),n(`user-input`)?.addEventListener(`keydown`,e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),C())}),n(`stop-btn`)?.addEventListener(`click`,te);let i=n(`file-input`);n(`attach-btn`)?.addEventListener(`click`,()=>i?.click()),i?.addEventListener(`change`,e=>{let t=e.target;u(t.files)});let a=n(`input-wrapper`),c=n(`drop-overlay`);a&&c&&([`dragenter`,`dragover`].forEach(e=>a.addEventListener(e,e=>{e.preventDefault(),c.classList.add(`active`)})),[`dragleave`,`drop`].forEach(e=>c.addEventListener(e,e=>{e.preventDefault(),c.classList.remove(`active`)})),c.addEventListener(`drop`,e=>{e.dataTransfer?.files&&u(e.dataTransfer.files)})),n(`sidebar-toggle`)?.addEventListener(`click`,()=>{let e=n(`sidebar`);e&&(window.innerWidth>=1024?e.classList.toggle(`collapsed`):(e.classList.toggle(`open`),n(`sidebar-backdrop`)?.classList.toggle(`active`,e.classList.contains(`open`))))}),n(`logo-icon-toggle`)?.addEventListener(`click`,()=>{let e=n(`sidebar`);e&&e.classList.contains(`collapsed`)&&e.classList.remove(`collapsed`)});function l(){n(`sidebar`)?.classList.add(`open`),n(`sidebar-backdrop`)?.classList.add(`active`)}function p(){n(`sidebar`)?.classList.remove(`open`),n(`sidebar-backdrop`)?.classList.remove(`active`)}n(`mobile-menu-btn`)?.addEventListener(`click`,l),n(`mobile-menu-btn-setup`)?.addEventListener(`click`,l),n(`mobile-menu-btn-admin`)?.addEventListener(`click`,l),n(`sidebar-backdrop`)?.addEventListener(`click`,p),n(`app-menu-btn`)?.addEventListener(`click`,()=>{let e=n(`app-menu`)?.classList.toggle(`open`)||!1;n(`app-menu-btn`)?.setAttribute(`aria-expanded`,String(e))}),document.querySelectorAll(`[data-theme-option]`).forEach(e=>{e.addEventListener(`click`,()=>{H(e.dataset.themeOption||`system`),W()})}),n(`logout-btn`)?.addEventListener(`click`,U);let g=document.getElementById(`about-photo-img`);g&&g.addEventListener(`error`,()=>{g.parentElement?.classList.add(`about-photo-missing`),g.remove()}),n(`user-input`)?.addEventListener(`input`,o),n(`advanced-toggle-btn`)?.addEventListener(`click`,()=>{let e=n(`advanced-panel`)?.classList.toggle(`hidden`)===!1;n(`advanced-toggle-btn`)?.classList.toggle(`active`,e),n(`input-wrapper`)?.classList.toggle(`advanced-open`,e)}),document.addEventListener(`click`,e=>{let t=e.target,r=n(`app-menu`);r&&!r.contains(t)&&W();let i=n(`advanced-panel`),a=n(`advanced-toggle-btn`);i&&a&&!i.contains(t)&&!a.contains(t)&&G()}),document.addEventListener(`keydown`,e=>{e.key===`Escape`&&(W(),G(),L(),q(),X(),Z())}),n(`chat-session-category`)?.addEventListener(`change`,()=>{let e=n(`chat-session-category`)?.value,r=n(`chat-title-category`);r&&e&&(r.textContent=e),ee.saveCurrent(),s.authToken&&s.currentUser&&y(),t()})}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,B):B();
//# sourceMappingURL=index-O8WPJOoU.js.map