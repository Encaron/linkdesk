# create-linkdesk-plugin

LinkDesk 插件脚手架——一行命令生成你的第一个插件项目（对标 `yo code`）。

```bash
npm create linkdesk-plugin my-cool-plugin
```

不带名字则交互式询问：

```bash
npm create linkdesk-plugin
```

## 生成什么

生成物的形状**与官方插件一致**——README / CHANGELOG / resources / i18n 一个不少：

```
my-cool-plugin/
├── plugin.json           # 插件清单（JSONC：可注释/尾逗号，字段分节示范，VS Code $schema 校验）
├── package.json          # scripts: dev / dev:real / build / publish / validate / lint
├── tsconfig.json         # jsx: react-jsx + window.linkdesk.* 类型（@linkdesk/plugin-sdk）
├── .gitignore            # node_modules / dist / *.linkdesk-plugin
├── README.md             # 说明——市场「详情」页签的数据源 + 目录契约表
├── CHANGELOG.md          # 更新日志——市场「更改日志」页签的数据源
├── .vscode/settings.json # plugin.json 按 jsonc 识别（注释不标红）
├── resources/
│   └── icon.svg          # 图标占位图——换成你自己的
├── src/
│   ├── index.tsx         # 视图组件 default 导出——壳以 { isActive, tabId?, sourceId? } 渲染
│   └── index.css         # 样式示例——颜色 / 字号走 var(--xxx)，间距走 4px 节奏
└── i18n/
    └── en.json           # 英文译文（key = 中文原文；不建 zh.json）
```

> **不预建空文件夹**（git 本来也不记录空目录）——「东西该放哪」写在生成的 `README.md` 的目录契约表里，
> 用文字说清比用空夹暗示更清楚。

## 命令

```bash
cd my-cool-plugin
npm install

npm run dev        # 浏览器热重载预览（改代码即时生效）
npm run dev:real   # 真机环——直写 {userData}/plugins/<id> + CDP reload（真 IPC / 串口 / LSP 类插件用）
npm run validate   # 校验 plugin.json
npm run build      # 产出 <pluginId>.linkdesk-plugin——可装进 LinkDesk / 发布
npm run lint       # 门禁自检（硬编码颜色 / 字号 / 间距网格 / eslint 规则）
npm run publish    # 一键发布（建 GitHub Release + 上传 + 更新 catalog）
```

> 说明：插件作者工作流（dev 热预览 / build / 发布全链路）的完整文档见
> [00-第三方作者旅程](../../docs/02-Electron架构/E6_插件生态与发布/05-文档与发布/00-第三方作者旅程.md)。
