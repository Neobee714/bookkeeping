# -*- coding: utf-8 -*-
"""双人记账 APP 图标生成器(3 款,512×512,活力渐变底 + 圆角)。

运行:python generate_icons.py
依赖:Pillow(可选 numpy 加速渐变;无 numpy 时自动走逐像素回退)
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

PURPLE = (139, 92, 246)          # #8B5CF6
PINK = (236, 72, 153)            # #EC4899
WHITE = (255, 255, 255)
AMBER = (251, 191, 36)           # #FBBF24 书签线
SOFT_LAVENDER = (221, 214, 254)  # #DDD6FE 书本/硬币细节

S = 2048        # 4x 超采样绘制尺寸
FINAL = 512     # 最终尺寸
RADIUS = 400    # 圆角半径:100px @512 -> 400 @2048

HERE = os.path.dirname(os.path.abspath(__file__))


def diagonal_gradient(size, c1, c2):
    """左上 c1 -> 右下 c2 的对角线性渐变,逐像素插值,平滑无断层。"""
    try:
        import numpy as np
        yy, xx = np.mgrid[0:size, 0:size]
        t = (xx + yy) / (2.0 * (size - 1))
        r = (c1[0] + (c2[0] - c1[0]) * t).astype(np.uint8)
        g = (c1[1] + (c2[1] - c1[1]) * t).astype(np.uint8)
        b = (c1[2] + (c2[2] - c1[2]) * t).astype(np.uint8)
        return Image.fromarray(np.stack([r, g, b], axis=-1), "RGB")
    except ImportError:
        img = Image.new("RGB", (size, size))
        px = img.load()
        den = 2.0 * (size - 1)
        dr, dg, db = c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]
        for y in range(size):
            ty = y / den
            for x in range(size):
                t = ty + x / den
                px[x, y] = (int(c1[0] + dr * t), int(c1[1] + dg * t), int(c1[2] + db * t))
        return img


def base_rgba():
    return diagonal_gradient(S, PURPLE, PINK).convert("RGBA")


def load_font(size):
    for path in (r"C:\Windows\Fonts\msyhbd.ttc",
                 r"C:\Windows\Fonts\msyh.ttc",
                 r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise RuntimeError("未找到可用中文字体(msyhbd/msyh/simhei)")


def icon_a():
    """「双人」:两个相扣的白色圆环(链环式互扣,一环在前一环在后)。

    实现:两个完整圆环各画在独立图层,再在交叉点用楔形遮罩各开一个缺口,
    缺口处露出另一条环 -> 形成交错效果。不依赖 arc 的角度方向语义,更稳健。
    """
    img = base_rgba()
    cx1, cy1, cx2, cy2 = 754, 904, 1294, 1144   # 两环中心,斜向错开
    r, w = 360, 104                             # 环半径 / 线宽
    # 两圆交点(等半径 -> 交点在两圆心连线的中垂线上)
    dx, dy = cx2 - cx1, cy2 - cy1
    dist = math.hypot(dx, dy)
    h = math.sqrt(max(r * r - (dist / 2.0) ** 2, 0.0))
    mx, my = (cx1 + cx2) / 2.0, (cy1 + cy2) / 2.0
    px_, py_ = -dy / dist, dx / dist
    p1 = (mx + h * px_, my + h * py_)   # 下交点
    p2 = (mx - h * px_, my - h * py_)   # 上交点
    a1 = math.atan2(p1[1] - cy1, p1[0] - cx1)
    a2 = math.atan2(p2[1] - cy2, p2[0] - cx2)
    delta = math.radians(8)             # 缺口半角(总缺口 16°,约 100px 弧长)

    # 注意:PIL 的 ellipse outline 宽度是向边界内侧画的,因此外扩 w/2,
    # 使描边中心线落在设计半径 r 上(环实际覆盖 r-w/2 .. r+w/2)。
    R = r + w // 2
    ringL = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ringR = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(ringL).ellipse([cx1 - R, cy1 - R, cx1 + R, cy1 + R],
                                  outline=WHITE, width=w)
    ImageDraw.Draw(ringR).ellipse([cx2 - R, cy2 - R, cx2 + R, cy2 + R],
                                  outline=WHITE, width=w)

    def cut_gap(ring, cx, cy, ang):
        """在环上 ang 角度处擦出一个楔形缺口(径向 300..420,略大于环宽)。"""
        m = Image.new("L", (S, S), 0)
        dm = ImageDraw.Draw(m)
        r0, r1 = 300, 420
        pts = [(cx + r0 * math.cos(ang - delta), cy + r0 * math.sin(ang - delta)),
               (cx + r0 * math.cos(ang + delta), cy + r0 * math.sin(ang + delta)),
               (cx + r1 * math.cos(ang + delta), cy + r1 * math.sin(ang + delta)),
               (cx + r1 * math.cos(ang - delta), cy + r1 * math.sin(ang - delta))]
        dm.polygon(pts, fill=255)
        ring.paste((0, 0, 0, 0), (0, 0), m)

    cut_gap(ringL, cx1, cy1, a1)   # 左环:下交点开口(右环从前方穿过)
    cut_gap(ringR, cx2, cy2, a2)   # 右环:上交点开口(左环从前方穿过)
    img.alpha_composite(ringL)
    img.alpha_composite(ringR)
    return img


def icon_b():
    """「账本」:白色圆角账本(翻开样式)+ 彩色书签线。"""
    img = base_rgba()
    # 书签线先画,顶部会被书本压住
    ribbon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(ribbon)
    dr.polygon([(960, 1400), (1088, 1400), (1088, 1900), (1024, 1810), (960, 1900)], fill=AMBER)
    img.alpha_composite(ribbon)
    d = ImageDraw.Draw(img)
    # 书本主体(圆角矩形)
    d.rounded_rectangle([364, 584, 1684, 1464], radius=110, fill=WHITE)
    # 书脊(中缝)
    d.line([(1024, 624), (1024, 1424)], fill=SOFT_LAVENDER, width=14)
    # 左右页面横线
    for yy in (950, 1130):
        d.line([(470, yy), (950, yy)], fill=SOFT_LAVENDER, width=10)
        d.line([(1098, yy), (1578, yy)], fill=SOFT_LAVENDER, width=10)
    return img


def icon_c():
    """「钱币」:白色圆形钱币 + 内嵌渐变 ¥ 符号。"""
    img = base_rgba()
    d = ImageDraw.Draw(img)
    r_coin = 470
    d.ellipse([1024 - r_coin, 1024 - r_coin, 1024 + r_coin, 1024 + r_coin], fill=WHITE)
    # 币缘内环(同样外扩 w/2 抵消内侧描边)
    r_edge = 385
    d.ellipse([1024 - r_edge - 11, 1024 - r_edge - 11,
               1024 + r_edge + 11, 1024 + r_edge + 11],
              outline=SOFT_LAVENDER, width=22)
    # ¥ 符号(微软雅黑粗体),用与背景同方向的渐变填充
    font = load_font(560)
    mask = Image.new("L", (S, S), 0)
    dm = ImageDraw.Draw(mask)
    dm.text((1024, 1024), "¥", font=font, fill=255, anchor="mm",
            stroke_width=36, stroke_fill=255)
    grad = diagonal_gradient(S, PURPLE, PINK)
    img.paste(grad, (0, 0), mask)
    return img


def finalize(rgba_big):
    """2048 -> 512,套圆角遮罩(遮罩同样先 4x 再缩放,保证边缘抗锯齿)。"""
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS, fill=255)
    icon = rgba_big.resize((FINAL, FINAL), Image.LANCZOS)
    mask = mask.resize((FINAL, FINAL), Image.LANCZOS)
    icon.putalpha(mask)
    return icon


def main():
    os.makedirs(HERE, exist_ok=True)
    items = [("icon-a-double.png", icon_a()),
             ("icon-b-ledger.png", icon_b()),
             ("icon-c-coin.png", icon_c())]
    for name, big in items:
        icon = finalize(big)
        path = os.path.join(HERE, name)
        icon.save(path, "PNG")
        icon.resize((48, 48), Image.LANCZOS).save(
            os.path.join(HERE, "_thumb-" + name), "PNG")
        print("已生成 %s (%dx%d) + 48px 缩略图" % (path, icon.size[0], icon.size[1]))


if __name__ == "__main__":
    main()
