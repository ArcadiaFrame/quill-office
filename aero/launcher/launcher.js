/*
 * launcher.js: Works-style Task Launcher for the Euro-Office start page.
 * Hooked into desktopeditors/index.html by aero/apply-aero.py, after tasks.js
 * (generated from aero/launcher/tasks.json, which sets window.AERO_TASKS).
 *
 * It adds a "Task Launcher" sidebar item plus a matching .action-panel. The start page's
 * own menu code handles switching, and the page opens on the launcher. Flow: pick
 * Document / Spreadsheet / Presentation, then a category gallery (Blank first), then click
 * a card to create a new file from that template via sdk.command('create:new').
 */
(function () {
    'use strict';

    var ACTION = 'launcher';
    var EDITORS = [
        { id: 'document',     label: 'Document',     blank: 'word',  hint: 'Letters, reports, resumes, flyers' },
        { id: 'spreadsheet',  label: 'Spreadsheet',  blank: 'cell',  hint: 'Budgets, invoices, schedules, lists' },
        { id: 'presentation', label: 'Presentation', blank: 'slide', hint: 'Slides, posters, timelines, quizzes' },
        { id: 'pdf',          label: 'PDF form',     blank: 'form',  hint: 'Fillable forms, applications, contracts' }
    ];
    // The start page's own Templates collection (paneltemplates.js): PDF forms and online
    // templates (templates.onlyoffice.com, cloud icon) join the launcher as tasks.
    var APP_EDITOR = { word: 'document', cell: 'spreadsheet', slide: 'presentation', pdf: 'pdf' };
    var ONLINE = 'Online templates', LOCAL_FORMS = 'On this computer';
    // AVS_OFFICESTUDIO_FILE_* codes for custom (non-built-in) template files.
    var FORMAT_BY_EXT = { docx: 65, dotx: 76, xlsx: 257, xltx: 262, pptx: 129, potx: 135 };

    var data = window.AERO_TASKS || { categories: [], tasks: [] };
    var builtins = {};          // lowercase display name -> { path, type, icon }
    var state = { editor: 'document', category: 'All' };
    var $panel = null;

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }

    function decodeHtml(s) {
        var t = document.createElement('textarea');
        t.innerHTML = s;
        return t.value;
    }

    // Absolute Windows path of a file in the launcher folder next to this script.
    function launcherFilePath(rel) {
        var base = (document.currentScript && document.currentScript.src) || window.__aeroLauncherSrc || '';
        var url = new URL(rel, base).href;
        return decodeURIComponent(url.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
    }
    window.__aeroLauncherSrc = window.__aeroLauncherSrc || (document.currentScript && document.currentScript.src);

    function appCollection() {
        try { return window.app.controller.templates.templates; } catch (e) { return null; }
    }
    // Tasks from the app's Templates area: every online template, plus local PDF forms
    // (local Word/Excel/PowerPoint templates are already launcher tasks via "builtin:").
    function appTasks(editor) {
        var col = appCollection(), out = [], seen = {};
        if (!col || !col.items || !window.utils || !utils.formatToEditor) return out;
        col.items.forEach(function (m) {
            var ed = APP_EDITOR[utils.formatToEditor(m.type)];
            if (ed !== editor || !(m.isCloud || ed === 'pdf')) return;
            var name = decodeHtml(String(m.name || '')).trim();
            if (!name || seen[name]) return;
            seen[name] = 1;
            out.push({
                editor: ed, name: name, _model: m,
                category: m.isCloud ? ONLINE : LOCAL_FORMS,
                description: (m.descr ? decodeHtml(String(m.descr)).trim() + ' ' : '') +
                             (m.isCloud ? '(Online: downloads when you open it.)' : '')
            });
        });
        return out;
    }

    function resolveTemplate(task) {
        if (task._model) return { thumb: task._model.icon ? decodeHtml(task._model.icon) : null };
        var t = task.template || '';
        if (t.indexOf('builtin:') === 0) {
            var b = builtins[t.substring(8).trim().toLowerCase()];
            return b ? { path: b.path, type: b.type, thumb: b.icon } : null;
        }
        var ext = (t.split('.').pop() || '').toLowerCase();
        return FORMAT_BY_EXT[ext] ? { path: launcherFilePath(t), type: FORMAT_BY_EXT[ext], thumb: null } : null;
    }

    // Favorites and recently used tasks (localStorage; ids are "editor|name").
    var FAV_KEY = 'aero-launcher-favorites', RECENT_KEY = 'aero-launcher-recent', RECENT_MAX = 8;
    var FAVORITES = '★ Favorites', RECENT = '⟲ Recently used';
    function taskId(t) { return t.editor + '|' + t.name; }
    function getList(key) { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; } }
    function setList(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
    function isFav(t) { return getList(FAV_KEY).indexOf(taskId(t)) >= 0; }
    function toggleFav(t) {
        var l = getList(FAV_KEY), id = taskId(t), i = l.indexOf(id);
        if (i >= 0) l.splice(i, 1); else l.push(id);
        setList(FAV_KEY, l);
    }
    function remember(t) {
        var l = getList(RECENT_KEY).filter(function (x) { return x !== taskId(t); });
        l.unshift(taskId(t));
        setList(RECENT_KEY, l.slice(0, RECENT_MAX));
    }

    function create(task) {
        if (!window.sdk) return;
        if (task !== 'blank') remember(task);
        if (task === 'blank') {
            var ed = EDITORS.filter(function (e) { return e.id === state.editor; })[0];
            // Personalize defaults (font, size, paper...) are applied when it opens (newdoc.js).
            window.sdk.command('create:new', ed.blank);
            return;
        }
        var m = task._model;
        if (m) {
            // Same as the Templates panel: online ones show the app's preview/download dialog.
            if (m.isCloud && window.PreviewTemplateDialog) new window.PreviewTemplateDialog(m).show();
            else if (!m.isCloud) window.sdk.command('create:new', JSON.stringify({ template: { id: m.id, type: m.type, path: m.path } }));
            return;
        }
        var r = resolveTemplate(task);
        if (!r) return;
        window.sdk.command('create:new', JSON.stringify({ template: { id: 0, type: r.type, path: r.path } }));
    }

    function thumbFor(task, r) {
        if (task.thumbnail) return new URL(task.thumbnail, window.__aeroLauncherSrc).href;
        return r && r.thumb ? r.thumb : null;
    }

    function card(title, desc, thumb, onClick, extraCls) {
        var b = el('button', 'aero-task' + (extraCls ? ' ' + extraCls : ''));
        b.type = 'button';
        b.setAttribute('aria-label', title + '. ' + desc);
        var box = el('span', 'aero-task-thumb');
        if (thumb) {
            var img = el('img');
            img.alt = '';
            img.src = thumb;
            box.appendChild(img);
        } else {
            box.appendChild(el('span', 'aero-task-thumb-empty'));
        }
        b.appendChild(box);
        b.appendChild(el('span', 'aero-task-name', title));
        b.appendChild(el('span', 'aero-task-desc', desc));
        b.addEventListener('click', onClick);
        return b;
    }

    // A task card plus its favorite star (a sibling button: buttons can't be nested).
    function taskCard(t, r) {
        var wrap = el('div', 'aero-task-wrap');
        wrap.appendChild(card(t.name, t.description, thumbFor(t, r), function () { create(t); }));
        var star = el('button', 'aero-star', isFav(t) ? '★' : '☆');
        star.type = 'button';
        star.title = isFav(t) ? 'Remove from favorites' : 'Add to favorites';
        star.setAttribute('aria-label', star.title + ': ' + t.name);
        star.setAttribute('aria-pressed', String(isFav(t)));
        star.addEventListener('click', function () { toggleFav(t); render(); });
        wrap.appendChild(star);
        return wrap;
    }

    function render() {
        if (!$panel) return;
        var grid = $panel.querySelector('.aero-task-grid');
        var cats = $panel.querySelector('.aero-cats');
        var tasks = data.tasks.filter(function (t) { return t.editor === state.editor; }).concat(appTasks(state.editor));

        // Editor tiles
        [].forEach.call($panel.querySelectorAll('.aero-editor'), function (b) {
            b.setAttribute('aria-pressed', String(b.dataset.editor === state.editor));
        });

        // Categories that have tasks for this editor
        cats.innerHTML = '';
        var favs = getList(FAV_KEY), recent = getList(RECENT_KEY);
        var favTasks = tasks.filter(function (t) { return favs.indexOf(taskId(t)) >= 0; });
        var recentTasks = recent.map(function (id) {
            return tasks.filter(function (t) { return taskId(t) === id; })[0];
        }).filter(Boolean);
        var names = [];
        if (favTasks.length) names.push(FAVORITES);
        if (recentTasks.length) names.push(RECENT);
        names = names.concat(['All'], data.categories.concat([LOCAL_FORMS, ONLINE]).filter(function (c) {
            return tasks.some(function (t) { return t.category === c; });
        }));
        if (names.indexOf(state.category) < 0) state.category = 'All';
        names.forEach(function (c) {
            var b = el('button', 'aero-cat' + (c === FAVORITES || c === RECENT ? ' aero-cat-special' : ''), c);
            b.type = 'button';
            b.setAttribute('aria-pressed', String(c === state.category));
            b.addEventListener('click', function () { state.category = c; render(); });
            cats.appendChild(b);
        });

        // Defaults note (Document editor only)
        var fontRow = $panel.querySelector('.aero-blank-font');
        fontRow.hidden = state.editor !== 'document';
        var st = window.AeroSettings ? window.AeroSettings.load() : null;
        fontRow.querySelector('b').textContent = st ? (st.doc.font + ', ' + st.doc.size + ' pt, ' + st.doc.paper.toUpperCase()) : '';

        // Cards: Blank first, then the category's tasks
        grid.innerHTML = '';
        var ed = EDITORS.filter(function (e) { return e.id === state.editor; })[0];
        var noun = ed.id === 'pdf' ? 'PDF form' : ed.label.toLowerCase();
        grid.appendChild(card('Blank ' + noun, 'Start from an empty ' + noun + '.',
            null, function () { create('blank'); }, 'aero-task-blank'));
        var shown = state.category === FAVORITES ? favTasks
                  : state.category === RECENT ? recentTasks
                  : tasks.filter(function (t) { return state.category === 'All' || t.category === state.category; });
        shown.forEach(function (t) {
            var r = resolveTemplate(t);
            if (!r) return;                 // built-in not reported (yet) by the app
            grid.appendChild(taskCard(t, r));
        });
    }

    function buildPanel(center) {
        $panel = el('div', 'action-panel ' + ACTION + ' aero-launcher');
        $panel.style.display = 'none';

        var head = el('div', 'aero-launcher-head');
        head.appendChild(el('h3', 'table-caption', 'Task Launcher'));
        head.appendChild(el('p', 'aero-launcher-sub', 'What would you like to create?'));
        $panel.appendChild(head);

        var editors = el('div', 'aero-editors');
        editors.setAttribute('role', 'group');
        editors.setAttribute('aria-label', 'Editor');
        EDITORS.forEach(function (e) {
            var b = el('button', 'aero-editor aero-editor-' + e.id);
            b.type = 'button';
            b.dataset.editor = e.id;
            b.appendChild(el('span', 'aero-editor-icon'));
            var txt = el('span', 'aero-editor-text');
            txt.appendChild(el('span', 'aero-editor-label', e.label));
            txt.appendChild(el('span', 'aero-editor-hint', e.hint));
            b.appendChild(txt);
            b.addEventListener('click', function () { state.editor = e.id; state.category = 'All'; render(); });
            editors.appendChild(b);
        });
        $panel.appendChild(editors);

        var fontRow = el('div', 'aero-blank-font');
        fontRow.appendChild(el('span', null, 'New blank documents: '));
        fontRow.appendChild(el('b'));
        var change = el('button', 'aero-link', 'Change in Personalize');
        change.type = 'button';
        change.addEventListener('click', function () {
            var a = document.querySelector('.tool-menu a[action="personalize"]');
            a && a.click();
        });
        fontRow.appendChild(change);
        $panel.appendChild(fontRow);

        var body = el('div', 'aero-launcher-body');
        var cats = el('nav', 'aero-cats');
        cats.setAttribute('aria-label', 'Categories');
        body.appendChild(cats);
        body.appendChild(el('div', 'aero-task-grid'));
        $panel.appendChild(body);

        var more = el('button', 'aero-more', 'All templates…');
        more.type = 'button';
        more.addEventListener('click', function () {
            var a = document.querySelector('.tool-menu a[action="templates"]');
            a && a.click();
        });
        $panel.appendChild(more);

        center.appendChild($panel);
    }

    function buildMenuItem(menu) {
        var li = el('li', 'menu-item');
        var a = el('a');
        a.setAttribute('action', ACTION);
        var box = el('div', 'icon-box');
        box.innerHTML = '<svg class="icon aero-launcher-icon" viewBox="0 0 20 20" aria-hidden="true">' +
            '<rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/>' +
            '<rect x="2" y="11" width="7" height="7" rx="1.5"/><path d="M14.5 11v7M11 14.5h7"/></svg>';
        a.appendChild(box);
        a.appendChild(el('span', 'text', 'Task Launcher'));
        li.appendChild(a);
        menu.insertBefore(li, menu.firstElementChild);
        return a;
    }

    function onTemplates(list) {
        (list || []).forEach(function (item) {
            if (!item || !item.path) return;
            var name = String(item.name || item.path.split(/[\\/]/).pop() || '').replace(/\.\w+$/, '').trim().toLowerCase();
            if (!builtins[name])
                builtins[name] = { path: item.path, type: item.type, icon: item.icon ? decodeHtml(item.icon) : null };
            else if (!builtins[name].icon && item.icon)
                builtins[name].icon = decodeHtml(item.icon);
        });
        render();
    }

    // Re-render when the Templates area adds items (online templates arrive page by page).
    var rerender = null;
    function hookAppTemplates(tries) {
        var col = appCollection();
        if (!col || !col.events) {
            if ((tries || 0) < 100) setTimeout(function () { hookAppTemplates((tries || 0) + 1); }, 200);
            return;
        }
        var later = function () { clearTimeout(rerender); rerender = setTimeout(render, 150); };
        ['inserted', 'reset', 'erased'].forEach(function (e) { col.events[e] && col.events[e].attach(later); });
        later();
    }

    function init() {
        var menu = document.querySelector('.tool-menu');
        var center = document.querySelector('.main-column.col-center');
        if (!menu || !center || !window.sdk) return false;
        if (menu.querySelector('a[action="' + ACTION + '"]')) return true;

        buildPanel(center);
        var a = buildMenuItem(menu);
        render();

        // Real thumbnails and paths for built-in templates come from the app.
        window.sdk.on('onaddtemplates', onTemplates);
        try { window.sdk.LocalFileTemplates(['en-US', 'en_US', 'en']); } catch (e) {}
        hookAppTemplates();

        // Open on the launcher once the start page has finished its own initial selection.
        var tries = 0;
        (function openFirst() {
            if (document.querySelector('.tool-menu > .menu-item.selected') || ++tries > 40) a.click();
            else setTimeout(openFirst, 50);
        })();
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
