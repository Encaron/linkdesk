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

```
my-cool-plugin/
├── plugin.json          # 插件清单（JSONC：可注释/尾逗号，字段分节示范，VS Code $schema 校验）
├── package.json         # scripts: dev / build / validate；依赖 @linkdesk/plugin-sdk
├── tsconfig.json        # jsx: react-jsx + window.linkdesk.* 类型（@linkdesk/plugin-sdk）
├── .vscode/settings.json # plugin.json 按 jsonc 识别（注释不标红）
├── src/
│   ├── index.tsx        # 视图组件 default 导出——壳以 { isActive, tabId?, sourceId? } 渲染
│   └── index.css        # 样式示例——主题色走 var(--xxx)
└── i18n/
    └── en.json
```

然后：

```bash
cd my-cool-plugin
npm install
npm run build     # 产出 <pluginId>.linkdesk-plugin——可装进 LinkDesk / 发布
```

> 说明：插件作者工作流（dev 热预览 / build / 发布全链路）的完整文档见
> [00-第三方作者旅程](../../docs/02-Electron架构/E6_插件生态与发布/05-文档与发布/00-第三方作者旅程.md)。
