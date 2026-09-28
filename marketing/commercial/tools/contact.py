# Contact sheet of review stills: python3 tools/contact.py out.png cols files...
import sys
from PIL import Image, ImageDraw
out, cols, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
w, h = 640, 360
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (w + 8) + 8, rows * (h + 30) + 8), (60, 60, 60))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h), Image.LANCZOS)
    x, y = 8 + (i % cols) * (w + 8), 8 + (i // cols) * (h + 30)
    sheet.paste(im, (x, y))
    d.text((x, y + h + 6), f.split("/")[-1], fill=(255, 255, 255))
sheet.save(out)
