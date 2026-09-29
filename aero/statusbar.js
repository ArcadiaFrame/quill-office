/*
 * statusbar.js: Aero tools group in the editors' status bar (hooked by apply-aero.py).
 *
 * It replaces the status bar's fit-to-page / fit-to-width / zoom-in / zoom-out buttons
 * (their sprite icons don't exist in the icon set these themes use; the "Zoom 100%" menu and
 * Ctrl+wheel cover zooming) with a group of tools: Search, Focus mode, Reading ruler, Papyrus
 * page, and a "View & highlights" menu built from the editor's own View tab options plus
 * formatting marks and the zoom commands. The accent orb (aero.js) moves in as the last item.
 */
(function () {
    'use strict';

    var ZOOM_BUTTONS = ['btn-zoom-topage', 'btn-zoom-towidth', 'btn-zoom-down', 'btn-zoom-up',
                        'status-btn-zoom-topage', 'status-btn-zoom-towidth', 'status-btn-zoomdown', 'status-btn-zoomup'];
    var ICONS = {   // original 16×16 line icons (currentColor)
        search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/>',
        focus: '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>',
        ruler: '<rect x="1.5" y="6" width="13" height="4" rx="1"/><path d="M3 3h10M3 13h10"/>',
        papyrus: '<path d="M4 2h6l3 3v9H4z"/><path d="M10 2v3h3M6 8h5M6 10.5h5"/>',
        reader: '<path d="M8 4C6 2.8 3.5 2.5 1.5 3v9.5c2-.5 4.5-.2 6.5 1 2-1.2 4.5-1.5 6.5-1V3c-2-.5-4.5-.2-6.5 1z"/><path d="M8 4v9.5"/>',
        view: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'
    };

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function clean(t) { return String(t || '').replace(/\s+/g, ' ').replace(/[…:]+$/, '').trim(); }
    function icon(name) {
        return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" ' +
               'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
    }
    function papyrusOn() { return document.documentElement.classList.contains('aero-papyrus'); }
    function setPapyrus(on) {
        document.documentElement.classList.toggle('aero-papyrus', on);
        try { localStorage.setItem('aero-papyrus', on ? '1' : '0'); } catch (e) {}
        var cb = document.getElementById('aero-papyrus-cb');
        if (cb) cb.checked = on;
    }

    // ── View & highlights menu ─────────────────────────────────────────────────
    function nativeButton(id) { return document.getElementById(id); }
    function viewItems() {
        var items = [];
        // View tab checkboxes (status bar, rulers, panels, gridlines, headings…)
        [].forEach.call(document.querySelectorAll('section.panel[data-tab="view"] label.checkbox-indeterminate'), function (lab) {
            var input = lab.querySelector('input.checkbox__native'), shape = lab.querySelector('.checkbox__shape');
            var d = input && document.getElementById(input.id + '-description');
            var name = clean(d ? d.textContent : lab.textContent);
            if (input && shape && name)
                items.push({ label: name, checked: input.checked, disabled: input.disabled, run: function () { shape.click(); } });
        });
        // Toggle buttons: View tab toggles and formatting marks on the Home tab.
        [].forEach.call(document.querySelectorAll('section.panel[data-tab="view"] button[aria-pressed], section.panel[data-tab="home"] button[aria-pressed]'), function (b) {
            var label = clean(b.getAttribute('aria-label') || (b.querySelector('.caption') || {}).textContent);
            var inView = !!b.closest('section.panel[data-tab="view"]');
            if (!label || (!inView && !/nonprinting|non-printing|formatting marks|paragraph mark|hidden/i.test(label))) return;
            items.push({ label: label, checked: b.getAttribute('aria-pressed') === 'true' || b.classList.contains('active'),
                         disabled: b.disabled || b.classList.contains('disabled'), run: function () { b.click(); } });
        });
        return items;
    }
    function zoomItems() {
        var out = [];
        [['btn-zoom-topage', 'status-btn-zoom-topage', 'Fit to page'], ['btn-zoom-towidth', 'status-btn-zoom-towidth', 'Fit to width'],
         ['btn-zoom-up', 'status-btn-zoomup', 'Zoom in'], ['btn-zoom-down', 'status-btn-zoomdown', 'Zoom out']].forEach(function (z) {
            var b = nativeButton(z[0]) || nativeButton(z[1]);
            if (b) out.push({ label: z[2], run: function () { b.click(); } });
        });
        return out;
    }

    var menu = null;
    function closeMenu() { if (menu) { menu.parentNode && menu.parentNode.removeChild(menu); menu = null; } }
    function openMenu(anchor) {
        closeMenu();
        menu = el('div', 'aero-view-menu');
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'View and highlights');
        function section(title, items, checkable) {
            if (!items.length) return;
            menu.appendChild(el('div', 'aero-view-head', title));
            items.forEach(function (it) {
                var b = el('button', 'aero-view-item');
                b.type = 'button';
                b.setAttribute('role', checkable ? 'menuitemcheckbox' : 'menuitem');
                if (checkable) b.setAttribute('aria-checked', String(!!it.checked));
                b.disabled = !!it.disabled;
                b.appendChild(el('span', 'aero-view-check', checkable ? (it.checked ? '✓' : '') : ''));
                b.appendChild(el('span', null, it.label));
                b.addEventListener('click', function () {
                    it.run();
                    if (checkable) setTimeout(function () { openMenu(anchor); }, 60);   // refresh states
                    else closeMenu();
                });
                menu.appendChild(b);
            });
        }
        section('View & highlights', viewItems(), true);
        section('Zoom', zoomItems(), false);
        document.body.appendChild(menu);
        var r = anchor.getBoundingClientRect();
        menu.style.left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, r.left + r.width / 2 - menu.offsetWidth / 2)) + 'px';
        menu.style.bottom = (window.innerHeight - r.top + 6) + 'px';
        var first = menu.querySelector('button:not(:disabled)');
        first && first.focus();
    }
    document.addEventListener('mousedown', function (e) {
        if (menu && !menu.contains(e.target) && !(e.target.closest && e.target.closest('.aero-tool-view'))) closeMenu();
    }, true);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu) { closeMenu(); } }, true);

    // ── Tools group ───────────────────────────────────────────────────────────
    var group = null;
    function tool(name, cls, tip, onClick) {
        var b = el('button', 'aero-tool ' + cls);
        b.type = 'button';
        b.title = tip;
        b.setAttribute('aria-label', tip);
        b.innerHTML = icon(name);
        b.addEventListener('click', onClick);
        group.appendChild(b);
        return b;
    }
    function sync() {
        if (!group) return;
        var q = window.AeroQuick;
        [['aero-tool-focus', q && q.isFocus()], ['aero-tool-ruler', q && q.isRuler()], ['aero-tool-papyrus', papyrusOn()],
         ['aero-tool-reader', q && q.isImmersive && q.isImmersive()]]
            .forEach(function (t) {
                var b = group.querySelector('.' + t[0]);
                b && b.setAttribute('aria-pressed', String(!!t[1]));
            });
    }

    function build() {
        var zoom = document.querySelector('.cnt-zoom');
        if (!zoom || document.getElementById('aero-tools')) return !!zoom;
        var first = ZOOM_BUTTONS.map(nativeButton).filter(Boolean)[0] || zoom;
        group = el('div');
        group.id = 'aero-tools';
        group.setAttribute('role', 'toolbar');
        group.setAttribute('aria-label', 'Aero tools');
        tool('search', 'aero-tool-search', 'Search commands (Ctrl+Q)', function () {
            window.AeroCommandSearch && window.AeroCommandSearch.open();
        });
        tool('focus', 'aero-tool-focus', 'Focus mode (F11)', function () { window.AeroQuick && window.AeroQuick.focus(); sync(); });
        tool('ruler', 'aero-tool-ruler', 'Reading ruler (Ctrl+Shift+E)', function () { window.AeroQuick && window.AeroQuick.ruler(); sync(); });
        tool('papyrus', 'aero-tool-papyrus', 'Papyrus page', function () { setPapyrus(!papyrusOn()); sync(); });
        tool('reader', 'aero-tool-reader', 'Immersive reader (Ctrl+Shift+I)', function () { window.AeroQuick && window.AeroQuick.immersive(); sync(); });
        var view = tool('view', 'aero-tool-view', 'View & highlights', function () {
            if (menu) closeMenu(); else openMenu(view);
        });
        view.setAttribute('aria-haspopup', 'menu');
        // Move the accent orb in as the last item.
        var orb = document.getElementById('aero-accent');
        if (orb) group.appendChild(orb);
        first.parentNode.insertBefore(group, first);
        document.documentElement.classList.add('aero-tools-on');
        if (window.AeroQuick) window.AeroQuick.onChange(sync);
        sync();
        return true;
    }

    function start() {
        if (build()) return;
        var obs = new MutationObserver(function () { if (build()) obs.disconnect(); });
        obs.observe(document.body, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
