/*
 * Accessibility Checker (Aero plugin). Scans the document with the Builder API
 * (callCommand) and reads/fixes picture alt text through the editor's image API
 * (window.parent.Asc.editor: getSelectedElements / ImgApply; the Builder API has no
 * alt-text methods for drawings). Every issue has "Go to"; several have "Fix".
 */
(function (window) {
    'use strict';

    var LABELS = {
        alt: 'Pictures and shapes without alternative text',
        heading: 'Heading structure',
        table: 'Tables without a title or description',
        link: 'Links with unclear text',
        title: 'Document properties',
        blank: 'Blank lines used for spacing'
    };
    var ORDER = ['alt', 'heading', 'table', 'link', 'title', 'blank'];
    var issues = [];

    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function cmd(fn, scope, cb) {
        window.Asc.scope = scope || {};
        window.Asc.plugin.callCommand(fn, false, false, cb);
    }
    function parentApi() { try { return window.parent.Asc.editor; } catch (e) { return null; } }

    // ── Scan (runs inside the editor) ───────────────────────────────────────────
    function scanDocument() {
        var doc = Api.GetDocument();
        var out = { title: '', drawings: 0, paragraphs: 0, issues: [] };
        try { var core = doc.GetCore(); out.title = core ? (core.GetTitle() || '') : ''; } catch (e) {}
        var paras = doc.GetAllParagraphs();
        out.paragraphs = paras.length;
        var lastLevel = 0, headings = 0, blankRun = 0;
        for (var i = 0; i < paras.length; i++) {
            var p = paras[i], txt = '';
            try { txt = p.GetText() || ''; } catch (e) {}
            var name = '';
            try { var st = p.GetStyle(); name = st ? st.GetName() : ''; } catch (e) {}
            var m = /^heading\s*(\d)$/i.exec(name);
            if (m) {
                var lvl = +m[1];
                headings++;
                if (!txt.replace(/\s/g, ''))
                    out.issues.push({ kind: 'heading', idx: i, target: 'para', text: 'An empty ' + name + ' (screen readers announce an empty heading).' });
                if (lastLevel && lvl > lastLevel + 1)
                    out.issues.push({ kind: 'heading', idx: i, target: 'para',
                        text: '"' + txt.trim().slice(0, 50) + '" jumps from Heading ' + lastLevel + ' to Heading ' + lvl + '. Use Heading ' + (lastLevel + 1) + ' instead.' });
                lastLevel = lvl;
            }
            if (!txt.replace(/\s/g, '')) {
                if (++blankRun === 3)
                    out.issues.push({ kind: 'blank', idx: i - 2, target: 'para', text: 'Three or more empty lines in a row. Use paragraph spacing or a page break instead.' });
            } else blankRun = 0;
            var n = 0;
            try { n = p.GetElementsCount(); } catch (e) {}
            for (var j = 0; j < n; j++) {
                var e2 = p.GetElement(j);
                if (e2 && e2.GetClassType && e2.GetClassType() === 'hyperlink') {
                    var shown = (e2.GetDisplayedText() || '').trim();
                    if (/^(click here|here|link|this link|read more|more|this|go)$/i.test(shown) || /^(https?:\/\/|www\.)/i.test(shown))
                        out.issues.push({ kind: 'link', idx: i, target: 'para',
                            text: 'Link text "' + shown.slice(0, 60) + '" does not say where it goes. Describe the destination.' });
                }
            }
        }
        if (paras.length > 30 && headings === 0)
            out.issues.push({ kind: 'heading', idx: 0, target: 'para', text: 'This long document has no headings. Headings let people navigate and skim.' });
        var tables = doc.GetAllTables();
        for (var k = 0; k < tables.length; k++) {
            var t = tables[k], tt = '', td = '';
            try { tt = t.GetTableTitle() || ''; td = t.GetTableDescription() || ''; } catch (e) {}
            if (!tt && !td) out.issues.push({ kind: 'table', idx: k, target: 'table', fix: 'table', text: 'Table ' + (k + 1) + ' has no title or description.' });
        }
        out.drawings = doc.GetAllDrawingObjects().length;
        if (!out.title) out.issues.push({ kind: 'title', idx: -1, target: 'none', fix: 'title', text: 'The document has no title. Screen readers and file lists use it.' });
        return JSON.stringify(out);
    }

    // ── Pictures: select each drawing, then read its alt text from the editor ──
    function selectDrawing(i, cb) {
        cmd(function () { var d = Api.GetDocument().GetAllDrawingObjects()[Asc.scope.i]; if (d) d.Select(); }, { i: i }, cb);
    }
    function selectedAltText() {
        var api = parentApi(), A = window.parent.Asc;
        if (!api || !api.getSelectedElements) return null;
        var els = api.getSelectedElements() || [];
        for (var k = 0; k < els.length; k++) {
            var t = els[k].get_ObjectType && els[k].get_ObjectType();
            if (A && A.c_oAscTypeSelectElement && t === A.c_oAscTypeSelectElement.Image) {
                var v = els[k].get_ObjectValue();
                return { title: (v.asc_getTitle && v.asc_getTitle()) || '', descr: (v.asc_getDescription && v.asc_getDescription()) || '' };
            }
        }
        return null;
    }
    function checkPictures(count, done) {
        var i = 0;
        (function next() {
            if (i >= count) return done();
            var idx = i++;
            selectDrawing(idx, function () {
                setTimeout(function () {
                    var alt = selectedAltText();
                    if (alt && !alt.descr.trim() && !alt.title.trim())
                        issues.push({ kind: 'alt', idx: idx, target: 'drawing', fix: 'alt', text: 'Picture or shape ' + (idx + 1) + ' has no alternative text.' });
                    next();
                }, 40);
            });
        })();
    }

    // ── Actions ─────────────────────────────────────────────────────────────
    function goTo(it) {
        if (it.target === 'para')
            cmd(function () { var p = Api.GetDocument().GetAllParagraphs()[Asc.scope.i]; if (p) p.Select(); }, { i: it.idx });
        else if (it.target === 'table')
            cmd(function () { var t = Api.GetDocument().GetAllTables()[Asc.scope.i]; if (t) t.Select(); }, { i: it.idx });
        else if (it.target === 'drawing') selectDrawing(it.idx);
    }
    function applyFix(it, value, done) {
        if (it.fix === 'title') {
            cmd(function () { Api.GetDocument().GetCore().SetTitle(Asc.scope.v); }, { v: value }, done);
        } else if (it.fix === 'table') {
            cmd(function () { var t = Api.GetDocument().GetAllTables()[Asc.scope.i]; if (t) t.SetTableDescription(Asc.scope.v); }, { i: it.idx, v: value }, done);
        } else if (it.fix === 'alt') {
            selectDrawing(it.idx, function () {
                var A = window.parent.Asc, api = parentApi();
                try {
                    var props = new A.asc_CImgProperty();
                    props.asc_putDescription(value);
                    api.ImgApply(props);
                } catch (e) {}
                done && done();
            });
        }
    }

    // ── UI ──────────────────────────────────────────────────────────────────
    function render() {
        var box = $('results');
        box.innerHTML = '';
        var sum = $('summary');
        sum.classList.toggle('ok', !issues.length);
        sum.textContent = issues.length ? issues.length + (issues.length === 1 ? ' issue found' : ' issues found') : 'No accessibility issues found. Nice work!';
        ORDER.forEach(function (kind) {
            var list = issues.filter(function (x) { return x.kind === kind; });
            if (!list.length) return;
            var g = el('div', 'group');
            var h = el('h3');
            h.appendChild(el('span', null, LABELS[kind]));
            h.appendChild(el('span', 'count', String(list.length)));
            g.appendChild(h);
            list.forEach(function (it) {
                var card = el('div', 'issue');
                card.appendChild(el('p', null, it.text));
                var actions = el('div', 'actions');
                if (it.target !== 'none') {
                    var go = el('button', 'btn-text-default', 'Go to');
                    go.type = 'button';
                    go.addEventListener('click', function () { goTo(it); });
                    actions.appendChild(go);
                }
                if (it.fix) {
                    var fixBtn = el('button', 'btn-text-default', it.fix === 'title' ? 'Add title' : 'Add description');
                    fixBtn.type = 'button';
                    fixBtn.addEventListener('click', function () {
                        if (card.querySelector('.fix-row')) return;
                        if (it.target !== 'none') goTo(it);
                        var row = el('div', 'fix-row');
                        var input = el('input');
                        input.type = 'text';
                        input.placeholder = it.fix === 'title' ? 'Document title' : 'Describe what it shows';
                        input.setAttribute('aria-label', input.placeholder);
                        var save = el('button', 'btn-text-default', 'Save');
                        save.type = 'button';
                        function commit() {
                            if (!input.value.trim()) return input.focus();
                            applyFix(it, input.value.trim(), function () {
                                card.classList.add('fixed');
                                row.parentNode && row.parentNode.removeChild(row);
                            });
                        }
                        save.addEventListener('click', commit);
                        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
                        row.appendChild(input);
                        row.appendChild(save);
                        card.appendChild(row);
                        input.focus();
                    });
                    actions.appendChild(fixBtn);
                }
                card.appendChild(actions);
                g.appendChild(card);
            });
            box.appendChild(g);
        });
    }

    function run() {
        $('summary').classList.remove('ok');
        $('summary').textContent = 'Checking…';
        $('results').innerHTML = '';
        issues = [];
        cmd(scanDocument, {}, function (res) {
            var data = {};
            try { data = JSON.parse(res || '{}'); } catch (e) {}
            issues = data.issues || [];
            $('summary').textContent = 'Checking pictures…';
            checkPictures(data.drawings || 0, function () {
                issues.sort(function (a, b) { return ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind); });
                render();
            });
        });
    }

    window.Asc.plugin.init = function () {
        $('check').addEventListener('click', run);
        run();
    };
    window.Asc.plugin.button = function () { this.executeCommand('close', ''); };
    window.Asc.plugin.onThemeChanged = function (theme) {
        window.Asc.plugin.onThemeChangedBase(theme);
        var r = document.documentElement.style;
        ['text-normal', 'text-secondary', 'text-link', 'background-normal', 'background-toolbar', 'border-divider',
         'border-regular-control', 'border-control-focus', 'icon-success'].forEach(function (k) {
            if (theme[k]) r.setProperty('--' + k, theme[k]);
        });
    };
})(window);
