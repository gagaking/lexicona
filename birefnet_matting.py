#!/usr/bin/env python3
"""BiRefNet 抠图推理（辞谱 Lexicona 本地引擎任务：matte）。

用法:
  python birefnet_matting.py --image in.jpg --model-dir models/birefnet/BiRefNet_HR-matting \
      --output out.png [--size 2048] [--device auto]
输出为保留 alpha 通道的 RGBA PNG。

常驻模式（模型只加载一次，适合批量抠图）：
  depth-engine.exe --task matte --serve
  stdin 每行一个 JSON 请求，stdout 每行以 @@LEXICONA@@ 前缀回结果：
    {"id":1,"action":"matte","modelDir":"...","size":2048,"items":[{"image":"in.jpg","output":"out.png"}]}
    {"id":2,"action":"release"}   # 释放显存
    {"id":3,"action":"exit"}
"""

import argparse
import json
import os
import sys
import time

PROTOCOL_PREFIX = "@@LEXICONA@@"


def _emit(payload):
    sys.stdout.write(PROTOCOL_PREFIX + " " + json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


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
    if "--serve" in (argv if argv is not None else sys.argv[1:]):
        return serve()
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


def serve():
    """常驻推理服务：模型常驻显存，按行读取 JSON 请求。"""
    configure_cache_dir()
    try:
        sys.stdin.reconfigure(encoding="utf-8")
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    try:
        import numpy
        import torch
        from PIL import Image
        from transformers import AutoModelForImageSegmentation
    except Exception as exc:  # noqa: BLE001
        _emit({"ready": False, "error": f"缺少抠图依赖: {exc}"})
        return 1

    device = "cuda" if torch.cuda.is_available() else "cpu"
    use_fp16 = device == "cuda"
    loaded_dir = None
    model = None
    _emit({"ready": True, "device": device})

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            request = json.loads(line)
        except Exception as exc:  # noqa: BLE001
            _emit({"ok": False, "error": f"请求解析失败: {exc}"})
            continue

        request_id = request.get("id")
        action = (request.get("action") or "matte").lower()

        if action == "exit":
            _emit({"id": request_id, "ok": True, "bye": True})
            return 0

        if action == "release":
            model = None
            loaded_dir = None
            if device == "cuda":
                try:
                    torch.cuda.empty_cache()
                except Exception:
                    pass
            _emit({"id": request_id, "ok": True, "released": True})
            continue

        if action != "matte":
            _emit({"id": request_id, "ok": False, "error": f"未知指令: {action}"})
            continue

        model_dir = request.get("modelDir") or ""
        size = max(256, min(4096, int(request.get("size") or 2048)))
        items = request.get("items") or []
        if not model_dir or not items:
            _emit({"id": request_id, "ok": False, "error": "缺少 modelDir 或 items"})
            continue

        try:
            if model is None or loaded_dir != model_dir:
                # 权重只常驻一份，切换模型时先释放旧的
                model = None
                if device == "cuda":
                    try:
                        torch.cuda.empty_cache()
                    except Exception:
                        pass
                model = AutoModelForImageSegmentation.from_pretrained(
                    model_dir, trust_remote_code=True, local_files_only=True
                )
                model.to(device).eval()
                if use_fp16:
                    model.half()
                loaded_dir = model_dir

            results = []
            for item in items:
                started = time.time()
                image = Image.open(item["image"]).convert("RGB")
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
                rgba.save(item["output"], "PNG")
                results.append(
                    {
                        "ok": True,
                        "width": image.width,
                        "height": image.height,
                        "elapsedMs": int((time.time() - started) * 1000),
                        "foreground": round(float((mask > 0.5).mean()), 4),
                    }
                )
            _emit({"id": request_id, "ok": True, "results": results, "device": device})
        except Exception as exc:  # noqa: BLE001
            # 出过一次错就丢掉模型句柄，下次请求重新加载，避免坏状态常驻
            model = None
            loaded_dir = None
            _emit({"id": request_id, "ok": False, "error": str(exc)})

    return 0


if __name__ == "__main__":
    sys.exit(main())
