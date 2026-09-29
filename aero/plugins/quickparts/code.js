/*
 * Quick Parts (Aero plugin): a library of reusable text (signatures, greetings, closings,
 * transitions, phrases) inserted at the cursor with PasteText, plus "My dictionary" for
 * custom spelling words (asc_spellCheckAddToDictionary / AscDesktopEditor.SpellCheck clear).
 * Parts and the word list live in localStorage (shared by all editors on file:// pages).
 */
(function (window) {
    'use strict';

    var PARTS_KEY = 'aero-quickparts', WORDS_KEY = 'aero-dictionary';
    var CATEGORIES = ['Signatures', 'Greetings', 'Closings', 'Transitions', 'Phrases'];
    var STARTER = [
        ['Signatures', 'Formal signature', 'Best regards,\n[Your Name]\n[Title] | [Company]\n[Phone] · [Email]'],
        ['Signatures', 'Sincerely', 'Sincerely,\n[Your Name]'],
        ['Signatures', 'Quick thanks', 'Thanks,\n[First Name]'],
        ['Greetings', 'Dear…', 'Dear [Name],'],
        ['Greetings', 'Hello…', 'Hello [Name],'],
        ['Greetings', 'To whom it may concern', 'To whom it may concern,'],
        ['Greetings', 'Hi team', 'Hi team,'],
        ['Closings', 'Questions welcome', 'Please let me know if you have any questions.'],
        ['Closings', 'Look forward', 'I look forward to hearing from you.'],
        ['Closings', 'Thank you for your time', 'Thank you for your time and consideration.'],
        ['Closings', 'Kind regards', 'Kind regards,'],
        ['Transitions', 'In addition', 'In addition, '],
        ['Transitions', 'However', 'However, '],
        ['Transitions', 'As a result', 'As a result, '],
        ['Transitions', 'For example', 'For example, '],
        ['Transitions', 'On the other hand', 'On the other hand, '],
        ['Transitions', 'Furthermore', 'Furthermore, '],
        ['Transitions', 'Meanwhile', 'Meanwhile, '],
        ['Transitions', 'In conclusion', 'In conclusion, '],
        ['Phrases', 'Please find attached', 'Please find attached '],
        ['Phrases', 'As discussed', 'As discussed, '],
        ['Phrases', 'Following up', 'Following up on our conversation, '],
        ['Phrases', 'At your convenience', 'at your earliest convenience']
    ];

    var parts = [], words = [], cat = 'All', editing = null;

    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function load(key, fallback) {
        try { var v = JSON.parse(localStorage.getItem(key) || 'null'); return v || fallback; } catch (e) { return fallback; }
    }
    function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function parentApi() { try { return window.parent.Asc.editor; } catch (e) { return null; } }

    // ── Parts ─────────────────────────────────────────────────────────────────
    function insert(text) { window.Asc.plugin.executeMethod('PasteText', [text]); }

    function renderCats() {
        var box = $('cats');
        box.innerHTML = '';
        ['All'].concat(CATEGORIES).forEach(function (c) {
            var b = el('button', null, c);
            b.type = 'button';
            b.setAttribute('aria-pressed', String(c === cat));
            b.addEventListener('click', function () { cat = c; renderCats(); renderList(); });
            box.appendChild(b);
        });
    }

    function renderList() {
        var q = $('search').value.trim().toLowerCase(), box = $('list');
        box.innerHTML = '';
        var shown = parts.filter(function (p) {
            return (cat === 'All' || p.cat === cat) &&
                   (!q || p.name.toLowerCase().indexOf(q) >= 0 || p.text.toLowerCase().indexOf(q) >= 0);
        });
        if (!shown.length) { box.appendChild(el('div', 'empty', 'No parts here yet.')); return; }
        shown.forEach(function (p) {
            var card = el('div', 'part');
            var name = el('div', 'name');
            name.appendChild(el('span', null, p.name));
            name.appendChild(el('span', 'cat', p.cat));
            card.appendChild(name);
            card.appendChild(el('div', 'preview', p.text));
            var actions = el('div', 'actions');
            [['Insert', function () { insert(p.text); }],
             ['Edit', function () { openEditor(p); }],
             ['Delete', function () {
                 parts = parts.filter(function (x) { return x.id !== p.id; });
                 save(PARTS_KEY, parts); renderList();
             }]].forEach(function (a) {
                var b = el('button', 'btn-text-default', a[0]);
                b.type = 'button';
                b.setAttribute('aria-label', a[0] + ' ' + p.name);
                b.addEventListener('click', a[1]);
                actions.appendChild(b);
            });
            card.appendChild(actions);
            box.appendChild(card);
        });
    }

    function openEditor(p, text) {
        editing = p || null;
        $('ed-cat').value = p ? p.cat : (cat !== 'All' ? cat : 'Phrases');
        $('ed-name').value = p ? p.name : '';
        $('ed-text').value = p ? p.text : (text || '');
        $('editor').hidden = false;
        $('ed-name').focus();
    }

    function saveEditor(e) {
        e.preventDefault();
        var name = $('ed-name').value.trim(), text = $('ed-text').value;
        if (!name || !text.trim()) return;
        if (editing) {
            editing.cat = $('ed-cat').value; editing.name = name; editing.text = text;
        } else {
            parts.push({ id: uid(), cat: $('ed-cat').value, name: name, text: text });
        }
        save(PARTS_KEY, parts);
        $('editor').hidden = true;
        renderList();
    }

    function fromSelection() {
        window.Asc.plugin.executeMethod('GetSelectedText', [{ Numbering: false, Math: false, TableCellSeparator: '\t',
            ParaSeparator: '\n', TabSymbol: '\t' }], function (text) {
            if (!text || !String(text).trim()) { $('fromsel').textContent = 'Select some text first'; setTimeout(function () { $('fromsel').textContent = 'Save selection as part'; }, 2000); return; }
            openEditor(null, String(text));
            $('ed-name').value = String(text).trim().split('\n')[0].slice(0, 40);
        });
    }

    // ── Dictionary ────────────────────────────────────────────────────────────
    function renderWords() {
        var ul = $('words');
        ul.innerHTML = '';
        if (!words.length) { ul.appendChild(el('li', 'empty', 'No custom words added here yet.')); return; }
        words.slice().sort().forEach(function (w) {
            var li = el('li');
            li.appendChild(el('span', null, w));
            var rm = el('button', 'btn-text-default', 'Remove');
            rm.type = 'button';
            rm.setAttribute('aria-label', 'Remove ' + w);
            rm.addEventListener('click', function () { removeWord(w); });
            li.appendChild(rm);
            ul.appendChild(li);
        });
    }
    function spellCommand(obj) {
        try { window.parent.AscDesktopEditor.SpellCheck(JSON.stringify(obj)); } catch (e) {}
    }
    function addWord() {
        var w = $('word').value.trim();
        if (!w || /\s/.test(w)) return;
        var api = parentApi();
        try { api && api.asc_spellCheckAddToDictionary ? api.asc_spellCheckAddToDictionary(w) : spellCommand({ type: 'add', usrWords: [w] }); } catch (e) {}
        if (words.indexOf(w) < 0) words.push(w);
        save(WORDS_KEY, words);
        $('word').value = '';
        renderWords();
    }
    function removeWord(w) {
        // The spell checker has no single-word removal: clear, then re-add the rest.
        words = words.filter(function (x) { return x !== w; });
        save(WORDS_KEY, words);
        spellCommand({ type: 'clear' });
        if (words.length) spellCommand({ type: 'add', usrWords: words });
        renderWords();
    }
    function clearWords() {
        spellCommand({ type: 'clear' });
        words = [];
        save(WORDS_KEY, words);
        renderWords();
    }

    // ── Tabs and init ─────────────────────────────────────────────────────────
    function selectTab(dict) {
        $('tab-parts').setAttribute('aria-selected', String(!dict));
        $('tab-dict').setAttribute('aria-selected', String(dict));
        $('panel-parts').hidden = dict;
        $('panel-dict').hidden = !dict;
    }

    window.Asc.plugin.init = function () {
        parts = load(PARTS_KEY, null);
        if (!parts) {
            parts = STARTER.map(function (s) { return { id: uid(), cat: s[0], name: s[1], text: s[2] }; });
            save(PARTS_KEY, parts);
        }
        words = load(WORDS_KEY, []);
        CATEGORIES.forEach(function (c) { var o = el('option', null, c); o.value = c; $('ed-cat').appendChild(o); });
        $('search').addEventListener('input', renderList);
        $('new').addEventListener('click', function () { openEditor(null); });
        $('fromsel').addEventListener('click', fromSelection);
        $('editor').addEventListener('submit', saveEditor);
        $('ed-cancel').addEventListener('click', function () { $('editor').hidden = true; });
        $('tab-parts').addEventListener('click', function () { selectTab(false); });
        $('tab-dict').addEventListener('click', function () { selectTab(true); });
        $('addword').addEventListener('click', addWord);
        $('word').addEventListener('keydown', function (e) { if (e.key === 'Enter') addWord(); });
        $('clearwords').addEventListener('click', clearWords);
        renderCats();
        renderList();
        renderWords();
    };
    window.Asc.plugin.button = function () { this.executeCommand('close', ''); };
    window.Asc.plugin.onThemeChanged = function (theme) {
        window.Asc.plugin.onThemeChangedBase(theme);
        var r = document.documentElement.style;
        ['text-normal', 'text-secondary', 'background-normal', 'background-toolbar', 'border-divider',
         'border-regular-control', 'border-control-focus'].forEach(function (k) { if (theme[k]) r.setProperty('--' + k, theme[k]); });
    };
})(window);
