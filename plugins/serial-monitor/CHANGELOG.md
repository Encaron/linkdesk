# 更新日志

## v1.0.8（2026-09-11）

- 更新记录迁入包内的 `CHANGELOG.md`（E6#92 元数据归一）——此前写在 `plugin.json` 的 `changelog` 字段里，市场详情页读不到

## v1.0.7（2026-09-11）

- 内部整理（E6#87b 文件整理层）：1642 行主视图按 12 档拆为 24 件同名夹 + 591 行样式按分节拆三件 + 会话/设置/控制面板/上下文各归同名夹——功能与界面零变化

## v1.0.6（2026-09-10）

- README 展示区封面随包（E6#70a）：说明区静态图经 assetBase 解析 linkdesk:// 包内资产真加载

## v1.0.5（2026-09-09）

- 图标身份分工（E6#69 三图模型）：icon → resources/icon-bar.svg（Type-1 线稿剪影，仅图标栏用）；marketIcon → resources/icon.svg（Type-2 彩色身份图，市场列表/详情/标签栏同用）；整幅封面迁入 README 展示

## v1.0.4（2026-09-09）

- 小图标 icon.png → resources/icon.svg 彩 SVG 品牌块（E6#68b 现存非 SVG 清零）——图标栏/侧栏行显青绿数据帧色块，市场展示位仍用 cover.svg

## v1.0.3（2026-09-09）

- 声明 marketIcon=resources/cover.svg——市场详情展示位显「串口的窗」封面（E6#67 双图标样本：图标栏仍读 icon.png 小图标，市场读 marketIcon 展示图）

## v1.0.2（2026-09-08）

- 状态栏组件随包自声明——appearsIn.statusBar 改路径字符串（E6#62d）——SDK 编 statusBar.bundle.js 进 .linkdesk-plugin，池按 dist 消费，灯/口数不再编入壳池

## v1.0.1（2026-09-07）

- 状态栏组件存在性改声明式（appearsIn.statusBar）——打包版修复连接灯/口数实时渲染

## v1.0.0（2026-07-19）

- 初始发布
- 串口工具栏
- CM6 接收区 + Monaco 发送栏
- 侧栏设置（时间戳/编码/换行符）
