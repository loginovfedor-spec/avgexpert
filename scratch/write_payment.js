const fs = require('fs');
let code = fs.readFileSync('webui_src/ts/billing/payment-modal.ts', 'utf-8');

const innerStart = code.indexOf('<div class="p-4 space-y-4">');
const innerEnd = code.indexOf('<!-- Custom amount modal -->');

const replacement = `<div class="modern-card bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
    <!-- Header -->
    <div class="px-5 pt-4 pb-3 border-b border-slate-800 bg-slate-900/80">
        <div class="flex items-center justify-between">
            <h1 class="font-display text-2xl font-semibold tracking-tight">Пополнение баланса</h1>
            <button id="payment-modal-close-btn" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-2xl transition-colors -mr-1">
                <i class="fa-solid fa-times text-lg"></i>
            </button>
        </div>
        <p class="text-xs text-slate-400 -mt-0.5">Мгновенное зачисление кредитов</p>
    </div>
    ` + code.substring(innerStart, innerEnd) + `
</div>
<!-- Trust footer -->
<div class="text-center mt-5 px-1">
    <div class="inline-flex items-center gap-x-2 text-xs text-slate-500">
        <i class="fa-solid fa-shield-halved text-emerald-500"></i>
        <span>Защищено SSL • Robokassa • 256-bit шифрование</span>
    </div>
</div>
<!-- Custom amount modal -->`;

code = code.substring(0, innerStart) + replacement + code.substring(innerEnd + 28);
code = code.replace(/<button id="close-custom-modal"/g, '<button type="button" id="close-custom-modal"');
code = code.replace(/<button id="cancel-custom-modal"/g, '<button type="button" id="cancel-custom-modal"');
code = code.replace(/<button id="apply-custom-modal"/g, '<button type="button" id="apply-custom-modal"');

// Hook up payment-modal-close-btn
code = code.replace("return container;", "container.querySelector('#payment-modal-close-btn')?.addEventListener('click', closeCreditsModal);\n  return container;");

fs.writeFileSync('webui_src/ts/billing/payment-modal.ts', code);
