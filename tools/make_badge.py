"""Builds the PAF pilot wings badge (cadet tag, bottom-left of the flight HUD)
from the owner's picture on white.

    python tools/make_badge.py
(needs Pillow). Removes the white background (same flood fill as the aircraft
tool, so white inside the badge such as the star and "PAF" stays), crops it and
stores it at 4x its on-screen width (drawn scaled down with mipmaps).
"""
import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from make_aircraft_sprites import remove_background  # noqa: E402

SRC = "docs/reference/paf_pilot_wings_source.png"
OUT = "public/sprites/paf_pilot_wings.png"
DISPLAY_WIDTH = 64   # px on the 640x360 layout
TEXTURE_SCALE = 4

im = Image.open(SRC).convert("RGBA")
remove_background(im)
im = im.crop(im.getbbox())
w = DISPLAY_WIDTH * TEXTURE_SCALE
h = round(im.height * w / im.width)
im.resize((w, h), Image.LANCZOS).save(OUT)
print("%s: %dx%d (shown at %dx%d)" % (OUT, w, h, DISPLAY_WIDTH, round(h / TEXTURE_SCALE)))
