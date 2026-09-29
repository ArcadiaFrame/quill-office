#!/usr/bin/env python3
"""Install the Aero theme into a built Euro-Office app tree (idempotent).

Copies aero/aero.css to <app>/editors/web-apps/apps/common/main/resources/aero/
and adds a <link> to it right after the app.css <link> in every editor's
index.html and index_loader.html, so it loads after (and overrides) app.css.
Copies aero/uithemes/*.json (Aero Glass Light/Dark/Sepia) to <app>/uithemes/.
Also: extra fonts (aero/fonts/out → <app>/fonts/aero-extra + allfontsgen), the default
document font from aero/aero.json (blank new.docx files, originals kept as .orig), the
Task Launcher (aero/launcher → tasks.js + per-font blank documents), and the start-page hook.

Usage: python aero/apply-aero.py [app_dir]   (default: <repo>/desktopeditors)
"""
import re
import shutil
import sys
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
app = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else repo / "desktopeditors"
apps_dir = app / "editors" / "web-apps" / "apps"
if not apps_dir.is_dir():
    sys.exit(f"not an app dir (missing {apps_dir})")

# Never deploy a script with a syntax error: one broken file can take down a whole feature
# (e.g. the Personalize panel). Uses esprima if installed (pip install esprima).
try:
    import esprima
    _bad = []
    _aero = repo / "aero"
    for _js in list(_aero.glob("*.js")) + list(_aero.glob("launcher/*.js")) + list(_aero.glob("plugins/*/*.js")) + \
               list(_aero.glob("plugin-defaults/*.js")) + list(_aero.glob("plugin-ai/*.js")):
        if _js.name == "tasks.js":
            continue
        try:
            esprima.parseScript(_js.read_text(encoding="utf-8"))
        except Exception as _e:
            _bad.append(f"{_js.relative_to(repo)}: {_e}")
    if _bad:
        sys.exit("NOT deployed, JavaScript syntax errors:\n  " + "\n  ".join(_bad))
except ImportError:
    print("  (esprima not installed: skipping the JavaScript syntax check)")

dest = apps_dir / "common" / "main" / "resources" / "aero"
dest.mkdir(parents=True, exist_ok=True)
for f in (repo / "aero").glob("*"):
    if f.suffix in (".css", ".html", ".js", ".woff2", ".woff", ".ttf"):
        shutil.copy2(f, dest / f.name)

# Interface font: bundled Open Sans (core-fonts/opensans) next to aero.css for @font-face.
ui_fonts = dest / "ui-fonts"
ui_fonts.mkdir(exist_ok=True)
for f in (repo / "core-fonts" / "opensans").glob("*"):
    if f.suffix.lower() in (".ttf", ".txt"):
        shutil.copy2(f, ui_fonts / f.name)
# Accessibility/alternative interface fonts (from aero/fonts/out, built by build_fonts.py).
for fam, files in {"AtkinsonHyperlegible": ["AtkinsonHyperlegible-Regular.ttf", "AtkinsonHyperlegible-Bold.ttf"],
                   "OpenDyslexic": ["OpenDyslexic-Regular.otf", "OpenDyslexic-Bold.otf"],
                   "NotoSans": ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf"]}.items():
    for name in files:
        src = repo / "aero" / "fonts" / "out" / fam / name
        if src.is_file():
            shutil.copy2(src, ui_fonts / name)

import hashlib
import json
import subprocess
import zipfile

config = json.loads((repo / "aero" / "aero.json").read_text(encoding="utf-8"))
default_font = config.get("defaultDocumentFont", "Arial")


def docx_with_body_font(src, dst, font):
    """Copy a blank .docx, setting the theme's minor (body) Latin font."""
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            if item.filename == "word/theme/theme1.xml":
                xml = data.decode("utf-8")
                xml = re.sub(r'(<a:minorFont>\s*<a:latin typeface=")[^"]*(")', r'\g<1>' + font + r'\g<2>', xml, count=1)
                data = xml.encode("utf-8")
            zout.writestr(item, data)


# Extra fonts: aero/fonts/out (built by aero/fonts/build_fonts.py) -> <app>/fonts/aero-extra,
# then re-run the app's font indexer (same arguments as build.ps1 step 9b) when they change.
fonts_src = repo / "aero" / "fonts" / "out"
if fonts_src.is_dir():
    fonts_dest = app / "fonts" / "aero-extra"
    files = sorted(p for p in fonts_src.rglob("*") if p.suffix.lower() in (".ttf", ".otf"))
    stamp = hashlib.sha1("".join(f"{p.name}:{p.stat().st_size};" for p in files).encode()).hexdigest()
    stamp_file = fonts_dest / ".stamp"
    if not stamp_file.is_file() or stamp_file.read_text() != stamp:
        if fonts_dest.exists():
            shutil.rmtree(fonts_dest)
        shutil.copytree(fonts_src, fonts_dest)
        conv = app / "converter"
        # The Windows build deletes allfontsgen.exe from converter/ after step 9b (it isn't
        # shipped); copy the build output back in temporarily so it finds its DLLs, as the build
        # does. The Linux Docker build runs this script before it deletes converter/allfontsgen.
        gen_name = "allfontsgen.exe" if sys.platform == "win32" else "allfontsgen"
        gen = conv / gen_name
        temp_gen = not gen.exists()
        if temp_gen:
            src_gen = next((p for p in (repo / "allfontsgen" / gen_name,
                                        repo / "package" / gen_name) if p.is_file()), None)
            if src_gen is None:
                sys.exit(f"{gen_name} not found (run the full build once)")
            shutil.copy2(src_gen, gen)
        cmd = [str(gen), "--use-system=1",
               f"--input={app / 'fonts'}", f"--input={repo / 'core-fonts'}",
               f"--allfonts={conv / 'AllFonts.js'}",
               f"--allfonts-web={app / 'editors' / 'sdkjs' / 'common' / 'AllFonts.js'}",
               f"--output-web={app / 'editors' / 'fonts'}",
               f"--selection={conv / 'font_selection.bin'}"]
        print(f"  fonts           {len(files)} files -> fonts/aero-extra; running allfontsgen...")
        try:
            rc = subprocess.run(cmd, cwd=conv).returncode
        finally:
            if temp_gen:
                gen.unlink(missing_ok=True)
        if rc != 0:
            print(f"  WARNING allfontsgen exit {rc}")
        else:
            stamp_file.write_text(stamp)
    else:
        print(f"  fonts           up to date ({len(files)} files)")

# Font index for on-demand interface fonts: families whose files live inside the app folder
# (bundled fonts the embedded browser can't see), as paths relative to the app root.
# Installed Windows fonts need no entry: the browser finds them by name.
native_fonts = app / "converter" / "AllFonts.js"
index = {}
if native_fonts.is_file():
    txt = native_fonts.read_text(encoding="utf-8-sig", errors="ignore")
    def js_array(name):
        i = txt.index('window["%s"]' % name); j = txt.index("= [", i) + 2; k = txt.index("];", j)
        return json.loads(txt[j:k + 1])
    files, infos = js_array("__fonts_files"), js_array("__fonts_infos")
    app_prefix = app.as_posix().rstrip("/") + "/"
    for info in infos:
        entry = {}
        for key, pos in (("r", 1), ("i", 3), ("b", 5), ("bi", 7)):
            idx = info[pos]
            if 0 <= idx < len(files) and files[idx].replace("\\", "/").lower().startswith(app_prefix.lower()):
                entry[key] = files[idx].replace("\\", "/")[len(app_prefix):]
        if entry.get("r"):
            index[info[0]] = entry
(dest / "fonts-index.js").write_text(
    "window.AERO_FONT_FILES = " + json.dumps(index, ensure_ascii=False, indent=0) + ";\n", encoding="utf-8")
print(f"  font index      {len(index)} bundled families")

# Interface color: the base Aero Dark/Light palettes (plain hex/rgba from the CSS blocks),
# per page type, for settings.js to hue-shift when the user picks an interface color.
NL = "\n"
PALETTE_BLOCKS = {
    ("editor", "dark"): ("aero.css", [":root body:is(.theme-aero-dark, .theme-matte-dark) {" + NL + "    --aero-accent-rgb:",
                                      ":root body:is(.theme-aero-dark, .theme-matte-dark) {                      /* deep brilliant navy */"]),
    ("editor", "light"): ("aero.css", [":root body:is(.theme-aero-light, .theme-matte-light) {" + NL + "    --aero-accent-rgb:",
                                       ":root body:is(.theme-aero-light, .theme-matte-light) {                     /* muted deep azure / cerulean */"]),
    ("start", "dark"): ("aero-start.css", [":root .theme-aero-dark.theme-type-dark, :root .theme-matte-dark.theme-type-dark {" + NL + "    --aero-accent:"]),
    ("start", "light"): ("aero-start.css", [":root .theme-aero-light.theme-type-light, :root .theme-matte-light.theme-type-light {" + NL + "    --aero-accent:"]),
    ("editor", "sepia"): ("aero.css", [":root body.theme-aero-sepia {" + NL + "    --aero-accent-rgb:",
                                       ":root body.theme-aero-sepia {                     /* sandstorm: warm parchment and sandstone */"]),
    ("start", "sepia"): ("aero-start.css", [":root .theme-aero-sepia.theme-type-light {  /* sandstorm */"]),
}
palette = {"base": {"dark": 216, "light": 208, "sepia": 38}, "editor": {}, "start": {}}
for (page, mode), (css_name, markers) in PALETTE_BLOCKS.items():
    css = (repo / "aero" / css_name).read_text(encoding="utf-8")
    colors = {}
    for marker in markers:
        i = css.index(marker); j = css.index(NL + "}", i)
        for name, value in re.findall(r"(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))\s*;", css[i:j]):
            colors[name] = value
    palette[page][mode] = colors
# Native window colors (Qt tab strip and window bar) per theme id, from the uithemes JSON:
# settings.js hue-shifts these too and sends them with AscDesktopEditor.execCommand("aero:colors").
palette["native"] = {}
for theme_file in sorted((repo / "aero" / "uithemes").glob("*.json")):
    theme = json.loads(theme_file.read_text(encoding="utf-8"))
    palette["native"][theme["id"]] = {k: v for k, v in theme.get("colors", {}).items()
                                      if isinstance(v, str) and re.fullmatch(r"#[0-9a-fA-F]{3,8}", v)}
(dest / "palette.js").write_text("window.AERO_PALETTE = " + json.dumps(palette, indent=1) + ";" + NL, encoding="utf-8")
print(f"  palette         " + ", ".join(f"{p}/{m} {len(palette[p][m])}" for p, m in PALETTE_BLOCKS))

# "Aero Defaults" system plugin: applies Personalize defaults to new blank files.
plugin_src = repo / "aero" / "plugin-defaults"
if plugin_src.is_dir():
    guid = json.loads((plugin_src / "config.json").read_text(encoding="utf-8"))["guid"].replace("asc.", "")
    plugin_dest = app / "editors" / "sdkjs-plugins" / guid
    shutil.copytree(plugin_src, plugin_dest, dirs_exist_ok=True)
    print(f"  plugin          Aero Defaults -> editors/sdkjs-plugins/{guid}")
(dest / "newdoc.js").unlink(missing_ok=True)   # replaced by the plugin

# Original Task Launcher templates (aero/templates/out, built by build_templates.py) go into
# the app's English template folder: the app lists them in its Templates panel and renders
# their thumbnails; the launcher refers to them as "builtin:<file name>".
tpl_src = repo / "aero" / "templates" / "out"
if tpl_src.is_dir():
    n = 0
    for f in tpl_src.rglob("*"):
        if f.suffix.lower() in (".docx", ".xlsx", ".pptx"):
            target = app / "converter" / "templates" / "EN" / f.parent.name / f.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, target)
            n += 1
    print(f"  templates       {n} original templates -> converter/templates/EN")

# Aero feature plugins (aero/plugins/<name>/ with a config.json), e.g. Accessibility Checker.
for cfg in sorted((repo / "aero" / "plugins").glob("*/config.json")):
    guid = json.loads(cfg.read_text(encoding="utf-8"))["guid"].replace("asc.", "")
    shutil.copytree(cfg.parent, app / "editors" / "sdkjs-plugins" / guid, dirs_exist_ok=True)
    print(f"  plugin          {cfg.parent.name} -> editors/sdkjs-plugins/{guid}")

# No Plugin Manager (store/plugin): every extension is bundled, and the manager's store would
# only offer upstream plugins that bypass the Aero integration. Also dropped from the build
# (SDKJS_PLUGINS in build/docker-bake.hcl).
plugin_manager = app / "editors" / "sdkjs-plugins" / "{AA2EA9B6-9EC2-415F-9762-634EE8D9A95E}"
if plugin_manager.exists():
    shutil.rmtree(plugin_manager)
    print("  plugin          Plugin Manager removed")

# "Plugins" are called "Extensions" in the interface (the Extensions ribbon tab, left-menu tip,
# panel buttons). Rewrites the English strings from a pristine backup (en.json.orig).
for en in sorted(apps_dir.glob("*/main/locale/en.json")):
    orig = en.with_name("en.json.orig")
    if not orig.exists():
        shutil.copy2(en, orig)
    strings = json.loads(orig.read_text(encoding="utf-8"))
    for key, value in strings.items():
        if isinstance(value, str) and "lugin" in value:
            strings[key] = (value.replace("Plugins", "Extensions").replace("plugins", "extensions")
                                 .replace("Plugin", "Extension").replace("plugin", "extension"))
    en.write_text(json.dumps(strings, ensure_ascii=False, indent=2), encoding="utf-8")
print("  strings         Plugins -> Extensions (English)")

# Bundled AI plugin: aero/plugin-ai/aero-ai.js is loaded right after its register.js. It adds
# thinking on/off (Ollama reasoning_effort), the Personalize time limit, a "AI is working… 0:12"
# pill and an AI > Thinking right-click item, without editing the plugin's own scripts.
ai_plugin = app / "editors" / "sdkjs-plugins" / "{9DC93CDB-B576-4F0C-B55E-FCC9C48DD007}"
if ai_plugin.exists():
    shutil.copy2(repo / "aero" / "plugin-ai" / "aero-ai.js", ai_plugin / "scripts" / "aero-ai.js")
    idx = ai_plugin / "index.html"
    html = idx.read_text(encoding="utf-8")
    if "scripts/aero-ai.js" not in html:
        anchor = '<script type="text/javascript" src="scripts/engine/register.js"></script>'
        html = html.replace(anchor, anchor + '\n  <script type="text/javascript" src="scripts/aero-ai.js"></script>', 1)
        idx.write_text(html, encoding="utf-8")
    # Undo the earlier direct edit of ollama.js (aero-ai.js does this now, switchable).
    ollama_js = ai_plugin / "scripts" / "engine" / "providers" / "internal" / "ollama.js"
    src = ollama_js.read_text(encoding="utf-8")
    if "aero: no thinking" in src:
        a = src.index("\tgetChatCompletions(message, model) {")
        b = src.index("\tgetImageGeneration(message, model) {")
        ollama_js.write_text(src[:a] + src[b:], encoding="utf-8")
    print("  AI plugin       aero-ai.js (thinking toggle, time limit, status)")

# Default document font: rewrite every blank new.docx from a pristine backup (new.docx.orig).
empty_dir = app / "converter" / "empty"
count = 0
for new_docx in sorted(empty_dir.glob("*/new.docx")):
    orig = new_docx.with_name("new.docx.orig")
    if not orig.exists():
        shutil.copy2(new_docx, orig)
    tmp = new_docx.with_name("new.docx.tmp")
    docx_with_body_font(orig, tmp, default_font)
    tmp.replace(new_docx)
    count += 1
print(f"  default font    {default_font} in {count} blank documents")

# Task Launcher: copy aero/launcher/ (templates, thumbnails, scripts) and turn tasks.json
# into tasks.js (window.AERO_TASKS); plain JSON can't be loaded reliably from file:// pages.
# Also generates launcher/blanks/<font>.docx for the Blank document font menu.
launcher_src = repo / "aero" / "launcher"
launcher_dest = dest / "launcher"
if launcher_src.is_dir():
    shutil.copytree(launcher_src, launcher_dest, dirs_exist_ok=True)
    tasks = json.loads((launcher_src / "tasks.json").read_text(encoding="utf-8"))
    blanks_dir = launcher_dest / "blanks"
    blanks_dir.mkdir(exist_ok=True)
    base_blank = empty_dir / "en-US" / "new.docx.orig"
    blank_fonts = []
    for font in config.get("blankFonts", []):
        if base_blank.is_file():
            docx_with_body_font(base_blank, blanks_dir / f"{font}.docx", font)
            blank_fonts.append(font)
    tasks["defaultFont"] = default_font
    tasks["blankFonts"] = blank_fonts
    (launcher_dest / "tasks.js").write_text(
        "window.AERO_TASKS = " + json.dumps(tasks, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"  launcher        {len(tasks.get('tasks', []))} tasks, {len(blank_fonts)} blank fonts")

# Aero Light/Dark UI themes: the app loads <app>/uithemes/*.json at startup and
# lists them in Settings > Interface theme.
themes_dest = app / "uithemes"
themes_dest.mkdir(exist_ok=True)
for f in (repo / "aero" / "uithemes").glob("*.json"):
    shutil.copy2(f, themes_dest / f.name)
    print(f"  theme           uithemes/{f.name}")

AERO_URL = "../../../apps/common/main/resources/aero/"
HOOK = ('<!-- aero --><link rel="stylesheet" href="' + AERO_URL + 'aero.css">'
        '<script src="' + AERO_URL + 'fonts-index.js"></script>'
        '<script src="' + AERO_URL + 'palette.js"></script>'
        '<script src="' + AERO_URL + 'settings.js"></script>'
        '<script src="' + AERO_URL + 'aero.js"></script>'
        '<script src="' + AERO_URL + 'quality.js"></script>'
        '<script src="' + AERO_URL + 'statusbar.js"></script>'
        '<script src="' + AERO_URL + 'helper.js"></script>'
        '<!-- /aero -->')
# Any earlier hook: a full <!-- aero -->...<!-- /aero --> block, the original link-only
# hook, and stray aero.js tags left behind by an earlier buggy version.
old_hook = re.compile(
    r'<!-- aero -->(?:(?!<!-- aero -->).)*?<!-- /aero -->'
    r'|<!-- aero --><link[^>]*aero\.css">'
    r'|<script src="[^"]*aero/aero\.js"></script>(?:<!-- /aero -->)?', re.S)
app_css = re.compile(r'<link[^>]*main/resources/css/app\.css[^>]*>')

for editor in sorted(p for p in apps_dir.iterdir() if (p / "main").is_dir()):
    for name in ("index.html", "index_loader.html"):
        page = editor / "main" / name
        if not page.is_file():
            continue
        orig = page.read_text(encoding="utf-8")
        html = old_hook.sub("", orig)           # drop any earlier hook version
        html, n = app_css.subn(lambda m: m.group(0) + HOOK, html, count=1)
        if n == 0:
            print(f"  WARNING no app.css link: {page.relative_to(app)}")
            continue
        if html != orig:
            page.write_text(html, encoding="utf-8")
            status = "hooked"
        else:
            status = "up to date"
        print(f"  {status:15} {page.relative_to(app)}")

# Product name "Quill Office" in the web layers (the native app's name is in defines.h /
# version.h). Only names of the app itself: "Euro-Office cloud" is Euro-Office's server
# product and stays. The editors' About box keeps crediting Euro-Office and ONLYOFFICE.
PRODUCT = "Quill Office"
ATTRIBUTION_OLD = 'attribution:"Euro-Office was based on ONLYOFFICE by Ascensio System SIA"'
ATTRIBUTION_NEW = ('attribution:"' + PRODUCT + ' is based on Euro-Office, which was based on ONLYOFFICE '
                   'by Ascensio System SIA"')
for bundle in sorted(apps_dir.glob("*/**/app.js")):
    js = bundle.read_text(encoding="utf-8")
    if ATTRIBUTION_OLD in js:
        bundle.write_text(js.replace(ATTRIBUTION_OLD, ATTRIBUTION_NEW), encoding="utf-8")
start_page = app / "index.html"
if start_page.exists():
    page = start_page.read_text(encoding="utf-8")
    renamed = (page.replace("Welcome to Euro-Office Desktop Editors!", "Welcome to " + PRODUCT + "!")
                   .replace("Euro-Office Desktop Editors", PRODUCT)
                   .replace("<title>Hello Documents</title>", "<title>" + PRODUCT + "</title>"))
    if renamed != page:
        start_page.write_text(renamed, encoding="utf-8")
# The installer's shortcuts and uninstall entry use {app}\app.ico, which the stock build never
# creates (blank icons). aero/icon/out is made by aero/icon/build_icon.py (original artwork).
shutil.copy2(repo / "aero" / "icon" / "out" / "quill-office.ico", app / "app.ico")
print("  product name    " + PRODUCT + " (start page, About credits, app.ico)")

# Start page: one inlined index.html at the app root. Hook aero-start.css (+ aero.js
# for the saved accent, no picker) at the end of <head> so it follows the inlined styles.
START_URL = "editors/web-apps/apps/common/main/resources/aero/"
START_HOOK = ('<!-- aero --><link rel="stylesheet" href="' + START_URL + 'aero-start.css">'
              '<link rel="stylesheet" href="' + START_URL + 'launcher/launcher.css">'
              '<link rel="stylesheet" href="' + START_URL + 'personalize.css">'
              '<script src="' + START_URL + 'fonts-index.js"></script>'
              '<script src="' + START_URL + 'palette.js"></script>'
              '<script src="' + START_URL + 'settings.js"></script>'
              '<script src="' + START_URL + 'aero.js" data-picker="off"></script>'
              '<script src="' + START_URL + 'personalize.js"></script>'
              '<script src="' + START_URL + 'launcher/tasks.js"></script>'
              '<script src="' + START_URL + 'launcher/launcher.js"></script><!-- /aero -->')
start = app / "index.html"
if start.is_file():
    orig = start.read_text(encoding="utf-8")
    html = re.sub(r'<!-- aero -->(?:(?!<!-- aero -->).)*?<!-- /aero -->', "", orig, flags=re.S)
    i = html.find("</head>")
    if i < 0:
        print("  WARNING no </head> in start page")
    else:
        html = html[:i] + START_HOOK + html[i:]
        if html != orig:
            start.write_text(html, encoding="utf-8")
        print(f"  {'hooked' if html != orig else 'up to date':15} index.html (start page)")

print(f"aero files -> {dest.relative_to(app)}")
