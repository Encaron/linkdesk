# 粉彩图标集（theme-iconset-pastel）

> 完备彩色图标主题——**全量搬运 Material Icon Theme（material-icon-theme）**的 SVG 图标集（MIT，© Material Extensions）。E5.8#133 图标主题闭环的完整实例：彩色 SVG 图像资产形态（`imagePath`）全链应用。

## 能力

| 形态 | 说明 |
|------|------|
| **图像资产（多色 SVG）** | 12820 条映射（files 2135 / extensions 1377 / folders 4654 / foldersExpanded 4654）→ 1123 个彩色 SVG → 壳解析 `linkdesk://` 绝对 URL → 渲染 `<img>` |
| **codicon 保底** | 未映射类型自动回退 default codicon（壳机制内置，本主题零配置） |

## 来源与许可

- **图标集**：https://github.com/material-extensions/vscode-material-icon-theme —— MIT 许可（本目录 `LICENSE.md` 附完整许可）。
- **获取方式**：`npm pack material-icon-theme`（npm registry）→ `package/dist/material-icons.json`（VS Code iconTheme 格式）+ `package/icons/*.svg`。
- **转换**：`scripts/convert-material-icons.mjs`（repo 内可复用）——把 VS Code iconTheme 格式转成 LinkDesk 双形态 `imagePath` 格式，只拷贝被映射引用的 SVG。升级 material 版本 = 重新 `npm pack` + 重跑转换。

## 结构

```
theme-iconset-pastel/
├── plugin.json          # contributes.iconThemes → icons/pastel.json
├── LICENSE.md           # MIT（material-icon-theme）
├── README.md
└── icons/
    ├── pastel.json      # 全量 mappings（~12800 条，纯 imagePath 形态）
    └── material/        # 彩色 SVG 资产（1123 个，仅被引用）
```
