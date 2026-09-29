#!/usr/bin/env python3
"""Draw original line-art icons for the Aero plugins (no third-party artwork).

For each plugin folder under aero/plugins/<name>/ that has an entry in GLYPHS, writes
resources/{light,dark}/icon{,@1.25x,@1.5x,@1.75x,@2x}.png (28 px base, like the stock
plugins). Light theme: dark glyph; dark theme: light glyph.
Usage: python aero/plugins/make_icons.py   (needs Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
SCALES = {"": 1, "@1.25x": 1.25, "@1.5x": 1.5, "@1.75x": 1.75, "@2x": 2}
COLORS = {"light": (40, 48, 60, 255), "dark": (234, 238, 243, 255)}


def accessibility(d, s, c):
    """Person in a circle (universal access symbol, drawn from scratch)."""
    w = max(1, round(1.6 * s))
    d.ellipse([3 * s, 3 * s, 25 * s, 25 * s], outline=c, width=w)
    d.ellipse([12.2 * s, 6.5 * s, 15.8 * s, 10.1 * s], fill=c)                 # head
    d.line([8 * s, 12.3 * s, 20 * s, 12.3 * s], fill=c, width=w)                # arms
    d.line([14 * s, 12.3 * s, 14 * s, 16.5 * s], fill=c, width=w)              # body
    d.line([14 * s, 16.5 * s, 10.8 * s, 21.8 * s], fill=c, width=w)            # legs
    d.line([14 * s, 16.5 * s, 17.2 * s, 21.8 * s], fill=c, width=w)


def quickparts(d, s, c):
    """A stack of text blocks with a plus."""
    w = max(1, round(1.6 * s))
    d.rounded_rectangle([4 * s, 5 * s, 20 * s, 12 * s], radius=2 * s, outline=c, width=w)
    d.rounded_rectangle([4 * s, 15 * s, 20 * s, 22 * s], radius=2 * s, outline=c, width=w)
    d.line([23 * s, 13 * s, 23 * s, 23 * s], fill=c, width=w)
    d.line([18 * s, 18 * s, 28 * s - 1, 18 * s], fill=c, width=w)


def clipboard(d, s, c):
    """Clipboard with lines and a history arc."""
    w = max(1, round(1.6 * s))
    d.rounded_rectangle([6 * s, 5 * s, 22 * s, 25 * s], radius=2 * s, outline=c, width=w)
    d.rounded_rectangle([10 * s, 3 * s, 18 * s, 7.5 * s], radius=1.5 * s, fill=c)
    for y in (12, 16, 20):
        d.line([10 * s, y * s, 18 * s, y * s], fill=c, width=w)


def inspector(d, s, c):
    """Document with a magnifier."""
    w = max(1, round(1.6 * s))
    d.polygon([(5 * s, 3 * s), (16 * s, 3 * s), (21 * s, 8 * s), (21 * s, 14 * s), (5 * s, 14 * s)], outline=c)
    d.line([5 * s, 3 * s, 5 * s, 24 * s], fill=c, width=w)
    d.line([5 * s, 24 * s, 12 * s, 24 * s], fill=c, width=w)
    d.ellipse([12 * s, 13 * s, 21 * s, 22 * s], outline=c, width=w)
    d.line([20 * s, 21 * s, 25 * s, 26 * s], fill=c, width=w)


GLYPHS = {"accessibility": accessibility, "quickparts": quickparts, "clipboard": clipboard, "inspector": inspector}


def main():
    for name, draw in GLYPHS.items():
        folder = HERE / name
        if not folder.is_dir():
            continue
        for style, color in COLORS.items():
            out = folder / "resources" / style
            out.mkdir(parents=True, exist_ok=True)
            for suffix, scale in SCALES.items():
                size = round(28 * scale)
                big = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))   # 4x supersampling
                draw(ImageDraw.Draw(big), scale * 4, color)
                big.resize((size, size), Image.LANCZOS).save(out / f"icon{suffix}.png")
        print("icons:", name)


if __name__ == "__main__":
    main()
