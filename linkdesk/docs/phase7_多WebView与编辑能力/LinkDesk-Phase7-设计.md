# Phase 7 — 多 WebView 与编辑能力

> 2026-07-22 Encaron 定稿。新路线图：Phase 6 底层加固完成后，Phase 7 做两件事——**多 WebView 进程隔离（架构）** + **第一批消费者插件（功能）**。
>
> **Phase 7 是 LinkDesk 从"外壳"变成"通用容器"的关键里程碑。** Phase 5 建了注册表体系（能注册），Phase 6 建了运行时安全（不崩），Phase 7 建进程隔离（插件互不影响）+ 第一个真正的非终端消费者插件（文件树）。

---

## 一、为什么多 WebView 放在 Phase 7

### 1.1 前置条件

| 前置 | Phase | 状态 |
|------|:--:|:--:|
| ErrorBoundary 全覆盖 | P6a | 安全气囊就位——多 WebView 之前的最后一道单线程防线 |
| 终端代码干净 | P6b | SerialContext 已迁出、术语已迁移——多 WebView 的 IPC 切面能画清楚 |
| FileService / WorkspaceService | P6c | 文件树的基础设施已就绪——多 WebView 后文件树直接消费 |

**为什么不是 Phase 6：** P6 的终端归一化必须先做完——SerialContext 还在 core/ 里时画 IPC 切面，切错了 P7 还要再改。

### 1.2 自由度原则——广度 vs 步骤

> Encaron 定调：多 WebView 不影响插件**能做什么**（广度自由度），只影响**做一件事要几步**（步骤自由度）。

```
单 WebView（Phase 1-6）：
  插件想读串口状态 → useSerialContext() → 一行 import，直接用

多 WebView（Phase 7+）：
  插件想读串口状态 → IPC 请求 → 壳返回状态 → 三行桥接代码
  → 本质是 AI 多打几个字。不是能力变少，是路径变长。
```

**AI 负责写 IPC 模板代码——对人不增加负担。** Phase 7 会建 IPC 代码生成模板：声明"我需要读串口状态"→ AI 生成对应的 IPC 调用。人看到的仍然是 `const status = useSerialContext()`——Hook 内部做了 IPC 还是直接 import，调用方不感知。

**所以多 WebView 的代价是可接受的——换来的安全是进程级隔离。** 对标 VS Code Extension Host：扩展崩了主窗口正常。LinkDesk Phase 7 后：插件崩了只崩自己的 WebView，其他插件不受影响。这是目前单 WebView + ErrorBoundary 做不到的。

---

## 二、Phase 7 四层（7a/7b/7c/7d）

### 7a — 多 WebView 核心（~400 行）

> **进程隔离。** 对标 VS Code Extension Host。每个插件独立 WebView → 独立 JS context → 崩了只崩自己。

| # | 任务 | 行数 |
|:--:|------|:--:|
| 1 | Tauri v2 multi-WebView 配置 | +50（Rust） |
| 2 | IPC 桥接层——核心服务代理（Config/Command/Menu/Events） | +150 |
| 3 | 插件 WebView 生命周期管理（创建/销毁/重载） | +100 |
| 4 | 现有插件迁移（terminal / marketplace / settings） | +100 |

**详情见：** [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md)

### 7b — 文件树 + 编辑（~500 行）

> **第一个非终端消费者插件。** 消费 Phase 6 的 FileService + WorkspaceService。

| # | 任务 | 来源 |
|:--:|------|:--:|
| 5 | 文件树视图（📁 图标栏 → 侧栏/标签页，MenuId.FileContext 右键） | 旧 P6a |
| 6 | 文件关联（FileAssociationService + contributes.fileAssociations） | 旧 P6a |
| 7 | Monaco JSON 编辑器标签页（打开 settings.json / keybindings.json） | 旧 P6a |
| 8 | 系统文件拖入 + Ctrl+Shift+T + 文件树键盘操作（F2/Delete/Ctrl+XCV） | 旧 P6a |
| 9 | 文件搜索（Ctrl+Shift+F）+ 多选/批量 + 编码检测 | 旧 P6b |
| 10 | Settings Editor JSON schema 自动补全 + 多工作区 | 旧 P6b |
| 11 | 文件图标主题 + 文件装饰器框架 | 旧 P6b |

**详情见：** [LinkDesk-Phase7-文件树与编辑.md](./LinkDesk-Phase7-文件树与编辑.md)

### 7c — 主题/语言引擎（~200 行）

> **让主题和语言成为一等公民插件类型。** 消费 Phase 3 ThemeEngine + Phase 2 i18next。

| # | 任务 | 来源 |
|:--:|------|:--:|
| 12 | 主题系统插件化（ThemeRegistry + contributes.themes + 三层退路） | 旧 P6c |
| 13 | 语言系统插件化（LanguageRegistry + contributes.languages + 两层退路） | 旧 P6c |
| 14 | 主题浏览器 UI（Ctrl+K Ctrl+T——搜索/预览/即时切换） | 旧 P6c |
| 15 | 产品图标主题 + 插件资源访问 API | 旧 P6c |

**详情见：** [LinkDesk-Phase7-主题语言引擎.md](./LinkDesk-Phase7-主题语言引擎.md)

### 7d — Profile + 激活 + 抛光（~500 行）

> **插件生态完整性。** Profile 决定谁参与游戏，activationEvents 决定什么时候加载。

| # | 任务 | 来源 |
|:--:|------|:--:|
| 16 | Profile 系统（ProfileService + 五维验证） | 旧 P6d |
| 17 | activationEvents（按需激活）+ extensionDependencies | 旧 P6d |
| 18 | 齿轮菜单完整版 + 输出面板 UI | 旧 P6d |
| 19 | 终端会话持久化（消费 FileService） | 旧 P6d |
| 20 | 欢迎页集成 + 标题栏 ☰ + Workspace 导入导出 | 旧 P6e |
| 21 | 通知系统全功能（进度条/过滤/Notification Center） | 旧 P6.5a |
| 22 | 动态 StatusBarItem + 插件 i18n + Toggle 动态标题 | 旧 P6.5b |
| 23 | contributes.icons + ☰ 完整版 + V2 配置导入 | 旧 P6.5c |

**详情见：** [LinkDesk-Phase7-Profile与激活.md](./LinkDesk-Phase7-Profile与激活.md) + [LinkDesk-Phase7-壳完善与抛光.md](./LinkDesk-Phase7-壳完善与抛光.md)

---

## 三、Phase 7 不做的东西

| 不做 | 理由 | 以后 |
|------|------|:--:|
| 卡片工作台 / 卡片渲染 | 纯消费者 → Phase 8 | P8 |
| OLED | 独立插件 → Phase 8 | P8 |
| 完整代码编辑器（Go to Definition / 重构 / IntelliSense） | 属于具体插件——不是基础设施 | P8+ |
| 文件搜索替换（replace in files） | 独立命令系统功能 | P8+ |
| 设置同步 | 需要后端 | 远期 |
| Debug 断点调试 | 需要调试协议 | 远期 |

---

## 四、Phase 6→7 承接链

```
Phase 6 建好                          Phase 7 消费
─────────────────────                ─────────────────
ErrorBoundary 全覆盖                  文件树侧栏崩了 → fallback，不白屏
Rust 心跳 + 内存监控                  多 WebView 插件死循环 → 心跳检测 + 可单独重载
终端 = 干净的参考实现                  文件树/主题浏览器以终端为模板——不复制坏模式
FileService                          文件树读目录 + Monaco 读文件 + 会话持久化写文件
WorkspaceService                     文件树根路径 + Workspace scope 设置
DialogService                        Profile 切换确认 / 插件卸载确认（不再用 window.confirm）
Chord + keybindings                  文件树键盘操作 (F2/Delete/Ctrl+XCV)
                                     主题浏览器 Ctrl+K Ctrl+T
                                     命令面板 Ctrl+Shift+P（模糊搜索后更可用）
CoreEvents                           文件树监听 onDidChangeFileSystem
                                     WorkspaceService → onDidChangeWorkspaceFolders
```

---

## 五、执行顺序

```
Phase 6 全部完成
  → 7a 多 WebView 核心（架构隔离先就位）
    → 7b 文件树 + 编辑（第一个消费者——验证多 WebView 底座）
      → 7c 主题/语言引擎（第二个消费者——验证插件化引擎）
        → 7d Profile + 激活 + 抛光（生态完整性 + 体验打磨）
```

**为什么先多 WebView 再写新插件：** 在单 WebView 里写的插件，到多 WebView 要改 IPC 桥接——双倍工作量。反过来：底座先就位，新插件一出生就隔离。

**7d 最后：** Profile 系统依赖"多个插件存在"才有意义——7b/7c 的插件是它的第一批管理对象。

---

## 六、验证标准

### 7a — 多 WebView

```
terminal 插件独立 WebView → render() 抛异常 → 只有终端崩了
  → 设置标签页正常 → 插件市场正常 → 文件树正常
  → ErrorBoundary fallback 显示 "「终端」已崩溃 [重试]"
  → 点 [重试] → 终端 WebView 重载

终端写 while(true){} → Rust 心跳 2s 超时
  → 原生对话框 "应用无响应" → 点 [刷新] → 软件重启
  （Phase 7 多 WebView 后可以只重载死循环的 WebView——不再需要重启整个软件）
```

### 7b — 文件树

```
打开文件夹 → 文件树渲染
F2 改名 → 标签标题同步更新
Delete → 移到回收站
Ctrl+Shift+F → 跨文件搜索
双击 .json → Monaco JSON 编辑器打开
```

### 7c — 主题/语言

```
Ctrl+K Ctrl+T → 主题浏览器 → 搜索 → ↑↓预览 → Enter 切换
卸载所有主题插件 → 回退到 index.css :root 变量
卸载所有语言插件 → t("终端") → 返回 "终端"（key = 中文原文）
```

### 7d — Profile + 抛光

```
切 Profile → 五维验证：插件列表/settings/主题/语言/布局 全变
通知进度条 + Notification Center + Do Not Disturb
keybindings.json 修改 → 即时生效
```

---

## 七、相关文档

- [LinkDesk-Phase7-实施顺序.md](./LinkDesk-Phase7-实施顺序.md) — 严格逐步执行计划
- [LinkDesk-Phase7-多WebView架构.md](./LinkDesk-Phase7-多WebView架构.md) — 进程隔离 + IPC 桥接
- [LinkDesk-Phase7-文件树与编辑.md](./LinkDesk-Phase7-文件树与编辑.md) — 文件树 + 编辑体验
- [LinkDesk-Phase7-主题语言引擎.md](./LinkDesk-Phase7-主题语言引擎.md) — 主题/语言插件化 + 浏览器
- [LinkDesk-Phase7-Profile与激活.md](./LinkDesk-Phase7-Profile与激活.md) — Profile + 激活链路
- [LinkDesk-Phase7-壳完善与抛光.md](./LinkDesk-Phase7-壳完善与抛光.md) — 通知 + 标题栏 + 模糊搜索 + 兼容
- [LinkDesk-Phase6-设计.md](../phase6_底层加固/LinkDesk-Phase6-设计.md) — Phase 7 的前置条件
- [Phase 5.5 ErrorBoundary 增强计划](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md) — 多 WebView 是防线第四层
