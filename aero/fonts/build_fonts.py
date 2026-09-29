#!/usr/bin/env python3
"""Fetch the extra open-source font families and produce static TTF/OTF files.

The suite's font engine doesn't select variable-font instances (no FreeType MM calls
in core/DesktopEditor), so variable fonts are instanced to static Regular / Bold /
Italic / Bold Italic with fontTools, with RIBBI names and style flags set so the
editor's Bold/Italic buttons link correctly. Only families WITHOUT an OFL Reserved
Font Name are instanced (modified); RFN families are used only as shipped statics.

Output: aero/fonts/out/<Family>/*.ttf|otf plus its license file; also rewrites
THIRD_PARTY_ASSETS.md (fonts section). Requires: pip install fonttools
Usage:  python aero/fonts/build_fonts.py
"""
import io
import shutil
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

GOOGLE_FONTS_REF = "23e54b51ddffbc7713c583748e3bd86f62b1fa4a"   # google/fonts, pinned 2026-09-28
OPENDYSLEXIC_REF = "1824da5c0e41dc3e13ffc7f3a636dcaf695d61b7"   # pinned 2026-09-28

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
REPO = HERE.parent.parent

# family, google/fonts dir, purpose, source spec
#   ("static", [files...])                   use shipped static files as-is
#   ("var", upright_file, italic_file|None)  instance to Regular/Bold(/Italic/Bold Italic)
FAMILIES = [
    ("Courier Prime",         "courierprime",         "Default document font (Courier-style)",
        ("static", ["CourierPrime-Regular.ttf", "CourierPrime-Bold.ttf", "CourierPrime-Italic.ttf", "CourierPrime-BoldItalic.ttf"])),
    ("Gelasio",               "gelasio",              "Georgia-compatible serif",
        ("var", "Gelasio[wght].ttf", "Gelasio-Italic[wght].ttf")),
    ("Comic Neue",            "comicneue",            "Friendly casual (Comic-style)",
        ("static", ["ComicNeue-Regular.ttf", "ComicNeue-Bold.ttf", "ComicNeue-Italic.ttf", "ComicNeue-BoldItalic.ttf"])),
    ("Noto Sans",             "notosans",             "Everyday sans, wide language coverage",
        ("var", "NotoSans[wdth,wght].ttf", "NotoSans-Italic[wdth,wght].ttf")),
    ("Noto Serif",            "notoserif",            "Everyday serif, wide language coverage",
        ("var", "NotoSerif[wdth,wght].ttf", "NotoSerif-Italic[wdth,wght].ttf")),
    ("Inter",                 "inter",                "Modern UI/document sans",
        ("var", "Inter[opsz,wght].ttf", "Inter-Italic[opsz,wght].ttf")),
    ("Roboto",                "roboto",               "Everyday sans",
        ("var", "Roboto[wdth,wght].ttf", "Roboto-Italic[wdth,wght].ttf")),
    ("Lato",                  "lato",                 "Everyday sans",
        ("static", ["Lato-Regular.ttf", "Lato-Bold.ttf", "Lato-Italic.ttf", "Lato-BoldItalic.ttf"])),
    ("EB Garamond",           "ebgaramond",           "Classic book serif",
        ("var", "EBGaramond[wght].ttf", "EBGaramond-Italic[wght].ttf")),
    ("Montserrat",            "montserrat",           "Headings",
        ("var", "Montserrat[wght].ttf", "Montserrat-Italic[wght].ttf")),
    ("Oswald",                "oswald",               "Condensed headings",
        ("var", "Oswald[wght].ttf", None)),
    ("Bebas Neue",            "bebasneue",            "Display headings (flyers)",
        ("static", ["BebasNeue-Regular.ttf"])),
    ("Caveat",                "caveat",               "Handwriting (cards, notes)",
        ("var", "Caveat[wght].ttf", None)),
    ("Pacifico",              "pacifico",             "Script (invitations, flyers)",
        ("static", ["Pacifico-Regular.ttf"])),
    ("Atkinson Hyperlegible", "atkinsonhyperlegible", "Accessibility: low vision",
        ("static", ["AtkinsonHyperlegible-Regular.ttf", "AtkinsonHyperlegible-Bold.ttf",
                    "AtkinsonHyperlegible-Italic.ttf", "AtkinsonHyperlegible-BoldItalic.ttf"])),
]

OPENDYSLEXIC = ("OpenDyslexic", "Accessibility: dyslexia-friendly",
                ["OpenDyslexic-Regular.otf", "OpenDyslexic-Bold.otf", "OpenDyslexic-Italic.otf", "OpenDyslexic-Bold-Italic.otf"])


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def gf_url(folder, name):
    return (f"https://raw.githubusercontent.com/google/fonts/{GOOGLE_FONTS_REF}/ofl/"
            f"{folder}/{urllib.parse.quote(name)}")


def set_ribbi(font, family, style):
    """Plain RIBBI naming + style flags (no typographic family names)."""
    bold, italic = "Bold" in style, "Italic" in style
    ps = (family.replace(" ", "") + "-" + style.replace(" ", ""))
    name = font["name"]
    for nid in (16, 17, 21, 22, 25):
        name.removeNames(nameID=nid)
    for nid, val in ((1, family), (2, style), (4, f"{family} {style}".replace(" Regular", "")),
                     (6, ps), (3, f"{ps};aero-instance")):
        name.setName(val, nid, 3, 1, 0x409)
        name.setName(val, nid, 1, 0, 0)
    os2 = font["OS/2"]
    os2.usWeightClass = 700 if bold else 400
    sel = os2.fsSelection & ~0b1100001             # clear ITALIC(0), BOLD(5), REGULAR(6); keep the rest
    sel |= (1 << 0 if italic else 0) | (1 << 5 if bold else 0) | (1 << 6 if not (bold or italic) else 0)
    os2.fsSelection = sel
    font["head"].macStyle = (1 if bold else 0) | (2 if italic else 0)
    if "post" in font:
        font["post"].italicAngle = font["post"].italicAngle if italic else 0
    return ps


def instance(data, family, style, weight):
    font = TTFont(io.BytesIO(data))
    axes = {a.axisTag: a for a in font["fvar"].axes}
    loc = {}
    for tag, a in axes.items():
        if tag == "wght":
            loc[tag] = max(a.minValue, min(a.maxValue, weight))
        else:
            loc[tag] = a.defaultValue            # wdth/opsz/...: the font's default
    inst = instancer.instantiateVariableFont(font, loc, inplace=False)
    for t in ("STAT", "MVAR", "HVAR", "avar", "fvar", "gvar", "cvar"):
        if t in inst:
            del inst[t]
    ps = set_ribbi(inst, family, style)
    return inst, ps


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    rows = []
    for family, folder, purpose, spec in FAMILIES:
        dest = OUT / family.replace(" ", "")
        dest.mkdir()
        (dest / "OFL.txt").write_bytes(fetch(gf_url(folder, "OFL.txt")))
        kind = spec[0]
        if kind == "static":
            for f in spec[1]:
                (dest / f).write_bytes(fetch(gf_url(folder, f)))
            files = len(spec[1])
            note = "shipped static files, unmodified"
        else:
            _, upright, italic = spec
            files = 0
            src = {"": fetch(gf_url(folder, upright))}
            if italic:
                src["Italic"] = fetch(gf_url(folder, italic))
            for slant, data in src.items():
                for wname, w in (("Regular", 400), ("Bold", 700)):
                    style = {("", "Regular"): "Regular", ("", "Bold"): "Bold",
                             ("Italic", "Regular"): "Italic", ("Italic", "Bold"): "Bold Italic"}[(slant, wname)]
                    font, ps = instance(data, family, style, w)
                    font.save(dest / f"{ps}.ttf")
                    files += 1
            note = "static instances generated from the variable font (fontTools)"
        print(f"  {family:24} {files} files")
        rows.append((family, purpose, "SIL OFL 1.1",
                     f"github.com/google/fonts ofl/{folder} @ {GOOGLE_FONTS_REF[:7]}", note))

    family, purpose, files = OPENDYSLEXIC
    dest = OUT / family
    dest.mkdir()
    base = f"https://raw.githubusercontent.com/antijingoist/opendyslexic/{OPENDYSLEXIC_REF}/"
    for f in files:
        (dest / f).write_bytes(fetch(base + "compiled/" + f))
    (dest / "OFL.txt").write_bytes(fetch(base + "OFL.txt"))
    print(f"  {family:24} {len(files)} files")
    rows.append((family, purpose, "SIL OFL 1.1", f"github.com/antijingoist/opendyslexic compiled/ @ {OPENDYSLEXIC_REF}",
                 "shipped static files, unmodified"))

    write_assets(rows)


def write_assets(rows):
    path = REPO / "THIRD_PARTY_ASSETS.md"
    begin, end = "<!-- fonts:begin (generated by aero/fonts/build_fonts.py) -->", "<!-- fonts:end -->"
    table = [begin, "", "| Font | Purpose | License | Source | Notes |", "|---|---|---|---|---|"]
    table += [f"| {f} | {p} | {l} | {s} | {n} |" for f, p, l, s, n in rows]
    table += ["", "License texts ship next to each family (`OFL.txt`) in `aero/fonts/out/<Family>/`.", end]
    block = "\n".join(table)
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    if begin in text and end in text:
        text = text[:text.index(begin)] + block + text[text.index(end) + len(end):]
    else:
        text = (text.rstrip() + "\n\n" if text else "") + "## Fonts\n\n" + block + "\n"
    path.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
