import re

with open('webui_src/index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_bad_block = False

for line in lines:
    if '<div id="credits-modal"' in line:
        in_bad_block = True
        new_lines.append('    <div id="credits-modal" class="credits-modal hidden" role="dialog" aria-label="Оплата" aria-modal="true">\n')
        new_lines.append('        <div class="credits-modal-backdrop" id="credits-modal-backdrop"></div>\n')
        new_lines.append('        <div id="payment-container" class="relative z-10 w-full max-w-[420px] mx-auto min-h-screen flex items-center justify-center p-4"></div>\n')
        new_lines.append('    </div>\n\n')
        continue
        
    if in_bad_block:
        if '<div id="about-modal"' in line:
            in_bad_block = False
            new_lines.append(line)
        continue
        
    new_lines.append(line)

with open('webui_src/index.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
