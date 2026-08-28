# 粉彩图标集（theme-iconset-pastel）

> 精简彩色图标主题——**Material Icon Theme（material-icon-theme）常用精选集**（MIT，© Material Extensions）。E5.8#133 图标主题闭环实例：彩色 SVG 图像资产形态（`imagePath`）全链应用。

## 能力

| 形态 | 说明 |
|------|------|
| **语言生态精选集** | 前端（js/ts/html/css/vue…）+ 后端（c/py/java/go/rs…）+ 脚本（sh/bat/ps1…）+ 文档配置（md/json/yaml…）= 63 扩展 + 26 文件名 + 25 文件夹名，共 139 条映射 → 99 个彩色 SVG |
| **默认图标** | `file`/`folder`/`folderExpanded`/`rootFolder`/`rootFolderExpanded` 5 个通用图标——**普通文件夹、新建文件、根文件夹未命中匹配表时也用主题彩色图标**（E5.8#133.6 默认图标链路，对齐 VS Code iconTheme 顶层键） |
| **codicon 保底** | 壳机制内置——极端未覆盖类型回退 codicon 字体保底 |

## 来源与许可

- **图标集**：https://github.com/material-extensions/vscode-material-icon-theme —— MIT 许可（本目录 `LICENSE.md` 附完整许可）。
- **获取方式**：`npm pack material-icon-theme`（npm registry）→ `package/dist/material-icons.json`（VS Code iconTheme 格式）+ `package/icons/*.svg`。
- **转换**：`scripts/convert-material-icons.mjs`（repo 内可复用）——按**语言生态精选清单**把 VS Code iconTheme 格式转成 LinkDesk 双形态 `imagePath` 格式（含 5 个顶层默认图标），只拷贝被引用的 SVG。升级 material 版本 = 重新 `npm pack` + 重跑转换（清单内缺失键静默跳过）。

## 结构

```
theme-iconset-pastel/
├── plugin.json          # contributes.iconThemes → icons/pastel.json
├── LICENSE.md           # MIT（material-icon-theme）
├── README.md
└── icons/
    ├── pastel.json      # 精选 mappings（139 条 + 5 默认图标，纯 imagePath 形态）
    └── material/        # 彩色 SVG 资产（99 个，仅被引用）
```
