"""将选定的图标图片转为 Android 全套 mipmap 图标(圆角方形 + 圆形)。"""
from PIL import Image, ImageDraw, ImageOps
import os

SRC = r'F:\Work\Program\Python\bookkeeping\docs\v0.1\prototypes\icons\app-icon-chosen.png'
RES_DIR = r'F:\Work\Program\Python\bookkeeping\mobile\android\app\src\main\res'

# 密度 -> 尺寸
DENSITIES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}


def make_rounded(img: Image.Image, radius_ratio: float) -> Image.Image:
    """圆角方形遮罩。"""
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    radius = int(img.size[0] * radius_ratio)
    draw.rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def make_circle(img: Image.Image) -> Image.Image:
    """圆形遮罩。"""
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, img.size[0] - 1, img.size[1] - 1], fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    src = Image.open(SRC).convert('RGBA')
    # 非方形时,居中放入正方形透明画布(不拉伸、不裁剪内容)
    w, h = src.size
    if w != h:
        side = max(w, h)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(src, ((side - w) // 2, (side - h) // 2), src)
        src = canvas
    # 放大到略大于目标,避免缩小后圆角占比变化(直接按比例即可)
    for density, size in DENSITIES.items():
        resized = src.resize((size, size), Image.LANCZOS)
        square = make_rounded(resized, 0.18)   # 圆角方形(radius ~18%)
        circle = make_circle(resized)           # 圆形

        dir_path = os.path.join(RES_DIR, density)
        os.makedirs(dir_path, exist_ok=True)
        square.save(os.path.join(dir_path, 'ic_launcher.png'))
        circle.save(os.path.join(dir_path, 'ic_launcher_round.png'))
        print(f'{density}: {size}px 写入 ic_launcher.png + ic_launcher_round.png')

    print('DONE')


if __name__ == '__main__':
    main()
