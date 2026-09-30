"""Local BiRefNet matting test: timings, GPU memory, cutout preview strips."""

import argparse
import glob
import os
import time

import numpy as np
import torch
from PIL import Image
from torchvision import transforms


def load_model(model_dir, device):
    from transformers import AutoModelForImageSegmentation

    model = AutoModelForImageSegmentation.from_pretrained(
        model_dir, trust_remote_code=True, local_files_only=True
    )
    model.to(device).eval()
    if device == "cuda":
        model.half()
    return model


def build_transform(size):
    return transforms.Compose(
        [
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]
    )


def predict(model, image, size, device):
    tensor = build_transform(size)(image).unsqueeze(0).to(device)
    if device == "cuda":
        tensor = tensor.half()
    with torch.no_grad():
        preds = model(tensor)[-1].sigmoid().cpu().float()
    mask = preds[0].squeeze()
    mask = mask - mask.min()
    mask = mask / mask.max().clamp(min=1e-6)
    mask = transforms.functional.resize(
        mask.unsqueeze(0), (image.height, image.width), antialias=True
    ).squeeze(0)
    return (mask.clamp(0, 1) * 255).byte().numpy()


def checkerboard(width, height, cell=32):
    board = np.zeros((height, width, 3), dtype=np.uint8)
    ys, xs = np.mgrid[0:height, 0:width]
    light = (((ys // cell) + (xs // cell)) % 2) == 0
    board[:] = (150, 150, 150)
    board[light] = (215, 215, 215)
    return board


def compose_strip(image, alpha, checker_cell=32):
    rgba = image.convert("RGBA")
    rgba.putalpha(Image.fromarray(alpha))

    white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    white.alpha_composite(rgba)

    board = Image.fromarray(checkerboard(rgba.width, rgba.height, checker_cell))
    board = board.convert("RGBA")
    board.alpha_composite(rgba)

    height = min(image.height, 1200)
    panels = [image.convert("RGB"), white.convert("RGB"), board.convert("RGB")]
    panels = [
        p.resize((max(1, int(p.width * height / p.height)), height)) for p in panels
    ]
    total_width = sum(p.width for p in panels) + 16
    strip = Image.new("RGB", (total_width, height), (20, 20, 20))
    x = 0
    for p in panels:
        strip.paste(p, (x, 0))
        x += p.width + 8
    return strip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", required=True)
    parser.add_argument("--input", required=True, help="image path or glob")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--size", type=int, default=2048)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--cpu", action="store_true")
    args = parser.parse_args()

    device = "cpu" if args.cpu else ("cuda" if torch.cuda.is_available() else "cpu")
    os.makedirs(args.out_dir, exist_ok=True)

    paths = sorted(glob.glob(args.input))
    if not paths:
        raise SystemExit("no input images matched: " + args.input)

    print(f"device={device} size={args.size}", flush=True)
    t0 = time.time()
    model = load_model(args.model_dir, device)
    if device == "cuda":
        torch.cuda.reset_peak_memory_stats()
    print(f"model loaded in {time.time() - t0:.1f}s", flush=True)

    for path in paths:
        name = os.path.splitext(os.path.basename(path))[0]
        image = Image.open(path).convert("RGB")

        mask = predict(model, image, args.size, device)
        if device == "cuda":
            torch.cuda.synchronize()

        timings = []
        for _ in range(max(1, args.runs)):
            start = time.perf_counter()
            mask = predict(model, image, args.size, device)
            if device == "cuda":
                torch.cuda.synchronize()
            timings.append((time.perf_counter() - start) * 1000)

        rgba = image.convert("RGBA")
        rgba.putalpha(Image.fromarray(mask))
        rgba.save(os.path.join(args.out_dir, f"{name}_cutout.png"))
        compose_strip(image, mask).save(
            os.path.join(args.out_dir, f"{name}_strip.jpg"), quality=92
        )

        coverage = float((mask > 127).mean()) * 100
        avg = sum(timings) / len(timings)
        print(
            f"{name}: {image.width}x{image.height} "
            f"avg={avg:.0f}ms min={min(timings):.0f}ms "
            f"foreground={coverage:.1f}%",
            flush=True,
        )

    if device == "cuda":
        peak = torch.cuda.max_memory_allocated() / 1024**3
        print(f"peak GPU memory: {peak:.2f} GB", flush=True)


if __name__ == "__main__":
    main()
