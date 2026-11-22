"""Builds the 1965-era aircraft sprites (owner 2026-11-22) from the owner's art.

    python tools/make_1965_sprites.py          # all four
    python tools/make_1965_sprites.py f86      # one
(needs Pillow)

The art (docs/reference/<name>_1965_source.png) faces LEFT with the gear down and the
gear doors open. Each config lists, in SOURCE px (before the flip):
  parts  - pieces cut out of the art to their own layer:
           kind 'leg'  = gear leg + wheel (+ a door fixed to the leg): rotates about
                         its hinge into the fuselage ('aft' or 'fwd' after the flip)
           kind 'door' = a door hanging under the fuselage: folds up flat to its hinge
                         line (drawn squashed toward it) as the gear comes up
           rect  = (x0, y0, x1, y1): the part's opaque pixels inside this box
           hinge = the pivot (legs) / hinge line (doors: only y counts)
  erase  - boxes cleared to background first (caption, stray pieces)
  unflip - text boxes (serials) flipped back after the flip so they read
  elevator - the tailplane (owner 2026-11-22: moving tailplanes on the fighters): poly
           (source px) cut to <name>_elevator.png, hinge = its pivot. Where it covered the
           fuselage / fin, the body is filled in by blending the body colours above and
           below in each column, so nothing shows through when it tilts.
The picture is flipped to face right, cropped, scaled to display_width world px x
TEXTURE_SCALE and written as public/sprites/<name>_body.png and <name>_<part>.png (all
layers the same size, aligned). It prints texture-px positions for src/data/aircraft.js.
"""
import sys
from collections import deque
from PIL import Image, ImageDraw

TEXTURE_SCALE = 4

CONFIGS = {
    "f86": {
        "src": "docs/reference/f86_1965_source.png",
        "display_width": 88,   # 11.4 m
        "erase": [(140, 243, 470, 266), (630, 226, 725, 266)],   # caption, stray tailplane piece
        "unflip": [(131, 131, 174, 154), (548, 138, 614, 160), (633, 23, 667, 50)],
        "parts": [
            {"name": "gear_nose", "kind": "leg", "rect": (76, 179, 117, 241), "hinge": (97, 160), "dir": "aft", "deg": 95},
            {"name": "door_nose", "kind": "door", "rect": (118, 182, 186, 226), "hinge": (150, 182)},
            {"name": "gear_main", "kind": "leg", "rect": (334, 181, 404, 241), "hinge": (368, 160), "dir": "fwd", "deg": 90},
        ],
        "elevator": {"poly": [(606, 113), (673, 110), (690, 104), (725, 104), (725, 112), (700, 118), (682, 124), (606, 125)],
                     "hinge": (648, 117)},
        "points": {"nozzle": (650, 147), "main_wheel_bottom": (379, 238), "tail_top": (680, 10),
                   "wing_tip": (420, 170), "gun": (120, 140)},
    },
    "f6": {
        "src": "docs/reference/f6_1965_source.png",
        "display_width": 105,  # 12.5 m + nose probe
        "erase": [(300, 284, 560, 305)],
        "unflip": [(176, 173, 240, 202), (603, 168, 657, 195)],
        "parts": [
            {"name": "gear_nose", "kind": "leg", "rect": (210, 222, 254, 280), "hinge": (228, 205), "dir": "aft", "deg": 95},
            {"name": "door_nose", "kind": "door", "rect": (266, 222, 284, 238), "hinge": (275, 222)},
            {"name": "gear_main", "kind": "leg", "rect": (476, 248, 530, 280), "hinge": (500, 222), "dir": "fwd", "deg": 85},
        ],
        "elevator": {"poly": [(655, 162), (660, 157), (829, 157), (830, 170), (655, 170)], "hinge": (720, 163)},
        "points": {"nozzle": (755, 180), "main_wheel_bottom": (503, 276), "wing_tip": (560, 205), "gun": (250, 190)},
    },
    "f104": {
        "src": "docs/reference/f104_1965_source.png",
        "display_width": 140,  # 16.7 m with the probe; owner 2026-11-22: longer (was 128), still under the B-57
        "erase": [(300, 284, 560, 305)],
        "unflip": [(286, 168, 362, 194), (726, 76, 780, 99)],
        "parts": [
            {"name": "gear_nose", "kind": "leg", "rect": (300, 226, 336, 279), "hinge": (318, 210), "dir": "fwd", "deg": 95},
            {"name": "gear_main", "kind": "leg", "rect": (506, 222, 560, 279), "hinge": (528, 200), "dir": "fwd", "deg": 90},
        ],
        "elevator": {"poly": [(747, 49), (828, 48), (839, 52), (839, 58), (800, 62), (747, 62)], "hinge": (778, 55)},
        "points": {"nozzle": (790, 175), "main_wheel_bottom": (533, 274), "wing_tip": (560, 195), "gun": (330, 190)},
    },
    "b57": {
        "src": "docs/reference/b57_1965_source.png",
        "display_width": 150,  # 20 m
        "erase": [(300, 280, 560, 302)],
        "unflip": [(103, 176, 139, 197), (693, 96, 765, 115)],
        "parts": [
            {"name": "door_nose", "kind": "door", "rect": (204, 221, 271, 236), "hinge": (237, 221)},
            {"name": "gear_nose", "kind": "leg", "rect": (209, 236, 254, 276), "hinge": (230, 210), "dir": "aft", "deg": 95},
            {"name": "gear_main", "kind": "leg", "rect": (394, 214, 454, 276), "hinge": (422, 195), "dir": "fwd", "deg": 90},
        ],
        "points": {"nozzle": (820, 150), "main_wheel_bottom": (423, 271), "wing_tip": (560, 200)},
    },
}


def is_bg(p):
    r, g, b, a = p
    return a < 30 or (r > 225 and g > 225 and b > 225 and max(r, g, b) - min(r, g, b) < 20)


def remove_background(im):
    """Flood-fill the white background from the edges to transparent."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]:
            continue
        seen[y * w + x] = 1
        if not is_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # The light anti-aliasing halo left against white.
    for _ in range(2):
        clear = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or min(r, g, b) < 215 or max(r, g, b) - min(r, g, b) > 25:
                    continue
                if any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    clear.append((x, y))
        for x, y in clear:
            px[x, y] = (0, 0, 0, 0)


def build(name, cfg):
    im = Image.open(cfg["src"]).convert("RGBA")
    for box in cfg.get("erase", []):
        im.paste((255, 255, 255, 255), box)
    remove_background(im)
    w, h = im.size
    px = im.load()
    layers = {"body": im.copy()}
    bp = layers["body"].load()
    for p in cfg["parts"]:
        x0, y0, x1, y1 = p["rect"]
        lay = Image.new("RGBA", im.size, (0, 0, 0, 0))
        lp = lay.load()
        for y in range(max(0, y0), min(h, y1 + 1)):
            for x in range(max(0, x0), min(w, x1 + 1)):
                if bp[x, y][3] > 0:
                    lp[x, y] = bp[x, y]
                    bp[x, y] = (0, 0, 0, 0)
        layers[p["name"]] = lay
    e = cfg.get("elevator")
    if e:
        m = Image.new("L", im.size, 0)
        ImageDraw.Draw(m).polygon(e["poly"], fill=255)
        mp = m.load()
        lay = Image.new("RGBA", im.size, (0, 0, 0, 0))
        lp = lay.load()
        cut = []
        for y in range(h):
            for x in range(w):
                if mp[x, y] and bp[x, y][3] > 0:
                    lp[x, y] = bp[x, y]
                    bp[x, y] = (0, 0, 0, 0)
                    cut.append((x, y))
        # Fill the hole where body continues above and below (fuselage / fin behind it).
        for x, y in cut:
            up = next((yy for yy in range(y - 1, max(-1, y - 45), -1) if bp[x, yy][3] > 0 and not mp[x, yy]), None)
            dn = next((yy for yy in range(y + 1, min(h, y + 45)) if bp[x, yy][3] > 0 and not mp[x, yy]), None)
            if up is None or dn is None:
                continue
            t = (y - up) / (dn - up)
            a, b = bp[x, up], bp[x, dn]
            bp[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3)) + (255,)
        layers["elevator"] = lay
    # Face right; serials flipped back so they read.
    for k in layers:
        layers[k] = layers[k].transpose(Image.FLIP_LEFT_RIGHT)
    b = layers["body"]
    for x0, y0, x1, y1 in cfg.get("unflip", []):
        bx = (w - 1 - x1, y0, w - 1 - x0 + 1, y1)
        b.paste(b.crop(bx).transpose(Image.FLIP_LEFT_RIGHT), bx[:2])
    fx = lambda x: w - 1 - x
    # Crop to everything (gear down) and scale.
    full = Image.new("RGBA", im.size, (0, 0, 0, 0))
    for lay in layers.values():
        full.alpha_composite(lay)
    box = full.getbbox()
    out_w = cfg["display_width"] * TEXTURE_SCALE
    k = out_w / (box[2] - box[0])
    out_h = round((box[3] - box[1]) * k)
    t = lambda x, y: (round((fx(x) - box[0]) * k, 1), round((y - box[1]) * k, 1))
    for lname, lay in layers.items():
        lay.crop(box).resize((out_w, out_h), Image.LANCZOS).save("public/sprites/%s_%s.png" % (name, lname))
    print("== %s: texture %dx%d" % (name, out_w, out_h))
    for p in cfg["parts"]:
        hx, hy = t(*p["hinge"])
        if p["kind"] == "leg":
            deg = p["deg"] if p["dir"] == "aft" else -p["deg"]
            print("  { sprite: '%s_%s', kind: 'leg', hinge: [%s, %s], deg: %s }," % (name, p["name"], hx, hy, deg))
        else:
            print("  { sprite: '%s_%s', kind: 'door', hingeY: %s }," % (name, p["name"], hy))
    if e:
        print("  elevatorSprite: '%s_elevator', elevatorHinge: [%s, %s]," % ((name,) + t(*e["hinge"])))
    for key, pt in cfg["points"].items():
        print("  %s -> %s" % (key, t(*pt)))


if __name__ == "__main__":
    for n in sys.argv[1:] or list(CONFIGS):
        build(n, CONFIGS[n])
