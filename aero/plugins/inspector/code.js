/*
 * Document Inspector (Aero plugin, documents). Finds content to review before sharing
 * (comments, tracked changes, track-changes mode, author/personal info, other properties,
 * bookmarks) with the Builder API, and removes it on request.
 */
(function (window) {
    'use strict';

    function $(id) { return document.getElementById(id); }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function cmd(fn, scope, cb) {
        window.Asc.scope = scope || {};
        window.Asc.plugin.callCommand(fn, false, true, cb);
    }

    function inspect() {
        var doc = Api.GetDocument(), core = doc.GetCore(), out = {};
        function safe(f, d) { try { return f(); } catch (e) { return d; } }
        out.comments = safe(function () { return doc.GetAllComments().length; }, 0);
        out.changes = safe(function () {
            var r = doc.GetReviewReport() || {}, n = 0, who = [];
            for (var k in r) if (r.hasOwnProperty(k)) { n += (r[k] || []).length; who.push(k); }
            return { count: n, who: who };
        }, { count: 0, who: [] });
        out.tracking = safe(function () { return doc.IsTrackRevisions(); }, false);
        out.creator = safe(function () { return core.GetCreator() || ''; }, '');
        out.modifiedBy = safe(function () { return core.GetLastModifiedBy() || ''; }, '');
        out.props = safe(function () {
            var p = {};
            ['Subject', 'Keywords', 'Category', 'Description'].forEach(function (n) {
                var v = core['Get' + n]();
                if (v) p[n] = v;
            });
            return p;
        }, {});
        out.bookmarks = safe(function () { return doc.GetAllBookmarksNames().filter(function (n) { return n.charAt(0) !== '_'; }).length; }, 0);
        return JSON.stringify(out);
    }

    var ACTIONS = {
        comments: function () { var c = Api.GetDocument().GetAllComments(); for (var i = c.length - 1; i >= 0; i--) c[i].Delete(); },
        accept: function () { Api.GetDocument().AcceptAllRevisionChanges(); },
        reject: function () { Api.GetDocument().RejectAllRevisionChanges(); },
        tracking: function () { Api.GetDocument().SetTrackRevisions(false); },
        personal: function () { var c = Api.GetDocument().GetCore(); c.SetCreator(''); c.SetLastModifiedBy(''); },
        props: function () {
            var c = Api.GetDocument().GetCore();
            ['Subject', 'Keywords', 'Category', 'Description'].forEach(function (n) { try { c['Set' + n](''); } catch (e) {} });
        }
    };

    function row(title, detail, buttons) {
        var card = el('div', 'issue');
        card.appendChild(el('p', null, title));
        if (detail) card.appendChild(el('p', 'detail', detail));
        if (buttons && buttons.length) {
            var a = el('div', 'actions');
            buttons.forEach(function (b) {
                var btn = el('button', 'btn-text-default', b[0]);
                btn.type = 'button';
                btn.addEventListener('click', function () {
                    btn.disabled = true;
                    cmd(ACTIONS[b[1]], {}, function () { card.classList.add('fixed'); setTimeout(run, 300); });
                });
                a.appendChild(btn);
            });
            card.appendChild(a);
        }
        return card;
    }

    function render(d) {
        var box = $('results'), found = 0;
        box.innerHTML = '';
        function group(title, cards) {
            if (!cards.length) return;
            var g = el('div', 'group');
            g.appendChild(el('h3', null, title));
            cards.forEach(function (c) { g.appendChild(c); });
            box.appendChild(g);
            found += cards.length;
        }
        group('Comments', d.comments ? [row(d.comments + ' comment' + (d.comments > 1 ? 's' : ''), 'Comments stay in the file and are visible to anyone you share it with.', [['Remove all comments', 'comments']])] : []);
        var ch = [];
        if (d.changes.count) ch.push(row(d.changes.count + ' tracked change' + (d.changes.count > 1 ? 's' : ''),
            d.changes.who.length ? 'By: ' + d.changes.who.join(', ') : '', [['Accept all', 'accept'], ['Reject all', 'reject']]));
        if (d.tracking) ch.push(row('Track changes is turned on', 'New edits will be recorded with your name.', [['Turn off', 'tracking']]));
        group('Tracked changes', ch);
        var who = [];
        if (d.creator) who.push('Author: ' + d.creator);
        if (d.modifiedBy) who.push('Last modified by: ' + d.modifiedBy);
        group('Personal information', who.length ? [row('Names are stored in the document properties', who.join(' · '), [['Remove personal information', 'personal']])] : []);
        var props = Object.keys(d.props || {});
        group('Document properties', props.length ? [row(props.join(', ') + ' filled in', props.map(function (k) { return k + ': ' + String(d.props[k]).slice(0, 60); }).join(' · '), [['Clear these properties', 'props']])] : []);
        group('Bookmarks', d.bookmarks ? [row(d.bookmarks + ' bookmark' + (d.bookmarks > 1 ? 's' : ''), 'Bookmarks are hidden markers; review them in Insert → Bookmark if needed.', [])] : []);
        $('summary').classList.toggle('ok', !found);
        $('summary').textContent = found ? 'Review ' + found + ' item' + (found > 1 ? 's' : '') + ' before sharing.' : 'Nothing to review. Ready to share!';
    }

    function run() {
        $('summary').classList.remove('ok');
        $('summary').textContent = 'Inspecting…';
        cmd(inspect, {}, function (res) {
            var d = {};
            try { d = JSON.parse(res || '{}'); } catch (e) {}
            d.changes = d.changes || { count: 0, who: [] };
            render(d);
        });
    }

    window.Asc.plugin.init = function () { $('check').addEventListener('click', run); run(); };
    window.Asc.plugin.button = function () { this.executeCommand('close', ''); };
    window.Asc.plugin.onThemeChanged = function (theme) {
        window.Asc.plugin.onThemeChangedBase(theme);
        var r = document.documentElement.style;
        ['text-normal', 'text-secondary', 'text-link', 'background-normal', 'background-toolbar', 'border-divider',
         'border-regular-control', 'border-control-focus', 'icon-success'].forEach(function (k) { if (theme[k]) r.setProperty('--' + k, theme[k]); });
    };
})(window);
