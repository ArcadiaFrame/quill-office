/*
 * helper.js: the Aero AI helper for the Euro-Office editors (hooked by apply-aero.py).
 *
 * A small mascot (a glowing glass ORB or a QUILL, chosen in Personalize) glides to the text
 * cursor or selection and hovers beside it. Click it for a chat bubble with a reply box.
 * Answers come from the user's local Ollama (via the desktop's native AscSimpleRequest; a
 * plain fetch from file:// pages sends Origin: null, which Ollama rejects). Replies can include
 * action buttons: the model writes [[do: Command name]] and the helper finds and runs that
 * ribbon command through the command-search index (quality.js). Nothing leaves this computer.
 */
(function () {
    'use strict';

    var OLLAMA = 'http://localhost:11434';
    var PREFERRED_MODELS = ['qwen3.5', 'gemma4', 'granite4.1', 'llama3', 'qwen3', 'mistral', 'phi'];
    var mascot = null, bubble = null, log = null, input = null, history = [], busy = false, modelName = null;
    var S = function () { return window.AeroSettings ? window.AeroSettings.load() : null; };

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function helperSettings() {
        var s = S();
        return (s && s.helper) || { style: 'quill', model: '', useSelection: true, persona: '', pinned: null };
    }
    function aiSettings() {
        var s = S();
        return (s && s.ai) || { think: false, timeoutMin: 10 };
    }
    function runtime() {   // Ollama context size and keep-alive for the chosen resource profile
        try { return window.AeroSettings.aiRuntime(); } catch (e) { return { numCtx: 16384, keepAlive: '15m' }; }
    }
    function saveAI(patch) {
        if (!window.AeroSettings) return;
        var s = window.AeroSettings.load();
        s.ai = Object.assign({}, s.ai || {}, patch);
        window.AeroSettings.save(s);
    }
    function saveHelper(patch) {
        if (!window.AeroSettings) return;
        var s = window.AeroSettings.load();
        s.helper = Object.assign({}, s.helper || {}, patch);
        window.AeroSettings.save(s);
    }

    // Quill's default personality (users can replace it in Personalize).
    var DEFAULT_PERSONA = 'You are Quill, a warm, encouraging writing companion who lives in the editor. ' +
        'You are patient with beginners, never condescending, and a little playful. ' +
        'You love good writing: when the user shares or selects text, gently offer one or two practical tips ' +
        '(clarity, structure, tone, grammar, formatting) and explain why they help. ' +
        'Celebrate progress, and suggest a next step when it would be useful.';
    window.AeroHelperDefaultPersona = DEFAULT_PERSONA;
    function editorKind() {
        var p = location.pathname;
        return /spreadsheeteditor/.test(p) ? 'spreadsheet' : /presentationeditor/.test(p) ? 'presentation' :
               /pdfeditor/.test(p) ? 'PDF' : 'document';
    }

    // ── Ollama ────────────────────────────────────────────────────────────────
    // timeoutMs: 0/undefined = wait as long as it takes.
    function request(method, path, body, cb, timeoutMs) {
        var R = window.AscSimpleRequest;
        if (R && R.createRequest) {
            R.createRequest({
                url: OLLAMA + path, method: method, timeout: timeoutMs || undefined,
                headers: { 'Content-Type': 'application/json' },
                body: body ? JSON.stringify(body) : '',
                complete: function (e) { var d = null; try { d = JSON.parse(e.responseText); } catch (x) {} cb(null, d); },
                error: function (e) { cb((e && e.statusCode) || 'error'); }
            });
        } else {
            fetch(OLLAMA + path, { method: method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
                .then(function (r) { return r.json(); }).then(function (d) { cb(null, d); }).catch(function (e) { cb(e || 'error'); });
        }
    }
    function pickModel(cb) {
        var wanted = helperSettings().model;
        if (wanted) return cb(wanted);
        if (modelName) return cb(modelName);
        request('GET', '/api/tags', null, function (err, d) {
            var names = (!err && d && d.models ? d.models : []).map(function (m) { return m.name; })
                .filter(function (n) { return !/embed|coder|vision/i.test(n); });
            var pick = null;
            PREFERRED_MODELS.some(function (p) { pick = names.filter(function (n) { return n.indexOf(p) === 0; })[0]; return !!pick; });
            modelName = pick || names[0] || null;
            cb(modelName);
        });
    }

    // Load the model into memory as soon as the bubble opens (the first answer is otherwise slow).
    var warmed = false;
    function warmUp() {
        if (warmed) return;
        warmed = true;
        pickModel(function (model) {
            var rt = runtime();
            if (model) request('POST', '/api/generate', { model: model, prompt: '', keep_alive: rt.keepAlive, options: { num_ctx: rt.numCtx } }, function () {});
        });
    }

    function systemPrompt() {
        var persona = (helperSettings().persona || '').trim() || DEFAULT_PERSONA;
        return persona + '\n\n' +
            'You are the built-in helper of Quill Office, an office suite (Documents, Spreadsheets, ' +
            'Presentations). The user is in the ' + editorKind() + ' editor. The ribbon has tabs such as File, Home, ' +
            'Insert, Draw, Layout, References, Collaboration, Protection, View, Extensions and AI. ' +
            'Answer briefly (2 to 5 short sentences or a short list), in plain language. ' +
            'When a ribbon command would do what the user wants, add one action line per command in exactly this form: ' +
            '[[do: <command name as shown on the ribbon>]], for example [[do: Table of Contents]] or [[do: Insert Table]]. ' +
            'Only suggest real commands. If you are unsure, explain where to find it instead. Never invent features.';
    }

    function ask(text) {
        if (busy || !text.trim()) return;
        busy = true;
        addMessage('user', text);
        var ai = aiSettings(), limitMs = (Number(ai.timeoutMin) || 0) * 60000, started = Date.now();
        var label = ai.think ? 'Thinking it through' : 'Thinking';
        var thinking = addMessage('bot', label + '…');
        // Live elapsed time, so a slow answer never looks like a dead one.
        var ticker = setInterval(function () {
            var s = Math.round((Date.now() - started) / 1000);
            thinking.textContent = label + '… ' + Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2) +
                (s > 20 && !ai.think ? ' (the model may still be loading)' : '');
        }, 1000);
        var sel = '';
        if (helperSettings().useSelection) {
            try { var a = window.Asc && window.Asc.editor; sel = a && a.asc_GetSelectedText ? String(a.asc_GetSelectedText() || '') : ''; } catch (e) {}
        }
        var content = sel.trim() ? text + '\n\n(Selected text:\n"""' + sel.slice(0, 4000) + '"""\n)' : text;
        history.push({ role: 'user', content: content });
        pickModel(function (model) {
            if (!model) {
                clearInterval(ticker);
                thinking.textContent = 'I can\'t reach a local AI. Start Ollama (ollama.com) and pull a model, e.g. "ollama pull qwen3.5:9b".';
                busy = false; return;
            }
            var msgs = [{ role: 'system', content: systemPrompt() }].concat(history.slice(-8));
            var rt = runtime();
            request('POST', '/api/chat', { model: model, messages: msgs, stream: false, think: !!ai.think, keep_alive: rt.keepAlive,
                                           options: { temperature: 0.3, num_ctx: rt.numCtx } }, function (err, d) {
                busy = false;
                clearInterval(ticker);
                var reply = !err && d && d.message ? String(d.message.content || '') : '';
                reply = reply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
                if (!reply && err && limitMs && Date.now() - started >= limitMs - 1000) {
                    thinking.textContent = 'No answer within ' + ai.timeoutMin + ' min, so I stopped waiting. ' +
                        'You can raise the time limit in Personalize > Quill' + (ai.think ? ', or turn thinking off for faster answers.' : '.');
                    return;
                }
                if (!reply) { thinking.textContent = 'Sorry, the AI did not answer (' + (err || 'empty reply') + '). Is Ollama running?'; return; }
                history.push({ role: 'assistant', content: reply });
                renderReply(thinking, reply);
            });
        });
    }

    // ── Chat UI ───────────────────────────────────────────────────────────────
    function addMessage(who, text) {
        var m = el('div', 'aero-help-msg aero-help-' + who, text);
        log.appendChild(m);
        log.scrollTop = log.scrollHeight;
        return m;
    }
    // Paragraph with **bold** rendered safely (never HTML from the model).
    function richPara(text) {
        var p = el('p');
        text.split(/(\*\*[^*]+\*\*)/).forEach(function (part) {
            if (/^\*\*[^*]+\*\*$/.test(part)) p.appendChild(el('strong', null, part.slice(2, -2)));
            else if (part) p.appendChild(document.createTextNode(part.replace(/^[-*]\s+/gm, '• ')));
        });
        return p;
    }
    function renderReply(node, reply) {
        node.textContent = '';
        var actions = [], seen = {};
        var clean = reply.replace(/\[\[do:\s*([^\]]+?)\s*\]\]/gi, function (_, name) { actions.push({ name: name, explicit: true }); return ''; }).trim();
        // Models often name the command in bold instead: offer those too when they are real commands.
        (clean.match(/\*\*([^*]{3,40})\*\*/g) || []).forEach(function (b) { actions.push({ name: b.slice(2, -2), explicit: false }); });
        clean.split(/\n{2,}/).forEach(function (para) { if (para.trim()) node.appendChild(richPara(para.trim())); });
        actions.forEach(function (a) {
            var name = a.name;
            var cmd = window.AeroCommandSearch && window.AeroCommandSearch.find(name);
            if (!cmd && !a.explicit) return;
            var key = cmd ? cmd.label : name;
            if (seen[key]) return;
            seen[key] = 1;
            var b = el('button', 'aero-help-action' + (cmd ? '' : ' missing'), (cmd ? '▶ ' : '') + (cmd ? cmd.label : name));
            b.type = 'button';
            if (cmd) {
                b.title = 'Run "' + cmd.label + '" (' + cmd.tab + ' tab)';
                b.addEventListener('click', function () { closeBubble(); window.AeroCommandSearch.run(cmd); });
            } else {
                b.disabled = true;
                b.title = 'Not found on the ribbon';
            }
            node.appendChild(b);
        });
        log.scrollTop = log.scrollHeight;
    }

    function openBubble() {
        if (!bubble) {
            bubble = el('div');
            bubble.id = 'aero-help-bubble';
            bubble.setAttribute('role', 'dialog');
            bubble.setAttribute('aria-label', 'Quill, your AI helper');
            var head = el('div', 'aero-help-head');
            head.appendChild(el('span', 'aero-help-title', 'Quill'));
            var tools = el('span', 'aero-help-tools');
            var follow_ = el('button', 'aero-help-tool aero-help-follow', 'Follow my text');
            follow_.type = 'button';
            follow_.title = 'Quill is pinned where you dropped it. Click to make it follow your text again.';
            follow_.addEventListener('click', function () { saveHelper({ pinned: null }); follow(); syncFollowButton(); });
            tools.appendChild(follow_);
            var think = el('button', 'aero-help-tool aero-help-think');
            think.type = 'button';
            think.addEventListener('click', function () { saveAI({ think: !aiSettings().think }); syncThinkButton(); });
            tools.appendChild(think);
            var reset =el('button', 'aero-help-tool', '⟲ Reset');
            reset.type = 'button';
            reset.title = 'Start a new conversation';
            reset.setAttribute('aria-label', 'Reset conversation');
            reset.addEventListener('click', resetConversation);
            tools.appendChild(reset);
            var x = el('button', 'aero-help-close', '×');
            x.type = 'button'; x.setAttribute('aria-label', 'Close Quill');
            x.addEventListener('click', closeBubble);
            tools.appendChild(x);
            head.appendChild(tools);
            bubble.appendChild(head);
            log = el('div', 'aero-help-log');
            log.setAttribute('aria-live', 'polite');
            bubble.appendChild(log);
            greet();
            var chips = el('div', 'aero-help-chips');
            ['Give me writing tips on my selection', 'How do I add a table of contents?', 'Make this text a heading', 'Summarize my selection']
                .forEach(function (q) {
                    var c = el('button', 'aero-help-chip', q);
                    c.type = 'button';
                    c.addEventListener('click', function () { ask(q); });
                    chips.appendChild(c);
                });
            bubble.appendChild(chips);
            var form = el('form', 'aero-help-form');
            input = el('input');
            input.type = 'text';
            input.placeholder = 'Ask me anything about the editor…';
            input.setAttribute('aria-label', 'Ask the helper');
            var send = el('button', 'aero-help-send', 'Ask');
            send.type = 'submit';
            form.appendChild(input);
            form.appendChild(send);
            form.addEventListener('submit', function (e) { e.preventDefault(); var t = input.value; input.value = ''; ask(t); });
            input.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBubble(); e.stopPropagation(); });
            bubble.appendChild(form);
            document.body.appendChild(bubble);
        }
        bubble.hidden = false;
        syncFollowButton();
        syncThinkButton();
        placeBubble();
        warmUp();
        var api = window.Asc && window.Asc.editor;
        try { api && api.asc_enableKeyEvents && api.asc_enableKeyEvents(false); } catch (e) {}
        setTimeout(function () { input.focus(); }, 0);
    }
    function greet() {
        addMessage('bot', 'Hi, I\'m Quill! Ask me how to do anything in the editor, or select some text and I\'ll offer tips. ' +
            'Drag me anywhere if I\'m in the way.');
    }
    function resetConversation() {
        history = [];
        if (log) { log.innerHTML = ''; greet(); }
        if (input) input.focus();
    }
    function syncFollowButton() {
        var b = bubble && bubble.querySelector('.aero-help-follow');
        if (b) b.hidden = !helperSettings().pinned;
    }
    function syncThinkButton() {
        var b = bubble && bubble.querySelector('.aero-help-think');
        if (!b) return;
        var on = !!aiSettings().think;
        b.textContent = on ? 'Think: on' : 'Think: off';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.title = on ? 'The AI reasons before answering: more careful, much slower. Click for quick answers.'
                     : 'Quick answers. Click to let the AI think before answering (more careful, much slower).';
    }
    function closeBubble() {
        if (!bubble || bubble.hidden) return;
        bubble.hidden = true;
        var api = window.Asc && window.Asc.editor;
        try { api && api.asc_enableKeyEvents && api.asc_enableKeyEvents(true); } catch (e) {}
    }
    function placeBubble() {
        if (!bubble || bubble.hidden || !mascot) return;
        var r = mascot.getBoundingClientRect(), w = 340, h = bubble.offsetHeight || 380;
        var left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left - w + r.width));
        var top = r.top - h - 12;
        if (top < 60) top = Math.min(window.innerHeight - h - 12, r.bottom + 12);
        bubble.style.left = left + 'px';
        bubble.style.top = top + 'px';
    }

    // ── Mascot ────────────────────────────────────────────────────────────────
    var QUILL_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="aqf" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="var(--aero-accent, #3d8ee6)"/></linearGradient></defs>' +
        '<path d="M41 5C29 7 18 16 13 30l-3 9 3 1 3-8c9-2 17-9 21-19l-6 3 8-10z" fill="url(#aqf)" stroke="rgba(255,255,255,.85)" stroke-width="1.2"/>' +
        '<path d="M37 9C27 14 19 23 14 36" fill="none" stroke="rgba(20,40,70,.55)" stroke-width="1.2"/>' +
        '<path d="M9 42c1-2 2-3 3-3" stroke="rgba(20,40,70,.8)" stroke-width="2" stroke-linecap="round"/></svg>';

    function buildMascot(style) {
        if (mascot) mascot.parentNode.removeChild(mascot);
        mascot = null;
        if (style === 'off') { closeBubble(); return; }
        mascot = el('button', 'aero-mascot aero-mascot-' + style);
        mascot.type = 'button';
        mascot.title = 'Quill: click to ask, drag to move';
        mascot.setAttribute('aria-label', 'Open Quill, your AI helper');
        if (style === 'quill') mascot.innerHTML = QUILL_SVG;
        else mascot.appendChild(el('span', 'aero-orb-core'));
        mascot.addEventListener('click', function (e) {
            if (dragged) { dragged = false; e.preventDefault(); return; }       // end of a drag, not a click
            if (bubble && !bubble.hidden) closeBubble(); else openBubble();
        });
        mascot.addEventListener('dblclick', function () { saveHelper({ pinned: null }); follow(); syncFollowButton(); });
        mascot.addEventListener('pointerdown', startDrag);
        document.body.appendChild(mascot);
        follow();
    }

    // Drag Quill anywhere; it then stays there ("pinned") until "Follow my text" or a double-click.
    var dragged = false;
    function startDrag(e) {
        if (e.button !== 0) return;
        var sx = e.clientX, sy = e.clientY, moved = false;
        var r = mascot.getBoundingClientRect(), ox = sx - r.left, oy = sy - r.top;
        function move(ev) {
            if (!moved && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
            moved = true;
            mascot.classList.add('aero-mascot-dragging');
            var x = Math.max(0, Math.min(window.innerWidth - 44, ev.clientX - ox));
            var y = Math.max(0, Math.min(window.innerHeight - 44, ev.clientY - oy));
            mascot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
            lastPos = { x: x, y: y };
            placeBubble();
        }
        function up() {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('pointerup', up, true);
            mascot.classList.remove('aero-mascot-dragging');
            if (moved) {
                dragged = true;
                saveHelper({ pinned: { x: lastPos.x / window.innerWidth, y: lastPos.y / window.innerHeight } });
                syncFollowButton();
            }
        }
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
    }

    // Hover beside the text cursor / selection, inside the editing area.
    var lastPos = null;
    function follow() {
        if (!mascot) return;
        var pin = helperSettings().pinned;
        if (pin) {                                          // user-placed: stay put
            var px = Math.round(pin.x * window.innerWidth), py = Math.round(pin.y * window.innerHeight);
            lastPos = { x: px, y: py };
            mascot.style.transform = 'translate(' + px + 'px,' + py + 'px)';
            placeBubble();
            return;
        }
        var sdk = document.getElementById('editor_sdk');
        var area = sdk ? sdk.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        var c = document.getElementById('id_target_cursor');
        var x, y;
        if (c && c.offsetParent) {
            var cr = c.getBoundingClientRect();
            x = cr.right + 34; y = cr.top - 44;
        } else if (!lastPos) {
            x = area.right - 90; y = area.top + 40;
        } else { x = lastPos.x; y = lastPos.y; }
        x = Math.max(area.left + 8, Math.min(area.right - 56, x));
        y = Math.max(area.top + 8, Math.min(area.bottom - 56, y));
        lastPos = { x: x, y: y };
        mascot.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
        placeBubble();
    }
    var typingTimer = null;
    window.addEventListener('keydown', function () {
        if (!mascot) return;
        mascot.classList.add('aero-mascot-typing');
        clearTimeout(typingTimer);
        typingTimer = setTimeout(function () { mascot && mascot.classList.remove('aero-mascot-typing'); follow(); }, 900);
    }, true);
    ['mouseup', 'keyup'].forEach(function (t) { window.addEventListener(t, function () { setTimeout(follow, 30); }, true); });
    window.addEventListener('resize', follow);

    function apply() {
        var style = helperSettings().style || 'orb';
        if (!mascot && style === 'off') return;
        if (mascot && mascot.classList.contains('aero-mascot-' + style)) return;
        buildMascot(style);
    }
    window.AeroHelper = { open: openBubble, close: closeBubble, apply: apply };
    window.addEventListener('storage', function (e) { if (e.key === 'aero-settings') { apply(); follow(); syncFollowButton(); } });

    // Start once the editor area exists.
    (function wait(n) {
        if (document.getElementById('editor_sdk')) apply();
        else if (n < 300) setTimeout(function () { wait(n + 1); }, 200);
    })(0);
})();
