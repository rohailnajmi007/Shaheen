"""Splits the modern jets' gear layers into legs that rotate up (owner 2026-11-22: "the
same animation as the 1965 jets" for all the modern fighters).

    python tools/split_modern_gear.py            # all
    python tools/split_modern_gear.py mirage5    # one
(needs Pillow; run after tools/make_aircraft_sprites.py, which makes <sprite>_gear.png)

Each existing gear layer (the owner's gear, cut from the art) is split into separate
legs by gaps along x (rightmost = nose leg). For each leg the tool finds the strut top
and then the hinge: straight above it, lifted just enough (and swung the way that needs
the least lift: nose legs try aft first, mains forward) that the leg, turned 90 deg,
lies entirely inside the body picture (it is drawn behind the body, so it vanishes).
doors = boxes (texture px) of open doors hanging under the body: cut from the body to
their own layer, folded flat to their top edge as the gear comes up.
Writes public/sprites/<sprite>_gear_<i>.png (+ _door_<i>.png) and prints the gearParts
entries for src/data/aircraft.js. The original <sprite>_gear.png is left as it is.
"""
import sys
from PIL import Image

CONFIGS = {
    "f7pg": {"sprite": "f7pg"},
    "mirage5": {"sprite": "mirage5", "doors": [(275, 111, 312, 124)]},
    "jf17": {"sprite": "jf17"},
    "f16d": {"sprite": "f16"},
}
GAP = 8           # px of empty columns that separate two legs
COVER = 0.985     # share of a folded leg that must lie inside the body
MAX_LIFT = 60     # px


def clusters(g):
    w, h = g.size
    px = g.load()
    cols = [any(px[x, y][3] > 20 for y in range(h)) for x in range(w)]
    out, start, gap = [], None, 0
    for x in range(w + 1):
        on = x < w and cols[x]
        if on:
            if start is None:
                start = x
            gap = 0
            end = x
        elif start is not None:
            gap += 1
            if gap > GAP or x == w:
                out.append((start, end))
                start = None
    return out


def build(name, cfg):
    sp = cfg["sprite"]
    body = Image.open("public/sprites/%s_body.png" % sp).convert("RGBA")
    gear = Image.open("public/sprites/%s_gear.png" % sp).convert("RGBA")
    w, h = body.size
    ba = body.getchannel("A").load()
    parts = []
    # Doors first (from the body), so the coverage test uses the body without them.
    doors = []
    bpx = body.load()
    for i, (x0, y0, x1, y1) in enumerate(cfg.get("doors", [])):
        lay = Image.new("RGBA", body.size, (0, 0, 0, 0))
        lp = lay.load()
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if bpx[x, y][3] > 0:
                    lp[x, y] = bpx[x, y]
                    bpx[x, y] = (0, 0, 0, 0)
        doors.append((lay, y0))
    if doors:
        body.save("public/sprites/%s_body.png" % sp)
        ba = body.getchannel("A").load()
    cl = clusters(gear)
    gp = gear.load()
    for i, (x0, x1) in enumerate(cl):
        lay = Image.new("RGBA", gear.size, (0, 0, 0, 0))
        lp = lay.load()
        ys = []
        for y in range(h):
            for x in range(x0, x1 + 1):
                if gp[x, y][3] > 0:
                    lp[x, y] = gp[x, y]
                    if gp[x, y][3] > 20:
                        ys.append(y)
        top = min(ys)
        tops = [x for x in range(x0, x1 + 1) for y in range(top, top + 4) if lp[x, y][3] > 20]
        hx = sum(tops) / len(tops)
        nose = i == len(cl) - 1
        best = None
        for deg in ((90, -90) if nose else (-90, 90)):
            for lift in range(0, MAX_LIFT):
                hy = top - lift
                rot = lay.rotate(-deg, center=(hx, hy))  # PIL: + = anticlockwise; canvas: + = clockwise
                rp = rot.load()
                n = inside = 0
                for y in range(h):
                    for x in range(w):
                        if rp[x, y][3] > 60:
                            n += 1
                            if ba[x, y] > 128:
                                inside += 1
                if n and inside / n >= COVER:
                    if best is None or lift < best[1]:
                        best = (deg, lift, hy)
                    break
        if best is None:
            best = ((90 if nose else -90), MAX_LIFT, top - MAX_LIFT)
            print("  ! %s leg %d: never fully hidden" % (name, i))
        part = "gear_nose" if nose else ("gear_main" if len(cl) == 2 else "gear_%d" % i)
        lay.save("public/sprites/%s_%s.png" % (sp, part))
        parts.append("      { sprite: '%s_%s', kind: 'leg', hinge: [%.1f, %.1f], deg: %d }," % (sp, part, hx, best[2], best[0]))
    for i, (lay, y0) in enumerate(doors):
        lay.save("public/sprites/%s_door_%d.png" % (sp, i))
        parts.append("      { sprite: '%s_door_%d', kind: 'door', hingeY: %d }," % (sp, i, y0))
    print("== %s" % name)
    print("\n".join(parts))


if __name__ == "__main__":
    for n in sys.argv[1:] or list(CONFIGS):
        build(n, CONFIGS[n])
