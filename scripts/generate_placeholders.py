"""Generate placeholder images for the try-on playground.

Run:  python scripts/generate_placeholders.py
Creates /public/clothes/*.png (6 garments) and /public/mock-results/*.png (3).
Replace these with real photos any time — keep the same filenames.
"""
import math
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = 512

WHITE = (255, 255, 255, 255)


def canvas():
    return Image.new("RGB", (SIZE, SIZE), (237, 237, 240))


def save(img, rel):
    out = os.path.join(ROOT, "public", *rel.split("/"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out)
    print("wrote", os.path.relpath(out, ROOT))


def garlabel(d, label):
    d.text((SIZE // 2, SIZE - 28), label, fill=(120, 120, 130), anchor="mm")


def tee(d, body, sleeve_y=150, sleeve_w=68, sleeve_h=120):
    # sleeves
    d.polygon([(110, sleeve_y), (110 + sleeve_w, sleeve_y + 14),
               (110 + sleeve_w - 6, sleeve_y + 14 + sleeve_h), (96, sleeve_y + 110)], fill=body)
    d.polygon([(SIZE - 110, sleeve_y), (SIZE - 110 - sleeve_w, sleeve_y + 14),
               (SIZE - 110 - sleeve_w + 6, sleeve_y + 14 + sleeve_h),
               (SIZE - 96, sleeve_y + 110)], fill=body)
    # torso
    d.rounded_rectangle([128, 120, SIZE - 128, 420], radius=28, fill=body)
    # neck
    d.ellipse([212, 104, 300, 148], fill=(237, 237, 240))
    d.rounded_rectangle([212, 112, 300, 128], radius=8, fill=body)


def hoodie(d, body):
    tee(d, body)
    # hood
    d.ellipse([176, 60, 336, 210], fill=body)
    d.ellipse([204, 84, 308, 176], fill=tuple(max(0, c - 25) for c in body))
    d.ellipse([220, 96, 292, 160], fill=(237, 237, 240))
    # pocket
    d.rounded_rectangle([176, 330, 336, 400], radius=12,
                        fill=tuple(max(0, c - 18) for c in body))
    # drawstrings
    d.line([(240, 150), (240, 230)], fill=WHITE, width=5)
    d.line([(272, 150), (272, 230)], fill=WHITE, width=5)


def jacket(d, body):
    tee(d, body, sleeve_y=140)
    # zipper line
    d.line([(256, 128), (256, 420)], fill=(60, 60, 70), width=4)
    # collar
    d.polygon([(210, 118), (256, 150), (302, 118), (302, 138), (256, 172), (210, 138)], fill=(45, 45, 55))
    # chest pockets
    d.rounded_rectangle([150, 190, 210, 240], radius=6, outline=(60, 60, 70), width=3)
    d.rounded_rectangle([302, 190, 362, 240], radius=6, outline=(60, 60, 70), width=3)


def buttonshirt(d, body):
    tee(d, body)
    # placket
    d.line([(256, 130), (256, 420)], fill=tuple(max(0, c - 40) for c in body), width=3)
    # buttons
    for y in (170, 220, 270, 320, 370):
        d.ellipse([251, y, 261, y + 10], fill=(80, 80, 90))
    # collar
    d.polygon([(214, 116), (256, 152), (298, 116)], outline=tuple(max(0, c - 40) for c in body), width=4)


def person(img):
    """Simple stick-person-on-beach scene used as the mock try-on result."""
    d = ImageDraw.Draw(img)
    # sky + sea + sand
    d.rectangle([0, 0, SIZE, 280], fill=(168, 200, 235))
    d.rectangle([0, 280, SIZE, 340], fill=(70, 130, 180))
    d.rectangle([0, 340, SIZE, SIZE], fill=(222, 205, 170))
    # sun
    d.ellipse([400, 40, 460, 100], fill=(255, 220, 120))
    # head
    d.ellipse([216, 90, 296, 170], fill=(235, 190, 160))
    # torso wearing the "result" garment
    d.rounded_rectangle([200, 170, 312, 330], radius=24, fill=(45, 45, 55))
    # arms
    d.rounded_rectangle([172, 180, 196, 320], radius=12, fill=(235, 190, 160))
    d.rounded_rectangle([316, 180, 340, 320], radius=12, fill=(235, 190, 160))
    # legs
    d.rounded_rectangle([214, 330, 248, 440], radius=12, fill=(70, 90, 130))
    d.rounded_rectangle([264, 330, 298, 440], radius=12, fill=(70, 90, 130))
    d.ellipse([206, 430, 252, 460], fill=(240, 240, 245))
    d.ellipse([260, 430, 306, 460], fill=(240, 240, 245))
    # smile
    d.arc([236, 120, 276, 152], 20, 160, fill=(120, 70, 50), width=3)
    return img


# ---------- garments ----------
img = canvas(); d = ImageDraw.Draw(img); tee(d, (30, 30, 34))
garlabel(d, "black t-shirt"); save(img, "clothes/black-tshirt.png")

img = canvas(); d = ImageDraw.Draw(img); tee(d, (245, 245, 248))
garlabel(d, "white t-shirt"); save(img, "clothes/white-tshirt.png")

img = canvas(); d = ImageDraw.Draw(img); tee(d, (50, 100, 190))
garlabel(d, "blue t-shirt"); save(img, "clothes/blue-tshirt.png")

img = canvas(); d = ImageDraw.Draw(img); hoodie(d, (90, 96, 110))
garlabel(d, "hoodie"); save(img, "clothes/hoodie.png")

img = canvas(); d = ImageDraw.Draw(img); jacket(d, (70, 80, 95))
garlabel(d, "jacket"); save(img, "clothes/jacket.png")

img = canvas(); d = ImageDraw.Draw(img); buttonshirt(d, (200, 205, 215))
garlabel(d, "shirt"); save(img, "clothes/shirt.png")

# ---------- mock results ----------
save(person(canvas()), "mock-results/result-1.png")
save(person(canvas()), "mock-results/result-2.png")
save(person(canvas()), "mock-results/result-3.png")
