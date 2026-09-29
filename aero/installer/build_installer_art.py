"""Installer artwork for Quill Office (original, replaces the stock ONLYOFFICE-branded images).

Writes into desktop-apps/package/inno/res:
  WizImage-{Light,Dark}-WxH.png      side panel of the welcome/finish pages (all stock sizes)
  WizSmallImage-{Light,Dark}-N.png   top-right image of the inner pages
  look-<theme id>.bmp                previews for the "Choose your look" page (_code.iss),
                                     drawn from aero/uithemes/*.json at their default colors.
Uses the app icon (aero/icon/out, run aero/icon/build_icon.py first) and Open Sans (OFL, core-fonts).

    python aero/installer/build_installer_art.py
"""
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parents[2]
RES = REPO / "desktop-apps" / "package" / "inno" / "res"
ICON = Image.open(REPO / "aero" / "icon" / "out" / "quill-office-512.png").convert("RGBA")
FONT_BOLD = str(REPO / "core-fonts" / "opensans" / "OpenSans-Bold.ttf")
FONT_REG = str(REPO / "core-fonts" / "opensans" / "OpenSans-Regular.ttf")
NAME = "Quill Office"

WIZ_SIZES = [(164, 314), (202, 386), (240, 459), (290, 556), (315, 604), (366, 700), (416, 797)]
SMALL_SIZES = [58, 71, 85, 103, 112, 129, 147]
STYLE = {  # background gradient top/bottom, text, secondary text
    "Light": ("#e4eefa", "#a9c8ea", "#0c1a2b", "#3a5578"),
    "Dark": ("#1f3150", "#0b1322", "#eef3fa", "#a9bbd4"),
}


def rgb(v, over=(255, 255, 255)):
    """#hex or rgba() -> (r, g, b), alpha-blended over `over`."""
    v = v.strip()
    if v.startswith("#"):
        v = v[1:]
        if len(v) == 3:
            v = "".join(c * 2 for c in v)
        return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
    n = [float(x) for x in re.findall(r"[\d.]+", v)]
    a = n[3] if len(n) > 3 else 1.0
    return tuple(round(n[i] * a + over[i] * (1 - a)) for i in range(3))


def gradient(size, top, bottom):
    w, h = size
    t, b = rgb(top), rgb(bottom)
    img = Image.new("RGB", size)
    d = ImageDraw.Draw(img)
    for y in range(h):
        f = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(round(t[i] + (b[i] - t[i]) * f) for i in range(3)))
    return img


def gloss(img, box, strength=0.35):
    """Aero sheen: white fading down over the top half of box."""
    x0, y0, x1, y1 = box
    over = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    mid = y0 + (y1 - y0) // 2
    for y in range(y0, mid):
        a = round(255 * strength * (1 - (y - y0) / max(1, mid - y0)))
        d.line([(x0, y), (x1, y)], fill=(255, 255, 255, a))
    return Image.alpha_composite(img.convert("RGBA"), over)


def fit_text(draw, text, font_path, max_w, start):
    size = start
    while size > 6:
        f = ImageFont.truetype(font_path, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
        size -= 1
    return ImageFont.truetype(font_path, 6)


def wiz_image(style, w, h):
    top, bottom, fg, fg2 = STYLE[style]
    img = gloss(gradient((w, h), top, bottom), (0, 0, w, h), 0.25)
    # soft diagonal light bands (glass)
    bands = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(bands)
    for i, a in ((0, 38), (1, 22)):
        off = int(h * (0.62 + 0.14 * i))
        d.polygon([(0, off), (w, off - int(w * 0.8)), (w, off - int(w * 0.8) + int(h * 0.07)), (0, off + int(h * 0.07))],
                  fill=(255, 255, 255, a))
    img = Image.alpha_composite(img, bands)
    s = int(w * 0.46)
    icon = ICON.resize((s, s), Image.LANCZOS)
    iy = int(h * 0.30)
    img.alpha_composite(icon, ((w - s) // 2, iy))
    d = ImageDraw.Draw(img)
    f1 = fit_text(d, NAME, FONT_BOLD, int(w * 0.84), int(w * 0.14))
    y = iy + s + int(h * 0.035)
    d.text((w / 2, y), NAME, font=f1, fill=fg, anchor="ma")
    f2 = fit_text(d, "Documents · Sheets · Slides · PDF", FONT_REG, int(w * 0.86), int(w * 0.065))
    d.text((w / 2, y + f1.size * 1.35), "Documents · Sheets · Slides · PDF", font=f2, fill=fg2, anchor="ma")
    return img


def small_image(n):
    pad = max(2, n // 12)
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    img.alpha_composite(ICON.resize((n - 2 * pad, n - 2 * pad), Image.LANCZOS), (pad, pad))
    return img


def look_preview(colors, glass, w=320, h=200):
    """A miniature editor window in the theme's default colors."""
    c = lambda k, over=(255, 255, 255): rgb(colors[k], over)
    img = Image.new("RGBA", (w, h), c("canvas-background") + (255,))
    d = ImageDraw.Draw(img)
    header, ribbon = c("toolbar-header-document"), c("background-toolbar")
    d.rectangle([0, 0, w, 26], fill=header)                       # title / tab bar
    d.rounded_rectangle([10, 6, 92, 26], 5, fill=ribbon)          # active tab
    d.text((18, 9), "Document", font=ImageFont.truetype(FONT_REG, 11), fill=c("text-toolbar-header", header))
    for i, x in enumerate((w - 54, w - 36, w - 18)):              # window buttons
        d.rectangle([x, 9, x + 9, 17], outline=c("text-toolbar-header", header))
    d.rectangle([0, 26, w, 70], fill=ribbon)                      # ribbon
    for i in range(7):
        x = 14 + i * 40
        d.rounded_rectangle([x, 36, x + 28, 62], 4, fill=c("background-normal"),
                            outline=c("border-divider"))
    d.line([0, 70, w, 70], fill=c("border-divider"))
    px0, px1 = int(w * 0.24), int(w * 0.76)                       # page
    d.rectangle([px0, 84, px1, h + 4], fill=(255, 255, 255), outline=(0, 0, 0, 60))
    for i, frac in enumerate((0.9, 0.75, 0.85, 0.6, 0.8)):
        y = 100 + i * 16
        d.line([px0 + 16, y, px0 + 16 + int((px1 - px0 - 32) * frac), y], fill=(150, 160, 175), width=4)
    d.rectangle([0, h - 16, w, h], fill=ribbon)                   # status bar
    if glass:
        img = gloss(img, (0, 0, w, 26), 0.45)
        img = gloss(img, (0, 26, w, 70), 0.30)
    return img.convert("RGB")


def classic_preview():
    light = {"toolbar-header-document": "#446995", "background-toolbar": "#f7f7f7", "background-normal": "#ffffff",
             "canvas-background": "#eeeeee", "border-divider": "#dfdfdf", "text-toolbar-header": "#ffffff"}
    dark = {"toolbar-header-document": "#2a2a2a", "background-toolbar": "#404040", "background-normal": "#333333",
            "canvas-background": "#555555", "border-divider": "#505050", "text-toolbar-header": "#ffffff"}
    a, b = look_preview(light, False), look_preview(dark, False)
    out = a.copy()
    out.paste(b.crop((a.width // 2, 0, a.width, a.height)), (a.width // 2, 0))
    return out


def main():
    for style in STYLE:
        for w, h in WIZ_SIZES:
            wiz_image(style, w, h).save(RES / f"WizImage-{style}-{w}x{h}.png")
        for n in SMALL_SIZES:
            small_image(n).save(RES / f"WizSmallImage-{style}-{n}x{n}.png")
    for f in sorted((REPO / "aero" / "uithemes").glob("*.json")):
        t = json.loads(f.read_text(encoding="utf-8"))
        look_preview(t["colors"], t["id"].startswith("theme-aero")).save(RES / f"look-{t['id']}.bmp")
    classic_preview().save(RES / "look-theme-system.bmp")
    print("installer art ->", RES)


if __name__ == "__main__":
    main()
