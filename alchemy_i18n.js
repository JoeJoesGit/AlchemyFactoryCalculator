/**
 * I18n - Lightweight translation module for Alchemy Factory Calculator.
 * English keys are used as-is; other languages load from lang/{lang}.js.
 * Uses script tag loading to avoid CORS issues with file:// protocol.
 */
const I18n = (() => {
    let _lang = 'en';
    let _dict = {};

    /**
     * Translate a key, with optional parameter substitution.
     * @param {string} key - English source string (used as key)
     * @param {Object} [params] - Placeholder values, e.g. {item: "Gold"}
     * @returns {string}
     */
    function t(key, params) {
        let str = (_lang === 'en' || !_dict[key]) ? key : _dict[key];
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                str = str.replaceAll(`{${k}}`, v);
            }
        }
        return str;
    }

    /** Apply translations to all elements with data-i18n attributes. */
    function applyStaticTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
        });
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.getAttribute('data-i18n-title'));
        });
    }

    /**
     * Initialize: read saved language from localStorage, load dictionary if needed.
     */
    async function init() {
        _lang = localStorage.getItem('alchemy-lang') || 'en';
        if (_lang !== 'en') {
            await _loadDict(_lang);
        }
        const sel = document.getElementById('lang-select');
        if (sel) {
            sel.value = _lang;
            sel.addEventListener('change', (e) => setLang(e.target.value));
        }
        applyStaticTranslations();
    }

    /**
     * Switch language, reload dictionary, re-render UI.
     */
    async function setLang(lang) {
        _lang = lang;
        localStorage.setItem('alchemy-lang', lang);
        _dict = {};
        if (lang !== 'en') {
            await _loadDict(lang);
        }
        applyStaticTranslations();
        if (typeof renderAll === 'function') {
            renderAll();
        }
    }

    /**
     * Load dictionary via script tag (works with file:// protocol).
     */
    function _loadDict(lang) {
        return new Promise((resolve) => {
            // Check if already loaded via global variable
            const globalVar = `LANG_${lang.toUpperCase()}`;
            if (window[globalVar]) {
                _dict = window[globalVar];
                resolve();
                return;
            }

            // Load via script tag
            const script = document.createElement('script');
            script.src = `lang/${lang}.js`;
            script.onload = () => {
                if (window[globalVar]) {
                    _dict = window[globalVar];
                }
                resolve();
            };
            script.onerror = () => {
                console.warn(`I18n: Failed to load lang/${lang}.js`);
                resolve();
            };
            document.head.appendChild(script);
        });
    }

    function getLang() {
        return _lang;
    }

    return { t, init, setLang, getLang, applyStaticTranslations };
})();
