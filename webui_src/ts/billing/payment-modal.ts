import { state } from '../state';
import { $ } from '../index';
import { showToast } from '../ui';
import { showRegistrationPrompt } from '../auth';
import { createRobokassaPayment, fetchExchangeRate } from '../api/billing.api';

let exchangeRate = 90.0;
let modalLoaded = false;
let currentAmount = 1000;
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 20000;

function formatAmount(amount: number): string {
    return Math.round(amount).toLocaleString('ru-RU');
}

function renderPaymentForm(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'form-container payment-form-wrap w-full mx-auto';
  
  container.innerHTML = `
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
  `;

  const display = container.querySelector('#amount-display') as HTMLElement;
  const slider = container.querySelector('#amount-slider') as HTMLInputElement;
  const creditsEl = container.querySelector('#credits-amount') as HTMLElement;
  const payText = container.querySelector('#pay-text') as HTMLElement;
  const payBtn = container.querySelector('#pay-button') as HTMLButtonElement;
  const presets = container.querySelectorAll('.preset-btn');
  const customModal = container.querySelector('#custom-modal') as HTMLElement;
  const customInput = container.querySelector('#custom-amount-input') as HTMLInputElement;

  function updateUI(animate = true) {
      display.textContent = formatAmount(currentAmount);
      if (animate) {
          display.style.transform = 'scale(1.04)';
          setTimeout(() => { display.style.transform = 'scale(1)'; }, 120);
      }
      slider.value = currentAmount.toString();
      
      const bonusPercent = Math.min(Math.floor((currentAmount / MAX_AMOUNT) * 20), 20);
      const multiplier = 1 + (bonusPercent / 100);
      const baseCredits = currentAmount / exchangeRate;
      const finalCredits = (baseCredits * multiplier).toFixed(2);
      
      creditsEl.style.transition = 'none';
      creditsEl.textContent = finalCredits;
      // force reflow
      void creditsEl.offsetWidth;
      creditsEl.style.transition = 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)';
      
      const bonusRow = container.querySelector('#bonus-row') as HTMLElement;
      const bonusPercentEl = container.querySelector('#bonus-percent') as HTMLElement;
      if (bonusPercent > 0) {
          bonusRow.classList.remove('hidden');
          bonusRow.classList.add('flex');
          bonusPercentEl.textContent = bonusPercent.toString();
      } else {
          bonusRow.classList.remove('flex');
          bonusRow.classList.add('hidden');
      }

      payText.textContent = `Оплатить ${formatAmount(currentAmount)} ₽`;

      presets.forEach(btn => {
          btn.classList.remove('active', 'border-indigo-500');
          btn.classList.add('border-slate-700');
          const val = (btn as HTMLElement).dataset.val;
          if (val === 'max' && currentAmount === MAX_AMOUNT) {
              btn.classList.add('active', 'border-indigo-500');
              btn.classList.remove('border-slate-700');
          } else if (val && parseInt(val) === currentAmount) {
              btn.classList.add('active', 'border-indigo-500');
              btn.classList.remove('border-slate-700');
          }
      });
  }

  slider.addEventListener('input', () => {
      currentAmount = parseInt(slider.value, 10);
      updateUI(false);
  });

  presets.forEach(p => {
      p.addEventListener('click', (e) => {
          const val = (e.target as HTMLElement).dataset.val;
          if (val === 'max') {
              currentAmount = MAX_AMOUNT;
          } else if (val) {
              currentAmount = parseInt(val, 10);
          }
          updateUI(true);
          (p as HTMLElement).style.transform = 'scale(0.96)';
          setTimeout(() => { (p as HTMLElement).style.transform = ''; }, 100);
      });
  });

  const customBtn = container.querySelector('#custom-amount-btn');
  customBtn?.addEventListener('click', () => {
      customInput.value = currentAmount.toString();
      customModal.classList.remove('hidden');
      customModal.classList.add('flex');
      setTimeout(() => { customInput.focus(); customInput.select(); }, 50);
  });

  const hideCustomModal = () => {
      customModal.classList.remove('flex');
      customModal.classList.add('hidden');
  };

  container.querySelector('#close-custom-modal')?.addEventListener('click', hideCustomModal);
  container.querySelector('#cancel-custom-modal')?.addEventListener('click', hideCustomModal);
  customModal.addEventListener('click', (e) => {
      if (e.target === customModal) hideCustomModal();
  });

  const applyCustomAmount = () => {
      let val = parseInt(customInput.value.replace(/\s/g, ''), 10);
      if (!val || isNaN(val)) val = MIN_AMOUNT;
      if (val < MIN_AMOUNT) val = MIN_AMOUNT;
      if (val > MAX_AMOUNT) val = MAX_AMOUNT;
      currentAmount = val;
      updateUI(true);
      hideCustomModal();
  };

  container.querySelector('#apply-custom-modal')?.addEventListener('click', applyCustomAmount);
  customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') applyCustomAmount();
      if (e.key === 'Escape') hideCustomModal();
  });

  payBtn.addEventListener('click', () => {
      startPayment(payBtn, { amount_rub: currentAmount });
  });

  updateUI(false);
  container.querySelector('#payment-modal-close-btn')?.addEventListener('click', closeCreditsModal);
  return container;
}

export function initPaymentModal(): void {
  $('credits-modal-close')?.addEventListener('click', closeCreditsModal);
  $('credits-modal-backdrop')?.addEventListener('click', closeCreditsModal);
  $('payment-modal-close')?.addEventListener('click', closeCreditsModal);
}

export async function openCreditsModal(): Promise<void> {
  if (!state.authToken) {
    showRegistrationPrompt();
    return;
  }
  
  const paymentModal = $('payment-modal');
  if (paymentModal) {
    paymentModal.classList.remove('hidden');
  } else {
    $('credits-modal')?.classList.remove('hidden');
  }
  
  $<HTMLButtonElement>('credits-modal-close')?.focus();
  $<HTMLButtonElement>('payment-modal-close')?.focus();
  
  const container = $('payment-container');
  if (!container) return;

  if (!modalLoaded) {
    container.innerHTML = '<div class="help-loading"><span class="help-loader"></span><span>Загрузка курса ЦБ...</span></div>';
    try {
      const res = await fetchExchangeRate();
      if (res.rate) {
        exchangeRate = res.rate;
      }
      container.innerHTML = '';
      container.appendChild(renderPaymentForm());
      modalLoaded = true;
    } catch (e) {
      container.innerHTML = '<div class="help-error"><strong>Не удалось загрузить данные</strong></div>';
    }
  }
}

export function closeCreditsModal(): void {
  $('credits-modal')?.classList.add('hidden');
  $('payment-modal')?.classList.add('hidden');
}

async function startPayment(button: HTMLButtonElement, payload: { amount_rub: number }): Promise<void> {
  if (!state.authToken) {
    showRegistrationPrompt();
    return;
  }

  button.disabled = true;
  const originalContent = button.innerHTML;
  button.innerHTML = '<span class="flex items-center gap-x-3"><i class="fa-solid fa-spinner fa-spin"></i> <span>Подготовка...</span></span>';
  
  try {
    const data = await createRobokassaPayment(payload);
    if (data.payment_url) {
      window.location.href = data.payment_url;
      return;
    }
    throw new Error('Не удалось создать платёж');
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Ошибка оплаты', 'error');
    button.innerHTML = originalContent;
    button.disabled = false;
  }
}
