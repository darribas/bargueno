"""Draw the placeholder Bargueño icon set into lite/icons/ (needs Pillow).

A walnut cabinet face: a grid of small drawers above a drop-front lid.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "lite" / "icons"
PAPER = (246, 241, 231)
WALNUT = (92, 58, 33)
BRASS = (201, 162, 74)


def draw(size: int, pad: float) -> Image.Image:
    img = Image.new("RGB", (size, size), PAPER)
    d = ImageDraw.Draw(img)
    u = size / 100
    x0, y0, x1, y1 = (pad * u, pad * u, (100 - pad) * u, (100 - pad) * u)
    d.rounded_rectangle((x0, y0, x1, y1), radius=6 * u, fill=WALNUT)
    inner = 6 * u
    w, h = x1 - x0 - 2 * inner, y1 - y0 - 2 * inner
    gap = 3 * u
    cols, rows = 3, 2
    dw = (w - gap * (cols - 1)) / cols
    dh = (h * 0.5 - gap * (rows - 1)) / rows
    for r in range(rows):
        for c in range(cols):
            bx = x0 + inner + c * (dw + gap)
            by = y0 + inner + r * (dh + gap)
            d.rounded_rectangle((bx, by, bx + dw, by + dh), radius=1.5 * u, outline=BRASS, width=max(1, round(1.2 * u)))
            k = 1.8 * u
            d.ellipse((bx + dw / 2 - k, by + dh / 2 - k, bx + dw / 2 + k, by + dh / 2 + k), fill=BRASS)
    ly = y0 + inner + h * 0.5 + gap
    d.rounded_rectangle((x0 + inner, ly, x1 - inner, y1 - inner), radius=2 * u, fill=PAPER)
    for i in range(3):
        yy = ly + (6 + i * 7) * u
        d.line((x0 + inner + 6 * u, yy, x1 - inner - (6 + 10 * (i == 2)) * u, yy), fill=WALNUT, width=max(1, round(1.4 * u)))
    return img


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192, 8).save(OUT / "icon-192.png")
    draw(512, 14).save(OUT / "icon-512.png")  # extra padding so it survives maskable crops
    draw(180, 8).save(OUT / "apple-touch-icon.png")
    print("icons written to", OUT)
