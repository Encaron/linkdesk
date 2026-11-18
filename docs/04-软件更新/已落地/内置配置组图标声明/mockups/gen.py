# -*- coding: utf-8 -*-
"""内置配置组图标 · 设计稿生成器
几何单源：本脚本同时产出 12 枚 SVG 资产（3 方案 × 4 图标）＋ 1 张设计图 HTML。
运行：py -3 gen.py   （在 scratch/design-icons 下运行，产物写进案夹 mockups/）
"""
import os

CASE = "e:/linkdesk/docs/04-软件更新/待抉择池/内置配置组图标声明"
MOCK = os.path.join(CASE, "mockups")
SVGD = lambda v: os.path.join(MOCK, f"svg-{v}")

STROKE = 1.25

# ---------------------------------------------------------------- 图标几何

def rails_general():
    """滑杆：三条轨 + 错位旋钮。返回 (轨线段列表, 旋钮坐标)"""
    segs = []
    knobs = []
    for y, kx in ((3.5, 10.2), (8.0, 5.8), (12.5, 9.0)):
        g = 2.25  # 旋钮半径 1.8 + 0.45 空隙
        if kx - g - 2 > 0.7:
            segs.append((2, y, kx - g, y))
        if 14 - (kx + g) > 0.7:
            segs.append((kx + g, y, 14, y))
        knobs.append((kx, y))
    return segs, knobs

def glyph_general(variant):
    segs, knobs = rails_general()
    out = []
    for x1, y1, x2, y2 in segs:
        out.append(f'<path d="M {x1} {y1} L {x2} {y2}"/>')
    for kx, y in knobs:
        if variant == "B":
            out.append(f'<circle cx="{kx}" cy="{y}" r="1.8" fill="currentColor" stroke="none"/>')
        elif variant == "D":
            out.append(f'<circle cx="{kx}" cy="{y}" r="1.8" fill="{{ACC}}" stroke="none"/>')
        else:
            out.append(f'<circle cx="{kx}" cy="{y}" r="1.8"/>')
    return "".join(out)

BLOB = ("M 8 1.75 C 4.35 1.75 1.75 4.3 1.75 7.05 C 1.75 8.95 3.05 10.3 4.8 10.3 "
        "L 6.05 10.3 C 6.8 10.3 7.4 10.9 7.4 11.65 C 7.4 12 7.25 12.26 7.05 12.5 "
        "C 6.86 12.74 6.72 13 6.72 13.32 C 6.72 14.06 7.32 14.6 8.06 14.6 "
        "C 11.6 14.6 14.25 11.85 14.25 8.15 C 14.25 4.35 11.65 1.75 8 1.75 Z")
HOLE = ("M 8.6 7.75 A 1.55 1.55 0 1 0 8.6 10.85 A 1.55 1.55 0 1 0 8.6 7.75 Z")

def glyph_theme(variant):
    if variant == "B":  # 实心调色盘 + 挖孔
        return (f'<path d="{BLOB} {HOLE}" fill="currentColor" fill-rule="evenodd" stroke="none"/>')
    dots = '<circle cx="11.4" cy="5.1" r="1.05" fill="currentColor" stroke="none"/>' \
           '<circle cx="12.2" cy="8.3" r="1.05" fill="currentColor" stroke="none"/>'
    return (f'<path d="{BLOB}"/><circle cx="8.6" cy="9.3" r="1.55"/>{dots}')

STAR = ("M 8 2.4 C 8.55 5.9 10.1 7.45 13.6 8 C 10.1 8.55 8.55 10.1 8 13.6 "
        "C 7.45 10.1 5.9 8.55 2.4 8 C 5.9 7.45 7.45 5.9 8 2.4 Z")
COMP = ("M 12.4 2.2 C 12.55 3.15 13.0 3.6 13.95 3.75 C 13.0 3.9 12.55 4.35 12.4 5.3 "
        "C 12.25 4.35 11.8 3.9 10.85 3.75 C 11.8 3.6 12.25 3.15 12.4 2.2 Z")

def glyph_ai(variant):
    compc = "{ACC}" if variant == "D" else "currentColor"
    comp = f'<path d="{COMP}" fill="{compc}" stroke="none"/>'
    if variant == "B":
        return f'<path d="{STAR}" fill="currentColor" stroke="none"/>{comp}'
    return f'<path d="{STAR}"/>{comp}'

FOLDER = ("M 2.9 6.5 H 4.9 C 5.2 6.5 5.48 6.63 5.67 6.85 L 6.6 7.9 H 9.7 "
          "C 10.2 7.9 10.6 8.3 10.6 8.8 V 12.1 C 10.6 12.6 10.2 13 9.7 13 H 2.9 "
          "C 2.4 13 2 12.6 2 12.1 V 7.4 C 2 6.9 2.4 6.5 2.9 6.5 Z")
ARROW = ('<path d="M 10.0 6.0 L 13.4 2.7"/><path d="M 13.4 2.7 L 13.4 4.8"/>'
         '<path d="M 13.4 2.7 L 11.3 2.7"/>')

def glyph_openwith(variant):
    arrow = f'<g stroke="{{ACC}}">{ARROW}</g>' if variant == "D" else ARROW
    if variant == "B":  # 实心文件夹 + 线性箭头
        return f'<path d="{FOLDER}" fill="currentColor" stroke="none"/>{arrow}'
    return f'<path d="{FOLDER}"/>{arrow}'

HEX = '<path d="M 8 1 L 14.06 4.5 V 11.5 L 8 15 L 1.94 11.5 V 4.5 Z" stroke-width="1.1"/>'

GLYPHS = {"general": glyph_general, "theme": glyph_theme, "ai": glyph_ai, "openwith": glyph_openwith}
NAMES = {"general": "通用", "theme": "主题", "ai": "AI 接入", "openwith": "默认打开方式"}

def svg_for(variant, key):
    inner = GLYPHS[key](variant)
    if variant == "C":
        inner = (HEX + '<g transform="translate(8 8) scale(0.68) translate(-8 -8)" '
                 f'stroke-width="1.8">{inner}</g>')
    acc = "var(--accent, #0078D4)" if variant == "D" else "currentColor"
    inner = inner.replace("{ACC}", acc)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" '
            f'stroke="currentColor" stroke-width="{STROKE}" '
            f'stroke-linecap="round" stroke-linejoin="round">{inner}</svg>')

def write_assets():
    for v in ("A", "B", "C", "D"):
        d = SVGD(v)
        os.makedirs(d, exist_ok=True)
        for key in GLYPHS:
            with open(os.path.join(d, f"{NAMES[key]}.svg"), "w", encoding="utf-8", newline="\n") as f:
                f.write("<!-- 内置配置组图标 · 方案%s · %s —— 16×16 网格，stroke 1.25；"
                        "生产消费 = IconRegistry 默认项 + mask/currentColor（icon-ink 墨色阶梯） -->\n"
                        % (v, NAMES[key]) + svg_for(v, key) + "\n")

# ---------------------------------------------------------------- 设计图

def icon_html(variant, key, size):
    return svg_for(variant, key).replace("<svg ", f'<svg width="{size}" height="{size}" ')

def plugin_icon(path):
    with open(path, encoding="utf-8") as f:
        s = f.read()
    return s.replace('width="48" height="48"', 'width="16" height="16"', 1)

PICON = "E:/linkdesk-plugins/official/%s/resources/icon.svg"
PLUGINS = [("编辑器", PICON % "editor"), ("文件树", PICON % "file-tree"), ("串口监视器", PICON % "serial-monitor")]

def nav_row(icon_inner, title, count, active=False):
    cls = "settings-nav-item active" if active else "settings-nav-item"
    return (f'<div class="{cls}"><span class="settings-nav-label">'
            f'<span class="settings-nav-icon">{icon_inner}</span><span>{title}</span></span>'
            f'<span class="settings-nav-count">{count}</span></div>')

def nav_panel(variant, dark):
    theme = "theme-dark" if dark else "theme-light"
    rows = []
    for key, count in (("general", 11), ("theme", 9), ("ai", 5), ("openwith", 3)):
        rows.append(nav_row(icon_html(variant, key, 16), NAMES[key], count, key == "theme"))
    for title, path in PLUGINS:
        rows.append(nav_row(plugin_icon(path), title, {"编辑器": 48, "文件树": 26, "串口监视器": 12}[title]))
    pane_rows = "".join(
        '<div class="pane-row"><span class="pane-bar w60"></span><span class="pane-ctl"></span></div>'
        for _ in range(6))
    return (f'<div class="win {theme}"><div class="titlebar"><span>设置</span></div>'
            f'<div class="body"><nav class="settings-nav">{"".join(rows)}</nav>'
            f'<div class="pane">{pane_rows}</div></div></div>')

def specimen(variant):
    trs = []
    for key in GLYPHS:
        cells = []
        for size, theme, grid in ((16, True, False), (16, False, False), (64, True, False),
                                  (64, False, False), (128, True, True)):
            th = "theme-dark" if theme else "theme-light"
            cls = "chip" + (" grid" if grid else "")
            cells.append(f'<td><span class="{cls} {th}">{icon_html(variant, key, size)}</span></td>')
        trs.append(f'<tr><th>{NAMES[key]}</th>{"".join(cells)}</tr>')
    return (f'<table class="spec"><tr><th></th><th>16 暗</th><th>16 亮</th><th>64 暗</th>'
            f'<th>64 亮</th><th>128 网格（16px 栅）</th></tr>{"".join(trs)}</table>')

CSS = """
:root { --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", Roboto, sans-serif;
  --radius-sm: 4px; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #16161A; color: #E4E4E9; font-family: var(--font-ui);
  font-size: 14px; line-height: 1.55; padding: 40px 48px 80px; max-width: 1560px; margin: 0 auto; }
h1 { font-size: 22px; font-weight: 600; letter-spacing: 0.01em; }
h2 { font-size: 16px; font-weight: 600; margin: 56px 0 6px; }
h2 .idx { color: #8B8B96; font-weight: 400; margin-right: 10px; }
.note { color: #A6A6B2; font-size: 13px; max-width: 980px; }
.meta { margin-top: 14px; padding: 14px 18px; background: #1D1D23; border: 1px solid #2C2C34;
  border-radius: 8px; font-size: 12.5px; color: #B4B4C0; line-height: 1.9; }
.meta b { color: #E4E4E9; font-weight: 600; }
.meta code { background: #26262E; padding: 1px 6px; border-radius: 4px; color: #CDD6E4;
  font-family: Consolas, monospace; font-size: 12px; }
.verdict { margin-top: 10px; padding: 10px 18px; background: #14202B; border: 1px solid #1E4E6E;
  border-radius: 8px; font-size: 13px; color: #C7E2F4; }
/* ── 迷你设置窗（真源值复刻） ── */
.board { display: grid; grid-template-columns: repeat(2, 1fr); gap: 22px; margin-top: 18px; }
.win { border-radius: 8px; overflow: hidden; border: 1px solid var(--border); }
.titlebar { height: 26px; display: flex; align-items: center; justify-content: center;
  background: var(--bg-titlebar); border-bottom: 1px solid var(--border);
  font-size: 12px; color: var(--text-secondary); }
.body { display: flex; background: var(--bg-window); height: 292px; }
.theme-dark { --bg-window: #1E1E1E; --bg-card: #2D2D2D; --bg-input: #3C3C3C;
  --text-primary: #D4D4D4; --text-secondary: #9D9D9D; --text-muted: #8A8A8A;
  --accent: #0E639C; --border: #3C3C3C; --hover-overlay: rgba(255,255,255,0.06);
  --bg-titlebar: #252526; --bg-side-panel: #1E1E22;
  --icon-ink: color-mix(in srgb, var(--text-primary) 78%, transparent); }
.theme-light { --bg-window: #FFFFFF; --bg-card: #F5F5F5; --bg-input: #FFFFFF;
  --text-primary: #2D2D2D; --text-secondary: #5A5A5A; --text-muted: #767676;
  --accent: #0078D4; --border: #D4D4D4; --hover-overlay: rgba(0,0,0,0.04);
  --bg-titlebar: #DDDDDD; --bg-side-panel: #F5F5F5;
  --icon-ink: color-mix(in srgb, var(--text-primary) 78%, transparent); }
.settings-nav { width: 200px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border);
  padding: 8px 0; }
.settings-nav-item { display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 6px 20px; font-size: 14px; color: var(--text-primary);
  border-left: 2px solid transparent; }
.settings-nav-item:hover { background: var(--hover-overlay); }
.settings-nav-item.active { background: var(--hover-overlay); font-weight: 500;
  border-left-color: var(--accent); }
.settings-nav-label { display: flex; align-items: center; gap: 8px; min-width: 0; }
.settings-nav-icon { width: 16px; height: 16px; flex: none; border-radius: var(--radius-sm);
  display: block; }
.settings-nav-icon svg { width: 16px; height: 16px; display: block; }
.settings-nav-item .settings-nav-icon { color: var(--icon-ink); }
.settings-nav-count { font-size: 12px; color: var(--text-muted); background: var(--hover-overlay);
  padding: 0 6px; border-radius: 10px; }
.pane { flex: 1; background: var(--bg-side-panel); padding: 14px 18px; }
.pane-row { display: flex; align-items: center; justify-content: space-between;
  padding: 9px 2px; border-bottom: 1px solid var(--hover-overlay); }
.pane-bar { height: 10px; border-radius: 3px; background: var(--hover-overlay); }
.pane-bar.w60 { width: 60%; }
.pane-ctl { width: 36px; height: 16px; border-radius: 4px; background: var(--bg-input);
  border: 1px solid var(--border); }
/* ── 放大检视 ── */
.spec { border-collapse: collapse; margin-top: 16px; }
.spec th { text-align: left; font-weight: 500; font-size: 12.5px; color: #A6A6B2;
  padding: 8px 14px 8px 0; white-space: nowrap; }
.spec td { padding: 8px 14px 8px 0; }
.chip { display: inline-flex; align-items: center; justify-content: center;
  border-radius: 6px; border: 1px solid rgba(128,128,128,0.25); }
.chip.theme-dark { background: #1E1E1E; color: color-mix(in srgb, #D4D4D4 78%, transparent); }
.chip.theme-light { background: #FFFFFF; color: color-mix(in srgb, #2D2D2D 78%, transparent); }
.chip.grid { background-image: linear-gradient(to right, rgba(128,128,128,0.22) 1px, transparent 1px),
  linear-gradient(to bottom, rgba(128,128,128,0.22) 1px, transparent 1px);
  background-size: 16px 16px; position: relative; }
.plabel { font-size: 12px; color: #A6A6B2; margin-top: 4px; }
.legend { display: flex; gap: 28px; margin-top: 14px; font-size: 12.5px; color: #A6A6B2; }
.legend b { color: #E4E4E9; font-weight: 600; }
"""

def build_html():
    board = '<div class="board">'
    for v, vname, vdesc in (
            ("A", "方案 A · 墨线正典", "纯线性、墨色随主题（--icon-ink）。与插件彩色块区分最干净，16px 最稳。"),
            ("B", "方案 B · 墨线＋实心点睛", "同一骨架，每枚一处实心（旋钮/盘体/星芒/文件夹）。远看更有分量，近看更密。"),
            ("C", "方案 C · 品牌六边形", "六边形底座（呼应程序图标）＋缩小线符。本体身份最强，16px 最挤。"),
            ("D", "方案 D · 墨线＋品牌强调", "A 的墨线骨架，每枚一处品牌强调色（旋钮/颜料点/伴星/箭头），随主题 accent 翻转。本体味与区分度兼得；生产消费比单色多一层（墨层＋accent 层双层 mask）。")):
        board += (f'<div><h3 style="font-size:13px;font-weight:600;margin-bottom:8px">{vname}</h3>'
                  f'<p class="note" style="margin-bottom:12px;min-height:40px">{vdesc}</p>'
                  f'{nav_panel(v, True)}<div class="plabel">暗</div>'
                  f'<div style="height:12px"></div>{nav_panel(v, False)}<div class="plabel">亮</div></div>')
    board += "</div>"

    spec = ""
    for v, vname in (("A", "方案 A"), ("B", "方案 B"), ("C", "方案 C"), ("D", "方案 D")):
        spec += f"<h3 style='font-size:13px;font-weight:600;margin-top:26px'>{vname}</h3>{specimen(v)}"

    editors = "".join(nav_row(plugin_icon(p), t, 0) for t, p in PLUGINS)

    html = f"""<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>内置配置组图标 · 设计稿（通用 / 主题 / AI 接入 / 默认打开方式）</title>
<style>{CSS}</style>
</head>
<body>
<h1>内置配置组图标 · 设计稿</h1>
<p class="note" style="margin-top:8px">设置页左侧导航「本体组」四枚图标（通用 / 主题 / AI 接入 / 默认打开方式）。
判据：与插件组彩色 marketIcon 形成「本体 / 插件」天然区分。区分轴取 <b style="color:#E4E4E9">插件＝有块·彩色·不随主题；本体＝无块·墨线·随主题</b>：
插件图标是货架上的商品（48×48 渐变块），本体图标是软件自身的骨架（16×16，走 --icon-ink 墨色阶梯，亮暗主题自动翻转）。</p>
<div class="meta">
<b>真源钉桩（拟真度门）</b>：导航窗内所有度量照产品源复刻（settings 仓基线 <code>a489870</code> · <code>a489870</code> ·
nav 200px / 行 padding 6px 20px / 字号 md 14 / 图标位 16×16 圆角 var(--radius-sm)=4px / active 左 2px accent 条 /
count 徽标 xs 12px（<code>settings/src/views/SettingsView.css:92-158</code>）·
调色板照 <code>theme-defaults/themes/defaults.json</code>（暗 accent #0E639C / 亮 #0078D4）·
墨色阶梯 --icon-ink = text-primary 78%（<code>src/index.css:28</code>））。
计数徽标数字为示意。本体组四行均落在「本体」列，插件组三行（编辑器 / 文件树 / 串口监视器）用真件内嵌对照。
</div>
<div class="verdict"><b>你的选择</b>：三方案同屏（暗 / 亮双主题）＋放大检视（128px 带 16px 栅格）。
<b>方案 D 专款</b>：强调色元素随主题 accent 翻转，生产消费＝双层（墨层 mask＋accent 层 mask，两层都吃主题 token）；若选 D，IconRegistry 默认项与 PluginIcon 按名解析按双层渲染落码。<br>
选定方案后，四枚 SVG 即按现几何落为 IconRegistry 默认项资产（盘上 SVG），值形态与节奏按 2026-11-18 拍板执行。</div>

<h2><span class="idx">一</span>四方案 × 双主题 · 导航实装对照</h2>
{board}
<div class="legend"><span><b>本体组</b>：墨线随主题（通用 11 / 主题 9〔active 态〕/ AI 接入 5 / 默认打开方式 3，计数示意）</span>
<span><b>插件组</b>：真彩 marketIcon 原件内嵌（48×48 渐变块缩 16px）</span></div>

<h2><span class="idx">二</span>放大检视 · 几何与墨色</h2>
<p class="note">128px 格带 16px 栅格线，供检查几何落在网格上、笔画粗细（stroke 1.25）与亮暗墨色对比；
16px / 64px 供检查真实显示尺寸下的辨识度。</p>
{spec}

<h2><span class="idx">三</span>语义与落点</h2>
<p class="note" style="margin-top:8px"><b style="color:#E4E4E9">四枚语义</b>：
通用＝滑杆（⛔ 齿轮：会撞设置插件自己的齿轮身份图）；主题＝调色盘；AI 接入＝四角星芒（＋伴星）；
默认打开方式＝文件夹＋外指箭头（「交给哪只插件打开」）。<br>
<b style="color:#E4E4E9">生产落点</b>（照案 00-README §二 2026-11-18 拍板）：壳以宿主身份把这四枚登记为 IconRegistry 默认项
（definition 指向盘上 SVG 资产，getAssetPath 可达），本体组 <code>icon</code> 字段填图标名；
消费端 mask ＋ currentColor 走 --icon-ink 墨色阶梯；图标主题插件可成套覆盖，设置页本可整套替换——三层替换口全占。</p>
<p class="note" style="margin-top:18px">对照：插件组三行真件如下（此段仅备查）——</p>
<div class="win theme-dark" style="width:320px;margin-top:8px"><div class="body" style="height:auto">
<nav class="settings-nav" style="width:280px">{editors}</nav></div></div>
</body>
</html>
"""
    out = os.path.join(MOCK, "01-设计图-本体组四枚图标.html")
    os.makedirs(MOCK, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    return out

if __name__ == "__main__":
    write_assets()
    print(build_html())
    print("done")
