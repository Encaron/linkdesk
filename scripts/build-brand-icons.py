# -*- coding: utf-8 -*-
"""
品牌图标生成器——04「程序图标偏小与软件内品牌标不一致」（2026-09-27）。

单一真源 = build/icon.svg（正典矢量：六边形 + 三节点）。本脚本解析它的 polygon/circle
基元，4x 超采样绘制后生成：
  1. build/icon.ico —— 帧集 16/24/32/48/64/96/128/256（补齐旧 ico 缺的 96/128，高 DPI 不再发虚；
     所有帧同一几何同源缩放，留白恒定 ≈94%，修复旧 ico 留白随帧递增的「大小不一」）；
  2. public/assets/logo.svg —— 软件内标（标题栏 / 关于页 / 池 logoUrl / BootMark 同一消费入口）。

用法：python scripts/build-brand-icons.py （需 Pillow；electron-builder.yml win.icon 显式指 build/icon.ico）
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SVG_PATH = ROOT / "build" / "icon.svg"
ICO_PATH = ROOT / "build" / "icon.ico"
LOGO_PATH = ROOT / "public" / "assets" / "logo.svg"
CANVAS = 256
SS = 4  # 超采样倍数——抗锯齿（16px 帧由 1024 直接 LANCZOS 下去，比逐帧画干净）
FRAMES = [16, 24, 32, 48, 64, 96, 128, 256]


def parse_svg(svg: str):
    """解析本仓自有 icon.svg 的受控基元（polygon points + circle cx/cy/r + stroke/fill 色）。
    只支持生成器约定的形状集——不是通用 SVG 渲染器（那是浏览器/cairosvg 的事）。"""
    poly = re.search(r'<polygon points="([^"]+)" fill="[^"]*" stroke="([^"]+)" stroke-width="([^"]+)"', svg)
    if not poly:
        raise SystemExit("icon.svg 缺 polygon 基元（受控形状集：polygon + circle）")
    points = [tuple(float(v) for v in pair.split(",")) for pair in poly.group(1).split()]
    circles = []
    for m in re.finditer(r'<circle cx="([^"]+)" cy="([^"]+)" r="([^"]+)" fill="([^"]+)"', svg):
        circles.append((float(m.group(1)), float(m.group(2)), float(m.group(3)), m.group(4)))
    return points, poly.group(2), float(poly.group(3)), circles


def draw(canvas: int) -> Image.Image:
    svg = SVG_PATH.read_text(encoding="utf-8")
    points, stroke_color, stroke_width, circles = parse_svg(svg)
    k = canvas * SS / CANVAS
    img = Image.new("RGBA", (canvas * SS, canvas * SS), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pts = [(x * k, y * k) for x, y in points]
    draw.polygon(pts, outline=stroke_color, width=round(stroke_width * k))
    for cx, cy, r, fill in circles:
        draw.ellipse(
            [(cx - r) * k, (cy - r) * k, (cx + r) * k, (cy + r) * k],
            fill=fill,
        )
    return img.resize((canvas, canvas), Image.LANCZOS)


def occupancy(img: Image.Image) -> tuple:
    """内容框占画布比（档案 §五 方法①的 Pillow 版）——生成后自检。"""
    box = img.getchannel("A").getbbox()
    return (round((box[2] - box[0]) / img.width, 3), round((box[3] - box[1]) / img.height, 3))


def main() -> None:
    base = draw(1024)  # 超采样底图——所有帧由它 LANCZOS 缩出（同源同留白）
    base.save(ICO_PATH, format="ICO", sizes=[(s, s) for s in FRAMES])
    LOGO_PATH.write_text(SVG_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    w, h = occupancy(base.resize((256, 256), Image.LANCZOS))
    print(f"icon.ico 帧集 {FRAMES}")
    print(f"logo.svg 已同步（与 icon.svg 逐字节同源）")
    print(f"256 帧内容占画布: {w:.0%} x {h:.0%}（目标 92-96%）")
    # 六边形高瘦比（w:h≈0.96）固有：高维达标 92-96%，宽维 ≥88% 即对齐 Telegram 的「留一点安全边」量级
    if h < 0.92 or h > 0.96 or w < 0.88:
        sys.exit(f"🔴 占画布比越界（高 {h:.0%} 应 92-96%，宽 {w:.0%} 应 ≥88%）——几何回归")


if __name__ == "__main__":
    main()
