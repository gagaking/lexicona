#!/usr/bin/env python3
"""BiRefNet 抠图推理（辞谱 Lexicona 本地引擎任务：matte）。

用法:
  python birefnet_matting.py --image in.jpg --model-dir models/birefnet/BiRefNet_HR-matting \
      --output out.png [--size 2048] [--device auto]
输出为保留 alpha 通道的 RGBA PNG。
"""

import argparse
import json
import os
import sys
import time


def configure_cache_dir():
    # 打包后的 exe 里 HuggingFace 缓存目录必须可写，否则 trust_remote_code 会失败
    home = os.path.expanduser("~")
    os.environ.setdefault("HF_HOME", os.path.join(home, ".cache", "lexicona-hf"))
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="BiRefNet Matting Inference")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--model-dir", required=True, help="Path to BiRefNet model folder")
    parser.add_argument("--output", required=True, help="Path to save output RGBA png")
    parser.add_argument("--size", type=int, default=2048, help="Inference resolution")
    parser.add_argument("--device", default="auto", help="auto | cuda | cpu")
    return parser.parse_args(argv)


def _preprocess(image, size, use_fp16, device, torch, numpy):
    resized = image.resize((size, size))
    array = numpy.asarray(resized, dtype=numpy.float32) / 255.0
    mean = numpy.array([0.485, 0.456, 0.406], dtype=numpy.float32)
    std = numpy.array([0.229, 0.224, 0.225], dtype=numpy.float32)
    array = (array - mean) / std
    tensor = torch.from_numpy(array.transpose(2, 0, 1)).unsqueeze(0).to(device)
    return tensor.half() if use_fp16 else tensor


def main(argv=None):
    args = parse_args(argv)
    configure_cache_dir()

    try:
        import numpy
        import torch
        from PIL import Image
        from transformers import AutoModelForImageSegmentation
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: 缺少抠图依赖: {exc}", flush=True)
        return 1

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    use_fp16 = device == "cuda"
    size = max(256, min(4096, int(args.size)))

    try:
        started = time.time()
        print(f"Loading BiRefNet from {args.model_dir} (device={device}, size={size})...", flush=True)
        model = AutoModelForImageSegmentation.from_pretrained(
            args.model_dir, trust_remote_code=True, local_files_only=True
        )
        model.to(device).eval()
        if use_fp16:
            model.half()

        image = Image.open(args.image).convert("RGB")
        tensor = _preprocess(image, size, use_fp16, device, torch, numpy)

        with torch.no_grad():
            preds = model(tensor)[-1].sigmoid().cpu().float()

        mask = preds[0].squeeze().numpy()
        mask = mask - mask.min()
        peak = float(mask.max())
        if peak > 1e-6:
            mask = mask / peak
        mask = numpy.clip(mask, 0.0, 1.0)
        mask_image = Image.fromarray((mask * 255).astype("uint8")).resize(
            image.size, Image.LANCZOS
        )

        rgba = image.convert("RGBA")
        rgba.putalpha(mask_image)
        rgba.save(args.output, "PNG")

        elapsed_ms = int((time.time() - started) * 1000)
        foreground = float((mask > 0.5).mean())
        print(
            "RESULT "
            + json.dumps(
                {
                    "width": image.width,
                    "height": image.height,
                    "elapsedMs": elapsed_ms,
                    "foreground": round(foreground, 4),
                    "device": device,
                }
            ),
            flush=True,
        )
        print("Success: 抠图完成。", flush=True)
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"Error running BiRefNet matting: {exc}", flush=True)
        print("ERROR: 抠图推理失败。", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
