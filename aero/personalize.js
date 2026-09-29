/*
 * personalize.js: "Personalize" panel on the Euro-Office start page.
 * Adds a sidebar item + .action-panel (the start page's own menu code switches panels).
 * Everything is saved through window.AeroSettings (settings.js) or the aero.js keys and
 * takes effect in all open windows. Document defaults are applied to new blank files by
 * the "Aero Defaults" system plugin.
 */
(function () {
    'use strict';

    var ACTION = 'personalize';
    var ACCENTS = [['blue', 'Theme default', '#3d8ee6'], ['aqua', 'Aqua', '#20b2c4'], ['emerald', 'Emerald', '#2eaa60'],
                   ['violet', 'Violet', '#8c6edc'], ['rose', 'Rose', '#de5880'], ['amber', 'Amber', '#eba028'],
                   ['graphite', 'Graphite', '#8c96a5']];
    // Interface color presets for Aero Dark/Light: hue (null = theme default) and saturation factor.
    var UI_COLORS = [['Default', null, 1], ['Teal', 185, 1], ['Emerald', 150, 1], ['Violet', 265, 1],
                     ['Plum', 300, 1], ['Crimson', 350, 1], ['Bronze', 30, 1], ['Graphite', 216, 0.12]];
    var FALLBACK_THEMES = [['theme-aero-dark', 'Aero Glass Dark'], ['theme-aero-light', 'Aero Glass Light'],
                           ['theme-aero-sepia', 'Aero Glass Neutral'], ['theme-matte-dark', 'Matte Dark'], ['theme-matte-light', 'Matte Light'], ['theme-white', 'Light'], ['theme-night', 'Dark']];
    var TUNER = [ // key, label, min, max, step
        ['gloss', 'Gloss', 0, 1, 0.05], ['sheen', 'Reflection', 0, 0.4, 0.02], ['blur', 'Menu blur', 0, 30, 1],
        ['radius', 'Corner radius', 0, 12, 1], ['glow', 'Glow size', 0, 20, 1], ['speed', 'Animation speed', 0, 400, 20]
    ];
    // The editors' glass defaults per theme (aero.css), shown until the user moves a slider.
    var TUNER_DEFAULTS = {
        'theme-aero-dark':  { gloss: 0.45, sheen: 0.06, blur: 16, radius: 4, glow: 8, speed: 160 },
        'theme-aero-light': { gloss: 1,    sheen: 0.22, blur: 14, radius: 4, glow: 7, speed: 160 },
        'theme-aero-sepia': { gloss: 0.8,  sheen: 0.18, blur: 14, radius: 4, glow: 7, speed: 160 },
        'theme-matte-dark':  { gloss: 0, sheen: 0, blur: 0, radius: 4, glow: 8, speed: 160 },
        'theme-matte-light': { gloss: 0, sheen: 0, blur: 0, radius: 4, glow: 7, speed: 160 }
    };
    var APP_SHORTCUTS = [
        ['Ctrl+O', 'Open a file'], ['Ctrl+W  /  Ctrl+F4', 'Close the current tab'],
        ['Ctrl+Tab', 'Next tab (past the last tab: start page)'], ['Ctrl+Shift+Tab', 'Previous tab'],
        ['Alt+F4', 'Close the window']
    ];

    var S = window.AeroSettings;
    var state = null;

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function ls(k, v) {
        try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {}
        return null;
    }
    function commit() { S.save(state); }

    // "Save defaults" button + the last result reported by the Aero Defaults plugin.
    function saveRow(parent) {
        var row = el('div', 'aero-p-buttons');
        var b = button('Save defaults', function () {
            commit();
            b.textContent = 'Saved ✓';
            setTimeout(function () { b.textContent = 'Save defaults'; }, 1600);
        });
        row.appendChild(b);
        parent.appendChild(row);
        var status = el('p', 'aero-p-hint aero-p-lastrun');
        status.setAttribute('aria-live', 'polite');
        parent.appendChild(status);
        updateLastRun();
    }
    function updateLastRun() {
        var entry = null;
        try { entry = JSON.parse(localStorage.getItem('aero-defaults-log') || 'null'); } catch (e) {}
        var names = { word: 'document', cell: 'spreadsheet', slide: 'presentation' };
        var text = entry ? 'Last new file (' + (names[entry.editor] || entry.editor) + ', ' + entry.time + '): ' +
            (entry.status === 'applied' ? 'defaults applied ✓' : entry.status + (entry.detail ? ' (' + entry.detail + ')' : ''))
            : 'No new file created since these settings were added.';
        [].forEach.call(document.querySelectorAll('.aero-p-lastrun'), function (p) { p.textContent = text; });
    }
    window.addEventListener('storage', function (e) { if (e.key === 'aero-defaults-log') updateLastRun(); });

    function section(title, hint) {
        var sec = el('section', 'aero-p-card');
        sec.appendChild(el('h4', null, title));
        if (hint) sec.appendChild(el('p', 'aero-p-hint', hint));
        return sec;
    }

    function field(parent, label, control) {
        var row = el('label', 'aero-p-row');
        row.appendChild(el('span', 'aero-p-label', label));
        row.appendChild(control);
        parent.appendChild(row);
        return control;
    }

    function select(options, value, onChange) {
        var sel = el('select');
        options.forEach(function (o) {
            var opt = el('option', null, o[1]);
            opt.value = o[0];
            sel.appendChild(opt);
        });
        sel.value = value;
        sel.addEventListener('change', function () { onChange(sel.value); });
        return sel;
    }

    // Font menu: "Recommended" group first, then every font the editors know (filled async).
    function fontSelect(value, recommended, onChange) {
        var sel = el('select', 'aero-p-font');
        function opt(parent, name) {
            var o = el('option', null, name);
            o.value = name;
            o.style.fontFamily = '"' + name + '"';
            parent.appendChild(o);
        }
        var rec = el('optgroup');
        rec.label = 'Recommended';
        recommended.forEach(function (n) { opt(rec, n); });
        sel.appendChild(rec);
        var all = el('optgroup');
        all.label = 'All fonts (loading…)';
        if (recommended.indexOf(value) < 0) opt(all, value);
        sel.appendChild(all);
        sel.value = value;
        S.listFonts(function (names) {
            all.innerHTML = '';
            all.label = 'All fonts (' + names.length + ')';
            names.forEach(function (n) { opt(all, n); });
            sel.value = value;
        });
        sel.addEventListener('change', function () { value = sel.value; onChange(sel.value); });
        return sel;
    }

    function check(parent, label, value, onChange) {
        var row = el('label', 'aero-p-check');
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = !!value;
        cb.addEventListener('change', function () { onChange(cb.checked); });
        row.appendChild(cb);
        row.appendChild(el('span', null, label));
        parent.appendChild(row);
        return cb;
    }

    function button(text, onClick) {
        var b = el('button', 'aero-p-btn', text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }

    function themeOptions() {
        var native = document.querySelectorAll('#opts-ui-theme select option');
        var list = [].map.call(native, function (o) { return [o.value, o.textContent]; });
        if (!list.length) list = FALLBACK_THEMES;
        // Aero Glass first, then Matte, then the stock themes.
        function rank(id) { return /aero/.test(id) ? 0 : /matte/.test(id) ? 1 : 2; }
        return list.slice().sort(function (x, y) { return rank(x[0]) - rank(y[0]); });
    }

    function currentTheme() {
        var m = document.body.className.match(/\b(theme-[\w-]+)\b/g) || [];
        return (m.filter(function (c) { return !/^theme-type-/.test(c); })[0]) || '';
    }

    function tunerValue(key) {
        if (state.tuner[key] !== undefined && state.tuner[key] !== null) return +state.tuner[key];
        var d = TUNER_DEFAULTS[currentTheme()] || TUNER_DEFAULTS['theme-aero-dark'];
        return d[key];
    }

    // ── Sections ──────────────────────────────────────────────────────────────
    function appearance() {
        var a = section('Appearance');
        field(a, 'Interface theme', select(themeOptions(), currentTheme(), function (id) {
            if (window.sdk) window.sdk.command('settings:apply', JSON.stringify({ uitheme: id }));
        }));
        a.appendChild(el('p', 'aero-p-hint', 'Aero Glass: gloss and glow. Matte: the same colors, flat. Light/Dark: the stock originals.'));

        var sw = el('div', 'aero-p-swatches');
        sw.setAttribute('role', 'radiogroup');
        sw.setAttribute('aria-label', 'Accent color');
        var cur = ls('aero-accent') || 'blue';
        ACCENTS.forEach(function (c) {
            var b = el('button', 'aero-p-swatch');
            b.type = 'button';
            b.title = c[1];
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-label', c[1]);
            b.setAttribute('aria-checked', String(c[0] === cur));
            b.style.setProperty('--sw', c[2]);
            b.addEventListener('click', function () {
                ls('aero-accent', c[0]);
                document.documentElement.setAttribute('data-aero-accent', c[0]);
                [].forEach.call(sw.children, function (x) { x.setAttribute('aria-checked', String(x === b)); });
            });
            sw.appendChild(b);
        });
        field(a, 'Accent (highlights and glow)', sw);

        check(a, 'Papyrus page (warm paper tone in documents)', ls('aero-papyrus') === '1', function (v) {
            ls('aero-papyrus', v ? '1' : '0');
            document.documentElement.classList.toggle('aero-papyrus', v);
        });
        field(a, 'Interface font', fontSelect(state.uiFont, S.RECOMMENDED_UI_FONTS, function (v) { state.uiFont = v; commit(); }));
        field(a, 'Interface text size', select([90, 100, 110, 125, 150].map(function (n) {
            return [String(n), n + '%' + (n === 100 ? ' (default)' : '')];
        }), String(state.textScale), function (v) { state.textScale = +v; commit(); }));
        return a;
    }

    function interfaceColor() {
        var c = section('Interface color', 'The main color of the Aero Glass (Dark, Light, Neutral) and Matte (Dark, Light) interfaces. Each theme keeps its own depth, gradient and contrast; only the color changes.');
        var saved = state.uiColor;
        var sw = el('div', 'aero-p-swatches aero-p-colors');
        sw.setAttribute('role', 'radiogroup');
        sw.setAttribute('aria-label', 'Interface color');
        var slider = el('input');
        slider.type = 'range'; slider.min = 0; slider.max = 359; slider.step = 1;
        slider.setAttribute('aria-label', 'Custom interface hue');
        slider.value = saved ? saved.hue : 216;

        function mark(hue, sat) {
            [].forEach.call(sw.children, function (x) {
                var p = UI_COLORS[+x.dataset.i];
                x.setAttribute('aria-checked', String(hue === null ? p[1] === null : (p[1] === hue && p[2] === sat)));
            });
        }
        function setColor(hue, sat) {
            state.uiColor = hue === null ? null : { hue: hue, sat: sat };
            commit();
            mark(hue, sat);
        }
        UI_COLORS.forEach(function (p, i) {
            var b = el('button', 'aero-p-swatch');
            b.type = 'button';
            b.dataset.i = i;
            b.title = p[1] === null ? 'Theme default (navy, cerulean, sandstone)' : p[0];
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-label', b.title);
            b.style.setProperty('--sw', p[1] === null
                ? 'conic-gradient(#1d3557 0 33%, #6d9cc6 0 66%, #b9a27c 0)'
                : 'hsl(' + p[1] + ',' + Math.round(45 * p[2]) + '%,45%)');
            b.addEventListener('click', function () {
                if (p[1] !== null) slider.value = p[1];
                setColor(p[1], p[2]);
            });
            sw.appendChild(b);
        });
        mark(saved ? saved.hue : null, saved ? (saved.sat === undefined ? 1 : saved.sat) : 1);
        slider.addEventListener('input', function () { setColor(+slider.value, 1); });

        var row = el('div', 'aero-p-colorblock');
        row.appendChild(sw);
        var custom = el('label', 'aero-p-hue');
        custom.appendChild(el('span', null, 'Custom'));
        custom.appendChild(slider);
        row.appendChild(custom);
        c.appendChild(row);
        return c;
    }

    function tuner() {
        var t = section('Glass tuner', 'Fine-tune the Aero look. Export copies the values so they can be shared.');
        TUNER.forEach(function (d) {
            var wrap = el('span', 'aero-p-slider');
            var r = el('input');
            r.type = 'range'; r.min = d[2]; r.max = d[3]; r.step = d[4];
            r.value = tunerValue(d[0]);
            r.setAttribute('aria-label', d[1]);
            var out = el('output', null, r.value + S.TUNER_UNITS[d[0]]);
            r.addEventListener('input', function () {
                state.tuner[d[0]] = +r.value;
                out.textContent = r.value + S.TUNER_UNITS[d[0]];
                commit();
            });
            wrap.appendChild(r);
            wrap.appendChild(out);
            field(t, d[1], wrap);
        });
        var box = el('textarea', 'aero-p-export');
        box.readOnly = true;
        box.hidden = true;
        box.setAttribute('aria-label', 'Exported glass values');
        var btns = el('div', 'aero-p-buttons');
        btns.appendChild(button('Reset glass', function () {
            state.tuner = {};
            commit();
            [].forEach.call(t.querySelectorAll('input[type=range]'), function (r, i) {
                r.value = tunerValue(TUNER[i][0]);
                r.nextSibling.textContent = r.value + S.TUNER_UNITS[TUNER[i][0]];
            });
        }));
        var exp = button('Export values', function () {
            var vals = { theme: currentTheme(), accent: ls('aero-accent') || 'blue', interfaceColor: state.uiColor };
            TUNER.forEach(function (d) { vals[d[0]] = tunerValue(d[0]) + S.TUNER_UNITS[d[0]]; });
            box.value = JSON.stringify(vals, null, 2);
            box.hidden = false;
            box.select();
            try { document.execCommand('copy'); exp.textContent = 'Copied!'; } catch (e) {}
            setTimeout(function () { exp.textContent = 'Export values'; }, 1500);
        });
        btns.appendChild(exp);
        t.appendChild(btns);
        t.appendChild(box);
        return t;
    }

    function accessibility() {
        var x = section('Accessibility');
        check(x, 'Reduce motion (no animations)', state.reduceMotion, function (v) { state.reduceMotion = v; commit(); });
        check(x, 'Reduce transparency (solid menus, no blur)', state.reduceTransparency, function (v) { state.reduceTransparency = v; commit(); });
        check(x, 'High-contrast glass (less shine, stronger text and borders)', state.highContrast, function (v) { state.highContrast = v; commit(); });
        check(x, 'Strong focus rings for keyboard navigation', state.strongFocus, function (v) { state.strongFocus = v; commit(); });
        x.appendChild(el('p', 'aero-p-hint', 'Tip: Atkinson Hyperlegible and OpenDyslexic are available as interface fonts in Appearance.'));
        return x;
    }

    function documents() {
        var d = section('New documents', 'Applied automatically when you create a new blank document.');
        field(d, 'Font', fontSelect(state.doc.font, ['Courier Prime', 'Arial', 'Noto Serif', 'Noto Sans', 'Atkinson Hyperlegible', 'OpenDyslexic'],
            function (v) { state.doc.font = v; commit(); }));
        field(d, 'Font size', select([8, 9, 10, 10.5, 11, 12, 13, 14, 16, 18, 20, 24].map(function (n) { return [String(n), n + ' pt']; }),
            String(state.doc.size), function (v) { state.doc.size = +v; commit(); }));
        field(d, 'Paper size', select([['letter', 'Letter (8.5 × 11 in)'], ['a4', 'A4 (210 × 297 mm)'], ['legal', 'Legal (8.5 × 14 in)'], ['a5', 'A5 (148 × 210 mm)']],
            state.doc.paper, function (v) { state.doc.paper = v; commit(); }));
        field(d, 'Margins', select([['normal', 'Normal (1 in)'], ['narrow', 'Narrow (0.5 in)'], ['moderate', 'Moderate'], ['wide', 'Wide']],
            state.doc.margins, function (v) { state.doc.margins = v; commit(); }));
        field(d, 'Line spacing', select([['1', 'Single (1.0)'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', 'Double (2.0)']],
            String(state.doc.lineSpacing), function (v) { state.doc.lineSpacing = +v; commit(); }));
        field(d, 'Space after paragraphs', select([['0', 'None'], ['6', '6 pt'], ['8', '8 pt'], ['10', '10 pt'], ['12', '12 pt']],
            String(state.doc.spaceAfter), function (v) { state.doc.spaceAfter = +v; commit(); }));
        check(d, 'Use these defaults for new blank documents', state.doc.applyToNew, function (v) { state.doc.applyToNew = v; commit(); });
        saveRow(d);
        return d;
    }

    function spreadsheets() {
        var s = section('New spreadsheets', 'Applied automatically when you create a new blank spreadsheet.');
        field(s, 'Font', fontSelect(state.sheet.font, ['Arial', 'Open Sans', 'Noto Sans', 'Inter', 'Lato', 'Atkinson Hyperlegible'],
            function (v) { state.sheet.font = v; commit(); }));
        field(s, 'Font size', select([8, 9, 10, 11, 12, 14, 16].map(function (n) { return [String(n), n + ' pt']; }),
            String(state.sheet.size), function (v) { state.sheet.size = +v; commit(); }));
        check(s, 'Use these defaults for new blank spreadsheets', state.sheet.applyToNew, function (v) { state.sheet.applyToNew = v; commit(); });
        saveRow(s);
        return s;
    }

    function presentations() {
        var p = section('New presentations', 'Applied automatically when you create a new blank presentation.');
        field(p, 'Slide size', select([['16:9', 'Widescreen 16:9'], ['16:10', '16:10'], ['4:3', 'Standard 4:3']],
            state.slide.size, function (v) { state.slide.size = v; commit(); }));
        check(p, 'Use this size for new blank presentations', state.slide.applyToNew, function (v) { state.slide.applyToNew = v; commit(); });
        saveRow(p);
        return p;
    }

    function helper() {
        var h = section('Quill: AI helper', 'Quill is a small assistant that hovers beside your text. Click it to ask how to do something; it can run the command for you. It uses your local Ollama, so nothing leaves this computer.');
        field(h, 'Helper', select([['quill', 'Quill (feather pen)'], ['orb', 'Glowing orb'], ['off', 'Off']], state.helper.style,
            function (v) { state.helper.style = v; commit(); }));
        var modelSel = field(h, 'AI model', select([['', 'Automatic']], state.helper.model || '', function (v) { state.helper.model = v; commit(); }));
        check(h, 'Include the selected text with my questions', state.helper.useSelection, function (v) { state.helper.useSelection = v; commit(); });
        check(h, 'Let the AI think before answering (more careful, much slower)', state.ai.think, function (v) { state.ai.think = v; commit(); });
        field(h, 'Stop waiting for an answer after', select(
            [['2', '2 minutes'], ['5', '5 minutes'], ['10', '10 minutes'], ['20', '20 minutes'], ['60', '1 hour'], ['0', 'Never (wait as long as it takes)']],
            String(state.ai.timeoutMin), function (v) { state.ai.timeoutMin = Number(v); commit(); }));
        h.appendChild(el('p', 'aero-p-hint', 'Thinking applies to Quill and to the AI menu, and you can switch it any time while you work: the "Think" button in Quill\'s bubble, or AI > Thinking in the right-click menu. It affects models that can think (such as qwen3.5); others ignore it.'));
        var persona = el('textarea', 'aero-p-export');
        persona.style.height = '110px';
        persona.style.fontFamily = 'inherit';
        persona.setAttribute('aria-label', "Quill's personality");
        persona.placeholder = "Describe how Quill should act. Leave empty for Quill's default personality: a warm, encouraging writing companion who offers practical tips.";
        persona.value = state.helper.persona || '';
        persona.addEventListener('input', function () { state.helper.persona = persona.value; commit(); });
        h.appendChild(el('p', 'aero-p-label', "Quill's personality (how it should act)"));
        h.appendChild(persona);
        var prow = el('div', 'aero-p-buttons');
        prow.appendChild(button("Restore Quill's default personality", function () { persona.value = ''; state.helper.persona = ''; commit(); }));
        prow.appendChild(button("Reset Quill's position", function () { state.helper.pinned = null; commit(); }));
        h.appendChild(prow);
        h.appendChild(el('p', 'aero-p-hint', 'Tip: drag Quill anywhere in the editor to keep it out of the way. Double-click it (or use "Follow my text" in its bubble) to make it follow your text again.'));
        var status = el('p', 'aero-p-hint', 'Looking for Ollama…');
        h.appendChild(status);
        var R = window.AscSimpleRequest;
        function done(names) {
            names.forEach(function (n) { var o = el('option', null, n); o.value = n; modelSel.appendChild(o); });
            modelSel.value = state.helper.model || '';
            status.textContent = names.length ? 'Ollama found with ' + names.length + ' model' + (names.length > 1 ? 's' : '') + '.'
                : 'Ollama is not running. Install it from ollama.com and pull a model (e.g. "ollama pull qwen3.5:9b").';
        }
        if (R && R.createRequest) {
            R.createRequest({ url: 'http://localhost:11434/api/tags', method: 'GET', timeout: 5000,
                complete: function (e) { var d = {}; try { d = JSON.parse(e.responseText); } catch (x) {} done((d.models || []).map(function (m) { return m.name; })); },
                error: function () { done([]); } });
        } else done([]);
        h.appendChild(localAI());
        return h;
    }

    // Local AI (Ollama) resources: applies above the AI plugin too (settings.js AI_PROFILES).
    function localAI() {
        var box = el('div');
        box.appendChild(el('p', 'aero-p-label', 'Local AI (Ollama) resources'));
        var P = S.AI_PROFILES;
        field(box, 'Resource use', select(Object.keys(P).map(function (k) { return [k, P[k].label]; }), state.ai.profile || 'balanced',
            function (v) { state.ai.profile = v; commit(); refresh(); }));
        box.appendChild(el('p', 'aero-p-hint', 'Applies to Quill and to the AI menu and chat. More room lets the AI read longer text and think; ' +
            'it uses a little more graphics memory. With thinking on, the AI always gets room for at least 16,000 tokens.'));
        var live = el('p', 'aero-p-hint', '');
        box.appendChild(live);
        var row = el('div', 'aero-p-buttons');
        row.appendChild(button('Free AI memory now', function () {
            ollama('GET', '/api/ps', null, function (d) {
                var models = (d && d.models) || [];
                if (!models.length) return refresh();
                var left = models.length;
                models.forEach(function (m) {
                    ollama('POST', '/api/generate', { model: m.name, keep_alive: 0 }, function () { if (--left === 0) refresh(); });
                });
            });
        }));
        row.appendChild(button('Refresh', refresh));
        box.appendChild(row);

        function ollama(method, path, body, cb) {
            var R = window.AscSimpleRequest;
            if (!R || !R.createRequest) return cb(null);
            R.createRequest({ url: 'http://localhost:11434' + path, method: method, timeout: 10000,
                headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : '',
                complete: function (e) { var d = null; try { d = JSON.parse(e.responseText); } catch (x) {} cb(d); },
                error: function () { cb(null); } });
        }
        function refresh() {
            ollama('GET', '/api/ps', null, function (d) {
                if (!d) { live.textContent = 'Ollama is not running.'; return; }
                var models = d.models || [];
                if (!models.length) { live.textContent = 'No AI model is loaded right now: no memory in use. It loads when you ask something.'; return; }
                var want = S.aiRuntime(state.ai).numCtx;
                live.textContent = 'Loaded now: ' + models.map(function (m) {
                    var gb = (m.size_vram / 1073741824).toFixed(1), until = new Date(m.expires_at);
                    return m.name + ' (' + Math.round(m.context_length / 1024) + 'k memory, ' + gb + ' GB graphics memory, until ' +
                        until.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ')' +
                        (m.context_length !== want ? '. Reloads with your setting on the next question' : '');
                }).join('; ') + '.';
            });
        }
        refresh();
        return box;
    }

    function shortcuts() {
        var k = section('Keyboard shortcuts', 'Shortcuts that work everywhere in Quill Office:');
        var table = el('table', 'aero-p-keys');
        APP_SHORTCUTS.forEach(function (r) {
            var tr = el('tr');
            var td1 = el('td');
            td1.appendChild(el('kbd', null, r[0]));
            tr.appendChild(td1);
            tr.appendChild(el('td', null, r[1]));
            table.appendChild(tr);
        });
        k.appendChild(table);
        k.appendChild(el('p', 'aero-p-hint', 'Each editor has its own full list, and you can assign or change shortcuts there: in any open document, click the glowing accent orb in the status bar → "Keyboard shortcuts…", or go to File → Advanced settings → Keyboard shortcuts. Changes apply to that editor type (documents, spreadsheets, presentations…).'));
        return k;
    }

    function build(center) {
        state = S.load();
        var panel = el('div', 'action-panel ' + ACTION + ' aero-personalize');
        panel.style.display = 'none';

        var head = el('div', 'aero-p-head');
        head.appendChild(el('h3', 'table-caption', 'Personalize'));
        head.appendChild(el('p', 'aero-p-hint', 'Make Quill Office fit your comfort, style and the way you work. Changes apply to every open window.'));
        panel.appendChild(head);

        var grid = el('div', 'aero-p-grid');
        [appearance(), interfaceColor(), tuner(), accessibility(), helper(), documents(), spreadsheets(), presentations(), shortcuts()]
            .forEach(function (sec) { grid.appendChild(sec); });
        panel.appendChild(grid);
        center.appendChild(panel);
    }

    function buildMenuItem(menu) {
        var li = el('li', 'menu-item');
        var a = el('a');
        a.setAttribute('action', ACTION);
        var box = el('div', 'icon-box');
        box.innerHTML = '<svg class="icon aero-launcher-icon" viewBox="0 0 20 20" aria-hidden="true">' +
            '<path d="M3 17c2.5 0 4-1.2 4-3.2 0-1.1-.8-2-1.9-2S3 12.8 3 14.5V17z"/>' +
            '<path d="M7.2 11.8L15.8 3.2a1.4 1.4 0 012 2L9.2 13.8"/></svg>';
        a.appendChild(box);
        a.appendChild(el('span', 'text', 'Personalize'));
        li.appendChild(a);
        var settings = menu.querySelector('a[action="settings"]');
        menu.insertBefore(li, settings ? settings.parentNode : null);
    }

    function init() {
        var menu = document.querySelector('.tool-menu');
        var center = document.querySelector('.main-column.col-center');
        if (!menu || !center || !S) return false;
        if (menu.querySelector('a[action="' + ACTION + '"]')) return true;
        build(center);
        buildMenuItem(menu);
        return true;
    }

    function start() {
        if (init()) return;
        var obs = new MutationObserver(function () { if (init()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
