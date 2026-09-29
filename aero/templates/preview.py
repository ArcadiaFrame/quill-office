#!/usr/bin/env python3
"""Render thumbnails of the built templates with the app's own converter (x2t), exactly
as the app does for its Templates panel, and combine them into one contact sheet.
Usage: python aero/templates/preview.py [out.png]
"""
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
CONV = REPO / "desktopeditors" / "converter"
OUT = Path(__file__).resolve().parent / "out"
W, H = 240, 340

JSON = ('{"spreadsheetLayout":{"fitToWidth":0,"fitToHeight":0,"orientation":"landscape","sheetsProps":{"0":{"headings":false,'
        '"printTitlesWidth":null,"printTitlesHeight":null,"pageMargins":{"bottom":10,"footer":5,"header":5,"left":5,"right":5,"top":10},'
        '"pageSetup":{"orientation":1,"width":210,"height":297,"paperUnits":0,"scale":100,"printArea":false,"horizontalDpi":600,'
        '"verticalDpi":600,"usePrinterDefaults":true,"fitToHeight":0,"fitToWidth":0}}}},'
        '"documentLayout":{"drawPlaceHolders":true,"drawFormHighlight":true,"isPrint":true}}')


def thumb(src, dst, tmp):
    xml = ('<?xml version="1.0" encoding="utf-8"?><TaskQueueDataConvert>'
           f'<m_sFileFrom>{escape(str(src))}</m_sFileFrom><m_sFileTo>{escape(str(dst))}</m_sFileTo>'
           f'<m_nFormatTo>1025</m_nFormatTo><m_sFontDir>{escape(str(CONV))}</m_sFontDir><m_bIsNoBase64>false</m_bIsNoBase64>'
           f'<m_sAllFontsPath>{escape(str(CONV / "AllFonts.js"))}</m_sAllFontsPath><m_sTempDir>{escape(str(tmp))}</m_sTempDir>'
           '<m_bDontSaveAdditional>true</m_bDontSaveAdditional><m_bFromChanges>false</m_bFromChanges>'
           f'<m_sJsonParams>{escape(JSON)}</m_sJsonParams><m_nDoctParams>1</m_nDoctParams>'
           f'<m_oThumbnail><first>true</first><aspect>16</aspect><width>{W}</width><height>{H}</height></m_oThumbnail>'
           '</TaskQueueDataConvert>')
    params = Path(tmp) / "params.xml"
    params.write_text(xml, encoding="utf-8")
    return subprocess.run([str(CONV / "x2t.exe"), str(params)], cwd=CONV, capture_output=True).returncode


def main():
    files = sorted(OUT.rglob("*.*x"))
    tiles = []
    with tempfile.TemporaryDirectory() as tmp:
        for f in files:
            dst = Path(tmp) / (f.stem + ".png")
            rc = thumb(f, dst, tmp)
            img = Image.open(dst).convert("RGB") if dst.exists() else Image.new("RGB", (W, H), (255, 200, 200))
            img.thumbnail((W, H))
            tiles.append((f.stem, img, rc))
    cols = 6
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (W + 16) + 16, rows * (H + 40) + 16), (60, 66, 76))
    d = ImageDraw.Draw(sheet)
    for i, (name, img, rc) in enumerate(tiles):
        x, y = 16 + (i % cols) * (W + 16), 16 + (i // cols) * (H + 40)
        sheet.paste(img, (x + (W - img.width) // 2, y))
        d.text((x, y + H + 6), f"{name}" + ("" if rc == 0 else f"  (x2t {rc})"), fill=(235, 240, 245))
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT / "preview.png"
    sheet.save(out)
    print("saved", out, len(tiles), "tiles")


if __name__ == "__main__":
    main()
