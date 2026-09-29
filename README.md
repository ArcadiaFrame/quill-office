[![License](https://img.shields.io/badge/License-GNU%20AGPL%20V3-green.svg?style=flat)](https://www.gnu.org/licenses/agpl-3.0.en.html)
![Platforms Windows | Linux](https://img.shields.io/badge/Platforms-Windows%20%7C%20Linux-lightgrey.svg?style=flat)

# Quill Office

Quill Office is a free, open-source office suite for Windows and Linux: word processor,
spreadsheets, presentations, PDF editor and forms. It opens and saves Microsoft Office files
(.docx, .xlsx, .pptx) and works fully offline.

It's built on [Euro-Office Desktop Editors](https://github.com/Euro-Office/DesktopEditors),
which is based on ONLYOFFICE, and adds a glassy "Aero" look, deep personalization,
accessibility tools, a task-based start page, and a local AI writing helper called Quill.

## Screenshots

<!-- Screenshots go in docs/screenshots/ and are linked here, for example:
     ![Aero Glass Dark](docs/screenshots/aero-dark.png) -->

*Coming soon.*

## Features

**Look and feel**
- **Aero Glass themes:** Dark, Light and Neutral, plus flat Matte Dark and Matte Light.
- **Interface color:** pick any color for the whole interface, including the window bar.
- **Accent colors,** and an optional parchment-style "papyrus" page.

**Personalization and accessibility**
- **Personalize panel:** the interface font, plus defaults for new documents (font, size, margins, page size).
- **Accessibility fonts:** Atkinson Hyperlegible (for low vision) and OpenDyslexic.
- **Reading tools:** focus mode, a reading ruler, and an immersive reader with read-aloud.
- **Command search (Ctrl+Q):** find any toolbar command by name.

**Getting started quickly**
- **Task Launcher start page:** start from a task ("Write a cover letter", "Plan a budget") instead of a blank file.
- **Templates:** 18 original templates plus the built-in ones, with favorites and recently used.
- **16 bundled open-source font families.** Courier Prime is the default document font, and you can change it.

**Extensions (all included, all work offline)**
- **Accessibility Checker:** headings, alt text, tables, link text and the document title.
- **Quick Parts:** reusable signatures, closings and phrases, plus your personal dictionary.
- **Clipboard History,** and a **Document Inspector** that removes comments, tracked changes and personal metadata.
- **The AI assistant,** with local models through [Ollama](https://ollama.com) or LM Studio, or cloud providers. Quill Office adds a thinking on/off switch and resource profiles for local models.
- Also: OCR, Translator, Thesaurus, Speech, Photo Editor, Highlight Code, Zotero, Mendeley.

**Quill, the writing helper:** a small animated quill that follows your text. Ask it for help,
or have it find and run commands for you. It uses your local AI model, so your writing stays on
your computer.

## Download and install

Installers are on the [Releases](../../releases) page.

**Windows 10/11 (x64):** run `QuillOffice-Setup-<version>-x64.exe`. The installer lets you
pick your theme first; Aero Glass Dark is recommended.

**Ubuntu / Debian (x64):**

```sh
sudo apt install ./euro-office-desktopeditors_<version>_amd64.deb
```

Keep the `./`: it tells apt to install the local file and fetch anything it depends on.
Then open **Quill Office** from the app menu. The optional `-help` package adds offline help.

**Fedora / openSUSE:** use the `.rpm`. **Other distributions:** use the `.tar.xz`.

> The package, the install folder (`/opt/euro-office/desktopeditors`) and the terminal command
> (`euro-office-desktopeditors`) keep their Euro-Office names on purpose; see
> [Why it's built this way](#why-its-built-this-way).

## Build it yourself

Quill Office is a *super-repository*: the editors are split into submodules, and two of them
(`desktop-apps` and `core`) point at Quill Office forks. Always clone with `--recursive`.

On Windows, set git to keep Linux line endings **before cloning**. Parts of the build run in Linux
containers and break on Windows (CRLF) line endings:

```sh
git config --global core.autocrlf input
git clone --recursive https://github.com/ArcadiaFrame/quill-office.git
cd quill-office
```

### Build times

Measured on a 32-thread CPU with 32 GB of RAM (16 GB for Docker). Machines with fewer cores
will take longer.

| Build | Time |
|---|---|
| Windows, first full build (V8, Qt, all libraries, the web editors, the installer) | about 4 hours |
| Windows, rebuild after that (compiler cache warm) | 12 to 15 minutes |
| Only the Quill Office layer (`python aero/apply-aero.py` on an existing build) | a few seconds |
| Linux packages, first build (with the web editors already cached) | about 1¾ hours |
| Linux packages, rebuild | about 1 hour |

### Windows

You need:
- Windows 10/11 x64 and **Visual Studio 2022** with the C++ x64 toolset.
- CMake, Ninja, Python 3, Perl and Git, plus Docker Desktop in Linux-container mode (for the web editors).
- **Windows 10 SDK 10.0.19041.0 with the Debugging Tools** (V8 requires this exact version):
  ```powershell
  winget install Microsoft.WindowsSDK.10.0.19041 --override "/features OptionId.DesktopCPPx64 OptionId.DesktopCPPx86 OptionId.WindowsDesktopDebuggers OptionId.SigningTools /quiet /norestart"
  ```
- 7-Zip and Inno Setup 6 for the installer (`winget install 7zip.7zip JRSoftware.InnoSetup`).

Then, from the repository root, in PowerShell:

```powershell
$env:BUILDX_BAKE_ENTITLEMENTS_FS = "0"    # lets Docker read the source folder without prompting

# First time (run as administrator; installs the remaining tools):
.\build\windows\build.ps1 -InstallDeps -BuildCommon

# After that:
.\build\windows\build.ps1 -BuildCommon    # rebuilds the web editors and plugins too
.\build\windows\build.ps1                 # reuses the web editors already in .\common
```

- The app is built into `desktopeditors\`, and the installer is written to
  `desktop-apps\package\inno\QuillOffice-Setup-<version>-x64.exe`.
- **Close Quill Office before building** if you run it from `desktopeditors\`, because the build writes there.
- To try a change to the look, extensions or templates, you don't need to rebuild: run
  `python aero\apply-aero.py`, then restart the app.

### Linux (or Windows with Docker)

Everything runs in Docker (`docker buildx bake`), so you only need Docker with Buildx:

```sh
cd build/linux
BUILDX_BAKE_ENTITLEMENTS_FS=0 ./build.sh
```

- The packages (`.deb`, `.rpm`, `.tar.xz`, and a help package) are written to `build/linux/deploy/packages/`.
- **Memory:** the build compiles 12 files at a time, which needs about 16 GB for Docker. If
  Docker has less memory, lower it; if it has more, raise it:
  ```sh
  BUILDX_BAKE_ENTITLEMENTS_FS=0 ./build.sh --set desktop-linux.args.BUILD_JOBS=6
  ```
  If Docker runs out of memory, the build stops with `failed to receive status: ... EOF`.

The upstream build docs cover the details: [build/](./build/README.md),
[build/windows/](./build/windows/README.md), [build/linux/](./build/linux/README.md).

## Why it's built this way

- **A layer on top, not a rewrite.** Everything Quill Office adds (themes, Personalize, the
  launcher, extensions, Quill, fonts, templates) lives in [`aero/`](./aero) and is applied to the
  built app by `aero/apply-aero.py`. The editors' own web code (`web-apps`, `sdkjs`) is never
  edited, so Euro-Office updates merge cleanly and the look can be changed in seconds without
  recompiling. The Windows build (step 9c) and the Linux Docker build both run the same script.
- **Small, contained native changes.** Only a few things need C++ or packaging changes, and they
  live in the [`quill-desktop-apps`](https://github.com/ArcadiaFrame/quill-desktop-apps) fork:
  the name and icons, Aero Dark as the default theme, a native command that lets the window bar
  follow the interface color, and the installer's theme page. The
  [`quill-core`](https://github.com/ArcadiaFrame/quill-core) fork has one build fix. All other
  submodules are unmodified and point at Euro-Office.
- **Internal names are kept.** Only visible names say Quill Office. The settings folder,
  registry keys, install folder and package name stay Euro-Office, so installs upgrade in place
  and upstream packaging keeps working.
- **Offline and private by default.** The extensions are bundled with the app instead of being
  downloaded from a plugin store, and the AI features work with local models.
- **Clean licensing.** Everything added is original work or openly licensed: SIL OFL fonts, and
  no Microsoft-owned fonts, icons or sounds. See [THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md).

## Repository layout

| Path | What it is |
|---|---|
| `aero/` | The Quill Office layer: `aero.css` and themes, `settings.js`/`personalize.js`, `launcher/`, `plugins/`, `helper.js` (Quill), `fonts/`, `templates/`, `icon/`, `installer/`, and `apply-aero.py`, which installs it all |
| `build/` | Build scripts: `windows/build.ps1`, `linux/build.sh`, and the Docker bake files |
| `desktop-apps/` | Submodule, Quill fork: the native app, the installer and the Linux packaging |
| `core/` | Submodule, Quill fork: the document core and file converters |
| `web-apps/`, `sdkjs/`, `desktop-sdk/`, … | Submodules, unmodified Euro-Office |

## Staying up to date with Euro-Office

```sh
git remote add upstream https://github.com/Euro-Office/DesktopEditors.git
git fetch upstream && git merge upstream/main
```

For the forked submodules, merge Euro-Office's `main` into their `quill` branch the same way,
then commit the new submodule commits in this repository.

## Credits

Quill Office is a combined effort of **[ArcadiaFrame](https://github.com/ArcadiaFrame)** and
**Claude**, Anthropic's AI assistant, working together in Claude Code. ArcadiaFrame directed the
project, designed the experience and tested every step. Claude wrote most of the code, the
themes, the extensions and the build changes.

It stands on the work of:
- [Euro-Office](https://github.com/Euro-Office), whose Desktop Editors this is a fork of.
- [ONLYOFFICE](https://github.com/ONLYOFFICE) by Ascensio System SIA, on which Euro-Office is based, including the bundled editor plugins.
- The designers of the bundled open-source fonts, listed in [THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md).

## License

Quill Office is licensed under the [GNU Affero General Public License v3.0](./LICENSE), like
the projects it's based on. If you share a modified version, you must share its source code too.

"ONLYOFFICE" and "Euro-Office" are the names of their respective projects. Quill Office is an
independent fork and isn't affiliated with or endorsed by either project.
