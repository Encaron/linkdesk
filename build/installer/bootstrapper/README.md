# 引导器壳（bootstrapper）— 工程说明

件 1a 的产物：把 E 定稿 mockup 装进真实窗口的 **WebView2 宿主**。规格见
[docs/04-软件更新/待抉择池/安装界面自绘/05-实现交接.md §4.2](../../../docs/04-软件更新/待抉择池/安装界面自绘/05-实现交接.md)。
本文件只讲**怎么建、怎么跑、有哪些坑**——界面本身在 `app.html/css/js`（件 1b 从 mockup 直搬）。

## 一、建与跑

```cmd
rem 1) 取 WebView2 SDK（不入仓，见 .gitignore；版本钉在脚本里）
powershell -ExecutionPolicy Bypass -File tools\fetch-sdk.ps1

rem 2) 构建（vswhere→vcvars64→rc→cl），末尾体积门禁 ≤5MB
build.cmd
```

| 运行方式 | 用途 |
|:--|:--|
| `out\bootstrapper.exe` | 正常启动：无边框 780×570 窗口加载 `app.html` |
| `--debug` | 开 DevTools 并自动弹出（默认关闭；顺带开右键菜单） |
| `--capture=<path.png>` | 页面渲染完成后自行截图存 PNG 并退出（件 1b「mockup vs 实机」并排对照取图口） |
| `LK_FORCE_NO_RUNTIME=1`（环境变量） | 模拟 WebView2 运行时缺失 → 系统对话框＋退出码 3（件 3c 非交互测兜底路径） |

验收辅助脚本（`tools/`）：`window-probe.ps1`（列顶层窗口：类名/尺寸/标题）、`capture.ps1`（真桌面截图）、
`verify-no-runtime.ps1`（兜底路径自动验证，断言退出码 3）。

## 二、实测事实（2026-10-01，本机 VS2022 Community ＋ WebView2 运行时 140.0.3485.94）

- `out\bootstrapper.exe` = **195,072 字节**（预算 5MB，用掉 3.7%）。**C++ 路线据此定案**——C# self-contained 70MB+ 直接出局。
- 无边框窗：`cls=LinkDeskInstallerBootstrapper`，窗口矩形 = 客户区 = 780×570（无任何非客户区）。
- Per-Monitor V2：`GetProcessDpiAwareness` 实测返回 awareness=2；窗口按 `逻辑像素 × dpi/96` 建，并响应 `WM_DPICHANGED` 守回 780×570 逻辑尺寸。
- 页面加载：`SetVirtualHostNameToFolderMapping`（`installer.local` → exe 目录）+ `https://installer.local/app.html`，`NavigationCompleted` 返回 success=1。
- 缺运行时：系统对话框（中文警告＋官方下载按钮）＋退出码 3。

## 三、坑（都花过时间，别重踩）

1. 🔴 **控制器必须全局持有。** `ICoreWebView2Controller` 一旦释放，WebView2 连同浏览器实例即被销毁，
   此后 `NavigationCompleted` 永不触发（现象：环境→控制器回调都正常，导航无任何回调、无 ProcessFailed）。
   本文件用 `g_controller` 常驻持有。
2. **COM 回调签名分三类**，写错就是纯虚函数未实现：完成回调 `Invoke(HRESULT, ArgT)`（`CapturePreview` 是 `Invoke(HRESULT)`）、
   事件 `Invoke(sender, args)`、`ExecuteScript` 完成回调 `Invoke(HRESULT, LPCWSTR)`。模板参数写完整指针类型。
3. **截图：`PrintWindow` 对 WebView2 内容无效**（DirectComposition，拿到全黑）。
   而引导器是普通权限进程，宿主窗口提权时 `SetWindowPos(HWND_TOPMOST)` 被 UIPI 静默丢弃（返回 True 无效果）。
   真桌面截图只能走 `capture.ps1` 的「最小化全部 → 屏幕拷贝 → 还原」；页面自身图象用 `--capture`。
4. **编码**：`cmd.exe` 按 OEM 代码页解析 `build.cmd` → 该文件保持 **ASCII-only**；
   PowerShell 5.1 对无 BOM 的 UTF-8 `.ps1` 按 ANSI 读，中文注释会炸成语法错误 → `tools/*.ps1` **必须带 BOM**。
5. **运行时检测**读 `Microsoft\EdgeUpdate\Clients\{F3017226-...}` 的 `pv`（HKLM WOW6432Node / HKLM / HKCU 三路）；
   该键的 `pv=0.0.0.0` 视为未安装。注意路径 `wstring` 必须活过整个检测过程（临时对象 `.c_str()` 会变悬垂指针，曾误报「未安装」）。

## 四、宿主契约（件 1b 起会用到）

- 页面根目录 = **exe 所在目录**（`out/`）：`app.html`、`app.css`、`app.js`、`i18n/` 都在这一层，构建脚本负责拷进去。
- WebView2 用户数据夹 = `out/.wv2data`（安装器不落地用户配置；件 2 收尾应清掉）。
- 窗口内没有任何系统装饰，**拖拽区、关闭按钮、Esc/Alt+F4 分流全部要在页面/宿主里自管**（1b 与 2c 的活）。
