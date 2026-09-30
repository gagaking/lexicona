"""量一下边缘精修自身的显存峰值与耗时（不含模型）。"""
import sys
import time

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, ".")
import birefnet_matting as m  # noqa: E402

device = "cuda" if torch.cuda.is_available() else "cpu"
size = int(sys.argv[1]) if len(sys.argv) > 1 else 2000

rng = np.random.default_rng(0)
rgb = (rng.random((size, size, 3)) * 255).astype(np.uint8)
image = Image.fromarray(rgb, "RGB")
mask = torch.from_numpy(rng.random((1, 1, 2048, 2048)).astype(np.float32)).to(device)

if device == "cuda":
    torch.cuda.empty_cache()
    torch.cuda.reset_peak_memory_stats()

started = time.time()
rgba, info = m.refine_alpha_rgb(image, mask, device, torch, np, device == "cuda")
elapsed = (time.time() - started) * 1000

peak = torch.cuda.max_memory_allocated() / 1024**2 if device == "cuda" else 0
print(f"size={size} elapsed={elapsed:.0f}ms peak_allocated={peak:.0f}MB info={info}")
