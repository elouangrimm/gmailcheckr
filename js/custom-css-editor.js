"use strict";

// Detect color scheme
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (!prefersDark) {
    document.body.classList.add('light');
}

// Initialize CodeMirror
const editor = CodeMirror.fromTextArea(document.getElementById('css-editor'), {
    mode: 'css',
    theme: prefersDark ? 'dracula' : 'default',
    lineNumbers: true,
    lineWrapping: true,
    indentUnit: 4,
    tabSize: 4,
    indentWithTabs: false,
    autoCloseBrackets: true,
    matchBrackets: true,
    extraKeys: {
        'Tab': function (cm) {
            cm.replaceSelection('    ', 'end');
        }
    }
});

const statusEl = document.getElementById('save-status');
const imageUrlInput = document.getElementById('customBackgroundImageUrl');
let saveTimeout = null;

// Debounced auto-save
function scheduleSave() {
    statusEl.textContent = 'Saving...';
    statusEl.className = 'saving';

    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(async () => {
        await saveCustomSkin();
        statusEl.textContent = 'Saved';
        statusEl.className = 'saved';

        // Reset status after 2 seconds
        setTimeout(() => {
            statusEl.textContent = 'Ready';
            statusEl.className = '';
        }, 2000);
    }, 500);
}

async function saveCustomSkin() {
    const customSkin = {
        id: 'customSkin',
        css: editor.getValue(),
        image: imageUrlInput.value
    };
    await storage.set('customSkin', customSkin);

    // Notify opener window if exists
    if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'customSkinUpdated', skin: customSkin }, '*');
    }
}

// Load existing custom skin
async function loadCustomSkin() {
    const customSkin = await storage.get('customSkin');
    if (customSkin) {
        editor.setValue(customSkin.css || '');
        imageUrlInput.value = customSkin.image || '';
    }
}

// Event listeners
editor.on('change', scheduleSave);
imageUrlInput.addEventListener('input', scheduleSave);

// Initialize
(async function init() {
    try {
        await storage.init("custom-css-editor");
        loadCustomSkin();
    } catch (e) {
        console.error("Failed to initialize storage", e);
    }
})();

// Listen for color scheme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    document.body.classList.toggle('light', !e.matches);
    editor.setOption('theme', e.matches ? 'dracula' : 'default');
});

// Format CSS
function formatCSS() {
    try {
        const css = editor.getValue();
        const formatted = prettier.format(css, {
            parser: "css",
            plugins: prettierPlugins,
            tabWidth: 4,
            printWidth: 80,
            useTabs: false,
            singleQuote: false
        });
        
        editor.setValue(formatted);
    } catch (e) {
        console.error("Prettier formatting error:", e);
        // Fallback to basic indent if Prettier fails
        const totalLines = editor.lineCount();
        for (let i = 0; i < totalLines; i++) {
            editor.indentLine(i);
        }
    }
}

document.getElementById('format-btn').addEventListener('click', formatCSS);
