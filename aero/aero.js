/*
 * aero.js: Aero theme helpers for the Euro-Office editors (hooked in by apply-aero.py).
 * Accent picker: a small swatch button in the status bar (visible only with an
 * Aero Glass theme). The choice is stored in localStorage and applied as
 * <html data-aero-accent="...">; aero.css maps each name to colors.
 */
(function () {
    'use strict';

    var KEY = 'aero-accent';
    var PAPYRUS_KEY = 'aero-papyrus';
    var PAPYRUS_LABEL = 'Papyrus page';
    var ACCENTS = [
        { id: 'blue',     label: 'Theme default (sky blue; amber in Neutral)', color: '#3d8ee6' },
        { id: 'aqua',     label: 'Aqua',     color: '#20b2c4' },
        { id: 'emerald',  label: 'Emerald',  color: '#2eaa60' },
        { id: 'violet',   label: 'Violet',   color: '#8c6edc' },
        { id: 'rose',     label: 'Rose',     color: '#de5880' },
        { id: 'amber',    label: 'Amber',    color: '#eba028' },
        { id: 'graphite', label: 'Graphite', color: '#8c96a5' }
    ];

    function load() {
        try { return localStorage.getItem(KEY) || 'blue'; } catch (e) { return 'blue'; }
    }

    function papyrusOn() {
        try { return localStorage.getItem(PAPYRUS_KEY) === '1'; } catch (e) { return false; }
    }

    function isSepia() {
        return !!document.body && document.body.classList.contains('theme-aero-sepia');
    }

    function setPapyrus(on) {
        document.documentElement.classList.toggle('aero-papyrus', on);
        try { localStorage.setItem(PAPYRUS_KEY, on ? '1' : '0'); } catch (e) {}
        var cb = document.getElementById('aero-papyrus-cb');
        if (cb) cb.checked = on;
        syncDarkDocButton();
    }

    // In Sepia, the View tab's "Dark document" button (Document/PDF editors) becomes the
    // Papyrus toggle. The editor locks it in light-type themes, so keep it enabled.
    function syncDarkDocButton() {
        var slot = document.getElementById('slot-btn-dark-document');
        var btn = slot && slot.querySelector('button');
        if (!btn) return;
        var cap = btn.querySelector('.caption');
        if (isSepia()) {
            if (btn.dataset.aeroOrig === undefined) btn.dataset.aeroOrig = cap ? cap.textContent : '';
            if (cap && cap.textContent !== PAPYRUS_LABEL) cap.textContent = PAPYRUS_LABEL;
            if (btn.disabled) btn.disabled = false;
            if (btn.classList.contains('disabled')) btn.classList.remove('disabled');
            if (btn.classList.contains('active') !== papyrusOn()) btn.classList.toggle('active', papyrusOn());
            if (btn.title !== 'Tint the page a soft papyrus color') btn.title = 'Tint the page a soft papyrus color';
        } else if (btn.dataset.aeroOrig !== undefined) {
            if (cap) cap.textContent = btn.dataset.aeroOrig;
            delete btn.dataset.aeroOrig;
            btn.classList.remove('active');
            btn.title = '';
        }
    }

    function watchDarkDocButton() {
        var btnObs = null;
        var scheduled = false;
        function sync() {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(function () { scheduled = false; syncDarkDocButton(); });
        }
        function attach() {
            var btn = document.querySelector('#slot-btn-dark-document button');
            if (!btn || btnObs) return !!btn;
            btnObs = new MutationObserver(sync);
            btnObs.observe(btn, { attributes: true, attributeFilter: ['disabled', 'class'] });
            sync();
            return true;
        }
        if (!attach()) {
            var findObs = new MutationObserver(function () { if (attach()) findObs.disconnect(); });
            findObs.observe(document.body, { childList: true, subtree: true });
        }
        // Theme switches change <body> classes.
        new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        // Intercept the click before the editor's own handler (Sepia only).
        document.addEventListener('click', function (e) {
            if (!isSepia()) return;
            var slot = document.getElementById('slot-btn-dark-document');
            if (slot && slot.contains(e.target)) {
                e.stopImmediatePropagation();
                e.preventDefault();
                setPapyrus(!papyrusOn());
            }
        }, true);
    }

    function apply(id) {
        document.documentElement.setAttribute('data-aero-accent', id);
        try { localStorage.setItem(KEY, id); } catch (e) {}
        var sw = document.querySelectorAll('#aero-accent .aero-swatches button');
        for (var i = 0; i < sw.length; i++)
            sw[i].setAttribute('aria-pressed', String(sw[i].dataset.accent === id));
    }

    function buildPicker() {
        if (document.getElementById('aero-accent')) return;
        var root = document.createElement('div');
        root.id = 'aero-accent';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.title = 'Aero accent color';

        var panel = document.createElement('div');
        panel.className = 'aero-swatches';
        panel.hidden = true;
        var row = document.createElement('div');
        row.className = 'aero-panel-row';
        panel.appendChild(row);
        ACCENTS.forEach(function (a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.title = a.label;
            b.dataset.accent = a.id;
            b.style.setProperty('--sw', a.color);
            b.addEventListener('click', function () { apply(a.id); panel.hidden = true; });
            row.appendChild(b);
        });

        var check = document.createElement('label');
        check.className = 'aero-check';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'aero-papyrus-cb';
        cb.checked = papyrusOn();
        cb.addEventListener('change', function () { setPapyrus(cb.checked); });
        check.appendChild(cb);
        check.appendChild(document.createTextNode(PAPYRUS_LABEL));
        panel.appendChild(check);

        // The editor's own keyboard-shortcut dialog (view, assign and reset shortcuts).
        var keys = document.createElement('button');
        keys.type = 'button';
        keys.className = 'aero-panel-btn';
        keys.textContent = 'Keyboard shortcuts…';
        keys.addEventListener('click', function () {
            panel.hidden = true;
            var C = window.Common, api = window.Asc && window.Asc.editor;
            if (C && C.Views && C.Views.ShortcutsDialog && api) {
                new C.Views.ShortcutsDialog({ api: api }).show();
            } else {
                var file = document.querySelector('#file-menu-panel, .toolbar .tabs li[data-layout-name="toolbar-file"] a, #slot-btn-file');
                file && file.click();
            }
        });
        panel.appendChild(keys);

        var search = document.createElement('button');
        search.type = 'button';
        search.className = 'aero-panel-btn';
        search.textContent = 'Search commands…  (Ctrl+Q)';
        search.addEventListener('click', function () {
            panel.hidden = true;
            window.AeroCommandSearch && window.AeroCommandSearch.open();
        });
        panel.appendChild(search);

        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            panel.hidden = !panel.hidden;
        });
        document.addEventListener('mousedown', function (e) {
            if (!root.contains(e.target)) panel.hidden = true;
        }, true);

        root.appendChild(panel);
        root.appendChild(toggle);
        document.body.appendChild(root);
        apply(load());
        watchDarkDocButton();
    }

    // Apply saved settings immediately (before the UI renders) to avoid a flash.
    document.documentElement.setAttribute('data-aero-accent', load());
    document.documentElement.classList.toggle('aero-papyrus', papyrusOn());

    // The start page loads this with data-picker="off" (accent only, no swatch button).
    var script = document.currentScript;
    if (script && script.dataset.picker === 'off') return;

    if (document.body) buildPicker();
    else document.addEventListener('DOMContentLoaded', buildPicker);
})();
