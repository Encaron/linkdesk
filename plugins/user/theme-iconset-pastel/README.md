# 粉彩图标集（theme-iconset-pastel）

> **E5.8#133.4 虚构验证实例**——不是真实产品图标集，用于打通 图标主题「贡献 → 登记 → 选择 → 应用」全链 + 双形态渲染。

## 能力演示

| 形态 | 条目 | 说明 |
|------|------|------|
| **自定义字体 glyph（彩色）** | `ld-pastel ld-pastel-folder` + `color` | 自定义图标字体 `ld-pastel`（`icons/fonts/ld-pastel.ttf`）→ 壳生成 @font-face 广播进池 + glyph 类 CSS（`icons/ld-pastel.css`）注入池文档；`color` 字段做彩色 glyph |
| **图像资产（多色）** | `imagePath: "icons/ts-doc.svg"` | 任意多色/拟物化 SVG → 壳解析 `linkdesk://` 绝对 URL → 渲染 `<img>` |
| **codicon 保底** | `class: "codicon codicon-file-code"` | 与默认主题一致，验证混用不冲突 |

## 字体资产说明

演示字体 `ld-pastel.ttf` 复用 VS Code Codicons 的字形数据（MIT），仅用于**验证自定义字体链路**（@font-face 广播 → 池复刻 + glyph 类 CSS 注入），不追求字形独创性。真实第三方图标主题作者用自己的字体资产即可——壳零审查。
