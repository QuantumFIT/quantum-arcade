'use strict';
/*
 * Shared CS/EN language switch for the quantum arcade.
 *
 * Each page loads its Czech dictionary first (window.QA_CS = {...}), then
 * this file, then its game script.
 *  - Static text: elements with data-i18n="key" get DICT[key] in Czech. Their
 *    original (English) HTML is restored when switching back. Such elements
 *    must not contain elements that scripts keep references to.
 *    data-i18n-aria="key" does the same for the aria-label attribute.
 *  - Script text: QA.t('English text with {vars}', { vars }) looks the
 *    English string up in the dictionary and fills in the placeholders.
 *  - QA.onChange(fn) runs fn after every language switch, so a page can
 *    redraw text it generated itself.
 * The choice is stored in localStorage ('qa-lang') and shared by all pages.
 * A ?lang=cs or ?lang=en URL parameter overrides it.
 */
(() => {
  const DICT = window.QA_CS || {};
  const STORE = 'qa-lang';
  const has = k => Object.prototype.hasOwnProperty.call(DICT, k);

  let lang = null;
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'cs' || q === 'en') { lang = q; localStorage.setItem(STORE, q); }
  } catch (e) { /* no URL params or storage */ }
  if (!lang) { try { lang = localStorage.getItem(STORE); } catch (e) { lang = null; } }
  if (lang !== 'cs' && lang !== 'en') lang = /^(cs|sk)\b/i.test(navigator.language || '') ? 'cs' : 'en';

  const listeners = [];
  const originals = new Map();
  const origTitle = document.title;

  function t(s, vars) {
    let out = lang === 'cs' && has(s) ? DICT[s] : s;
    if (vars) out = String(out).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }

  const style = document.createElement('style');
  style.textContent = `
    .qa-lang { position: absolute; top: 12px; right: 12px; z-index: 40; display: flex; gap: 3px;
      padding: 3px; border: 1px solid #262058; border-radius: 8px; background: rgba(12,10,36,.85); }
    .qa-lang button { font-family: 'Press Start 2P', ui-monospace, monospace; font-size: 9px; color: #9690c6;
      background: transparent; border: 0; border-radius: 5px; padding: 6px 7px; cursor: pointer; }
    .qa-lang button:hover { color: #e8e5ff; }
    .qa-lang button.on { color: #05040f; background: #3ff4ff; }
    .qa-lang button:focus-visible { outline: 2px solid #3ff4ff; outline-offset: 1px; }
    /* Press Start 2P squeezes accents on capitals (Á, Í, Ú) into the glyph,
       so small Czech labels switch to the monospace font. */
    html:lang(cs) :is(.lbl, .seg button, .chip, .zbtn, .touch button, .go, .ghostbtn, .levels button, .play) {
      font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 700; letter-spacing: .04em; font-size: 11px;
    }
  `;
  document.head.appendChild(style);

  // The same goes for text the games draw on canvas: in Czech, a small
  // "Press Start 2P" font is swapped for bold JetBrains Mono.
  const fontDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
  if (fontDesc && fontDesc.set) {
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
      configurable: true,
      get() { return fontDesc.get.call(this); },
      set(v) {
        if (lang === 'cs' && typeof v === 'string') {
          const m = /(\d+(?:\.\d+)?)px\s+["']?Press Start 2P/.exec(v);
          if (m) v = `bold ${Math.round(+m[1] * 1.3 + 1)}px "JetBrains Mono", ui-monospace, monospace`;
        }
        fontDesc.set.call(this, v);
      },
    });
  }

  const toggle = document.createElement('div');
  toggle.className = 'qa-lang';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Jazyk / Language');
  toggle.innerHTML = '<button type="button" data-lang="cs" lang="cs" title="Česky">CS</button>'
    + '<button type="button" data-lang="en" lang="en" title="English">EN</button>';
  toggle.addEventListener('click', e => {
    const b = e.target.closest('[data-lang]');
    if (b) { setLang(b.dataset.lang); b.blur(); }
  });
  document.body.appendChild(toggle);

  function apply() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
      if (!originals.has(el)) originals.set(el, el.innerHTML);
      const k = el.dataset.i18n;
      el.innerHTML = lang === 'cs' && has(k) ? DICT[k] : originals.get(el);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      if (!originals.has(el)) originals.set(el, el.getAttribute('aria-label') || '');
      const k = el.dataset.i18nAria;
      el.setAttribute('aria-label', lang === 'cs' && has(k) ? DICT[k] : originals.get(el));
    });
    document.title = t(origTitle);
    for (const b of toggle.querySelectorAll('button')) {
      const on = b.dataset.lang === lang;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function setLang(l) {
    if ((l !== 'cs' && l !== 'en') || l === lang) return;
    lang = l;
    try { localStorage.setItem(STORE, l); } catch (e) { /* storage unavailable */ }
    apply();
    for (const fn of listeners) { try { fn(lang); } catch (e) { console.error(e); } }
  }

  apply();
  window.QA = {
    t,
    get lang() { return lang; },
    setLang,
    onChange(fn) { listeners.push(fn); },
  };
})();
