#!/usr/bin/env python3
"""辞谱 Lexicona 本地推理引擎统一入口。

  --task depth  （默认）Depth Anything V2 深度图
  --task matte  BiRefNet 抠图
其余参数原样透传给对应任务脚本。
"""

import sys


def extract_task(argv):
    if "--task" in argv:
        index = argv.index("--task")
        try:
            task = argv[index + 1]
        except IndexError:
            task = "depth"
        del argv[index : index + 2]
        return task
    return "depth"


def main():
    argv = sys.argv[1:]
    # 常驻模式：模型常驻显存，按行处理 JSON 请求（供批量抠图复用）
    if "--serve" in argv:
        from birefnet_matting import serve
        return serve()
    task = extract_task(argv)
    if task == "matte":
        from birefnet_matting import main as run
    else:
        from run_depth_anything import main as run
    return run(argv)


if __name__ == "__main__":
    sys.exit(main())
