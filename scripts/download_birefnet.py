import os

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

from huggingface_hub import snapshot_download

ROOT = r"C:\Users\sa\Documents\lexicona\models\birefnet"

REPOS = [
    "ZhengPeng7/BiRefNet_HR-matting",
    "ZhengPeng7/BiRefNet",
]

for repo in REPOS:
    name = repo.split("/")[-1]
    target = os.path.join(ROOT, name)
    print("downloading", repo, "->", target, flush=True)
    path = snapshot_download(
        repo_id=repo,
        local_dir=target,
        allow_patterns=["*.json", "*.py", "*.safetensors", "*.txt", "*.md"],
    )
    print("done", path, flush=True)
