/*
 * Clipboard History (Aero plugin). The recorder lives in aero/quality.js (every editor page)
 * and stores localStorage['aero-clipboard']; this panel lists the items (pinned first),
 * pastes them at the cursor with PasteText, and pins, deletes, pauses or clears.
 * Updates live through storage events.
 */
(function (window) {
    'use strict';

    var KEY = 'aero-clipboard', PAUSE_KEY = 'aero-clipboard-paused';
    var NAMES = { document: 'Document', spreadsheet: 'Spreadsheet', presentation: 'Presentation', pdf: 'PDF' };

    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
    function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} render(); }
    function paused() { try { return localStorage.getItem(PAUSE_KEY) === '1'; } catch (e) { return false; } }
    function ago(t) {
        var s = Math.round((Date.now() - t) / 1000);
        return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' :
               s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString();
    }

    function render() {
        var list = load(), q = $('search').value.trim().toLowerCase(), box = $('list');
        var p = paused();
        $('pause').textContent = p ? 'Resume history' : 'Pause history';
        $('pause').setAttribute('aria-pressed', String(p));
        $('state').textContent = p ? 'History is paused: new copies are not saved.' : list.length + ' item' + (list.length === 1 ? '' : 's');
        box.innerHTML = '';
        var shown = list.filter(function (x) { return !q || x.text.toLowerCase().indexOf(q) >= 0; })
            .sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });
        if (!shown.length) { box.appendChild(el('div', 'empty', q ? 'Nothing matches.' : 'Nothing copied yet.')); return; }
        shown.forEach(function (it) {
            var card = el('div', 'part');
            var head = el('div', 'name');
            head.appendChild(el('span', null, (it.pinned ? '📌 ' : '') + (NAMES[it.editor] || '')));
            head.appendChild(el('span', 'cat', ago(it.time)));
            card.appendChild(head);
            card.appendChild(el('div', 'preview', it.text));
            var actions = el('div', 'actions');
            [['Paste', function () { window.Asc.plugin.executeMethod('PasteText', [it.text]); }],
             [it.pinned ? 'Unpin' : 'Pin', function () {
                 save(load().map(function (x) { if (x.id === it.id) x.pinned = !x.pinned; return x; }));
             }],
             ['Delete', function () { save(load().filter(function (x) { return x.id !== it.id; })); }]
            ].forEach(function (a) {
                var b = el('button', 'btn-text-default', a[0]);
                b.type = 'button';
                b.setAttribute('aria-label', a[0] + ': ' + it.text.slice(0, 40));
                b.addEventListener('click', a[1]);
                actions.appendChild(b);
            });
            card.appendChild(actions);
            box.appendChild(card);
        });
    }

    window.Asc.plugin.init = function () {
        $('search').addEventListener('input', render);
        $('pause').addEventListener('click', function () {
            try { localStorage.setItem(PAUSE_KEY, paused() ? '0' : '1'); } catch (e) {}
            render();
        });
        $('clear').addEventListener('click', function () { save(load().filter(function (x) { return x.pinned; })); });
        window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === PAUSE_KEY) render(); });
        setInterval(render, 60000);                       // refresh "x min ago"
        render();
    };
    window.Asc.plugin.button = function () { this.executeCommand('close', ''); };
    window.Asc.plugin.onThemeChanged = function (theme) {
        window.Asc.plugin.onThemeChangedBase(theme);
        var r = document.documentElement.style;
        ['text-normal', 'text-secondary', 'background-normal', 'background-toolbar', 'border-divider',
         'border-regular-control', 'border-control-focus'].forEach(function (k) { if (theme[k]) r.setProperty('--' + k, theme[k]); });
    };
})(window);
