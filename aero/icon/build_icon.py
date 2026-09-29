"""Render the Quill Office icon (quill-office.svg, original artwork) to PNG and a Windows .ico.

Uses Microsoft Edge in headless mode as the SVG renderer (installed with Windows; a throwaway
profile, so the user's browser is untouched) and Pillow to downscale and pack the .ico.
Output: aero/icon/out/quill-office.ico (16-256 px), quill-office-<size>.png.

    python aero/icon/build_icon.py
"""
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
EDGE = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")
ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
RENDER = 1024
PRODUCT = "Quill Office"


def render(svg: Path, size: int) -> Image.Image:
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as tmp:
        tmp = Path(tmp)
        html = tmp / "icon.html"
        html.write_text('<html><body style="margin:0;background:transparent">'
                        f'<img src="{svg.as_uri()}" style="display:block;width:{size}px;height:{size}px">'
                        '</body></html>', encoding="utf-8")
        png = tmp / "icon.png"
        # --do-not-de-elevate: from an elevated shell Edge otherwise hands off and exits silently.
        subprocess.run([str(EDGE), "--headless", "--do-not-de-elevate", "--no-sandbox", "--no-first-run",
                        "--disable-gpu", "--hide-scrollbars",
                        f"--user-data-dir={tmp / 'profile'}", "--default-background-color=00000000",
                        f"--window-size={size},{size}", f"--screenshot={png}", html.as_uri()],
                       check=True, capture_output=True, timeout=60)
        return Image.open(png).convert("RGBA").copy()


def main():
    OUT.mkdir(exist_ok=True)
    big = render(HERE / "quill-office.svg", RENDER)
    if big.getpixel((0, 0))[3] != 0:
        raise SystemExit("render has an opaque background (transparency not supported by this Edge?)")
    for s in PNG_SIZES:
        big.resize((s, s), Image.LANCZOS).save(OUT / f"quill-office-{s}.png")
    big.resize((256, 256), Image.LANCZOS).save(OUT / "quill-office.ico", sizes=[(s, s) for s in ICO_SIZES])
    print("icon ->", OUT)
    # The app uses these under their original names: the window and .exe icon (resources.qrc
    # "app.ico" and the CMake app_icon.rc), the installer (SetupIconFile) and the update service.
    win = HERE.parents[1] / "desktop-apps" / "win-linux"
    for target in [win / "res/icons/desktopeditors-eo.ico", win / "res/icons/desktopeditors.ico",
                   win / "extras/projicons/res/icons/desktopeditors.ico",
                   win / "extras/update-daemon/res/icons/desktopeditors.ico"]:
        shutil.copy2(OUT / "quill-office.ico", target)
        print("icon ->", target.relative_to(HERE.parents[1]))
    logos(big, win / "res/icons")
    linux_icons()


def linux_icons():
    """Linux: the menu/dock icons of the .deb/.rpm/.tar (package/common/linux/icons-eo/<N>x<N>.png,
    installed to hicolor), and the GTK message-box brand image (res/icons/app-icon-eo.svg)."""
    root = HERE.parents[1] / "desktop-apps"
    icons = root / "package" / "common" / "linux" / "icons-eo"
    for png in sorted(icons.glob("*x*.png")):
        size = int(png.stem.split("x")[0])
        shutil.copy2(OUT / f"quill-office-{size}.png", png)
    print("linux icons ->", icons.relative_to(HERE.parents[1]))
    res = root / "win-linux" / "res" / "icons"
    shutil.copy2(HERE / "quill-office.svg", res / "app-icon-eo.svg")
    shutil.copy2(OUT / "quill-office-64.png", res / "app-icon_64.png")
    print("linux icons ->", (res / "app-icon-eo.svg").relative_to(HERE.parents[1]), "+ app-icon_64.png")


# The "logo" at the top left of the main window (styles*.qss: QPushButton#toolButtonMain uses
# logo-{light,dark}-eo[_scale].png, and the .svg at 2.25x): icon + product name. "light" is for
# light themes (dark text), "dark" for dark themes (light text). 83x20 at 100 %.
LOGO_TEXT = {"light": (68, 68, 68, 255), "dark": (215, 215, 215, 255)}
LOGO_SCALES = {"": 1.0, "@1.25x": 1.25, "@1.5x": 1.5, "@1.75x": 1.75}


def logo_png(icon, variant, scale):
    from PIL import ImageDraw, ImageFont
    w, h = round(83 * scale), round(20 * scale)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    s = round(16 * scale)
    img.alpha_composite(icon.resize((s, s), Image.LANCZOS), (0, (h - s) // 2))
    d = ImageDraw.Draw(img)
    font_path = str(HERE.parents[1] / "core-fonts" / "opensans" / "OpenSans-Semibold.ttf")
    size = round(12.5 * scale)
    while size > 6:
        font = ImageFont.truetype(font_path, size)
        if d.textlength(PRODUCT, font=font) <= w - s - round(3 * scale):
            break
        size -= 1
    d.text((s + round(3 * scale), h / 2), PRODUCT, font=font, fill=LOGO_TEXT[variant], anchor="lm")
    return img


def logo_svg(variant, icon):
    import base64
    import io
    buf = io.BytesIO()
    icon.resize((64, 64), Image.LANCZOS).save(buf, "PNG")
    r, g, b, _ = LOGO_TEXT[variant]
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="83" height="20" viewBox="0 0 83 20">\n'
            f'    <image x="0" y="2" width="16" height="16" xlink:href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/>\n'
            f'    <text x="19" y="14.5" font-family="\'Open Sans\', \'Segoe UI\', Arial, sans-serif" font-size="11" '
            f'font-weight="600" fill="#{r:02x}{g:02x}{b:02x}">{PRODUCT}</text>\n</svg>\n')


def logos(big, dest):
    for variant in LOGO_TEXT:
        for suffix, scale in LOGO_SCALES.items():
            logo_png(big, variant, scale).save(dest / f"logo-{variant}-eo{suffix}.png")
        (dest / f"logo-{variant}-eo.svg").write_text(logo_svg(variant, big), encoding="utf-8")
    print("logo ->", dest.relative_to(HERE.parents[1]), "(logo-{light,dark}-eo*)")
    splash(big, dest / "splash-eo.svg")


def splash(icon, path):
    """Startup splash (csplash_p.h renders res/icons/splash-eo.svg, 500x250). Keeps the credits."""
    import base64
    import io
    buf = io.BytesIO()
    icon.resize((256, 256), Image.LANCZOS).save(buf, "PNG")
    font = "'Open Sans', 'Segoe UI', Arial, sans-serif"
    path.write_text(f"""<svg width="500" height="250" viewBox="0 0 500 250" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <!-- {PRODUCT} splash: original artwork (aero/icon/build_icon.py). -->
    <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#eaf2fb"/>
            <stop offset="1" stop-color="#b9d3ee"/>
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/>
            <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </linearGradient>
    </defs>
    <rect width="500" height="250" fill="url(#bg)"/>
    <rect width="500" height="110" fill="url(#sheen)"/>
    <path d="M0 250 L500 120 L500 160 L0 290 Z" fill="#ffffff" fill-opacity="0.18"/>
    <rect x="0.5" y="0.5" width="499" height="249" fill="none" stroke="#8fa9c6"/>
    <image x="36" y="55" width="120" height="120" xlink:href="data:image/png;base64,{base64.b64encode(buf.getvalue()).decode()}"/>
    <text x="180" y="112" font-family="{font}" font-size="34" font-weight="bold" fill="#0c1a2b">{PRODUCT}</text>
    <text x="181" y="140" font-family="{font}" font-size="13" fill="#3a5578">Documents · Spreadsheets · Presentations · PDF</text>
    <text x="485" y="214" font-family="{font}" font-size="10" fill="#4f6682" text-anchor="end">Based on Euro-Office and ONLYOFFICE by Ascensio System SIA</text>
    <text x="485" y="232" font-family="{font}" font-size="10" fill="#4f6682" text-anchor="end">https://github.com/Euro-Office</text>
</svg>
""", encoding="utf-8")
    print("splash ->", path.name)


if __name__ == "__main__":
    main()
