/*
 * settings.js: shared "Personalize" settings for the Euro-Office start page and editors.
 * Loaded before aero.js on every hooked page (apply-aero.py), after fonts-index.js.
 * Stores one JSON object in localStorage['aero-settings'] (file:// pages share storage),
 * applies the interface parts (font, text size, interface color, accessibility, glass
 * tuner) to the current page, and re-applies when another window changes them (storage
 * event) or when the theme changes (body class).
 *
 * Accent and papyrus keep their own keys ('aero-accent', 'aero-papyrus') used by aero.js.
 * Document defaults are applied to new blank files by the "Aero Defaults" system plugin.
 */
(function () {
    'use strict';

    var KEY = 'aero-settings';

    // Shown first in the interface-font menu; any installed or bundled font also works.
    var RECOMMENDED_UI_FONTS = ['Open Sans', 'Atkinson Hyperlegible', 'OpenDyslexic', 'Noto Sans', 'Segoe UI'];

    var DEFAULTS = {
        uiFont: 'Open Sans',
        textScale: 100,             // % of the interface's base font size
        uiColor: null,              // {hue, sat} for all Aero modes (Dark, Light, Neutral); null = each theme's own color
        reduceMotion: false,
        reduceTransparency: false,
        highContrast: false,
        strongFocus: false,
        tuner: {},                  // gloss, sheen, blur, radius, glow, speed; missing = theme default
        doc:   { font: 'Courier Prime', size: 11, paper: 'letter', margins: 'normal', lineSpacing: 1.15, spaceAfter: 8, applyToNew: true },
        sheet: { font: 'Arial', size: 11, applyToNew: true },
        slide: { size: '16:9', applyToNew: true },
        helper: { style: 'quill', model: '', useSelection: true, persona: '', pinned: null, v2: true },  // "Quill" AI helper: quill | orb | off
        // Local AI (Quill and the AI plugin via aero-ai.js). think: let "thinking" models reason
        // before answering (better, much slower). timeoutMin: stop waiting after this; 0 = never.
        // profile: how much memory the local AI may use (AI_PROFILES).
        ai: { think: false, timeoutMin: 10, profile: 'balanced' }
    };

    // Local AI resource profiles. Ollama ignores context size and keep-alive on the /v1 requests
    // the AI plugin sends, but reuses a model that is already loaded. So Quill (per request) and
    // aero-ai.js (by loading the model first) apply these to everything that uses Ollama.
    // Measured with qwen3.5:9b on a 10 GB GPU: 8k = 5.2 GB, 16k = 5.5 GB, 32k = 6.0 GB.
    var AI_PROFILES = {
        light:    { label: 'Light: short memory, frees the computer after 2 minutes', numCtx: 8192, keepAlive: '2m' },
        balanced: { label: 'Balanced: room for thinking, stays ready for 15 minutes', numCtx: 16384, keepAlive: '15m' },
        full:     { label: 'Full: long documents, stays ready for an hour', numCtx: 32768, keepAlive: '60m' }
    };
    // What Ollama should run with right now. Thinking needs room: at least 16k tokens.
    function aiRuntime(ai) {
        ai = ai || load().ai;
        var p = AI_PROFILES[ai.profile] || AI_PROFILES.balanced;
        return { numCtx: ai.think ? Math.max(p.numCtx, 16384) : p.numCtx, keepAlive: p.keepAlive };
    }

    // The editor's theme color tokens (web-apps Themes.js themeColorTokens). It copies these
    // as raw text to the canvas engine (asc_setSkin), which can't parse hsl()/calc().
    var COLOR_TOKENS = ["toolbar-header-document", "toolbar-header-spreadsheet", "toolbar-header-presentation", "toolbar-header-pdf", "toolbar-header-visio", "text-toolbar-header-on-background-document", "text-toolbar-header-on-background-spreadsheet", "text-toolbar-header-on-background-presentation", "text-toolbar-header-on-background-pdf", "text-toolbar-header-on-background-visio", "background-normal", "background-toolbar", "background-toolbar-tab", "background-toolbar-additional", "background-primary-dialog-button", "background-notification-popover", "background-notification-badge", "background-scrim", "background-loader", "background-accent-button", "background-contrast-popover", "background-alt-key-hint", "shadow-contrast-popover", "background-fill-button", "background-pane", "background-pane-additional", "highlight-button-hover", "highlight-button-pressed", "highlight-button-pressed-hover", "highlight-primary-dialog-button-hover", "highlight-primary-dialog-button-pressed", "highlight-header-button-hover", "highlight-header-button-pressed", "highlight-text-select", "highlight-fill-button-hover", "highlight-fill-button-pressed", "highlight-toolbar-tab-underline-document", "highlight-toolbar-tab-underline-spreadsheet", "highlight-toolbar-tab-underline-presentation", "highlight-toolbar-tab-underline-pdf", "highlight-toolbar-tab-underline-visio", "highlight-header-tab-underline-document", "highlight-header-tab-underline-spreadsheet", "highlight-header-tab-underline-presentation", "highlight-header-tab-underline-pdf", "highlight-header-tab-underline-visio", "highlight-comment-hover", "highlight-comment-pressed", "border-toolbar", "border-toolbar-active-panel-top", "border-toolbar-active-tab", "border-divider", "border-regular-control", "border-preview-hover", "border-preview-select", "border-control-focus", "border-color-shading", "border-contrast-popover", "border-button-pressed-focus", "text-normal", "text-normal-pressed", "text-secondary", "text-tertiary", "text-link", "text-link-hover", "text-link-active", "text-link-visited", "text-inverse", "text-toolbar-header", "text-contrast-background", "text-alt-key-hint", "icon-normal", "icon-normal-pressed", "icon-toolbar-header", "icon-success", "canvas-background", "canvas-content-background", "canvas-page-border", "canvas-ruler-background", "canvas-ruler-border", "canvas-ruler-margins-background", "canvas-ruler-mark", "canvas-ruler-handle-border", "canvas-ruler-handle-border-disabled", "canvas-high-contrast", "canvas-high-contrast-disabled", "canvas-cell-title-background", "canvas-cell-title-background-hover", "canvas-cell-title-background-selected", "canvas-cell-title-border", "canvas-cell-title-border-hover", "canvas-cell-title-border-selected", "canvas-cell-title-text", "canvas-dark-cell-title", "canvas-dark-cell-title-hover", "canvas-dark-cell-title-selected", "canvas-dark-cell-title-border", "canvas-dark-cell-title-border-hover", "canvas-dark-cell-title-border-selected", "canvas-scroll-thumb", "canvas-scroll-thumb-hover", "canvas-scroll-thumb-pressed", "canvas-scroll-thumb-border", "canvas-scroll-thumb-border-hover", "canvas-scroll-thumb-border-pressed", "canvas-scroll-arrow", "canvas-scroll-arrow-hover", "canvas-scroll-arrow-pressed", "canvas-scroll-thumb-target", "canvas-scroll-thumb-target-hover", "canvas-scroll-thumb-target-pressed", "canvas-sheet-view-cell-background", "canvas-sheet-view-cell-background-hover", "canvas-sheet-view-cell-background-pressed", "canvas-sheet-view-cell-title-label", "canvas-sheet-view-select-all-icon", "canvas-select-all-icon", "canvas-anim-pane-background", "canvas-anim-pane-item-fill-selected", "canvas-anim-pane-item-fill-hovered", "canvas-anim-pane-button-fill", "canvas-anim-pane-button-fill-hovered", "canvas-anim-pane-button-fill-disabled", "canvas-anim-pane-play-button-fill", "canvas-anim-pane-play-button-outline", "canvas-anim-pane-effect-bar-entrance-fill", "canvas-anim-pane-effect-bar-entrance-outline", "canvas-anim-pane-effect-bar-emphasis-fill", "canvas-anim-pane-effect-bar-emphasis-outline", "canvas-anim-pane-effect-bar-exit-fill", "canvas-anim-pane-effect-bar-exit-outline", "canvas-anim-pane-effect-bar-path-fill", "canvas-anim-pane-effect-bar-path-outline", "canvas-anim-pane-timeline-ruler-outline", "canvas-anim-pane-timeline-ruler-tick", "canvas-anim-pane-timeline-scroller-fill", "canvas-anim-pane-timeline-scroller-outline", "canvas-anim-pane-timeline-scroller-opacity", "canvas-anim-pane-timeline-scroller-opacity-hovered", "canvas-anim-pane-timeline-scroller-opacity-active", "toolbar-height-controls", "sprite-button-icons-uid"];

    var TUNER_UNITS = { gloss: '', sheen: '', blur: 'px', radius: 'px', glow: 'px', speed: 'ms' };

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    function merge(base, over) {
        var out = clone(base);
        Object.keys(over || {}).forEach(function (k) {
            if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object')
                out[k] = merge(base[k], over[k]);
            else out[k] = over[k];
        });
        return out;
    }

    function load() {
        var raw = null;
        try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
        raw = raw || {};
        // Earlier versions stored one color per mode: {dark: {...}, light: {...}}.
        if (raw.uiColor && raw.uiColor.hue === undefined)
            raw.uiColor = raw.uiColor.dark || raw.uiColor.light || null;
        // Quill became the default helper after the first prototype saved "orb": switch once.
        if (raw.helper && !raw.helper.v2) { raw.helper.style = 'quill'; raw.helper.v2 = true; }
        var out = merge(DEFAULTS, raw);
        if (!raw.uiColor) out.uiColor = null;
        return out;
    }

    function save(s) {
        try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
        apply(s);
    }

    // App root URL (…/desktopeditors/), from either the start page or an editor page.
    function appRoot() {
        var href = location.href.split('#')[0].split('?')[0];
        var i = href.indexOf('/editors/');
        return i >= 0 ? href.substring(0, i + 1) : href.substring(0, href.lastIndexOf('/') + 1);
    }

    // Bundled fonts aren't visible to the embedded browser, so load the chosen one on demand.
    function ensureFontFace(name) {
        var files = window.AERO_FONT_FILES && window.AERO_FONT_FILES[name];
        var tag = document.getElementById('aero-uifont-face');
        if (!files) { if (tag) tag.textContent = ''; return; }
        if (!tag) {
            tag = document.createElement('style');
            tag.id = 'aero-uifont-face';
            (document.head || document.documentElement).appendChild(tag);
        }
        var root = appRoot(), css = '';
        [['r', 400, 'normal'], ['b', 700, 'normal'], ['i', 400, 'italic'], ['bi', 700, 'italic']].forEach(function (v) {
            if (files[v[0]])
                css += '@font-face{font-family:"' + name.replace(/"/g, '') + '";src:url("' + root + encodeURI(files[v[0]]) +
                       '");font-weight:' + v[1] + ';font-style:' + v[2] + ';}';
        });
        tag.textContent = css;
    }

    function fontStack(name) {
        return '"' + String(name || 'Open Sans').replace(/"/g, '') + '", "Open Sans", "Segoe UI", Arial, sans-serif';
    }

    function themeMode() {
        var b = document.body;
        if (!b) return null;
        if (b.classList.contains('theme-aero-dark') || b.classList.contains('theme-matte-dark')) return 'dark';
        if (b.classList.contains('theme-aero-light') || b.classList.contains('theme-matte-light')) return 'light';
        if (b.classList.contains('theme-aero-sepia')) return 'sepia';     // shown as "Aero Glass Neutral"
        return null;
    }

    function apply(s) {
        s = s || load();
        var html = document.documentElement;
        html.classList.toggle('aero-reduce-motion', !!s.reduceMotion);
        html.classList.toggle('aero-reduce-transparency', !!s.reduceTransparency);
        html.classList.toggle('aero-high-contrast', !!s.highContrast);
        html.classList.toggle('aero-strong-focus', !!s.strongFocus);

        var body = document.body;
        if (!body) return;
        // Inline custom properties on <body> outrank the theme's variable blocks.
        if (s.uiFont === 'Segoe UI (system)') s.uiFont = 'Segoe UI';
        ensureFontFace(s.uiFont);
        body.style.setProperty('--font-family-base', fontStack(s.uiFont));
        body.style.setProperty('--font-family-base-custom', fontStack(s.uiFont));
        var scale = Math.max(80, Math.min(160, +s.textScale || 100)) / 100;
        if (scale !== 1) body.style.setProperty('--font-size-base', Math.round(12 * scale) + 'px');
        else body.style.removeProperty('--font-size-base');

        Object.keys(TUNER_UNITS).forEach(function (k) {
            var v = s.tuner ? s.tuner[k] : undefined;
            if (v === undefined || v === null || v === '') body.style.removeProperty('--aero-' + k);
            else body.style.setProperty('--aero-' + k, v + TUNER_UNITS[k]);
        });

        applyInterfaceColor(s);
    }

    // ── Interface color ─────────────────────────────────────────────────────────
    // The theme CSS holds plain colors (the editor's canvas engine only parses #hex/rgb()).
    // For a chosen interface color, every base color of the current Aero mode (palette.js,
    // generated from the CSS) is hue-shifted in JS, keeping its saturation and lightness,
    // and inlined on <body> as #hex/rgba. Editors then get the new skin via asc_setSkin.
    function parseColor(v) {
        var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
        if (m) {
            var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
            return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16), null];
        }
        m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v);
        return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? null : +m[4]] : null;
    }
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0, d = max - min;
        if (d) {
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= 60;
        }
        return [h, s, l];
    }
    function hslToRgb(h, s, l) {
        h = ((h % 360) + 360) % 360 / 360;
        function f(p, q, t) {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
        }
        if (!s) return [l * 255, l * 255, l * 255].map(Math.round);
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        return [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)].map(function (x) { return Math.round(x * 255); });
    }
    function shiftColor(value, dh, satf) {
        var c = parseColor(value);
        if (!c) return value;
        var hsl = rgbToHsl(c[0], c[1], c[2]);
        if (hsl[1] < 0.08) return value;                  // neutral (white/black/grey): keep
        var rgb = hslToRgb(hsl[0] + dh, Math.min(1, hsl[1] * satf), hsl[2]);
        if (c[3] !== null) return 'rgba(' + rgb.join(', ') + ', ' + c[3] + ')';
        return '#' + rgb.map(function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    }

    var inlined = [];
    var skinCustomized = false;
    function applyInterfaceColor(s) {
        var body = document.body;
        if (!body) return;
        inlined.forEach(function (n) { body.style.removeProperty(n); });
        inlined = [];
        var mode = themeMode(), pal = window.AERO_PALETTE;
        var c = mode ? s.uiColor : null;
        var page = /\/editors\//.test(location.pathname) ? 'editor' : 'start';
        var custom = !!(mode && c && c.hue !== undefined && c.hue !== null && pal && pal.base);
        var dh = custom ? c.hue - pal.base[mode] : 0, satf = custom && c.sat !== undefined ? c.sat : 1;
        if (custom && pal[page] && pal[page][mode]) {
            var map = pal[page][mode];
            Object.keys(map).forEach(function (n) {
                body.style.setProperty(n, shiftColor(map[n], dh, satf));
                inlined.push(n);
            });
        }
        sendNativeColors(custom, dh, satf);
        // Send the editor's canvas the current colors when a custom color is (or was) active.
        if (page === 'editor' && (inlined.length || skinCustomized)) {
            skinCustomized = inlined.length > 0;
            sendSkin();
        }
    }

    // The desktop window's own tab strip and window bar (Qt) take their colors from the theme
    // file. Send them the same hue shift (aero:colors, added to cascapplicationmanagerwrapper.cpp);
    // with no custom color the theme's own colors go back. Only for our themes; sent on change only.
    var lastNative = null;
    function sendNativeColors(custom, dh, satf) {
        var D = window.AscDesktopEditor, pal = window.AERO_PALETTE;
        if (!D || typeof D.execCommand !== 'function' || !pal || !pal.native || !document.body) return;
        var id = (document.body.className.match(/\btheme-(?!type-)[\w-]+/) || [''])[0];
        var base = pal.native[id];
        if (!base) return;
        var colors = {};
        Object.keys(base).forEach(function (n) { colors[n] = custom ? shiftColor(base[n], dh, satf) : base[n]; });
        var msg = JSON.stringify({ theme: id, colors: colors });
        if (msg === lastNative) return;
        lastNative = msg;
        try { D.execCommand('aero:colors', msg); } catch (e) {}
    }

    function sendSkin() {
        var api = window.Asc && window.Asc.editor;
        if (!api || typeof api.asc_setSkin !== 'function' || !document.body) return;
        var cs = getComputedStyle(document.body), skin = {};
        COLOR_TOKENS.forEach(function (n) {
            var v = cs.getPropertyValue('--' + n).trim();
            if (v) skin[n] = v;
        });
        var id = (document.body.className.match(/\btheme-(?!type-)[\w-]+/) || [''])[0];
        skin.name = id;
        skin.type = themeMode() === 'dark' ? 'dark' : 'light';
        try { api.asc_setSkin(skin); } catch (e) {}
    }

    function applyAccentAndPapyrus() {
        var accent = 'blue', pap = false;
        try { accent = localStorage.getItem('aero-accent') || 'blue'; pap = localStorage.getItem('aero-papyrus') === '1'; } catch (e) {}
        document.documentElement.setAttribute('data-aero-accent', accent);
        document.documentElement.classList.toggle('aero-papyrus', pap);
    }

    // All font family names the editors know (installed + bundled), sorted. The editors
    // already have __fonts_infos; the start page loads the editors' AllFonts.js once.
    function listFonts(cb) {
        function done() {
            var names = {};
            (window.__fonts_infos || []).forEach(function (f) { if (f && f[0]) names[f[0]] = 1; });
            Object.keys(window.AERO_FONT_FILES || {}).forEach(function (n) { names[n] = 1; });
            cb(Object.keys(names).sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; }));
        }
        if (window.__fonts_infos) return done();
        var sc = document.createElement('script');
        sc.src = appRoot() + 'editors/sdkjs/common/AllFonts.js';
        sc.onload = sc.onerror = done;
        (document.head || document.documentElement).appendChild(sc);
    }

    window.AeroSettings = {
        KEY: KEY, DEFAULTS: DEFAULTS, TUNER_UNITS: TUNER_UNITS, RECOMMENDED_UI_FONTS: RECOMMENDED_UI_FONTS,
        load: load, save: save, apply: apply, listFonts: listFonts, themeMode: themeMode,
        AI_PROFILES: AI_PROFILES, aiRuntime: aiRuntime,
        reset: function () { save(clone(DEFAULTS)); }
    };

    apply();
    function onBody() {
        apply();
        // Theme switches change <body> classes; re-apply the per-mode interface color.
        new MutationObserver(function () { apply(); })
            .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    if (document.body) onBody(); else document.addEventListener('DOMContentLoaded', onBody);

    // Editors: re-send the resolved colors once the document has loaded (the editor may
    // have pushed its skin before our inline colors existed).
    var tries = 0;
    (function waitEditor() {
        var api = window.Asc && window.Asc.editor;
        if (api && typeof api.asc_registerCallback === 'function') {
            api.asc_registerCallback('asc_onDocumentContentReady', function () { setTimeout(function () { if (skinCustomized) sendSkin(); }, 50); });
        } else if (/\/editors\//.test(location.pathname) && ++tries < 600) {
            setTimeout(waitEditor, 100);
        }
    })();

    // Changes made in another window (start page <-> editors) arrive as storage events.
    window.addEventListener('storage', function (e) {
        if (e.key === KEY) apply();
        else if (e.key === 'aero-accent' || e.key === 'aero-papyrus') applyAccentAndPapyrus();
    });
})();
