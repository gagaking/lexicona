"""对比边缘精修前后：在 alpha 边缘处裁切放大，拼成对比图。"""
import sys
from PIL import Image
import numpy as np

original_path, off_path, on_path, out_path = sys.argv[1:5]
crop = int(sys.argv[5]) if len(sys.argv) > 5 else 420

base = Image.open(original_path).convert("RGB")
panels = [base]
alphas = []
for path in (off_path, on_path):
    img = Image.open(path).convert("RGBA")
    alphas.append(np.array(img)[..., 3])
    panels.append(img)

# 在结果里找一个明显的边缘点：alpha 在 30~225 且梯度大
alpha = alphas[1]
ys, xs = np.mgrid[0:alpha.shape[0], 0:alpha.shape[1]]
mask = (alpha > 30) & (alpha < 225) & (ys > crop) & (xs > crop)
points = np.argwhere(mask)
if len(points) == 0:
    cy, cx = alpha.shape[0] // 2, alpha.shape[1] // 2
else:
    cy, cx = points[len(points) // 2]
left = int(max(0, min(base.width - crop, cx - crop // 2)))
top = int(max(0, min(base.height - crop, cy - crop // 2)))

strip = Image.new("RGB", (crop * len(panels) + 8 * (len(panels) - 1), crop), (255, 255, 255))
x = 0
for panel in panels:
    piece = panel.crop((left, top, left + crop, top + crop))
    if piece.mode == "RGBA":
        flat = Image.new("RGB", piece.size, (255, 255, 255))
        flat.paste(piece, mask=piece.split()[3])
        piece = flat
    strip.paste(piece, (x, 0))
    x += crop + 8

strip.save(out_path, quality=95)
print("saved", out_path, "crop", (left, top, crop))
