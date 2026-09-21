import os
import math
import shutil
from PIL import Image, ImageFilter

def create_theme_texture(output_path, palette, angle_deg=35, stripe_width=60):
    src = Image.open('public/assets/themes/default/diffuse-light.png').convert('L')
    width, height = src.size

    rad = math.radians(angle_deg)
    cos_a = math.cos(rad)
    sin_a = math.sin(rad)
    total_period = len(palette) * stripe_width

    bg = Image.new('RGB', (width, height))
    pixels = bg.load()

    for y in range(height):
        for x in range(width):
            proj = (x * cos_a + y * sin_a) % total_period
            stripe_idx = int(proj // stripe_width) % len(palette)
            pixels[x, y] = palette[stripe_idx]

    text_mask = src.point(lambda p: 255 if p > 100 else 0).convert('L')
    outline_mask = text_mask.filter(ImageFilter.MaxFilter(7))

    dark = Image.new('RGB', (width, height), (20, 20, 25))
    bg.paste(dark, (0, 0), outline_mask)

    white = Image.new('RGB', (width, height), (255, 255, 255))
    bg.paste(white, (0, 0), text_mask)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    bg.save(output_path, 'PNG')
    print(f"Saved {output_path}")

pride_palette = [
    (228, 3, 3),     # Red
    (255, 140, 0),   # Orange
    (255, 237, 0),   # Yellow
    (0, 128, 38),    # Green
    (36, 64, 142),   # Blue
    (115, 41, 130),  # Purple
]

trans_palette = [
    (91, 206, 250),  # Light Blue
    (245, 169, 184), # Pink
    (255, 255, 255), # White
    (245, 169, 184), # Pink
    (91, 206, 250),  # Light Blue
]

nonbinary_palette = [
    (252, 244, 52),  # Yellow
    (255, 255, 255), # White
    (156, 89, 209),  # Purple
    (44, 44, 44),    # Dark Grey / Black
]

create_theme_texture('public/assets/themes/pride/diffuse-pride.png', pride_palette, angle_deg=35, stripe_width=64)
create_theme_texture('public/assets/themes/trans/diffuse-trans.png', trans_palette, angle_deg=35, stripe_width=50)
create_theme_texture('public/assets/themes/nonbinary/diffuse-nonbinary.png', nonbinary_palette, angle_deg=35, stripe_width=55)

for theme in ['pride', 'trans', 'nonbinary']:
    for f in ['default.json', 'normal.png', 'specular.jpg']:
        src_f = os.path.join('public/assets/themes/default', f)
        dst_f = os.path.join('public/assets/themes', theme, f)
        shutil.copyfile(src_f, dst_f)
print("Copied all companion files successfully!")
