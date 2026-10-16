#!/usr/bin/env python3
import os
import sys
from PIL import Image, ImageDraw

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src_icon = os.path.join(root, "..", "desktop", "build", "icon.png")
    if not os.path.exists(src_icon):
        src_icon = os.path.join(root, "..", "public", "icon.png")
    
    res_dir = os.path.join(root, "Resources")
    os.makedirs(res_dir, exist_ok=True)
    
    print(f"Loading source icon: {src_icon}")
    img = Image.open(src_icon).convert("RGBA")
    
    # 1. Generate AppIcon.icns
    icns_path = os.path.join(res_dir, "AppIcon.icns")
    sizes = [(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)]
    img.save(icns_path, format="ICNS", sizes=sizes)
    print(f"Generated {icns_path} ({os.path.getsize(icns_path)} bytes)")
    
    # 2. Generate Menu Bar Status Item icons (18x18 and 36x36 for Retina @2x)
    status_icon_1x = os.path.join(res_dir, "StatusIcon.png")
    status_icon_2x = os.path.join(res_dir, "StatusIcon@2x.png")
    
    s1 = img.resize((18, 18), Image.Resampling.LANCZOS)
    s2 = img.resize((36, 36), Image.Resampling.LANCZOS)
    
    s1.save(status_icon_1x, "PNG")
    s2.save(status_icon_2x, "PNG")
    print(f"Generated {status_icon_1x} and {status_icon_2x}")

if __name__ == "__main__":
    main()
