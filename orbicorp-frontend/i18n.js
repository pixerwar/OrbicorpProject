/**
 * OrbiCorp i18n - Internationalization Module
 * ============================================
 * Dil dosyalarını yükler ve çevirileri yönetir.
 * 
 * Kullanım:
 *   await i18n.init();
 *   i18n.t('users.title') → "Kullanıcı Yönetimi"
 *   i18n.setLang('en');
 *   
 * HTML'de:
 *   <span data-i18n="users.title">Kullanıcı Yönetimi</span>
 */

const i18n = (function() {
  // ═══════════════════════════════════════════════════════════════
  // CONFIG
  // ═══════════════════════════════════════════════════════════════
  
  const CONFIG = {
    defaultLang: 'tr',
    fallbackLang: 'tr',
    storageKey: 'orbicorp_lang',
    langPath: 'lang/',  // Dil dosyalarının yolu
    supportedLangs: ['tr', 'en'],
    debug: false
  };

  // ═══════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════
  
  let currentLang = CONFIG.defaultLang;
  let translations = {};
  let isInitialized = false;
  let onLangChangeCallbacks = [];

  // ═══════════════════════════════════════════════════════════════
  // CORE FUNCTIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Başlangıç - dil dosyasını yükler
   */
  async function init(options = {}) {
    if (isInitialized && !options.force) {
      return currentLang;
    }

    // Config override
    Object.assign(CONFIG, options);

    // localStorage'dan dil oku
    const savedLang = localStorage.getItem(CONFIG.storageKey);
    
    if (savedLang && CONFIG.supportedLangs.includes(savedLang)) {
      currentLang = savedLang;
    } else {
      currentLang = CONFIG.defaultLang;
    }

    // Dil dosyasını yükle
    await loadLanguage(currentLang);
    
    // DOM'u güncelle
    updateDOM();
    
    // HTML lang attribute
    document.documentElement.lang = currentLang;
    
    // RTL desteği (gelecekte Arapça vb. için)
    const dir = translations.meta?.direction || 'ltr';
    document.documentElement.dir = dir;

    isInitialized = true;
    
    if (CONFIG.debug) {
      console.log(`[i18n] Initialized with language: ${currentLang}`);
    }

    return currentLang;
  }

  /**
   * Dil dosyasını yükler
   */
  async function loadLanguage(lang) {
    try {
      const response = await fetch(`${CONFIG.langPath}${lang}.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to load language file: ${lang}.json`);
      }
      
      translations = await response.json();
      
      if (CONFIG.debug) {
        console.log(`[i18n] Loaded language: ${lang}`, translations);
      }
      
      return true;
    } catch (error) {
      console.error(`[i18n] Error loading language ${lang}:`, error);
      
      // Fallback dili yükle
      if (lang !== CONFIG.fallbackLang) {
        console.warn(`[i18n] Falling back to ${CONFIG.fallbackLang}`);
        return loadLanguage(CONFIG.fallbackLang);
      }
      
      return false;
    }
  }

  /**
   * Dil değiştir
   */
  async function setLang(lang) {
    if (!CONFIG.supportedLangs.includes(lang)) {
      console.warn(`[i18n] Unsupported language: ${lang}`);
      return false;
    }

    if (lang === currentLang) {
      return true;
    }

    const previousLang = currentLang;
    currentLang = lang;

    // localStorage'a kaydet
    localStorage.setItem(CONFIG.storageKey, lang);

    // Yeni dil dosyasını yükle
    await loadLanguage(lang);

    // DOM'u güncelle
    updateDOM();

    // HTML lang attribute
    document.documentElement.lang = lang;

    // RTL desteği
    const dir = translations.meta?.direction || 'ltr';
    document.documentElement.dir = dir;

    // Callbacks
    onLangChangeCallbacks.forEach(cb => cb(lang, previousLang));

    if (CONFIG.debug) {
      console.log(`[i18n] Language changed: ${previousLang} → ${lang}`);
    }

    return true;
  }

  /**
   * Çeviri al - nested key desteği (örn: "users.modal.title")
   */
  function t(key, params = {}) {
    const keys = key.split('.');
    let value = translations;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        if (CONFIG.debug) {
          console.warn(`[i18n] Missing translation: ${key}`);
        }
        return key; // Key'i döndür (fallback)
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // Parametreleri değiştir: {n}, {name} vb.
    return value.replace(/\{(\w+)\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  }

  /**
   * DOM'daki tüm data-i18n elementlerini güncelle
   */
  function updateDOM(container = document) {
    const elements = container.querySelectorAll('[data-i18n]');
    
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translation = t(key);
      
      // Placeholder için ayrı attribute
      if (el.hasAttribute('data-i18n-placeholder')) {
        el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
      }
      
      // Title için ayrı attribute
      if (el.hasAttribute('data-i18n-title')) {
        el.title = t(el.getAttribute('data-i18n-title'));
      }
      
      // Text content
      if (translation !== key) {
        el.textContent = translation;
      }
    });

    // Placeholder'ları güncelle
    const placeholders = container.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      el.placeholder = t(key);
    });

    // Title'ları güncelle
    const titles = container.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      el.title = t(key);
    });
  }

  /**
   * Dil değişikliği dinleyicisi ekle
   */
  function onLangChange(callback) {
    if (typeof callback === 'function') {
      onLangChangeCallbacks.push(callback);
    }
  }

  /**
   * Dil değişikliği dinleyicisi kaldır
   */
  function offLangChange(callback) {
    const index = onLangChangeCallbacks.indexOf(callback);
    if (index > -1) {
      onLangChangeCallbacks.splice(index, 1);
    }
  }

  /**
   * Mevcut dili al
   */
  function getLang() {
    return currentLang;
  }

  /**
   * Desteklenen dilleri al
   */
  function getSupportedLangs() {
    return [...CONFIG.supportedLangs];
  }

  /**
   * Dil bilgilerini al
   */
  function getLangInfo(lang) {
    const langNames = {
      tr: { code: 'tr', name: 'Türkçe', nativeName: 'Türkçe', flag: '🇹🇷' },
      en: { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
      de: { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
      ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', rtl: true }
    };
    return langNames[lang] || { code: lang, name: lang, nativeName: lang };
  }

  /**
   * Dil seçici UI oluştur
   */
  function createLangSelector(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { style = 'dropdown', showFlag = true, showNativeName = true } = options;

    if (style === 'dropdown') {
      const select = document.createElement('select');
      select.className = 'lang-selector';
      select.id = 'langSelector';
      
      CONFIG.supportedLangs.forEach(lang => {
        const info = getLangInfo(lang);
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = showFlag ? `${info.flag} ${info.nativeName}` : info.nativeName;
        option.selected = lang === currentLang;
        select.appendChild(option);
      });

      select.addEventListener('change', (e) => {
        setLang(e.target.value);
      });

      container.innerHTML = '';
      container.appendChild(select);
    } else if (style === 'buttons') {
      container.innerHTML = '';
      CONFIG.supportedLangs.forEach(lang => {
        const info = getLangInfo(lang);
        const btn = document.createElement('button');
        btn.className = `lang-btn ${lang === currentLang ? 'active' : ''}`;
        btn.textContent = showFlag ? `${info.flag} ${info.code.toUpperCase()}` : info.code.toUpperCase();
        btn.onclick = () => setLang(lang);
        container.appendChild(btn);
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  return {
    init,
    t,
    setLang,
    getLang,
    getSupportedLangs,
    getLangInfo,
    updateDOM,
    onLangChange,
    offLangChange,
    createLangSelector,
    
    // Shorthand
    translate: t,
    
    // Config access
    get config() { return { ...CONFIG }; },
    get isReady() { return isInitialized; }
  };
})();

// ═══════════════════════════════════════════════════════════════
// AUTO INIT (optional - sayfa yüklendiğinde otomatik başlat)
// ═══════════════════════════════════════════════════════════════

// Sayfa yüklendiğinde otomatik başlat
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => i18n.init());
} else {
  // DOM zaten yüklü
  i18n.init();
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = i18n;
}
