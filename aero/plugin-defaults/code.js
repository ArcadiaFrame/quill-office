/*
 * Aero Defaults: a hidden system plugin that applies the user's Personalize defaults to
 * NEW blank documents, spreadsheets and presentations. It uses the official plugin
 * callCommand; the minified editor build doesn't expose Asc.editor.callCommand.
 *
 * "New blank" means the desktop app reports no source path (never saved) AND the content
 * is empty. Files you open, and documents created from templates, are left alone.
 * Settings come from the editor page's AeroSettings (settings.js), same origin.
 */
(function (window) {
    'use strict';

    var PAPER = { letter: [12240, 15840], a4: [11906, 16838], legal: [12240, 20160], a5: [8391, 11906] };
    var MARGINS = { normal: [1440, 1440, 1440, 1440], narrow: [720, 720, 720, 720],
                    moderate: [1080, 1440, 1080, 1440], wide: [2880, 1440, 2880, 1440] };
    var SLIDES = { '16:9': [12192000, 6858000], '16:10': [10972800, 6858000], '4:3': [9144000, 6858000] };
    var done = false;

    // Record what happened so Personalize can show it ("applied" / "skipped: reason").
    function log(status, detail) {
        var entry = { time: new Date().toLocaleString(), editor: (window.Asc.plugin.info || {}).editorType || '?',
                      status: status, detail: detail || '' };
        try { window.parent.localStorage.setItem('aero-defaults-log', JSON.stringify(entry)); } catch (e) {}
        if (status === 'applied') notify();
    }
    function notify() {
        try {
            var d = window.parent.document, n = d.createElement('div');
            n.textContent = 'Your default settings were applied to this new file.';
            n.setAttribute('role', 'status');
            n.style.cssText = 'position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:20001;padding:8px 16px;' +
                'border-radius:16px;font:12px "Open Sans",Arial,sans-serif;color:#fff;background:rgba(20,40,70,.88);' +
                'box-shadow:0 6px 20px rgba(0,0,0,.35);transition:opacity .4s';
            d.body.appendChild(n);
            setTimeout(function () { n.style.opacity = '0'; }, 2600);
            setTimeout(function () { n.parentNode && n.parentNode.removeChild(n); }, 3200);
        } catch (e) {}
    }

    function settings() {
        try { if (window.parent.AeroSettings) return window.parent.AeroSettings.load(); } catch (e) {}
        return null;
    }

    // A never-saved file: no source path, or its source is one of the app's blank templates
    // (converter/empty/<lang>/new.*).
    function sourcePath() {
        try {
            var d = window.parent.AscDesktopEditor;
            return d && typeof d.LocalFileGetSourcePath === 'function' ? String(d.LocalFileGetSourcePath() || '') : null;
        } catch (e) { return null; }
    }
    function isNewUnsaved(src) {
        if (src === '') return true;
        src = src || '';
        // Blank template itself, or the working copy the app makes for a new file:
        // <appdata>/data/recover/<id>/Document2.docx (also Book1.xlsx, Presentation1.pptx, …).
        return /[\\/]converter[\\/]empty[\\/][^\\/]+[\\/]new\.\w+$/i.test(src) ||
               /[\\/]data[\\/]recover[\\/][^\\/]+[\\/](Document|Book|Presentation|Drawing|Form|PDF)\d*\.\w+$/i.test(src);
    }

    function word(s) {
        var d = s.doc;
        window.Asc.scope = {
            font: d.font, size: Math.round((+d.size || 11) * 2),
            line: Math.round((+d.lineSpacing || 1.15) * 240), after: Math.round((+d.spaceAfter || 0) * 20),
            page: PAPER[d.paper] || PAPER.letter, margins: MARGINS[d.margins] || MARGINS.normal
        };
        window.Asc.plugin.callCommand(function () {
            var doc = Api.GetDocument();
            if (doc.GetElementsCount() > 1 || doc.GetElement(0).GetText().replace(/\s/g, '') !== '') return;
            var sc = Asc.scope;
            var tp = doc.GetDefaultTextPr();
            if (sc.font) tp.SetFontFamily(sc.font);
            tp.SetFontSize(sc.size);
            var pp = doc.GetDefaultParaPr();
            pp.SetSpacingLine(sc.line, 'auto');
            pp.SetSpacingAfter(sc.after);
            var sec = doc.GetFinalSection();
            sec.SetPageSize(sc.page[0], sc.page[1]);
            sec.SetPageMargins(sc.margins[0], sc.margins[1], sc.margins[2], sc.margins[3]);
            return 'applied';
        }, false, true, function (r) { log(r === 'applied' ? 'applied' : 'skipped', r === 'applied' ? '' : 'the document is not empty'); });
    }

    function cell(s) {
        window.Asc.scope = { font: s.sheet.font, size: +s.sheet.size || 11 };
        window.Asc.plugin.callCommand(function () {
            var ws = Api.GetActiveSheet();
            var used = ws.GetUsedRange();
            if (used && used.GetAddress && used.GetAddress(false, false, 'xlA1', false) !== 'A1') return;
            if (ws.GetRange('A1').GetValue() !== '') return;
            var all = ws.GetRange('A:XFD');
            if (Asc.scope.font) all.SetFontName(Asc.scope.font);
            all.SetFontSize(Asc.scope.size);
            return 'applied';
        }, false, true, function (r) { log(r === 'applied' ? 'applied' : 'skipped', r === 'applied' ? '' : 'the sheet is not empty'); });
    }

    function slide(s) {
        window.Asc.scope = { size: SLIDES[s.slide.size] || SLIDES['16:9'], font: s.slide.font };
        window.Asc.plugin.callCommand(function () {
            var pres = Api.GetPresentation();
            if (pres.GetSlidesCount() > 1) return;
            pres.SetSizes(Asc.scope.size[0], Asc.scope.size[1]);
            return 'applied';
        }, false, true, function (r) { log(r === 'applied' ? 'applied' : 'skipped', r === 'applied' ? '' : 'the presentation is not empty'); });
    }

    function documentReady() {
        try { var d = window.parent.document; return !!(window.parent.Asc && window.parent.Asc.editor) && d.readyState === 'complete'; }
        catch (e) { return true; }
    }

    function run() {
        if (done) return;
        var s = settings();
        if (!s) return;                                   // settings.js not loaded yet: try again later
        done = true;
        var src = sourcePath();
        if (!isNewUnsaved(src)) { log('skipped', 'opened file (' + (src || 'unknown path') + ')'); return; }
        var type = window.Asc.plugin.info && window.Asc.plugin.info.editorType;
        try {
            if (type === 'word') { if (s.doc.applyToNew) word(s); else log('skipped', 'turned off for documents'); }
            else if (type === 'cell') { if (s.sheet && s.sheet.applyToNew) cell(s); else log('skipped', 'turned off for spreadsheets'); }
            else if (type === 'slide') { if (s.slide.applyToNew) slide(s); else log('skipped', 'turned off for presentations'); }
            else log('skipped', 'editor type ' + type);
        } catch (e) { log('error', String(e)); }
    }

    // The plugin may start before or after the document has loaded: try on init (with
    // retries until settings and the editor are ready) and on the ready event.
    window.Asc.plugin.init = function () {
        var tries = 0;
        (function attempt() {
            if (done) return;
            if (documentReady() && settings()) { setTimeout(run, 300); return; }
            if (++tries < 60) setTimeout(attempt, 250);
            else log('error', 'the editor did not become ready');
        })();
    };
    window.Asc.plugin.event_onDocumentContentReady = function () { setTimeout(run, 300); };
    window.Asc.plugin.button = function () {};
})(window);
