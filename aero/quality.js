/*
 * quality.js: quality-of-life features for the Euro-Office editors (hooked by apply-aero.py).
 *
 * Command search ("Tell me what you want to do"): Ctrl+Q opens a search box that finds
 * any ribbon command on any tab (by caption or tooltip), plus a few Aero actions, and runs
 * it: it switches to the command's tab, then clicks the button. Keyboard: ↑/↓, Enter, Esc.
 * (Alt+Q / Ctrl+Alt+Q are the editors' chat shortcuts, so plain Ctrl+Q is used.)
 */
(function () {
    'use strict';

    var root = null, input = null, list = null, results = [], active = 0;

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function clean(t) { return String(t || '').replace(/\s+/g, ' ').replace(/[…:]+$/, '').trim(); }

    // ── Index ─────────────────────────────────────────────────────────────────
    function extraActions() {
        var out = [];
        out.push({ label: 'Papyrus page (warm paper tone)', tab: 'Aero', run: function () {
            var on = !document.documentElement.classList.contains('aero-papyrus');
            document.documentElement.classList.toggle('aero-papyrus', on);
            try { localStorage.setItem('aero-papyrus', on ? '1' : '0'); } catch (e) {}
        } });
        out.push({ label: 'Focus mode (hide toolbar and panels)  F11', tab: 'Aero', run: function () { window.AeroQuick.focus(); } });
        out.push({ label: 'Reading ruler (line focus)  Ctrl+Shift+E', tab: 'Aero', run: function () { window.AeroQuick.ruler(); } });
        out.push({ label: 'Immersive reader (read aloud, focus)  Ctrl+Shift+I', tab: 'Aero', run: function () { window.AeroQuick.immersive(); } });
        out.push({ label: 'Keyboard shortcuts (view and assign)', tab: 'Aero', run: function () {
            var C = window.Common, api = window.Asc && window.Asc.editor;
            if (C && C.Views && C.Views.ShortcutsDialog && api) new C.Views.ShortcutsDialog({ api: api }).show();
        } });
        return out;
    }

    function buildIndex() {
        var tabs = {};
        [].forEach.call(document.querySelectorAll('.toolbar .tabs li.ribtab > a[data-tab]'), function (a) {
            if (a.parentNode.offsetParent !== null || a.parentNode.style.display !== 'none')
                tabs[a.getAttribute('data-tab')] = { name: clean(a.getAttribute('data-title') || a.textContent), a: a };
        });
        var seen = {}, items = [];
        [].forEach.call(document.querySelectorAll('section.panel[data-tab]'), function (panel) {
            var tabId = panel.getAttribute('data-tab'), tab = tabs[tabId];
            if (!tab) return;
            [].forEach.call(panel.querySelectorAll('button'), function (b) {
                var cap = b.querySelector('.caption');
                var label = clean(b.getAttribute('aria-label') || (cap && cap.textContent) || b.getAttribute('title'));
                if (!label || label.length < 2) return;
                var key = tabId + '|' + label.toLowerCase();
                if (seen[key]) return;
                seen[key] = 1;
                items.push({ label: label, tab: tab.name, tabEl: tab.a, button: b });
            });
        });
        return items.concat(extraActions());
    }

    // ── Matching ─────────────────────────────────────────────────────────────
    function score(item, q) {
        var l = item.label.toLowerCase();
        if (!q) return 1;
        if (l === q) return 100;
        if (l.indexOf(q) === 0) return 80;
        if (new RegExp('\\b' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(l)) return 60;
        if (l.indexOf(q) >= 0) return 40;
        var words = q.split(' ').filter(Boolean);
        if (words.length > 1 && words.every(function (w) { return l.indexOf(w) >= 0; })) return 30;
        var i = 0;                                       // subsequence ("tbl cnt" → table of contents)
        for (var k = 0; k < l.length && i < q.length; k++) if (l[k] === q[i]) i++;
        return i === q.length ? 10 : 0;
    }

    function isDisabled(item) {
        var b = item.button;
        return !!b && (b.disabled || b.classList.contains('disabled'));
    }

    // ── Running ──────────────────────────────────────────────────────────────
    function run(item) {
        close();
        if (item.run) { item.run(); return; }
        if (isDisabled(item)) return;
        var needTab = item.tabEl && !item.tabEl.parentNode.classList.contains('active');
        if (needTab) item.tabEl.click();
        setTimeout(function () {
            item.button.focus && item.button.focus();
            item.button.click();
        }, needTab ? 120 : 0);
    }

    // ── UI ───────────────────────────────────────────────────────────────────
    function render() {
        var q = input.value.trim().toLowerCase();
        var index = buildIndex();
        results = index.map(function (it) { return { it: it, s: score(it, q) }; })
            .filter(function (r) { return r.s > 0; })
            .sort(function (a, b) { return b.s - a.s || a.it.label.length - b.it.label.length; })
            .slice(0, 14).map(function (r) { return r.it; });
        active = 0;
        list.innerHTML = '';
        results.forEach(function (it, i) {
            var li = el('li', 'aero-cmd-item' + (isDisabled(it) ? ' disabled' : ''));
            li.id = 'aero-cmd-opt-' + i;
            li.setAttribute('role', 'option');
            li.appendChild(el('span', 'aero-cmd-label', it.label));
            li.appendChild(el('span', 'aero-cmd-tab', it.tab));
            li.addEventListener('mousedown', function (e) { e.preventDefault(); run(it); });
            li.addEventListener('mousemove', function () { setActive(i); });
            list.appendChild(li);
        });
        if (!results.length) list.appendChild(el('li', 'aero-cmd-empty', 'No matching commands'));
        setActive(0);
    }

    function setActive(i) {
        var items = list.querySelectorAll('.aero-cmd-item');
        if (!items.length) { input.removeAttribute('aria-activedescendant'); return; }
        active = Math.max(0, Math.min(items.length - 1, i));
        [].forEach.call(items, function (li, k) { li.setAttribute('aria-selected', String(k === active)); });
        input.setAttribute('aria-activedescendant', items[active].id);
        items[active].scrollIntoView({ block: 'nearest' });
    }

    function build() {
        root = el('div');
        root.id = 'aero-cmd';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-label', 'Search commands');
        root.hidden = true;
        var box = el('div', 'aero-cmd-box');
        input = el('input', 'aero-cmd-input');
        input.type = 'text';
        input.placeholder = 'Tell me what you want to do…  (e.g. table of contents, page border)';
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-expanded', 'true');
        input.setAttribute('aria-controls', 'aero-cmd-list');
        input.setAttribute('aria-autocomplete', 'list');
        list = el('ul', 'aero-cmd-list');
        list.id = 'aero-cmd-list';
        list.setAttribute('role', 'listbox');
        box.appendChild(input);
        box.appendChild(list);
        box.appendChild(el('div', 'aero-cmd-hint', '↑ ↓ to choose · Enter to run · Esc to close'));
        root.appendChild(box);
        document.body.appendChild(root);

        input.addEventListener('input', render);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') { setActive(active + 1); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { setActive(active - 1); e.preventDefault(); }
            else if (e.key === 'Enter') { if (results[active]) run(results[active]); e.preventDefault(); }
            else if (e.key === 'Escape') { close(); e.preventDefault(); }
            e.stopPropagation();
        });
        root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    }

    function open() {
        if (!root) build();
        root.hidden = false;
        var api = window.Asc && window.Asc.editor;       // keep typing out of the document
        try { api && api.asc_enableKeyEvents && api.asc_enableKeyEvents(false); } catch (e) {}
        input.value = '';
        render();
        setTimeout(function () { input.focus(); }, 0);
    }

    function close() {
        if (!root || root.hidden) return;
        root.hidden = true;
        var api = window.Asc && window.Asc.editor;       // give the keyboard back to the document
        try { api && api.asc_enableKeyEvents && api.asc_enableKeyEvents(true); } catch (e) {}
    }

    // Find the best command for a phrase (used by the AI helper's action buttons).
    function findCommand(q) {
        q = String(q || '').trim().toLowerCase();
        if (!q) return null;
        var best = null, bestScore = 0;
        buildIndex().forEach(function (it) {
            var s = score(it, q);
            if (s > bestScore || (s === bestScore && best && it.label.length < best.label.length)) { best = it; bestScore = s; }
        });
        return bestScore >= 30 ? best : null;
    }

    window.AeroCommandSearch = { open: open, close: close, find: findCommand, run: function (it) { if (it) run(it); } };

    // ── Focus mode (F11 or Ctrl+Shift+F; Esc exits) ────────────────────────────
    // Switches off the View tab's own toggles (toolbar, status bar, side panels, rulers,
    // formula bar…) so the editor re-lays itself out, and restores exactly what was on.
    var FOCUS_LABELS = ['always show toolbar', 'status bar', 'left panel', 'right panel', 'rulers', 'formula bar', 'headings'];
    var focusRestore = null;

    function viewCheckboxes() {
        var out = [];
        [].forEach.call(document.querySelectorAll('section.panel[data-tab="view"] label.checkbox-indeterminate'), function (lab) {
            var input = lab.querySelector('input.checkbox__native');
            var shape = lab.querySelector('.checkbox__shape');
            var text = input && document.getElementById(input.id + '-description');
            var name = clean(text ? text.textContent : lab.textContent).toLowerCase();
            if (input && shape && FOCUS_LABELS.indexOf(name) >= 0) out.push({ name: name, input: input, shape: shape });
        });
        return out;
    }

    function setFocus(on) {
        if (on === !!focusRestore) return;
        if (on) {
            focusRestore = [];
            viewCheckboxes().forEach(function (c) {
                if (c.input.checked && !c.input.disabled) { focusRestore.push(c.name); c.shape.click(); }
            });
        } else {
            var names = focusRestore || [];
            focusRestore = null;
            viewCheckboxes().forEach(function (c) {
                if (names.indexOf(c.name) >= 0 && !c.input.checked) c.shape.click();
            });
        }
        document.documentElement.classList.toggle('aero-focus', on);
        syncToggles();
    }

    // ── Reading ruler (Ctrl+Shift+E) ─────────────────────────────────────────
    // A soft band that follows the text cursor (or the mouse) and dims the rest of the page.
    var ruler = null, rulerY = null;
    function placeRuler() {
        if (!ruler) return;
        var sdk = document.getElementById('editor_sdk');
        if (!sdk) return;
        var r = sdk.getBoundingClientRect();
        ruler.style.left = r.left + 'px'; ruler.style.top = r.top + 'px';
        ruler.style.width = r.width + 'px'; ruler.style.height = r.height + 'px';
        var band = ruler.firstChild, h = 44;
        var y = rulerY === null ? r.height / 3 : rulerY - r.top;
        band.style.top = Math.max(0, Math.min(r.height - h, y - h / 2)) + 'px';
        band.style.height = h + 'px';
    }
    function followCaret() {
        var c = document.getElementById('id_target_cursor');
        if (c && c.offsetParent) {
            var cr = c.getBoundingClientRect();
            if (cr.height) { rulerY = cr.top + cr.height / 2; placeRuler(); }
        }
    }
    function setRuler(on) {
        if (on === !!ruler) return;
        if (on) {
            ruler = el('div');
            ruler.id = 'aero-reading-ruler';
            ruler.setAttribute('aria-hidden', 'true');
            ruler.appendChild(el('div', 'aero-ruler-band'));
            document.body.appendChild(ruler);
            placeRuler();
        } else {
            ruler.parentNode.removeChild(ruler);
            ruler = null;
        }
        syncToggles();
    }
    window.addEventListener('mousemove', function (e) {
        if (!ruler) return;
        var sdk = document.getElementById('editor_sdk');
        if (!sdk) return;
        var r = sdk.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            rulerY = e.clientY; placeRuler();
        }
    }, true);
    window.addEventListener('keyup', function () { if (ruler) setTimeout(followCaret, 0); }, true);
    window.addEventListener('mouseup', function () { if (ruler) setTimeout(followCaret, 0); }, true);
    window.addEventListener('resize', function () { placeRuler(); });

    // ── Clipboard history recorder ────────────────────────────────────────────
    // Scripts can't read clipboard data during a copy, so on copy/cut ask the editor for the
    // selected text. The Clipboard History plugin shows and re-inserts the items.
    // localStorage['aero-clipboard'] = [{id, text, time, editor, pinned}], newest first;
    // 'aero-clipboard-paused' = '1' pauses recording.
    var CLIP_KEY = 'aero-clipboard', CLIP_MAX = 30, CLIP_MAX_LEN = 20000;
    function editorKind() {
        var p = location.pathname;
        return /spreadsheeteditor/.test(p) ? 'spreadsheet' : /presentationeditor/.test(p) ? 'presentation' :
               /pdfeditor/.test(p) ? 'pdf' : 'document';
    }
    function recordCopy() {
        try { if (localStorage.getItem('aero-clipboard-paused') === '1') return; } catch (e) { return; }
        var api = window.Asc && window.Asc.editor, text = '';
        try { text = api && api.asc_GetSelectedText ? String(api.asc_GetSelectedText() || '') : ''; } catch (e) {}
        if (!text.trim() || text.length > CLIP_MAX_LEN) return;
        var list = [];
        try { list = JSON.parse(localStorage.getItem(CLIP_KEY) || '[]'); } catch (e) {}
        var old = list.filter(function (x) { return x.text === text; })[0];
        list = list.filter(function (x) { return x.text !== text; });
        list.unshift({ id: Date.now().toString(36), text: text, time: Date.now(), editor: editorKind(), pinned: !!(old && old.pinned) });
        var pinned = list.filter(function (x) { return x.pinned; }), rest = list.filter(function (x) { return !x.pinned; });
        list = list.filter(function (x) { return x.pinned || rest.indexOf(x) < CLIP_MAX; });
        try { localStorage.setItem(CLIP_KEY, JSON.stringify(list)); } catch (e) {}
    }
    ['copy', 'cut'].forEach(function (t) {
        document.addEventListener(t, function () { setTimeout(recordCopy, 0); }, true);
    });

    // ── Immersive reader (Ctrl+Shift+I; Esc exits) ────────────────────────────
    // Focus mode + reading ruler + papyrus page + larger zoom, with a floating bar for
    // Read aloud (Windows voices via speechSynthesis), text size and Exit. Restores all on exit.
    var immersive = null, bar = null;
    function zoomApi() { var a = window.Asc && window.Asc.editor; return a && typeof a.zoom === 'function' ? a : null; }
    function currentZoom() {
        var l = document.querySelector('#label-zoom, #status-label-zoom');
        var m = l && /(\d+)\s*%/.exec(l.textContent);
        return m ? +m[1] : null;
    }
    function speak(btn) {
        var synth = window.speechSynthesis;
        if (!synth) { btn.textContent = 'Read aloud unavailable'; return; }
        if (synth.speaking) { synth.cancel(); btn.textContent = 'Read aloud'; return; }
        var a = window.Asc && window.Asc.editor, text = '';
        try { text = a && a.asc_GetSelectedText ? (a.asc_GetSelectedText() || '') : ''; } catch (e) {}
        if (!text.trim()) { btn.textContent = 'Select text first (Ctrl+A = all)'; setTimeout(function () { btn.textContent = 'Read aloud'; }, 2500); return; }
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 0.95;
        u.onend = u.onerror = function () { btn.textContent = 'Read aloud'; };
        synth.speak(u);
        btn.textContent = 'Stop reading';
    }
    function setImmersive(on) {
        if (on === !!immersive) return;
        var html = document.documentElement;
        if (on) {
            immersive = { focus: !!focusRestore, ruler: !!ruler, papyrus: html.classList.contains('aero-papyrus'), zoom: currentZoom() };
            setFocus(true);
            setRuler(true);
            html.classList.add('aero-papyrus');
            var z = zoomApi();
            if (z && (immersive.zoom || 100) < 130) { try { z.zoom(130); } catch (e) {} }
            bar = el('div');
            bar.id = 'aero-immersive';
            bar.setAttribute('role', 'toolbar');
            bar.setAttribute('aria-label', 'Immersive reader');
            bar.appendChild(el('span', 'aero-imm-title', 'Immersive reader'));
            function btn(text, tip, fn) {
                var b = el('button', 'aero-imm-btn', text);
                b.type = 'button'; b.title = tip; b.setAttribute('aria-label', tip);
                b.addEventListener('click', function () { fn(b); });
                bar.appendChild(b);
                return b;
            }
            btn('Read aloud', 'Read the selected text aloud', speak);
            btn('A−', 'Smaller text', function () { var z2 = zoomApi(); z2 && z2.zoomOut(); });
            btn('A+', 'Larger text', function () { var z2 = zoomApi(); z2 && z2.zoomIn(); });
            btn('Exit', 'Exit immersive reader (Esc)', function () { setImmersive(false); });
            document.body.appendChild(bar);
        } else {
            var s = immersive;
            immersive = null;
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (bar) { bar.parentNode.removeChild(bar); bar = null; }
            setRuler(s.ruler);
            setFocus(s.focus);
            html.classList.toggle('aero-papyrus', s.papyrus);
            var z = zoomApi();
            if (z && s.zoom) { try { z.zoom(s.zoom); } catch (e) {} }
        }
        syncToggles();
    }

    // ── Toggles API (orb popover, command search) ────────────────────────────
    var toggleListeners = [];
    function syncToggles() { toggleListeners.forEach(function (f) { try { f(); } catch (e) {} }); }
    window.AeroQuick = {
        focus: function (v) { setFocus(v === undefined ? !focusRestore : v); },
        ruler: function (v) { setRuler(v === undefined ? !ruler : v); },
        immersive: function (v) { setImmersive(v === undefined ? !immersive : v); },
        isImmersive: function () { return !!immersive; },
        isFocus: function () { return !!focusRestore; },
        isRuler: function () { return !!ruler; },
        onChange: function (f) { toggleListeners.push(f); }
    };

    // Shortcuts: F11 / Ctrl+Shift+F = focus mode, Ctrl+Shift+E = reading ruler, Esc leaves focus mode.
    window.addEventListener('keydown', function (e) {
        var k = e.code || '';
        if ((k === 'F11' && !e.ctrlKey && !e.altKey && !e.shiftKey) ||
            (e.ctrlKey && e.shiftKey && !e.altKey && k === 'KeyF')) {
            e.preventDefault(); e.stopPropagation(); setFocus(!focusRestore);
        } else if (e.ctrlKey && e.shiftKey && !e.altKey && k === 'KeyE') {
            e.preventDefault(); e.stopPropagation(); setRuler(!ruler);
        } else if (e.ctrlKey && e.shiftKey && !e.altKey && k === 'KeyI') {
            e.preventDefault(); e.stopPropagation(); setImmersive(!immersive);
        } else if (k === 'Escape' && immersive && !(root && !root.hidden)) {
            setImmersive(false);
        } else if (k === 'Escape' && focusRestore && !(root && !root.hidden) &&
                   !document.querySelector('.asc-window.modal:not(.hidden), .dropdown-menu:not(.hidden)[style*="display: block"]')) {
            setFocus(false);
        }
    }, true);

    // Ctrl+Q anywhere in the editor (capture phase, before the editor's own handlers).
    window.addEventListener('keydown', function (e) {
        if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey && (e.code === 'KeyQ' || e.keyCode === 81)) {
            e.preventDefault();
            e.stopPropagation();
            if (root && !root.hidden) close(); else open();
        }
    }, true);
})();
