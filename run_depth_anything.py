#!/usr/bin/env python3
import sys
import os
import argparse

def main():
    parser = argparse.ArgumentParser(description="Depth Anything V2 Inference Script")
    parser.add_argument("--image", required=True, help="Path to input image")
    parser.add_argument("--model", required=True, help="Path to Depth Anything V2 model weights (.pth)")
    parser.add_argument("--output", required=True, help="Path to save output depth map")
    args = parser.parse_args()

    print(f"Loading model from {args.model}...", flush=True)
    print(f"Processing image {args.image}...", flush=True)

    try:
        # Try importing torch and cv2
        import torch
        import cv2
        import numpy as np

        # Try to import DepthAnythingV2. If not in path, try adding current or parent dir
        try:
            from depth_anything_v2.dpt import DepthAnythingV2
        except ImportError:
            # Maybe it's in the same directory or we can import it from HuggingFace
            sys.path.append(os.path.dirname(os.path.abspath(__file__)))
            sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "depth-anything-v2"))
            from depth_anything_v2.dpt import DepthAnythingV2

        # Model configs for Depth Anything V2
        model_configs = {
            'vits': {'encoder': 'vits', 'features': 64, 'out_channels': [256, 512, 1024, 1024]},
            'vitb': {'encoder': 'vitb', 'features': 128, 'out_channels': [256, 512, 1024, 1024]},
            'vitl': {'encoder': 'vitl', 'features': 256, 'out_channels': [256, 512, 1024, 1024]},
            'vitg': {'encoder': 'vitg', 'features': 384, 'out_channels': [256, 512, 1024, 1024]}
        }

        # Automatically determine encoder type from model name/path
        encoder = 'vitl' # default
        model_name_lower = args.model.lower()
        if 'vits' in model_name_lower or 'small' in model_name_lower:
            encoder = 'vits'
        elif 'vitb' in model_name_lower or 'base' in model_name_lower:
            encoder = 'vitb'
        elif 'vitg' in model_name_lower or 'giant' in model_name_lower:
            encoder = 'vitg'

        print(f"Using encoder: {encoder}", flush=True)
        model = DepthAnythingV2(**model_configs[encoder])
        
        # Load weights
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"Running on device: {device}", flush=True)
        
        model.load_state_dict(torch.load(args.model, map_location=device))
        model.to(device)
        model.eval()

        # Read image
        raw_img = cv2.imread(args.image)
        if raw_img is None:
            raise ValueError(f"Could not read image from {args.image}")

        # Run inference
        depth = model.infer_image(raw_img)

        # Normalize depth map to 0-255 for visualization
        depth_normalized = ((depth - depth.min()) / (depth.max() - depth.min()) * 255).astype(np.uint8)
        
        # Save output image as grayscale depth map
        cv2.imwrite(args.output, depth_normalized)
        print("Success: Depth map generated successfully using local Depth Anything V2 model.", flush=True)
        return 0

    except Exception as e:
        print(f"Error running local Depth Anything V2 model: {str(e)}", flush=True)
        print("ERROR: Real depth map generation failed.", flush=True)
        print("  Error: " + str(e), flush=True)
        return 1

if __name__ == "__main__":
    sys.exit(main())
