# Patches applied locally to build DesktopEditors on Windows (report upstream)

## 1. build/windows/build.ps1 (~line 313): wrong working dir for `docker buildx bake`
- Was:  `Push-Location (Join-Path $RepoRoot 'build')`
- Now:  `Push-Location (Join-Path $RepoRoot 'build\windows')`
- Why: the bake call uses `-f ../docker-bake.hcl` and `--set "*.context=../.."`, which only
  resolve to `build/docker-bake.hcl` and the repo root when cwd is `build\windows`.

## Environment notes (not code changes, but worth documenting upstream)
- Windows checkouts with `core.autocrlf=true` (Git for Windows default) produce CRLF
  Dockerfiles/shell scripts → core-wasm bake fails with `/bin/sh: set: Illegal option -`.
  Workaround: `git config --global core.autocrlf input` and re-checkout root + all submodules.
  Suggested fix: add `.gitattributes` with `* text=auto eol=lf` (plus `*.bat/*.cmd eol=crlf`)
  in the root repo and every submodule (only `core` has one today).
- `docker buildx bake` prompts for filesystem entitlements and hangs non-interactively;
  set `BUILDX_BAKE_ENTITLEMENTS_FS=0` (or have build.ps1 set it / pass `--allow=fs.read=..`).

## 2. build/windows/build.ps1: default `-WinSdkVersion 10.0.19041.0` not installed by `-InstallDeps`
- No code change; worked around by passing `-WinSdkVersion 10.0.26100.0` (the SDK that VS 2022's
  C++ workload installs today).
- `-InstallDeps` has the Win10 SDK 19041 install commented out (~line 264-269), yet the default
  still requires it. `Import-VcVars` sends vcvars output to NUL, so the real cause
  ("Windows SDK not found") is hidden and it only reports "VCINSTALLDIR empty".
- Suggested fix: default to the newest installed SDK (or re-enable the 19041 install), and
  surface vcvars' own error output on failure.

## 3. (minor, robustness) core/Common/3dParty/boost/nc-build.py ~line 88
- `[ "cmd.exe", "/c" "bootstrap.bat", ... ]` is missing a comma (Python joins it into "/cbootstrap.bat").
  cmd happens to accept that, but it should be `"/c", ".\bootstrap.bat"`.
- Calling it as bare `bootstrap.bat` fails when `NoDefaultCurrentDirectoryInExePath` is set
  (a hardening setting some environments/agents use): "'bootstrap.bat' is not recognized".
  Using an explicit `.\bootstrap.bat` (or the absolute path) would avoid that. Not patched locally;
  worked around by clearing the env var for the build.

## 4. core/Common/3dParty/v8/nc-build.py: gclient_paths.patch no longer applies (PATCHED)
- depot_tools is cloned from `main` unpinned (`git clone` + `git pull origin main`). Upstream
  depot_tools was reformatted with ruff (commits 93974d014 2026-07-21, c733c4a38 2026-08-12), so
  `tools/8.9/x64-linux-dynamic/gclient_paths.patch` fails: "patch failed: gclient_paths.py:20".
- Local fix: dropped gclient_paths.patch from the `patches` list and added
  `remove_gclient_paths_lru_cache()`, which removes `@functools.lru_cache` from the same four
  functions (FindGclientRoot, _GetPrimarySolutionPathInternal, _GetBuildtoolsPathInternal,
  _GetGClientSolutions) using a regex, regardless of formatting. Newer depot_tools has a
  fifth cached function (_GetGClientConfigInner), which is left untouched, as the original patch did.
- Better upstream fix: pin depot_tools to a known commit (and set DEPOT_TOOLS_UPDATE=0), or keep the
  regex approach. See `git -C core diff Common/3dParty/v8/nc-build.py`.

## 5. V8 8.9 hard-requires Windows 10 SDK 10.0.19041.0 + "Debugging Tools for Windows"
- `v8/build/toolchain/win/setup_toolchain.py` hardcodes 10.0.19041.0, and `vs_toolchain.py` copies
  `api-ms-win-downlevel-kernel32-l2-1-0.dll` from the Debuggers folder (missing from newer SDKs).
  Errors: "user32.lib is not found in LIB" / "...downlevel-kernel32... not found ... You must install
  Windows 10 SDK version 10.0.19041.0 including the Debugging Tools for Windows feature".
- Resolved by installing the SDK (no code change):
  `winget install Microsoft.WindowsSDK.10.0.19041 --override "/features OptionId.DesktopCPPx64
  OptionId.DesktopCPPx86 OptionId.WindowsDesktopDebuggers OptionId.SigningTools /quiet /norestart"`
- Suggest upstream: re-enable the SDK install in `-InstallDeps`, making sure it includes the
  debugger feature (the VS Installer's Windows10SDK.19041 component does NOT include the Debugging
  Tools), and document it as a prerequisite. With it installed, item 2's workaround isn't needed.

## 6. build/windows/build.ps1 (~line 324): `docker cp eo_common_tmp:/` pulls in container stubs (PATCHED)
- `docker create` + `docker cp <ctr>:/ $CommonDir` copies the files Docker injects into every
  container (`dev/`, `etc/hostname|hosts|resolv.conf`, `etc/mtab -> /proc/mounts`, `proc/`, `sys/`).
  Step 9's robocopy then fails: `ERROR 123 ... Copying File ...\common\etc\mtab` -> "robocopy overlay
  failed (exit 11)". This only surfaces after the full ~1h C++ build.
- Local fix: after `docker rm`, delete dev, etc, proc, sys and .dockerenv from $CommonDir.
- Cleaner upstream alternative: export the image filesystem without a container, e.g.
  `docker buildx bake ... --set desktop-common.output=type=local,dest=<CommonDir>`, which also avoids
  the scratch-image `docker create ... true` trick.

## 7. build/windows/build.ps1: packaging tools aren't checked up front; failure reported as success
- 7-Zip and Inno Setup 6 weren't present despite an earlier `-InstallDeps` run. Step 5 ("Verifying
  tool versions") doesn't check `7z`/`iscc`, so the missing tools only surface at step 11a, after the
  full build. make_zip.ps1 then died with "The term '7z' is not recognized", yet the script ended
  with exit code 0 and never reached 11b (Inno).
- Resolved by installing the tools (no code change):
  `winget install 7zip.7zip --scope machine` and `winget install JRSoftware.InnoSetup --scope machine`.
- Suggest upstream: validate 7z and iscc in step 5 (unless -SkipPackaging), and make sure a failing
  child packaging script results in a non-zero exit.

## 8. (packaging bloat, not fixed) Debug Qt DLLs and dev-only Qt modules shipped in the release package
- The staged build `desktop-apps/package/build/x64/desktop` contains 69 debug DLLs (`Qt6*d.dll` etc.,
  about 208 MB of Qt debug DLLs alone), an empty `Debug/` folder, and dev-only Qt modules (Designer, Help, Labs*).
  Result: 1.6 GB staged, 1.0 GB ZIP, 647 MB installer.
- Suggest upstream: exclude `*d.dll`/debug artifacts and unneeded Qt modules during make.ps1 staging
  (e.g., use windeployqt --release, or filter the Qt copy).

## Also noted
- `editors/sdkjs-plugins` is empty in the shipped package: no bundled plugins (no Plugin Manager or AI
  plugin), because desktop-composer.bake.Dockerfile only creates the directory. If that's
  intentional, it should be documented.

## 9. desktop-apps/win-linux/CMakeLists.txt: Windows exes are linked as CONSOLE apps (PATCHED)
- `add_executable(DesktopEditors ...)` (and `editors_helper` in desktop-sdk) have no WIN32 /
  /SUBSYSTEM:WINDOWS, so the PE subsystem is CONSOLE. Launching the installed app opens a blank
  console window, and closing that window kills the editor. (Probably a regression from the
  qmake -> CMake / Qt6 migration.)
- Local fix, in the existing `if(WIN32)` block:
    foreach(_t DesktopEditors editors_helper)
        target_link_options(${_t} PRIVATE "/SUBSYSTEM:WINDOWS" "/ENTRY:mainCRTStartup")
    endforeach()
  This keeps the standard `int main()` entry point; no source changes. (Alternative:
  `WIN32_EXECUTABLE ON` for DesktopEditors via Qt6::EntryPoint; editors_helper has no Qt, so it
  would need a WinMain or the /ENTRY option anyway.)

## 10. Bundle editor plugins (AI, Plugin Manager, ...) into the common payload (FEATURE, PATCHED)
- Before: `desktop-composer.bake.Dockerfile` only created an empty `/editors/sdkjs-plugins`, so the
  editors had no Plugins tab content, no Plugin Manager and no AI assistant.
- Change:
  - `build/.docker/desktop-composer.bake.Dockerfile`: new `sdkjs-plugins` stage (ubuntu:24.04 + git).
    It sparse-fetches ONLYOFFICE/onlyoffice.github.io at a pinned commit, copies each listed plugin
    to `/{GUID}/` (the GUID is read from config.json; the desktop app loads system plugins by GUID
    folder), bundles `sdkjs-plugins/v1`, and rewrites `https://onlyoffice.github.io/sdkjs-plugins/`
    in plugin HTML to a relative `../` prefix for offline use (the same thing desktop-sdk's
    ReplaceHtmlUrls does for user-installed plugins). desktop-common then does
    `COPY --from=sdkjs-plugins /out/ /editors/sdkjs-plugins/`.
  - `build/docker-bake.hcl`: new variables SDKJS_PLUGINS_REPO, SDKJS_PLUGINS_REF (pinned
    00f642a604b3c139ab628ece27f4fbc8eb621645, 2026-09-28) and SDKJS_PLUGINS (default:
    now `ai highlightcode ocr photoeditor speech thesaurus translator youtube zotero mendeley`; Quill Office leaves out `store/plugin`, the Plugin Manager),
    passed as args to desktop-common. Override via env vars, e.g. `$env:SDKJS_PLUGINS="..."`.
- Applies to both the Windows (-BuildCommon) and Linux builds, since both consume desktop-common.

## 11. No root .dockerignore: the bake context uploads all Windows build outputs (PATCHED)
- The Windows build runs CMake in the repo root (CMakeCache.txt, CMakeFiles/, third_party/,
  vcpkg_installed/, .vcpkg/, desktopeditors/, package/ ...), and every bake target uses the repo
  root as its context. With no .dockerignore, a `-BuildCommon` run after a Windows build uploaded
  over 22 GB of context and was still going after 16 minutes.
- Local fix: added a root `.dockerignore` that EXCLUDES the in-source build outputs (.git, CMakeFiles,
  CMakeCache.txt, third_party, vcpkg_installed, .vcpkg, *_autogen, per-library build dirs, package,
  common, desktopeditors, *.exe, *.log at the root, plus desktop-apps/package/{build,zip} and
  build/windows/.docker-cache).
- Don't use an allowlist (`*` then `!web-apps/` ...): with bake building several targets over the
  same shared context, BuildKit then drops files. `web-apps` got a 2 MB context and failed with
  `"/web-apps": not found`, reproducibly (it builds fine when run alone).
- Better upstream fix as well: run the Windows CMake build out of source (e.g. `-B build/windows/out`).

## 12. desktop-apps/win-linux/CMakeLists.txt: DesktopEditors.exe has no icon (PATCHED)
- `version.rc` (IDI_MAINICON from `res/icons/desktopeditors-eo.ico`, version info, manifest) is
  never added to the CMake target, so the exe has no icon (ExtractIconEx count = 0) and no
  version info. The installed app shows the generic Windows program icon.
- Local fix: in the `if(WIN32)` block, generate an icon-only `app_icon.rc`
  (`101 ICON "<abs path>/res/icons/desktopeditors-eo.ico"`) and `target_sources` it. Adding
  version.rc as-is would add a second RT_MANIFEST resource, clashing with the linker-generated
  manifest.
- Upstream should also restore the version info (FileDescription, ProductVersion, ...).
- Note: desktopeditors-eo.ico is a black glyph on a transparent background, so it's nearly
  invisible on a dark taskbar. Consider a light/dark-safe icon.

## Local customizations (not for upstream)

- build/windows/build.ps1 step 9c runs aero/apply-aero.py (the Quill Office layer) before packaging.
- Installer: app.ico is referenced by the shortcuts/uninstall entry but never produced by the stock
  build, so installed shortcuts have blank icons. This one IS worth reporting upstream.

## 13. Linux Docker build: Ninja's default job count runs Docker out of memory (PATCHED)
- `cmake --build .` in `desktop-apps/.docker/desktop-apps.bake.Dockerfile` uses Ninja's default of
  CPU count + 2 jobs. On a 32-thread host with 16 GB for Docker Desktop, BuildKit was killed about
  37 minutes in: `ERROR: target desktop-linux: failed to receive status: rpc error: code = Unavailable
  desc = error reading from server: EOF`.
- Local fix: `ARG BUILD_JOBS=12` feeds `CMAKE_BUILD_PARALLEL_LEVEL` and `VCPKG_MAX_CONCURRENCY`
  (override: `./build.sh --set desktop-linux.args.BUILD_JOBS=N`; `build/linux/build.sh` now forwards
  extra arguments to bake).
- Suggest upstream: a job cap based on memory, or at least a documented build arg.

## 14. Linux packaging: the .desktop StartupWMClass must match the Qt application name
- Qt's xcb backend sets WM_CLASS from `QCoreApplication::applicationName()` (WINDOW_NAME in
  defines.h), while `package/common/linux/defines.m4` derived `_WM_CLASS` from the company name.
  They only match while the two strings happen to be equal. After a rename, docks show a generic
  icon for the running app.
- Suggest upstream: derive both from one definition.
