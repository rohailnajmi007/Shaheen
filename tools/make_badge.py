"""Builds the PAF pilot wings for the flying name tag (bottom-left of the flight
HUD) from the owner's picture on white.

    python tools/make_badge.py
(needs Pillow). Removes the white background (same flood fill as the aircraft
tool, so white inside the badge such as the star and "PAF" stays), then knocks
out the dark backing plate so the wings sit straight on the name tag's cloth,
crops it and stores it at 4x its on-screen width (drawn scaled down).

One file per crescent colour (the colour shows the rank, owner 2026-11-19):
    paf_pilot_wings_white.png  (Flight Lieutenant, cadet)
    paf_pilot_wings_blue.png   (Squadron Leader)
    paf_pilot_wings_red.png    (Wing Commander)
"""
import os
import sys
from PIL import Image, ImageChops, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from make_aircraft_sprites import remove_background  # noqa: E402

SRC = "docs/reference/paf_pilot_wings_source.png"
OUT = "public/sprites/paf_pilot_wings_%s.png"
DISPLAY_WIDTH = 64   # px on the old 640x360 layout
TEXTURE_SCALE = 4

# Backing plate: dark, grey pixels. Fully clear below PLATE_LO luminance, kept above
# PLATE_HI, ramped between. Saturated pixels (the gold wreath) are always kept.
PLATE_LO = 75
PLATE_HI = 135
PLATE_MAX_SAT = 40
# The plate's light anti-aliased rim: everything this many source px inside the
# badge outline is cleared (the wings sit well inside it).
RIM_PX = 7
# Islands smaller than this (source px) are rim leftovers and get cleared.
SPECK_PX = 60

# Crescent and star: bright pixels inside this box (fractions of the cropped badge).
CRESCENT_BOX = (0.40, 0.0, 0.60, 0.40)
CRESCENT_MIN_LUM = 140
COLOURS = {
    "white": None,
    "blue": (70, 140, 245),
    "red": (225, 35, 45),
}


def lum(r, g, b):
    return 0.3 * r + 0.59 * g + 0.11 * b


def knock_out_plate(im):
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or max(r, g, b) - min(r, g, b) > PLATE_MAX_SAT:
                continue
            l = lum(r, g, b)
            if l <= PLATE_LO:
                px[x, y] = (r, g, b, 0)
            elif l < PLATE_HI:
                px[x, y] = (r, g, b, round(a * (l - PLATE_LO) / (PLATE_HI - PLATE_LO)))


def drop_specks(im, min_px=SPECK_PX):
    """Clears small islands of pixels left over from the plate's rim."""
    px = im.load()
    w, h = im.size
    seen = bytearray(w * h)
    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or px[sx, sy][3] == 0:
                continue
            blob, stack = [], [(sx, sy)]
            seen[sy * w + sx] = 1
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] > 0:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            if len(blob) < min_px:
                for x, y in blob:
                    px[x, y] = (0, 0, 0, 0)


def tint_crescent(im, col):
    px = im.load()
    w, h = im.size
    x0, y0, x1, y1 = (round(f * s) for f, s in zip(CRESCENT_BOX, (w, h, w, h)))
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = px[x, y]
            l = lum(r, g, b)
            if a == 0 or l < CRESCENT_MIN_LUM or max(r, g, b) - min(r, g, b) > 40:
                continue
            k = l / 255
            # Shade the colour by the embroidery's light and dark threads.
            px[x, y] = tuple(min(255, round(c * k * 1.15)) for c in col) + (a,)


base = Image.open(SRC).convert("RGBA")
remove_background(base)
base = base.crop(base.getbbox())
inner = base.getchannel("A").point(lambda a: 255 if a > 0 else 0).filter(ImageFilter.MinFilter(2 * RIM_PX + 1))
knock_out_plate(base)
base.putalpha(ImageChops.multiply(base.getchannel("A"), inner))
drop_specks(base)
base = base.crop(base.getbbox())
w = DISPLAY_WIDTH * TEXTURE_SCALE
h = round(base.height * w / base.width)
for name, col in COLOURS.items():
    im = base.copy()
    if col:
        tint_crescent(im, col)
    im.resize((w, h), Image.LANCZOS).save(OUT % name)
    print("%s: %dx%d" % (OUT % name, w, h))
