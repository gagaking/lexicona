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


def open_source_image(path):
    """打开待抠图的源文件：普通位图用 PIL，PSD 取合成图（按平面图处理，不区分图层）。"""
    from PIL import Image

    extension = os.path.splitext(path)[1].lower()
    if extension == ".psd":
        try:
            from psd_tools import PSDImage
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"缺少 psd-tools，无法读取 PSD：{exc}") from exc
        document = PSDImage.open(path)
        composite = document.composite()
        if composite is None:
            raise RuntimeError("PSD 没有可用的合成图（可能是纯矢量/空文档）")
        composite = composite.convert("RGBA")
        # 合成图如果带透明背景，铺白底后再抠图
        flattened = Image.new("RGB", composite.size, (255, 255, 255))
        flattened.paste(composite, mask=composite.split()[3])
        return flattened
    return Image.open(path).convert("RGB")


def make_preview(path, output, max_size=900, quality=88):
    """生成预览图：PSD 走合成图（清晰）；只有当文件内置缩略图本身够大时才用它省时间。"""
    from PIL import Image

    extension = os.path.splitext(path)[1].lower()
    image = None
    if extension == ".psd":
        try:
            from psd_tools import PSDImage
        except Exception as exc:  # noqa: BLE001
            raise RuntimeError(f"缺少 psd-tools，无法预览 PSD：{exc}") from exc
        document = PSDImage.open(path)
        try:
            embedded = document.thumbnail()
        except Exception:  # noqa: BLE001
            embedded = None
        # 内嵌缩略图通常只有 160~256px，放大后很糊；只有它本身够大时才用
        if embedded is not None and max(embedded.size) >= max_size:
            image = embedded
        else:
            image = document.composite()
        if image is None:
            raise RuntimeError("PSD 没有可用的合成图")
        image = image.convert("RGBA")
        flattened = Image.new("RGB", image.size, (255, 255, 255))
        flattened.paste(image, mask=image.split()[3])
        image = flattened
    else:
        opened = Image.open(path)
        if opened.mode in ("RGBA", "LA", "P"):
            opened = opened.convert("RGBA")
            flattened = Image.new("RGB", opened.size, (255, 255, 255))
            flattened.paste(opened, mask=opened.split()[3])
            image = flattened
        else:
            image = opened.convert("RGB")

    image.thumbnail((max_size, max_size), Image.LANCZOS)
    image.save(output, "JPEG", quality=quality)
    return {"width": image.width, "height": image.height}


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="BiRefNet Matting Inference")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--model-dir", required=True, help="Path to BiRefNet model folder")
    parser.add_argument("--output", required=True, help="Path to save output RGBA png")
    parser.add_argument("--size", type=int, default=2048, help="Inference resolution")
    parser.add_argument("--device", default="auto", help="auto | cuda | cpu")
    parser.add_argument("--refine", type=int, default=1, help="1=边缘精修+去色，0=关闭")
    return parser.parse_args(argv)


def _preprocess(image, size, use_fp16, device, torch, numpy):
    resized = image.resize((size, size))
    array = numpy.asarray(resized, dtype=numpy.float32) / 255.0
    mean = numpy.array([0.485, 0.456, 0.406], dtype=numpy.float32)
    std = numpy.array([0.229, 0.224, 0.225], dtype=numpy.float32)
    array = (array - mean) / std
    tensor = torch.from_numpy(array.transpose(2, 0, 1)).unsqueeze(0).to(device)
    return tensor.half() if use_fp16 else tensor


REFINE_WORK_MAX = 2048  # 边缘精修的统计分辨率上限（显存与画质折中）


def _matte_one(model, image, size, use_fp16, device, torch, numpy, refine):
    """单张抠图：推理 + 归一化 + （可选）边缘精修，返回 (RGBA, 前景占比, 精修信息)。"""
    from PIL import Image

    tensor = _preprocess(image, size, use_fp16, device, torch, numpy)
    with torch.no_grad():
        preds = model(tensor)[-1].sigmoid().cpu().float()
    mask = preds[0].squeeze().numpy()
    mask = mask - mask.min()
    peak = float(mask.max())
    if peak > 1e-6:
        mask = mask / peak
    mask = numpy.clip(mask, 0.0, 1.0)

    rgba = None
    refined = None
    if refine:
        try:
            mask_tensor = torch.from_numpy(mask).view(1, 1, mask.shape[0], mask.shape[1])
            mask_tensor = mask_tensor.to(device=device, dtype=torch.float32)
            rgba, refined = refine_alpha_rgb(image, mask_tensor, device, torch, numpy, use_fp16)
        except Exception as exc:  # noqa: BLE001
            print(f"WARN: 边缘精修失败，回退基础路径: {exc}", flush=True)

    if rgba is None:
        mask_image = Image.fromarray((mask * 255).astype("uint8")).resize(
            image.size, Image.LANCZOS
        )
        rgba = image.convert("RGBA")
        rgba.putalpha(mask_image)

    return rgba, float((mask > 0.5).mean()), refined


def _box_mean(torch, functional, tensor, radius):
    kernel = 2 * radius + 1
    return functional.avg_pool2d(
        tensor, kernel_size=kernel, stride=1, padding=radius, count_include_pad=False
    )


def _guided_filter(torch, functional, guide, source, radius, eps):
    """彩色引导图 + 灰度掩码的引导滤波（He et al.），返回精修后的掩码。"""
    mean_i = _box_mean(torch, functional, guide, radius)
    mean_p = _box_mean(torch, functional, source, radius)
    corr_i = _box_mean(torch, functional, guide * guide, radius)
    corr_ip = _box_mean(torch, functional, guide * source, radius)
    var_i = (corr_i - mean_i * mean_i).clamp_min(0)
    cov_ip = corr_ip - mean_i * mean_p
    a = cov_ip / (var_i + eps)
    b = mean_p - a * mean_i
    a = _box_mean(torch, functional, a, radius)
    b = _box_mean(torch, functional, b, radius)
    refined = (a * guide + b).mean(dim=1, keepdim=True)
    return refined.clamp(0.0, 1.0)


def refine_alpha_rgb(image, mask_lowres, device, torch, numpy, use_fp16):
    """把低分辨率掩码用原图做引导精修到全分辨率，并做边缘去色。

    返回 (退化后的 RGBA 图像, 统计信息)。任何异常都会由调用方回退到旧路径。
    """
    import torch.nn.functional as functional
    from PIL import Image

    width, height = image.size
    scale = min(1.0, float(REFINE_WORK_MAX) / float(max(width, height)))
    work_w = max(16, int(round(width * scale)))
    work_h = max(16, int(round(height * scale)))

    guide_image = image.resize((work_w, work_h), Image.BILINEAR)
    guide = (
        torch.from_numpy(numpy.array(guide_image, dtype=numpy.float32) / 255.0)
        .permute(2, 0, 1)
        .unsqueeze(0)
        .to(device)
    )
    # 统计量与滤波统一用 fp32：2048 尺度下显存只有几百 MB，换来数值稳定与更好的边缘
    guide = guide.float()

    source = functional.interpolate(
        mask_lowres, size=(work_h, work_w), mode="bilinear", align_corners=False
    ).float()
    radius = max(2, int(round(min(work_w, work_h) / 256.0)))

    refined = _guided_filter(torch, functional, guide, source, radius, 1e-4)

    # 背景色估计（用 alpha 加权模糊），用于边缘去色
    weight = (1.0 - source).clamp(0.0, 1.0)
    numerator = _box_mean(torch, functional, guide * weight, radius)
    denominator = _box_mean(torch, functional, weight, radius)
    background = numerator / denominator.clamp_min(1e-3)

    alpha_full = Image.fromarray(
        (refined[0, 0].float().cpu().numpy() * 255.0).astype(numpy.uint8)
    ).resize((width, height), Image.LANCZOS)
    background_full = functional.interpolate(
        background.float(), size=(height, width), mode="bilinear", align_corners=False
    )

    alpha_array = numpy.array(alpha_full, dtype=numpy.float32) / 255.0
    source_pixels = torch.from_numpy(numpy.array(image, dtype=numpy.uint8)).to(device)
    output_pixels = source_pixels.clone()
    tile = 512
    for y0 in range(0, height, tile):
        y1 = min(height, y0 + tile)
        alpha_tile = torch.from_numpy(alpha_array[y0:y1]).to(device).view(1, 1, y1 - y0, width)
        bg_tile = background_full[:, :, y0:y1, :]
        rgb_tile = source_pixels[y0:y1].permute(2, 0, 1).unsqueeze(0).float() / 255.0
        edge = (alpha_tile > 0.03) & (alpha_tile < 0.97)
        if bool(edge.any()):
            foreground = (rgb_tile - (1.0 - alpha_tile) * bg_tile) / alpha_tile.clamp_min(1e-2)
            mixed = torch.where(edge.expand_as(rgb_tile), foreground.clamp(0.0, 1.0), rgb_tile)
            output_pixels[y0:y1] = (
                (mixed[0].permute(1, 2, 0) * 255.0).clamp(0, 255).to(torch.uint8)
            )

    cleaned = Image.fromarray(output_pixels.cpu().numpy()).convert("RGB")
    rgba = cleaned.convert("RGBA")
    rgba.putalpha(alpha_full)
    return rgba, {"radius": radius, "workSize": [work_w, work_h]}


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

        image = open_source_image(args.image)
        rgba, foreground, refined = _matte_one(
            model, image, size, use_fp16, device, torch, numpy, bool(args.refine)
        )
        rgba.save(args.output, "PNG")

        elapsed_ms = int((time.time() - started) * 1000)
        print(
            "RESULT "
            + json.dumps(
                {
                    "width": image.width,
                    "height": image.height,
                    "elapsedMs": elapsed_ms,
                    "foreground": round(foreground, 4),
                    "device": device,
                    "refined": bool(refined),
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

        if action == "preview":
            items = request.get("items") or []
            max_size = int(request.get("maxSize") or 900)
            if not items:
                _emit({"id": request_id, "ok": False, "error": "缺少 items"})
                continue
            try:
                previews = []
                for item in items:
                    meta = make_preview(item["image"], item["output"], max_size=max_size)
                    previews.append({"ok": True, **meta})
                _emit({"id": request_id, "ok": True, "results": previews})
            except Exception as exc:  # noqa: BLE001
                _emit({"id": request_id, "ok": False, "error": str(exc)})
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
            refine = True
            if request.get("refine") is not None:
                refine = bool(request.get("refine"))
            for item in items:
                started = time.time()
                image = open_source_image(item["image"])
                rgba, foreground, refined = _matte_one(
                    model, image, size, use_fp16, device, torch, numpy, refine
                )
                rgba.save(item["output"], "PNG")
                results.append(
                    {
                        "ok": True,
                        "width": image.width,
                        "height": image.height,
                        "elapsedMs": int((time.time() - started) * 1000),
                        "foreground": round(foreground, 4),
                        "refined": bool(refined),
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
