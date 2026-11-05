#!/usr/bin/env python3
"""Render Curated Journal's icon set from one vector mark.

The mark: a journal page whose last line turns into a small graph of
connected notes. Source SVGs are written to assets/branding/, PNGs to the
paths app.json uses and to store/ for the store listings.

Requires rsvg-convert (librsvg) and Pillow. Run from the repo root:
    python3 scripts/render-icons.py
"""
import os
import subprocess

from PIL import Image

INK = "#16233F"
PAPER = "#F4EEE2"
AMBER = "#E3A23B"


def glyph(page_fill, line_fill, graph_fill, page_stroke=None):
    """The mark on a 1024 canvas (page spans x 262-762, y 200-824)."""
    if page_stroke:
        page = (f'<rect x="273" y="211" width="478" height="602" rx="32" '
                f'fill="none" stroke="{page_stroke}" stroke-width="22"/>')
    else:
        page = f'<rect x="262" y="200" width="500" height="624" rx="40" fill="{page_fill}"/>'
    return f"""{page}
<rect x="332" y="320" width="360" height="36" rx="18" fill="{line_fill}"/>
<rect x="332" y="420" width="290" height="36" rx="18" fill="{line_fill}"/>
<rect x="332" y="520" width="150" height="36" rx="18" fill="{line_fill}"/>
<path d="M482 538 L548 538 L668 470 L636 664 L548 538 M636 664 L494 724" fill="none"
  stroke="{graph_fill}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="548" cy="538" r="34" fill="{graph_fill}"/>
<circle cx="668" cy="470" r="26" fill="{graph_fill}"/>
<circle cx="636" cy="664" r="30" fill="{graph_fill}"/>
<circle cx="494" cy="724" r="22" fill="{graph_fill}"/>"""


def svg(body, background=None, scale=1.0):
    bg = f'<rect width="1024" height="1024" fill="{background}"/>' if background else ""
    t = f"translate(512 512) scale({scale}) translate(-512 -512)"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" '
            f'viewBox="0 0 1024 1024">{bg}<g transform="{t}">{body}</g></svg>\n')


# Android adaptive icons are masked to roughly the centre 66%; shrink the mark to fit.
ADAPTIVE = 0.82

SOURCES = {
    "icon": svg(glyph(PAPER, INK, AMBER), background=INK),
    "adaptive-foreground": svg(glyph(PAPER, INK, AMBER), scale=ADAPTIVE),
    "adaptive-background": svg("", background=INK),
    "monochrome": svg(glyph(None, "#FFFFFF", "#FFFFFF", page_stroke="#FFFFFF"), scale=ADAPTIVE),
    "splash": svg(glyph(PAPER, INK, AMBER)),
}

# (source, output path, size, pixel format)
# "rgb" flattens to opaque RGB — App Store icons must have no alpha channel.
# "alpha-opaque" flattens but keeps a fully opaque alpha channel — Google Play
# requires a 32-bit PNG with an alpha channel. "keep" leaves rsvg output.
OUTPUTS = [
    ("icon", "assets/images/icon.png", 1024, "rgb"),
    ("icon", "assets/images/favicon.png", 48, "rgb"),
    ("icon", "store/app-store/icon-1024.png", 1024, "rgb"),
    ("icon", "store/google-play/icon-512.png", 512, "alpha-opaque"),
    ("adaptive-foreground", "assets/images/android-icon-foreground.png", 1024, "keep"),
    ("adaptive-background", "assets/images/android-icon-background.png", 1024, "rgb"),
    ("monochrome", "assets/images/android-icon-monochrome.png", 1024, "keep"),
    ("splash", "assets/images/splash-icon.png", 512, "keep"),
]


def main():
    os.makedirs("assets/branding", exist_ok=True)
    for name, text in SOURCES.items():
        with open(f"assets/branding/{name}.svg", "w") as f:
            f.write(text)
    for name, out, size, mode in OUTPUTS:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size),
                        f"assets/branding/{name}.svg", "-o", out], check=True)
        if mode != "keep":
            im = Image.open(out)
            if mode == "rgb":
                im = im.convert("RGB")
            elif mode == "alpha-opaque":
                im = im.convert("RGBA")
                im.putalpha(Image.new("L", im.size, 255))
            im.save(out, optimize=True)
        print(out, size)


if __name__ == "__main__":
    main()
