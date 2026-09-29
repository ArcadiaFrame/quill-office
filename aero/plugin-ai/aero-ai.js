/*
 * aero-ai.js: added to the bundled AI plugin ({9DC93CDB-...D007}) by apply-aero.py, loaded
 * right after scripts/engine/register.js. It leaves the plugin's own files alone and:
 *
 *  - Thinking on/off for Ollama: adds reasoning_effort "none" to /v1 chat requests unless the
 *    user turned thinking on (AeroSettings.ai.think, set in Personalize, in Quill's bubble or in
 *    the AI > Thinking item this adds to the right-click menu). With thinking, a 9B model can
 *    take minutes before replying; without it, a second or two.
 *  - Resource profile (AeroSettings.aiRuntime(): context size, keep-alive). Ollama ignores
 *    these on /v1 requests but reuses a loaded model, so the model is loaded with them first
 *    (GET /api/ps, then an empty /api/generate if needed). Quill sends them directly.
 *  - Time limit (AeroSettings.ai.timeoutMin, 0 = never) on the plugin's non-streamed requests,
 *    which go through the desktop's native AscSimpleRequest.
 *  - A small "AI is working… 0:12" status pill in the editor while a request is running, so a
 *    slow answer never looks like nothing happened.
 */
(function () {
    'use strict';

    var OLLAMA_RE = /^https?:\/\/(localhost|127\.0\.0\.1):11434\//;
    var LOCAL_KEY = 'aero-ai';   // fallback when the editor page's AeroSettings is out of reach

    function parentSettings() {
        try { return window.parent && window.parent !== window && window.parent.AeroSettings || null; } catch (e) { return null; }
    }
    function settings() {
        var S = parentSettings();
        try { if (S) return S.load().ai; } catch (e) {}
        try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || { think: false, timeoutMin: 10 }; } catch (e) {}
        return { think: false, timeoutMin: 10 };
    }
    function runtime() {   // Ollama context size and keep-alive for the chosen resource profile
        var S = parentSettings();
        try { if (S && S.aiRuntime) return S.aiRuntime(); } catch (e) {}
        return { numCtx: 16384, keepAlive: '15m' };   // same as the Balanced profile
    }
    function saveThink(on) {
        var S = parentSettings();
        try {
            if (S) { var s = S.load(); s.ai = Object.assign({}, s.ai, { think: on }); S.save(s); return; }
        } catch (e) {}
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(Object.assign({}, settings(), { think: on }))); } catch (e) {}
    }

    function adjustBody(url, body) {
        if (!OLLAMA_RE.test(url) || !/completions/.test(url) || typeof body !== 'string' || !body) return body;
        var o;
        try { o = JSON.parse(body); } catch (e) { return body; }
        if (settings().think) delete o.reasoning_effort;
        else o.reasoning_effort = 'none';
        return JSON.stringify(o);
    }

    // ── Status pill and toasts (drawn in the editor page) ────────────────────────
    function parentDoc() {
        try { return window.parent.document; } catch (e) { return null; }
    }
    var pill = null, pending = 0, started = 0, ticker = null, showTimer = null;
    function drawPill() {
        var d = parentDoc();
        if (!d || !d.body) return;
        if (!pill || !pill.isConnected) {
            pill = d.createElement('div');
            pill.className = 'aero-ai-status';
            pill.setAttribute('role', 'status');
            d.body.appendChild(pill);
        }
        var s = Math.round((Date.now() - started) / 1000);
        var think = settings().think;
        pill.textContent = 'AI is ' + (think ? 'thinking it through' : 'working') + '… ' +
            Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) +
            (s > 20 && !think ? ' (the model may still be loading)' : '');
        pill.hidden = false;
    }
    function busyStart() {
        if (pending++ > 0) return;
        started = Date.now();
        // Quick requests finish before the pill would even show.
        showTimer = setTimeout(function () { drawPill(); ticker = setInterval(drawPill, 1000); }, 1200);
    }
    function busyEnd() {
        pending = Math.max(0, pending - 1);
        if (pending) return;
        clearTimeout(showTimer);
        clearInterval(ticker);
        if (pill) pill.hidden = true;
    }
    function toast(text) {
        var d = parentDoc();
        if (!d || !d.body) return;
        var n = d.createElement('div');
        n.className = 'aero-ai-status aero-ai-toast';
        n.setAttribute('role', 'status');
        n.textContent = text;
        d.body.appendChild(n);
        setTimeout(function () { n.parentNode && n.parentNode.removeChild(n); }, 5000);
    }

    // ── Native requests (non-streamed: right-click actions, summaries, translation…) ──
    var R = window.AscSimpleRequest;
    if (R && R.createRequest && !R.__aeroWrapped) {
        var origCreate = R.createRequest;
        R.createRequest = function (e) {
            if (!e || !OLLAMA_RE.test(e.url || '') || String(e.method).toUpperCase() !== 'POST')
                return origCreate.apply(this, arguments);
            e.body = adjustBody(e.url, e.body);
            var ai = settings(), limitMs = (Number(ai.timeoutMin) || 0) * 60000;
            var complete = e.complete, error = e.error, finished = false, timer = null;
            function finish() {
                if (finished) return false;
                finished = true;
                clearTimeout(timer);
                busyEnd();
                return true;
            }
            e.complete = function () { if (finish() && complete) return complete.apply(this, arguments); };
            e.error = function () { if (finish() && error) return error.apply(this, arguments); };
            if (limitMs) {
                timer = setTimeout(function () {
                    if (!finish()) return;
                    toast('No AI answer within ' + ai.timeoutMin + ' min, so it was stopped. You can raise the limit in Personalize > Quill' +
                          (ai.think ? ', or turn thinking off (AI > Thinking) for faster answers.' : '.'));
                    if (error) error({ status: 'error', statusCode: 408 }, 'error');
                }, limitMs);
            }
            busyStart();
            var self = this, model = null;
            try { model = JSON.parse(e.body).model; } catch (x) {}
            ensureLoaded(e.url.match(/^https?:\/\/[^\/]+/)[0], model, function () {
                if (!finished) origCreate.call(self, e);
            });
        };
        // Ollama ignores num_ctx/keep_alive on /v1 requests but reuses an already loaded model,
        // so load it with the Personalize profile first when it isn't loaded that way.
        var ensureLoaded = function (base, model, then) {
            if (!model) return then();
            var rt = runtime();
            origCreate.call(R, {
                url: base + '/api/ps', method: 'GET', headers: {}, body: '',
                complete: function (res) {
                    var loaded = null;
                    try {
                        loaded = (JSON.parse(res.responseText).models || []).filter(function (m) {
                            return m.name === model || m.model === model;
                        })[0];
                    } catch (x) {}
                    if (loaded && loaded.context_length === rt.numCtx) return then();
                    origCreate.call(R, {
                        url: base + '/api/generate', method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: model, prompt: '', keep_alive: rt.keepAlive, options: { num_ctx: rt.numCtx } }),
                        complete: function () { then(); },
                        error: function () { then(); }
                    });
                },
                error: function () { then(); }
            });
        };
        R.__aeroWrapped = true;
    }

    // ── fetch (streamed chat, when Ollama accepts the plugin's origin) ────────────
    if (window.fetch && !window.fetch.__aeroWrapped) {
        var origFetch = window.fetch;
        window.fetch = function (url, init) {
            if (typeof url === 'string' && OLLAMA_RE.test(url) && init && init.body) {
                init = Object.assign({}, init, { body: adjustBody(url, init.body) });
                busyStart();
                var p = origFetch.call(window, url, init);
                p.then(busyEnd, busyEnd);
                return p;
            }
            return origFetch.apply(window, arguments);
        };
        window.fetch.__aeroWrapped = true;
    }

    // ── Right-click menu: AI > Thinking on/off ───────────────────────────────────
    function addMenuItem() {
        var list = (window.Asc && Asc.Buttons && Asc.Buttons.ButtonsContextMenu) || [];
        var main = list.filter(function (b) { return b.parent === null && b.text === 'AI'; })[0];
        if (!main) return;
        var b = new Asc.ButtonContextMenu(main);
        b.text = 'Thinking';
        b.separator = true;
        b.editors = ['word', 'cell', 'slide', 'pdf'];
        b.addCheckers('All');
        b.onContextMenuShowExtendItem = function (options, item) {
            item.text = settings().think ? 'Thinking: on (careful, slower). Click for quick answers'
                                         : 'Thinking: off (quick answers). Click to think it through';
        };
        b.attachOnClick(function () {
            var on = !settings().think;
            saveThink(on);
            toast(on ? 'AI thinking is on: answers are more careful but can take minutes.'
                     : 'AI thinking is off: quick answers.');
        });
    }
    if (typeof window.registerButtons === 'function') {
        var origRegister = window.registerButtons;
        window.registerButtons = async function () {
            var r = await origRegister.apply(this, arguments);
            try { addMenuItem(); } catch (e) {}
            return r;
        };
    }
})();
