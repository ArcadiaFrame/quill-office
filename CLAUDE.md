# Quill Office (fork of Euro-Office DesktopEditors): project notes

## Repository, forks, build and license

- **Product name: "Quill Office"** in everything a user sees. Never add Euro-Office or ONLYOFFICE
  branding (names or logos) to the UI. Internal identifiers stay Euro-Office on purpose: the data
  path, registry keys, install folder, Linux package name `euro-office-desktopeditors`, and
  `/opt/euro-office/desktopeditors`. Changing them breaks in-place upgrades.
- **License: AGPL v3.** Keep `LICENSE`, `THIRD_PARTY_ASSETS.md`, and the About-box credits
  ("Quill Office is based on Euro-Office, which was based on ONLYOFFICE by Ascensio System SIA").
  Record every new third-party asset in `THIRD_PARTY_ASSETS.md`.
- **Remotes:** `origin` = github.com/ArcadiaFrame/quill-office (public); `upstream` =
  Euro-Office/DesktopEditors. Credits: a combined effort of ArcadiaFrame and Claude (README).
- **Forked submodules (branch `quill`, set in `.gitmodules`):**
  - `desktop-apps` → ArcadiaFrame/quill-desktop-apps: branding, icons, Aero Dark default and
    `aero:colors` (win-linux/src), the Inno installer (package/inno), the Linux .desktop
    entry and icons (package/common/linux), and the Linux Docker step
    (.docker/desktop-apps.bake.Dockerfile).
  - `core` → ArcadiaFrame/quill-core: the V8 `nc-build.py` gclient_paths fix.
  - Every other submodule (web-apps, sdkjs, desktop-sdk, …) is unmodified and points at Euro-Office.
    The Aero theme is an overlay (`aero/`), not a web-apps edit. Only fork a submodule when its
    source really has to change.
  - To commit in a submodule, commit on its `quill` branch, push it to the fork, then commit the new
    submodule pointer here.
- **Build (Windows):** `$env:BUILDX_BAKE_ENTITLEMENTS_FS="0"; .\build\windows\build.ps1 [-BuildCommon]`
  → `desktopeditors\` and `desktop-apps\package\inno\QuillOffice-Setup-<ver>-x64.exe`. The first
  build takes about 4 h, rebuilds 12–15 min. Close the app first: the build writes into the
  folder the user runs it from. Needs Win10 SDK 19041 with the Debugging Tools, 7-Zip and
  Inno Setup 6. Clear `NoDefaultCurrentDirectoryInExePath` in the agent shell.
- **Build (Linux):** `cd build/linux && BUILDX_BAKE_ENTITLEMENTS_FS=0 ./build.sh` →
  `build/linux/deploy/packages/*.deb|rpm|tar.xz`. It takes about 1–1.75 h. `BUILD_JOBS`
  (default 12, `--set desktop-linux.args.BUILD_JOBS=N`) caps parallel compiles: Ninja's default
  of CPU count + 2 made BuildKit run out of memory and crash ("EOF") with 16 GB for Docker.
- **Fixes applied on top of upstream** (details in `docs/upstream-patches.md`):
  - `build.ps1`: bake runs from `build\windows`, and the `docker cp` container stubs are removed.
  - `core` V8: the gclient_paths lru_cache is removed by regex, because depot_tools isn't pinned.
  - `desktop-apps`: the WINDOWS subsystem and exe icon, and the `--create-jump-list` installer hang.
  - Line endings: `.gitattributes` keeps .sh, Dockerfiles, .hcl, .m4 and .py LF, and
    `core.autocrlf input` is required on Windows (CRLF Dockerfiles break the bake). The Inno
    `_code.iss` and `_messages.iss` are CRLF upstream: keep them CRLF.
  - Build outputs are in `.gitignore` and `.dockerignore`: the in-source CMake tree, `common/`,
    `desktopeditors/`, `.vcpkg/`, the packaging outputs and the docker caches. Never commit them;
    installers go in GitHub Releases.

## Aero theme (UI restyle)

The goal is a Vista / Office 2007 "Aero" look (glass, obsidian panels, glossy ribbon, glows, smooth
animation), done entirely as a CSS override. Work on the already-built app; never run the full
build for styling.

- **Three Aero modes:** Dark (deep navy), Light (muted deep azure/cerulean) and
  Neutral (id `theme-aero-sepia`, shown as "Aero Glass Neutral"; sandstorm: parchment/sandstone, type light, default accent amber). Light and Sepia
  share the light-type rules via `body:is(.theme-aero-light, .theme-aero-sepia)`. Accent
  presets set `--aero-accent-rgb` for all modes but chrome tints only in Light. "blue" has no
  rule, so it means each theme's own default accent.
- **Matte Dark / Matte Light** (`theme-matte-dark|light`): the Aero Dark/Light palettes,
  icons, accent and interface color, but flat. The palette/icon/color blocks use
  `body:is(.theme-aero-x, .theme-matte-x)`. The glass rules (`:is(body.theme-aero-…)`) don't
  include matte, and a final block zeroes gloss/sheen/blur. The stock Light/Dark (compiled in,
  names from native code) remain as the untouched originals; renaming or hiding them needs the
  final rebuild.
- **Modes = UI themes.** `aero/uithemes/theme-aero-{light,dark,sepia}.json` ("Aero Glass Light/Dark/Sepia")
  are copied to `<app>/uithemes/`. The app loads `*.json` from there at startup
  (`cthemes.cpp` `searchLocalThemes`) and lists them in Settings > Interface theme. The stock
  themes (Light, Dark, ...) are the "flat/original" mode.
  - A theme file needs only `id`/`name`/`type`/`colors`. Colors not set fall back to the stock
    light/dark theme of the same `type`, which keeps text contrast right. Color keys are the
    web-apps tokens (full list: `web-apps/apps/common/main/resources/themes/*.json.example`).
  - The editors and the start page add `<theme-id>` and `theme-type-<light|dark>` classes to
    `<body>` (web-apps `Themes.js`). Custom theme colors become `:root .<id>{--token:...}`.
  - So `aero.css` scopes every rule under `body.theme-aero-light` / `body.theme-aero-dark`,
    and stock themes are untouched.
- **Icons (gotcha):** a custom theme falls back to the legacy "antique" icon sprites
  (`--sprite-button-icons-base-url: ../img`, 20 px), which render dark on dark. The stock
  Light/Dark (`theme-white`/`theme-night`) use v2 (`../img/v2`, uid `mod25`, 24 px icons,
  48 px small sprite). The dark variant is selected by `--button-*-icon-offset-x: -24px` and
  `--component-normal-icon-filter: invert(100%)`. aero.css copies those values. Its variable
  blocks use `:root body.theme-aero-*` so they outrank the stock `:root .theme-type-dark`.
- **Accent picker:** `aero/aero.js` (hooked with aero.css) adds a glowing swatch next to the
  status-bar zoom. It stores `localStorage['aero-accent']` and sets `<html
  data-aero-accent>` (blue, aqua, emerald, violet, rose, amber, graphite). aero.css maps each to
  `--aero-accent-rgb`, and in light mode also `--aero-tint-header` / `--aero-tint-ribbon`.
- **Papyrus page:** `html.aero-papyrus` → `#editor_sdk::after` click-through overlay with
  `mix-blend-mode: multiply` (`--aero-papyrus`), because sdkjs has no page-color setting
  (Dark Document = `Common.UI.Themes.setContentTheme('dark')` → sdk dark content mode, locked
  via `enumLock.inLightTheme` in light-type themes). Toggles:
  - the "Papyrus page" checkbox in the accent popover (all editors);
  - in Sepia, aero.js repurposes the View tab's `#slot-btn-dark-document` button (Document and
    PDF editors only): it relabels it, keeps it enabled with a MutationObserver, and intercepts
    the click in the capture phase.
  Stored in `localStorage['aero-papyrus']`.
- **Visual check without the user:** launch `desktopeditors\DesktopEditors.exe [--new:word]
  -WindowStyle Minimized`, wait about 20 s, then capture ONLY the app window (user32
  `PrintWindow`, see "Task Launcher" below). Don't use full-screen `CopyFromScreen`: it
  captures the user's other windows.
- **Source of truth:** `aero/aero.css`. It's the only stylesheet for the theme; never edit the
  app's own CSS files. Tunables are the `--aero-*` variables at the top (accent, glow-color,
  glass, edge, popup, shadow, gloss, blur, radius, glow, speed), with one block per mode.
- **Syntax check:** `apply-aero.py` parses every aero JS file with esprima first and refuses to deploy on
  errors. Beware shell heredocs/`sed`: they have mangled `\` and `'` several times. Prefer the Edit tool for JS edits.
- **Install/refresh:** `python aero/apply-aero.py [app_dir]` (default `desktopeditors/`). It copies
  `aero/*.css|html|js|fonts` to `editors/web-apps/apps/common/main/resources/aero/`, copies
  `aero/uithemes/*.json` to `<app>/uithemes/`, and inserts `<!-- aero --><link ... aero.css>`
  right after the `app.css` `<link>` in each editor's `main/index.html` and
  `main/index_loader.html` (document, spreadsheet, presentation, pdf, visio). It's idempotent.
  Theme JSON changes need an app restart.
- **Preview:** close every Euro-Office window, then run `desktopeditors\DesktopEditors.exe` (the
  dev tree, NOT the installed copy in Program Files) and open a document.
- **Rebuilds wipe the hook:** build.ps1 step 9 robocopies `common/` over `desktopeditors/`,
  overwriting the editor `index*.html`. Re-run `apply-aero.py` afterwards.
- **Editor CSS:** `editors/web-apps/apps/<editor>/main/resources/css/app.css` (minified, about 480
  KB). Search it with grep; don't read it whole. It's loaded with a `media="print"
  onload` swap, but cascade order follows document position, so aero.css still wins.
- **Useful selectors/vars** (from app.css):
  - Ribbon body: `#toolbar .toolbar .box-controls`, bg `var(--background-toolbar)`.
  - Tab/header strip: `#toolbar:not(.style-off-tabs)`, bg `var(--toolbar-header-document)`
    (with per-editor `--toolbar-header-{spreadsheet,presentation,pdf,visio}`).
  - Other toolbar vars: `--background-toolbar-tab`, `--background-toolbar-additional`,
    `--border-radius-toolbar`.
- Other editor selectors: tabs `.toolbar .tabs li(.active)`, title `#box-document-title`,
  buttons `.btn-toolbar`, panels `#left-menu` / `#right-menu` / `.statusbar`, menus
  `.dropdown-menu` (open: `.open > .dropdown-menu`), dialogs `.asc-window` (`> .header`).
- **Start page** (not an editor): `desktopeditors/index.html`, a single file with everything
  inlined, with theme classes on `<body>`. It's hooked with `aero/aero-start.css` + `aero.js`
  (`data-picker="off"`, accent only) before the first `</head>`.
  - Start-page colors are keyed by theme **id** (`loginpage/src/css/colors_<id>.less`: night,
    white, dark, ...). A custom theme would get the light defaults from `colors.less` (white
    panels with light text), so aero-start.css defines the full start-page variable set for
    both modes.
  - Start-page selectors: sidebar `.tool-menu > li.menu-item(.selected)`, buttons `.btn`,
    dialogs `dialog.dlg` (`.dlg-about`, ...), panels `.action-panel`.
- **No Selawik:** it's Microsoft-owned (even though it's OFL), so the "no Microsoft fonts" rule
  excludes it. The default interface font is the bundled Open Sans.

## Start page (loginpage) and the Task Launcher

- **Source:** `desktop-apps/common/loginpage/src/*.js` (jQuery views, one per panel: panels.js,
  panelrecent.js, paneltemplates.js, panelsettings.js, document-creation-grid.js), CSS/LESS in
  `src/css`, strings in `src/locale.js` + `locale/*.js`. Built by grunt
  (`loginpage/build/Gruntfile.js`) into `deploy/index.html` with everything inlined.
- **Create new (blank):** `window.sdk.command("create:new", "word"|"cell"|"slide"|"form")`
  (panels.js / panelrecent.js). The document-creation grid calls it.
- **Create from template:** `sdk.command('create:new', JSON.stringify({template:{id, type,
  path}}))` (paneltemplates.js:216). Native handler: `cascapplicationmanagerwrapper_private.h`
  `create:new` opens `path` as `etTemplateFile` (a new unsaved doc) with format `type`
  (AVS_OFFICESTUDIO_FILE_* codes: DOCX 65, XLSX 257, PPTX 129). **Any absolute path works, so
  the launcher needs no C++ changes.** There's also a `"template:<type>"` string form for a
  per-type default template.
- **Built-in templates:** `desktop-apps/common/templates/<LANG>/<Category>/[32]<base32 name>.dotx`
  → `<app>/converter/templates` (`system_templates_path`, main.cpp:107). The page requests them
  with `sdk.LocalFileTemplates(langs)` and the native side answers
  `window.onaddtemplates(json)` with native-generated previews (desktop-sdk
  `m_oTemplatesCache`). `document-templates/new/<lang>/` = blank "new" files → `converter/empty`.
- **Built-in template content (EN):** 10 documents, 7 spreadsheets, 10 presentations, 10 PDF
  forms (resume, invoice, pay stub, P&L, amortization, Gantt, agenda, SWOT, timeline,
  planners, certificates...). Names decode with base32 (`[32]<b32>.ext`, pad with `=`). They
  already ship in the app, so the launcher can reference them in place.
- **Fastest start-page rebuild:** Node isn't installed on the host. Build only the `desktop-js`
  bake target and copy `/app/loginpage/deploy/index.html` over `desktopeditors/index.html`
  (the root .dockerignore keeps the context small). A full build overwrites it again.

## Task Launcher (start page add-on)

- **Files:** `aero/launcher/tasks.json` (the only data file: categories plus tasks with
  category/editor/name/description/template[/thumbnail]), `launcher.js`, `launcher.css`.
  `apply-aero.py` copies `aero/launcher/` to `.../resources/aero/launcher/` and generates
  `tasks.js` (`window.AERO_TASKS`), because raw JSON isn't reliably loadable from file:// pages.
- **Templates:** `"builtin:<display name>"` resolves through the app's own template list:
  `sdk.on('onaddtemplates', ...)` (multiple subscribers are fine), then
  `sdk.LocalFileTemplates(['en-US','en_US','en'])`. Items have `{name, path, type, icon}`;
  `icon` is HTML-encoded and is the native preview, used as the thumbnail. Otherwise it's a
  path relative to `aero/launcher/`, with the format from its extension (DOCX 65, DOTX 76,
  XLSX 257, XLTX 262, PPTX 129, POTX 135).
- **Creating:** blank → `sdk.command('create:new','word'|'cell'|'slide')`; template →
  `sdk.command('create:new', JSON.stringify({template:{id:0,type,path}}))`.
- **Wiring:** it inserts `li.menu-item > a[action="launcher"]` first in `.tool-menu` and
  `.action-panel.launcher` into `.main-column.col-center`. The start page's own `onActionClick`
  handles switching. Once the page has made its initial selection, the launcher clicks its own
  item so the page opens on it.
- **Gotcha:** the start page styles every `<button>` with a fixed height, so launcher.css resets
  height/line-height/white-space for `.aero-launcher button`.
- **Screenshots:** capture only the app window (user32 `PrintWindow` with flag 2 via PowerShell
  Add-Type; launch with `-WindowStyle Minimized`), not the whole screen. The user's other
  windows may be in front.

## Original templates (launcher Step 3)

- `aero/templates/build_templates.py` (python-docx / openpyxl / python-pptx) → `aero/templates/out/
  {Documents,Spreadsheet,Presentation}/<Name>.docx|xlsx|pptx`. It builds 18 original templates
  in navy/cerulean with the bundled fonts, and blank author fields.
- **The app's template scanner (desktop-sdk templatesmanager.h) takes EVERY file** under
  `converter/templates/<LANG>` (plus the user templates dir). The display name is the file name
  (base32 only if the name starts with `[32]`), and thumbnails are rendered with x2t
  (`m_nFormatTo 1025` + `m_oThumbnail`). So `apply-aero.py` copies the out/ files to
  `<app>/converter/templates/EN/<folder>/`, and tasks.json uses `builtin:<Name>`.
- `aero/templates/preview.py` renders the same x2t thumbnails into a contact sheet (visual check).

## Fonts and the default document font

- **Font engine:** there are no FreeType variable-font calls in `core/DesktopEditor`, so
  variable fonts would only show their default instance. `aero/fonts/build_fonts.py` fetches 16
  OFL families (google/fonts pinned at 23e54b5, OpenDyslexic at 1824da5) and instances
  variable ones to static R/B/I/BI with fontTools (RIBBI names and fsSelection/macStyle set).
  It only instances families WITHOUT an OFL Reserved Font Name. RFN + variable-only families
  (Source Sans 3, Merriweather, Libre Baskerville, Lora, Playfair, Raleway, Dancing Script,
  Lexend) are left out. Output goes to `aero/fonts/out/` and the fonts table in
  `THIRD_PARTY_ASSETS.md` is regenerated. Needs `pip install fonttools`.
- **Install:** `apply-aero.py` copies them to `<app>/fonts/aero-extra` and re-runs
  `allfontsgen` (same arguments as build.ps1 step 9b) when the file set changes (`.stamp`). The
  build deletes `allfontsgen.exe` from `converter/`, so the script temporarily copies
  `<repo>/allfontsgen/allfontsgen.exe` back in (it needs the converter DLLs), then removes it.
- **Default font:** `aero/aero.json` `defaultDocumentFont` (Courier Prime). Blank documents take
  their body font from the theme's `minorFont` Latin typeface (stock: Arial in all 45
  `converter/empty/<lang>/new.docx`). The script rewrites them from `new.docx.orig` backups.
  `blankFonts` → `launcher/blanks/<font>.docx` for the launcher's "Blank document font" menu
  (`localStorage['aero-blank-font']`). The default font uses the native blank; others use the
  generated blank as a template.

## Personalize (settings) — status and gotchas

- Files: `aero/settings.js` (shared core, `localStorage['aero-settings']`, storage-event sync),
  `aero/personalize.js` + `.css` (start-page panel, sidebar item before Settings),
  `aero/newdoc.js` (editor side: defaults for new blank documents).
- **The production SDK (`sdkjs/*/sdk-all-min.js`) does NOT export `callCommand`** (the name
  is minified; only `asc_*` API names survive), so `Asc.editor.callCommand` is undefined.
  Defaults are applied instead by the **"Aero Defaults" system plugin**
  (`aero/plugin-defaults`, guid `{6A5E9C2B-3F4D-4E8A-9B1C-AE20D5F0C001}`, `isSystem: true` =
  hidden and auto-started; `events: onDocumentContentReady`). `apply-aero.py` installs it to
  `<app>/editors/sdkjs-plugins/{guid}`. It reads `window.parent.AeroSettings` and only acts
  on unsaved (`AscDesktopEditor.LocalFileGetSourcePath() === ''`) AND empty files.
  Word: default text/para pr + section size/margins. Cell: font on `A:XFD`. Slide: `SetSizes`.
- **All fonts:** the menus list `window.__fonts_infos` (the start page loads
  `editors/sdkjs/common/AllFonts.js`) plus `AERO_FONT_FILES`. `apply-aero.py` builds
  `fonts-index.js` (`AERO_FONT_FILES`: bundled families under the app dir, as app-relative
  paths, from native `converter/AllFonts.js`). settings.js injects `@font-face` for a chosen
  bundled interface font; installed fonts work by name.
- **Interface color:** the CSS palettes stay PLAIN (#hex/rgba). `apply-aero.py` generates
  `palette.js` (`AERO_PALETTE`: base colors per page (editor/start) and mode (dark/light),
  scraped from the palette blocks; base hue 216 dark / 208 light / 38 neutral). ONE
  `uiColor {hue, sat}` applies to all three modes (null = each theme's own). settings.js hue-shifts each
  color in JS (keeping S/L; neutrals kept), inlines the results on `<body>` and, in editors,
  sends the skin via `Asc.editor.asc_setSkin({...tokens, name, type})`.
  **Don't use `hsl(calc(var(...)))` formulas for theme tokens:** web-apps copies
  `themeColorTokens` as raw text to the canvas engine (sdkjs skin.js `RgbaTextToRgbaHex` only
  parses #hex and `rgb(r,g,b)`), which then painted the canvas black.
- **Keyboard shortcuts:** the editors have built-in customizable shortcuts
  (`Common.Views.ShortcutsDialog`, File → Advanced settings). The accent popover's
  "Keyboard shortcuts…" opens it with `{api: Asc.editor}`. App-level shortcuts (native): Ctrl+O,
  Ctrl+W/Ctrl+F4, Ctrl+(Shift+)Tab, Alt+F4.
- **Window bar (Qt tab strip) follows the interface color** through the native `aero:colors`
  command (see "Quill Office packaging" below). Native colors otherwise come only from the theme
  JSON, and `uitheme:add` needs a file dialog.
- **App icon:** the exe had none (version.rc isn't in the CMake build). It's fixed in
  win-linux/CMakeLists.txt with a generated icon-only app_icon.rc.
- **Don't force-close the app for tests while the user may be using it** (they may have
  unsaved work). Ask first, or only test when the user says the app is free.

## Quality-of-life features (B)

- `aero/quality.js` (editors, hooked after aero.js). **Command search: Ctrl+Q** (Alt+Q and
  Ctrl+Alt+Q are the editors' chat shortcuts). It indexes `section.panel[data-tab] button`
  labels (`aria-label` = tooltip, or `.caption`) with tab names from
  `.toolbar .tabs li.ribtab > a[data-tab]` (data-title), plus Aero actions. To run a command
  it clicks the tab `a`, then `button.click()`. While open it calls
  `Asc.editor.asc_enableKeyEvents(false)` (restored on close). Also reachable from the orb
  popover. `window.AeroCommandSearch.open()`.
- **Focus mode (F11 / Ctrl+Shift+F, Esc exits):** clicks the View tab's own checkboxes
  (`section.panel[data-tab=view] label.checkbox-indeterminate`, name from
  `#<input id>-description`: always show toolbar, status bar, left/right panel, rulers,
  formula bar, headings) off, remembers which were on, and restores them.
- **Reading ruler (Ctrl+Shift+E):** `#aero-reading-ruler` overlay sized to `#editor_sdk`; the band
  follows the mouse and the caret (`#id_target_cursor`) with a 100vmax box-shadow dim.
- Free keys checked in sdkjs `*/Shortcuts.js` (`AscShortcut(type, key, ctrl, shift, alt)`):
  Ctrl+Shift+F/E and F11 are unused; Ctrl+Shift+R/L are taken.
- **Status bar tools** (`aero/statusbar.js`): `#aero-tools` is inserted before the first zoom
  button next to `.cnt-zoom` (all editors). It hides the fit/zoom buttons (their sprite icons are
  missing from the v2 set = invisible; ids btn-zoom-*/status-btn-zoom*). It has Search, Focus,
  Ruler, Papyrus and a "View & highlights" menu (View tab checkboxes + aria-pressed toggles +
  Home formatting marks + zoom commands clicking the hidden native buttons), and moves the
  accent orb in. `window.AeroQuick.{focus,ruler,isFocus,isRuler,onChange}`.
- **Launcher favorites and recent:** ★ per card (sibling of the card button), plus
  "★ Favorites" / "⟲ Recently used" categories. `localStorage['aero-launcher-favorites'|'aero-launcher-recent']`,
  ids "editor|name".

## AI helper (aero/helper.js, editors)

- Mascot (`AeroSettings.helper.style`: orb | quill | off) positioned beside `#id_target_cursor`,
  clamped to `#editor_sdk`, fading while typing. Click → `#aero-help-bubble` chat.
- **Ollama access:** a plain `fetch` from file:// pages sends `Origin: null`, which Ollama rejects
  (403). Use the desktop's native `window.AscSimpleRequest.createRequest({url, method, headers, body,
  complete(e){e.responseText}, error})`, injected into every frame (client_renderer_wrapper.cpp,
  CEF > 102). This is how the bundled AI plugin reaches local URLs too.
- Model: `helper.model` or auto (prefers qwen3.5/gemma4/granite4.1/…, skips coder/embed). `think:false`,
  `keep_alive 10m`, warm-up `/api/generate` when the bubble opens (the first load of a 9B model took
  about 85 s here).
- Actions: the model writes `[[do: Command]]` (and **bold** names are also tried) →
  `AeroCommandSearch.find(name)` (score ≥ 30) → a button that runs it via `AeroCommandSearch.run`.
- Personalize "AI helper" section: style, model (from `/api/tags` via AscSimpleRequest), include selection.
- **Quill** (the default mascot; the user chose it over the orb). Persona = `helper.persona` or
  `DEFAULT_PERSONA` (a warm writing companion that offers tips), prepended to the system prompt.
  The bubble header has Follow my text (when pinned), ⟲ Reset and ×. Drag with pointer events →
  `helper.pinned {x,y}` as fractions of the window. Double-click or "Follow my text" unpins.
  `helper.v2` migration switches old saved "orb" to "quill" once.
- **AI plugin right-click menu:** every sub-item needs checker "Selection" or "Target"
  (v1 plugins.js `ButtonContextMenu.onContextMenuShow` matches `options.type`). Right-clicking
  blank space gives type None → an empty "AI" submenu. Not a build bug.

## Aero plugins (aero/plugins/<name>/)

- `apply-aero.py` installs every `aero/plugins/*/config.json` folder to
  `<app>/editors/sdkjs-plugins/{guid}`. Icons are drawn by `aero/plugins/make_icons.py` (Pillow,
  original line art, 28 px base, light/dark, 5 scales; add a glyph function per plugin).
  Panel plugins: `isVisual: true, isInsideMode: true`. Pages load `../v1/plugins.js`,
  `plugins-ui.js`, `plugins.css`.
- **Accessibility Checker** `{7F3C1A2E-4B5D-4C6E-8A9F-0B1C2D3E4F01}` (word). Builder scan: headings
  (skips/empty/none), blank-line runs, hyperlink text (`GetDisplayedText`), tables
  (`GetTableTitle/Description`), `GetCore().GetTitle()`. **The Builder API has no drawing alt
  text**, so it selects each drawing (`GetAllDrawingObjects()[i].Select()`) and reads
  `window.parent.Asc.editor.getSelectedElements()` → Image → `asc_getTitle/asc_getDescription`.
  Fix: `new Asc.asc_CImgProperty()` + `asc_putDescription` + `api.ImgApply`.
- Minified SDK exports: only asc_* and names web-apps calls survive (e.g. `zoom`, `zoomIn`,
  `zoomOut`, `getSelectedElements`, `ImgApply`, `asc_GetSelectedText`, `asc_setSkin`). There's no
  SelectAll and no callCommand. Check with `grep -oE "\.name=" sdk-all-min.js`.
- **Quick Parts** `{2C9D4E6F-8A1B-4C3D-9E5F-7A6B5C4D3E02}` (word/cell/slide panel): a library
  (`localStorage['aero-quickparts']`, seeded with original starter parts) inserted with
  `executeMethod('PasteText')`, and "save selection" with `GetSelectedText`. "My dictionary":
  `api.asc_spellCheckAddToDictionary(word)` (accepts a plain string). Natively only
  `AscDesktopEditor.SpellCheck({"type":"add"|"clear", usrWords})` exist (no single remove), so
  removal = clear + re-add the mirrored list `localStorage['aero-dictionary']`. The user dict
  file is `<appdata>/data/dictionaries/all/all.dic`.
- **Clipboard History** `{9E1D2C3B-4A5F-4B6C-8D7E-1F2A3B4C5D03}`: the recorder is in quality.js
  (copy/cut capture → `api.asc_GetSelectedText()`, which all 3 editors export; you can't read
  clipboardData in a copy event) → `localStorage['aero-clipboard']` (30 unpinned + pinned,
  dedupe, ≤20k chars; `aero-clipboard-paused`). The panel pastes with PasteText and updates live
  via storage events.
- **Document Inspector** `{4B8A6C2D-9E1F-4A3B-8C5D-2E6F7A8B9C04}` (word): `GetAllComments()`/`Delete`,
  `GetReviewReport()` + `Accept/RejectAllRevisionChanges`, `IsTrackRevisions/SetTrackRevisions`,
  `GetCore()` Creator/LastModifiedBy/Subject/Keywords/Category/Description, and
  `GetAllBookmarksNames` (report only).
- **Aero Defaults diagnostics:** the plugin writes `localStorage['aero-defaults-log']`
  ({time, editor, status: applied|skipped|error, detail}). Personalize shows it under each
  defaults section with a "Save defaults" button, and a toast appears in the editor when applied.
  New-file test: source path '' OR `…/converter/empty/<lang>/new.*`. Init retries until
  `AeroSettings` and the editor are ready.
- **Immersive reader** (quality.js, Ctrl+Shift+I, Esc): focus + ruler + papyrus + zoom 130 and a
  floating bar (Read aloud via `speechSynthesis` on `asc_GetSelectedText()`, A−/A+, Exit).
  It restores the previous state on exit. It's also a status-bar tool.

## Asset rules

- UI font: Open Sans (bundled) by default; users can pick another in Personalize.
- Never use Microsoft-owned icons, fonts, sounds or images.
- Before adding any third-party icon or sound, check its license and record it in
  `THIRD_PARTY_ASSETS.md`.

## Build notes

Full Windows build: `build\windows\build.ps1` (needs `$env:BUILDX_BAKE_ENTITLEMENTS_FS="0"`, and
`-BuildCommon` to rebuild the web/plugin payload). Linux: see the top section. Local patches and
upstream-report notes are in `docs/upstream-patches.md` (keep it up to date when adding a fix).

## Local AI control (settings.js ai, aero-ai.js)

- `AeroSettings.ai = {think, timeoutMin, profile}`; `AI_PROFILES` light 8k/2m, balanced 16k/15m, full 32k/60m;
  `aiRuntime()` gives {numCtx, keepAlive} (thinking forces at least 16k).
- Ollama /v1 (the AI plugin) IGNORES options.num_ctx and keep_alive but REUSES an already loaded model
  (tested 0.34.4). So aero-ai.js checks /api/ps and preloads with /api/generate {prompt:'', options:{num_ctx},
  keep_alive} when the context differs. Quill sends num_ctx/keep_alive on /api/chat itself.
- Thinking off on /v1 = `reasoning_effort: "none"` (`think:false` is ignored there). 18 s to 1.8 s.
- OLLAMA_ORIGINS cannot list onlyoffice:// or file:// (the server panics: "bad origin"); only "*" works,
  which exposes Ollama to every website. So streamed chat stays on the plugin's non-stream fallback.
- aero-ai.js is inserted into the AI plugin's index.html after register.js; wraps AscSimpleRequest
  and fetch, wraps global registerButtons to add AI > Thinking; status pill `.aero-ai-status` (aero.css).

## Quill Office packaging (final stage)

- Name: display strings only (defines.h APP_TITLE/WINDOW_NAME/APP_SIMPLE_WINDOW_TITLE, version.h,
  cmainwindowimpl appname, inno defines.iss sAppName/sAppIconName/ASSOC names, extDOCXF messages,
  start page via apply-aero). Kept on purpose: data path/registry (Euro-Office\DesktopEditors),
  install folder and uninstall key (upgrade in place), "Euro-Office cloud" strings (the server product),
  About credits. _messages.iss is CRLF: sed -i turned it LF once; restore CRLF if touched.
- Window bar color: native command "aero:colors" {theme, colors} -> CThemes::overrideCurrentColors +
  CMainWindow::refreshThemeColors (no uitheme:changed, which would loop). settings.js sendNativeColors,
  palette.js "native" = colors of aero/uithemes/*.json.
- Icon: aero/icon/quill-office.svg -> build_icon.py (Edge headless needs --do-not-de-elevate in an
  elevated shell) -> .ico copied over the 4 desktopeditors*.ico files; apply-aero writes <app>/app.ico
  (the installer's shortcuts used a nonexistent app.ico before).
- Installer: aero/installer/build_installer_art.py replaces the ONLYOFFICE-logo WizImage/WizSmallImage
  PNGs and makes look-*.bmp; _code.iss "Choose your look" page (after Welcome) writes HKCU
  Software\Euro-Office\DesktopEditors UITheme; native default is theme-aero-dark.json.
- build.ps1 step 9c runs aero/apply-aero.py on the install dir (after step 9's common overlay).
- Extensions: Plugin Manager removed (apply-aero + SDKJS_PLUGINS); "plugin" -> "extension" in en.json.
- Task Launcher: PDF form tile; online templates from window.app.controller.templates.templates
  (cloud -> PreviewTemplateDialog, local -> create:new template).
