"""对比"关闭精修"与"开启精修"的差异分布：确认只在轮廓窄带内改动、带外逐像素一致。"""
import sys

import numpy as np
from PIL import Image

off_path, on_path = sys.argv[1:3]
off = np.array(Image.open(off_path).convert("RGBA")).astype(np.int16)
on = np.array(Image.open(on_path).convert("RGBA")).astype(np.int16)

diff = np.abs(off - on).max(axis=2)
alpha = off[..., 3].astype(np.float32) / 255.0
changed = diff > 2
print(f"像素总数 {diff.size:,}")
print(f"有改动像素 {int(changed.sum()):,}（{changed.mean() * 100:.2f}%）")

for lo, hi, name in [(0.0, 0.02, "全透明区"), (0.02, 0.2, "弱边缘带"), (0.2, 0.9, "半透明带"), (0.9, 1.01, "实心区")]:
    zone = (alpha >= lo) & (alpha < hi)
    if zone.sum() == 0:
        continue
    print(f"  {name}: 改动占比 {changed[zone].mean() * 100:6.2f}%  (面积 {zone.mean() * 100:.1f}%)")

# 实心/透明区若几乎无改动，说明没有整体发虚
print(f"实心区最大差异 {diff[alpha > 0.98].max() if (alpha > 0.98).any() else 0}")
