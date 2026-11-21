"""Builds aircraft sprites from the owner's art (plane on a white background).

    python tools/make_aircraft_sprites.py            # all aircraft
    python tools/make_aircraft_sprites.py f16        # one aircraft
(needs Pillow: pip install pillow)

For each aircraft in CONFIGS it removes the white background and writes
aligned layers to public/sprites/<name>_<layer>.png:
  body - the aircraft (minus gear/prop if those are split out)
  gear - landing gear cut from the art (slides up to retract), optional
  prop - propeller blades (shown while the engine runs), optional
Front-view configs (k8_front, jf17_front, f16_front) make parked-aircraft scenery.
  elevator - the tailplane cut out of the art (drawn rotating with the
             stick), optional. The body under it is the owner's picture of
             the same art without the tailplane (under_src)
  canard   - the same for a foreplane (J-10C canards); config key "canard"
Textures are stored at TEXTURE_SCALE x the on-screen size and drawn scaled
down with mipmaps, so they look like the art rather than blocky.
It prints texture-space positions to copy into src/data/aircraft.js (pivot, gearTravel, lights, ...).
"""
import sys
from collections import deque
from PIL import Image, ImageDraw

TEXTURE_SCALE = 4   # texture px per world px

CONFIGS = {
    "super_mushshak": {
        "src": "docs/reference/super_mushshak_sprite_source.png",
        "display_width": 70,   # world px (owner: "original size")
        # Gear = pixels below a cut line inside each x range: (x0, x1, cut y at x0, cut y at x1).
        "gear_regions": [(440, 585, 231, 231), (600, 735, 233, 210)],
        "gear_cut_y": 231,
        # Propeller blades: right of min_x, outside the spinner band.
        "prop": {"min_x": 724, "spinner_y": (148, 198)},
        "points": {"flap_hinge": (368, 126), "prop_center": (742, 173)},
    },
    "f16": {
        # Owner's F-16D art (No. 11 Sqn "Falcons", 10805), drawn with the gear
        # DOWN: the gear is cut to its own layer and slides up into the body.
        # (Old retracted-gear art: docs/reference/f16d_old_sprite_source.png.)
        "src": "docs/reference/f16_sprite_source.png",
        "display_width": 115,  # world px; the F-16 is ~2x the Mushshak's length
        # Main gear below the fuselage; nose gear = strut column + wheel below the tank.
        "gear_regions": [(274, 326, 249, 249), (473, 482, 255, 255), (462, 492, 270, 270)],
        # Travel = wheel bottom up to y 245, so the main wheel hides fully in the body.
        "gear_cut_y": 245,
        "prop": None,
        "points": {"nozzle": (50, 184), "main_wheel": (295, 0), "elevator_hinge": (128, 202),
                   "light_landing": (477, 262)},
        # All-moving tailplane, in OUTPUT texture px (see the f16a config).
        # Owner's picture of the same art WITHOUT the tailplane (2026-11-18) is the
        # body under it; under_offset = where it sits on the source.
        "elevator": {"poly": [(0, 131), (14, 108), (78, 106), (79, 111), (52, 117), (32, 123), (13, 131)],
                     "under_src": "docs/reference/f16_no_tailplane_source.png", "under_offset": (-5, 2)},
    },
    "f16a": {
        # Owner's F-16A art (No. 9 Sqn "Griffins", 84717). Same pose and size as
        # the F-16D, gear retracted: gear drawn in code, tailplane cut to its own layer.
        # Owner's pair (2026-11-18): the art with the tailplane, and the same art
        # WITHOUT it (full nozzle and the fixed shelf under the tailplane). The
        # no-tailplane picture is the body; the tailplane layer is the difference.
        # (Same art as the older f16a_sprite_source.png, shifted by (15, 4) px.)
        "src": "docs/reference/f16a_with_tailplane_source.png",
        "display_width": 115,
        "gear_regions": [],
        "prop": None,
        # Gear tops sit hidden behind the stores/fuselage; the wheels reach the same
        # height below the fuselage as on the F-16D (fin top to wheel = 275 src px).
        "points": {"nozzle": (71, 185), "main_gear_top": (363, 254), "nose_gear_top": (498, 252),
                   "wheel_bottom": (0, 307), "elevator_hinge": (143, 203)},
        # under_offset: where the no-tailplane picture sits on the with-tailplane one.
        # poly: the tailplane outline in OUTPUT texture px (cut from the with-tailplane art).
        "elevator": {"under_src": "docs/reference/f16a_no_tailplane_source.png", "under_offset": (5, -12),
                     "poly": [(0, 131), (14, 110), (79, 108), (80, 112), (50, 118), (30, 123), (12, 131)]},
    },
    "mirage5": {
        "src": "docs/reference/mirage5_sprite_source.png",   # owner's art with the gear down
        "display_width": 118,  # world px; 15.5 m, about the F-16's length
        "gear_regions": [(285, 336, 266, 266), (548, 596, 219, 219)],   # main wheel, nose gear
        "gear_cut_y": 219,
        "prop": None,
        "points": {"nozzle": (55, 182), "main_wheel": (312, 0), "light_nav_near": (160, 208),
                   "light_nav_far": (185, 203), "light_tail": (55, 140), "light_beacon": (38, 38),
                   "light_landing": (575, 252)},
    },
    "jf17": {
        # Owner's JF-17 Thunder art (No. 16 Sqn "Black Panthers" style, 23-323,
        # 2026-11-19), gear down, missiles under the wing as drawn. Owner's pair:
        # the art WITH the all-moving tailplane (src) and WITHOUT it (under_src);
        # same scale, the no-tailplane picture sits at (11, 21) on this one
        # (found by matching the fin and nozzle). Tailplane = what differs.
        "src": "docs/reference/jf17_with_tailplane_source.png",
        "display_width": 114,  # world px; JF-17 is 14.9 m, a touch shorter than the F-16
        # Main gear below the stores (the missile fin next to it stays on the body), nose gear.
        "gear_regions": [(255, 295, 251, 251), (505, 537, 244, 244)],
        "gear_cut_y": 247,
        "prop": None,
        "points": {"nozzle": (50, 197), "main_wheel": (274, 289), "elevator_hinge": (120, 222),
                   "light_nav_near": (300, 214), "light_nav_far": (330, 209), "light_tail": (68, 150),
                   "light_beacon": (100, 44), "light_landing": (522, 250)},
        # poly_src: the tailplane outline in SOURCE px (converted to texture px).
        "elevator": {"under_src": "docs/reference/jf17_no_tailplane_source.png", "under_offset": (11, 21),
                     "poly_src": [(37, 226), (55, 217), (70, 211), (161, 214), (161, 224), (106, 238), (80, 232), (50, 231)]},
    },
    "j10c": {
        # Owner's J-10C art (22-105, 2026-11-20), gear up (gear drawn in code), PL-15
        # under the wing as drawn. Owner's pair: WITH the canards (src) and WITHOUT
        # them (under_src). The pair is NOT the same scale: the no-canard picture
        # is scaled x0.972 and sits at (-6, 7) on this one (found by matching the
        # outlines). Phone share buttons and the captions are blanked.
        "src": "docs/reference/j10c_with_canards_source.png",
        "erase": [(560, 0, 758, 60), (0, 226, 758, 241)],
        "display_width": 122,  # world px; J-10C is 16.9 m, a bit longer than the F-16
        "gear_regions": [],
        "prop": None,
        "points": {"nozzle": (72, 163), "main_gear_top": (330, 192), "nose_gear_top": (505, 184),
                   "wheel_bottom": (0, 246), "canard_hinge": (440, 152),
                   "light_nav_near": (300, 172), "light_nav_far": (318, 168), "light_tail": (88, 120),
                   "light_beacon": (92, 16), "light_landing": (505, 190)},
        # poly_src: the canard (and its shaded underside) in SOURCE px.
        "canard": {"under_src": "docs/reference/j10c_no_canards_source.png", "under_scale": 0.972,
                   "under_offset": (-6, 7), "under_erase": [(220, 0, 470, 38), (0, 228, 755, 251)],
                   "poly_src": [(384, 141), (428, 142), (448, 143), (468, 145), (495, 150), (495, 157),
                                (483, 160), (472, 166), (440, 171), (404, 171), (401, 160), (393, 151)]},
    },
    "f7pg": {
        # Owner's F-7PG art (No. 20-style "Tigers", 801; 2026-11-21), gear down, nose
        # LEFT (flipped). Owner's pair f7pg_pair_source.png: WITH the tailplane (top,
        # f7pg_with_elevator_source.png) and WITHOUT it (bottom, f7pg_no_elevator_source.png,
        # caption blanked). The two are drawn differently (stores and tail proportions
        # move), so the body is the WITH picture and only the strip under the tailplane
        # is filled from the WITHOUT picture, shifted so its nozzle lines up.
        # All coordinates here are in the UNFLIPPED source (src_unflipped).
        "src": "docs/reference/f7pg_with_elevator_source.png", "flip": True, "src_unflipped": True,
        "display_width": 112,  # world px; 14.9 m incl. the pitot, like the JF-17
        # Nose gear below the fuselage; main gear strut + wheel (the stores behind it
        # are filled back in from the next column: gear_fill).
        "gear_regions": [(265, 307, 205, 205), (568, 619, 223, 223), (584, 604, 201, 201)],
        "gear_fill": [(568, 619, 201, 245)],
        "gear_cut_y": 201,  # travel deep enough to hide the nose wheel too
        # Lettering, mirrored back after the flip (Tigers, 801, fin serial/name, cockpit text).
        "unflip": [(506, 122, 650, 163), (214, 155, 258, 181), (864, 26, 906, 40), (842, 44, 874, 57), (302, 132, 336, 146)],
        "prop": None,
        "points": {"nozzle": (890, 170), "main_wheel": (593, 266), "elevator_hinge": (840, 167),
                   "gun_port": (330, 196), "light_nav_near": (700, 186), "light_nav_far": (712, 182),
                   "light_tail": (895, 122), "light_beacon": (620, 104), "light_landing": (286, 210)},
        "elevator": {"patch_src": "docs/reference/f7pg_no_elevator_source.png", "patch_box": (774, 157, 900, 177),
                     "patch_shift": (-12, 0), "patch_clear_from_x": 894,
                     "poly_src": [(777, 166), (781, 161), (793, 160), (933, 160), (934, 163), (966, 163),
                                  (966, 171), (933, 172), (931, 174), (793, 174), (779, 170)]},
    },
    # Air-to-air opponents (owner 2026-11-21): bandit art, no gear (always airborne).
    # MiG-21 and Rafale art points left: flipped to fly right like everything else.
    "mig21": {
        "src": "docs/reference/mig21_opponent_source.png", "flip": True,
        "display_width": 118,  # 15.8 m incl. the pitot, about the F-16's length
        "unflip": [(698, 92, 741, 109)],  # serial CU251
        "gear_regions": [], "prop": None, "points": {},  # nozzle etc.: read off the output (flipped)
    },
    "su30": {
        "src": "docs/reference/su30_opponent_source.png",
        "display_width": 160,  # 21.9 m: much bigger than the others
        "gear_regions": [], "prop": None, "points": {"nozzle": (60, 190)},
    },
    "rafale": {
        "src": "docs/reference/rafale_opponent_source.png", "flip": True,
        "display_width": 116,  # 15.3 m
        "unflip": [(691, 83, 736, 99)],  # serial RB001
        "gear_regions": [], "prop": None, "points": {},  # nozzle etc.: read off the output (flipped)
    },
    # Weapons (owner's art, 2026-11-18), drawn under the jets on a strike
    # mission and when falling/flying. display_width is in world px like the
    # aircraft (aircraft art is ~2x true scale; so are these): texture width =
    # display_width x 4 = the weapon's length in aircraft texture px.
    "agm88": {   # AGM-88 HARM, F-16D (4.2 m). Art points left: flipped to point right.
        "src": "docs/reference/agm88_harm_source.png", "flip": True,
        "display_width": 32, "gear_regions": [], "prop": None, "points": {},
    },
    "gbu12": {   # GBU-12 Paveway II laser-guided bomb, F-16A (3.3 m)
        "src": "docs/reference/gbu12_source.png",
        "display_width": 25, "gear_regions": [], "prop": None, "points": {},
    },
    "raad": {    # Ra'ad (Hatf-VIII) air-launched cruise missile, JF-17 (4.85 m), owner's art 2026-11-19
        "src": "docs/reference/raad_source.png",
        "display_width": 37, "gear_regions": [], "prop": None, "points": {},
    },
    "mk82": {    # Mk 82 unguided bomb, Mirage V (2.2 m); the "Mk 82" caption is erased
        "src": "docs/reference/mk82_source.png", "erase": [(180, 79, 330, 97)],
        "display_width": 17, "gear_regions": [], "prop": None, "points": {},
    },
    # Front views for parked aircraft (base scenery, not flyable). "erase" blanks
    # the phone share/copy/download buttons in the top-right of the screenshots.
    "k8_front": {
        "src": "docs/reference/k8_front_source.png",
        "display_width": 40,   # K-8 span 9.6 m
        "erase": [(680, 0, 853, 50)],
        "gear_regions": [], "prop": None, "points": {},
    },
    "jf17_front": {
        "src": "docs/reference/jf17_front_source.png",
        "display_width": 40,   # JF-17 span 9.45 m incl. wingtip missiles
        "erase": [(680, 0, 846, 50)],
        "gear_regions": [], "prop": None, "points": {},
    },
    "f16_front": {
        "src": "docs/reference/f16_front_source.png",
        "display_width": 42,   # F-16 span 9.96 m incl. wingtip missiles
        "erase": [(680, 0, 852, 50)],
        "gear_regions": [], "prop": None, "points": {},
    },
}


def is_bg(p):
    return min(p[:3]) >= 232


def remove_background(im):
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
    # Soften the light halo left from anti-aliasing against white.
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


def unflip_cfg(cfg, w):
    """Configs written in the unflipped source's coordinates -> flipped coordinates."""
    fx = lambda x: w - 1 - x
    c = dict(cfg)
    c["gear_regions"] = [(fx(x1), fx(x0), y1, y0) for x0, x1, y0, y1 in cfg["gear_regions"]]
    c["gear_fill"] = [(fx(x1), fx(x0), y0, y1) for x0, x1, y0, y1 in cfg.get("gear_fill", [])]
    c["points"] = {k: (fx(x), y) for k, (x, y) in cfg["points"].items()}
    if cfg.get("elevator"):
        e = dict(cfg["elevator"])
        e["poly_src"] = [(fx(x), y) for x, y in e["poly_src"]]
        c["elevator"] = e
    return c


def orient(im, cfg):
    if cfg.get("flip"):
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        # Text (serials) inside these SOURCE boxes is flipped back so it reads correctly.
        for x0, y0, x1, y1 in cfg.get("unflip", []):
            bx = (im.width - x1, y0, im.width - x0, y1)
            im.paste(im.crop(bx).transpose(Image.FLIP_LEFT_RIGHT), bx[:2])
    return im


def fill_gear_holes(img, orig, boxes):
    """Where the gear was cut out in front of the stores, continue the stores: each
    hole pixel takes the nearest body pixel to its left in the same row (needs body
    on both sides). orig = the picture before the cut (what was opaque)."""
    bp, op = img.load(), orig.load()
    w = img.width
    for x0, x1, y0, y1 in boxes:
        for y in range(y0, y1 + 1):
            src_x = next((x for x in range(x0 - 1, max(-1, x0 - 40), -1) if bp[x, y][3] > 0), None)
            right = any(bp[x, y][3] > 0 for x in range(x1 + 1, min(w, x1 + 60)))
            if src_x is None or not right:
                continue
            for x in range(x0, x1 + 1):
                if bp[x, y][3] == 0 and op[x, y][3] > 0:
                    bp[x, y] = bp[src_x, y]


def build(name, cfg):
    im = Image.open(cfg["src"]).convert("RGBA")
    if cfg.get("src_unflipped"):
        raw = im.copy()
        cfg = unflip_cfg(cfg, im.width)
        e = cfg.get("elevator")
        if e and e.get("patch_src"):
            # Body under the tailplane: the WITH picture, with the strip under the
            # tailplane copied from the WITHOUT picture (shifted), right of
            # patch_clear_from_x cleared to background (past the nozzle).
            p = Image.open(e["patch_src"]).convert("RGBA")
            x0, y0, x1, y1 = e["patch_box"]
            sx, sy = e["patch_shift"]
            under = raw.copy()
            under.paste(p.crop((x0 - sx, y0 - sy, x1 - sx, y1 - sy)), (x0, y0))
            under.paste((255, 255, 255, 255), (e["patch_clear_from_x"], y0, x1 + 80, y1))
            e["under_img"] = orient(under, cfg)
            e["under_offset"] = (0, 0)
    im = orient(im, cfg)
    for box in cfg.get("erase", []):
        im.paste((255, 255, 255, 255), box)
    remove_background(im)
    w, h = im.size
    px = im.load()
    layers = {"body": im.copy()}
    if cfg["gear_regions"]:
        layers["gear"] = Image.new("RGBA", im.size, (0, 0, 0, 0))
    if cfg["prop"]:
        layers["prop"] = Image.new("RGBA", im.size, (0, 0, 0, 0))
    bp = layers["body"].load()
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            if "gear" in layers and any(x0 <= x <= x1 and y >= y0 + (y1 - y0) * (x - x0) / (x1 - x0)
                                        for x0, x1, y0, y1 in cfg["gear_regions"]):
                layers["gear"].putpixel((x, y), px[x, y]); bp[x, y] = (0, 0, 0, 0)
            elif "prop" in layers and x >= cfg["prop"]["min_x"] and not (
                    cfg["prop"]["spinner_y"][0] <= y <= cfg["prop"]["spinner_y"][1]):
                layers["prop"].putpixel((x, y), px[x, y]); bp[x, y] = (0, 0, 0, 0)

    fill_gear_holes(layers["body"], im, cfg.get("gear_fill", []))
    box = im.getbbox()
    out_w = cfg["display_width"] * TEXTURE_SCALE
    k = out_w / (box[2] - box[0])
    out_h = round((box[3] - box[1]) * k)
    out = {layer: img.crop(box).resize((out_w, out_h), Image.LANCZOS) for layer, img in layers.items()}
    moving = "elevator" if cfg.get("elevator") else "canard" if cfg.get("canard") else None
    if moving and (cfg[moving].get("under_src") or cfg[moving].get("under_img")):
        # The owner's art also exists WITHOUT the tailplane (or canards): that picture
        # is the body, and the moving layer is what differs between the two.
        e = cfg[moving]
        under = Image.new("RGBA", im.size, (255, 255, 255, 255))
        src2 = e["under_img"] if "under_img" in e else Image.open(e["under_src"]).convert("RGBA")
        for b in e.get("under_erase", []):
            src2.paste((255, 255, 255, 255), b)
        if e.get("under_scale"):
            src2 = src2.resize((round(src2.width * e["under_scale"]), round(src2.height * e["under_scale"])), Image.LANCZOS)
        under.paste(src2, e["under_offset"])
        remove_background(under)
        # The gear is its own layer: cut the same gear areas out of this picture too.
        upx = under.load()
        for y in range(h):
            for x in range(w):
                if any(x0 <= x <= x1 and y >= y0 + (y1 - y0) * (x - x0) / (x1 - x0)
                       for x0, x1, y0, y1 in cfg["gear_regions"]):
                    upx[x, y] = (0, 0, 0, 0)
        if cfg.get("gear_fill"):
            fill_gear_holes(under, im, cfg["gear_fill"])
        under = under.crop(box).resize((out_w, out_h), Image.LANCZOS)
        mask = Image.new("L", (out_w, out_h), 0)
        poly = e["poly"] if "poly" in e else [((x - box[0]) * k, (y - box[1]) * k) for x, y in e["poly_src"]]
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        elev = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
        elev.paste(out["body"], (0, 0), mask)
        out[moving] = elev
        out["body"] = under
    for layer, img in out.items():
        img.save("public/sprites/%s_%s.png" % (name, layer))

    def t(x, y):
        return round((x - box[0]) * k, 1), round((y - box[1]) * k, 1)

    print("== %s: texture %dx%d, sprite_scale %s" % (name, out_w, out_h, 1 / TEXTURE_SCALE))
    if cfg["gear_regions"]:
        print("  sprite_wheel_bottom_y =", out_h)
        print("  sprite_gear_travel =", round(out_h - t(0, cfg["gear_cut_y"])[1], 1))
    for key, pt in cfg["points"].items():
        print("  %s -> %s" % (key, t(*pt)))


if __name__ == "__main__":
    names = sys.argv[1:] or list(CONFIGS)
    for n in names:
        build(n, CONFIGS[n])
