# 引导器壳（bootstrapper）— 工程说明

件 1a 的产物：把 E 定稿 mockup 装进真实窗口的 **WebView2 宿主**。规格见
[docs/04-软件更新/待抉择池/安装界面自绘/05-实现交接.md §4.2](../../../docs/04-软件更新/待抉择池/安装界面自绘/05-实现交接.md)。
本文件只讲**怎么建、怎么跑、有哪些坑**——界面本身在 `app.html/css/js`（件 1b 安装六屏 ＋ 件 1d 卸载四帧，均从 mockup 直搬；
两套屏共存于同一个 DOM，靠启动参数 `?mode=` 分区，见下）。

## 一、建与跑

```cmd
rem 1) 取 WebView2 SDK（不入仓，见 .gitignore；版本钉在脚本里）
powershell -ExecutionPolicy Bypass -File tools\fetch-sdk.ps1

rem 2) 构建（vswhere→vcvars64→rc→cl），末尾体积门禁 ≤5MB
rem    build.cmd 自己会在 tools\.cache\7zr.exe 缺失时调 fetch-7z.ps1 补（钉 SHA-256）
build.cmd
```

载荷（app-*.7z）**不在**这一步，也不进 `out\`——它由 electron-builder 出（件 3 整合）：

```cmd
npx electron-builder --win -c.win.target=7z -c.directories.output=<出包目录> --publish never
node scripts\build-installer.mjs --exe out\bootstrapper.exe ^
  --payload=<出包目录>\linkdesk-setup-<版本>.7z --out=<出包目录>\linkdesk-setup-<版本>.exe
```

| 运行方式 | 用途 |
|:--|:--|
| `out\bootstrapper.exe` | 正常启动：无边框 780×570 窗口加载 `app.html` |
| `--debug` | 开 DevTools 并自动弹出（默认关闭；顺带开右键菜单） |
| `--uninstall` | **卸载器模式**（件 1d）：无边框 **720×540** 窗口（标题「LinkDesk 卸载」），启动 URL 自动补 `?mode=uninstall` ⇒ 页面走卸载四帧（confirm/running/progress/finish）。同一 exe、同一页面，产品化入口（ARP `UninstallString` 指向本 exe）归件 2b/2d |
| `--preview=<query>` | 把 query 拼到启动 URL 上，供对照/排查直接摆屏：`screen=home\|custom\|progress\|finish\|error\|uac`（`custom` 展开自定义区）、`pct=<0-100>`（进度定格）、`dust=0`（关微尘）、`seed=1`（定序随机数）、`lang=<code>`（页面语言；词条从 `i18n/<code>.json` 取，认不得的值回落 zh-CN）、`langs=a,b`（词条清单，一般不手给——宿主扫目录后自己注入）｜卸载态另有 `screen=un-confirm\|un-running\|un-progress\|un-finish`（**必须与 `--uninstall` 同给**：屏名不在当前模式的白名单里会被**静默拒绝**，症状＝实机整屏空白）与 `keep=0`（卸载完成屏「数据已一并移除」黄徽章态） |
| `--capture=<path.png>` | 页面渲染完成后自行截图存 PNG 并退出（单屏取图口） |
| `--silent`（或 `/S`） | **静默安装**（件 2a）：不建窗、**不碰 WebView2**（运行时缺失也装得上——那是能用界面的问题，不是装不上的问题）。解压 → 校验 → 退出码 0；失败码见 §四。更新链走的就是这条 |
| `--force-run` | 装完把壳拉起来（`ShellExecute` `<安装目录>\LinkDesk.exe`）。对应用户点「运行 LinkDesk」与更新器 `app.relaunch()` 的 `${isForceRun}` 同位 |
| `--dir=<路径>` | 指定安装目录（覆盖默认/已装目录探测）。静默与界面态都认；界面态由 `?dir=` 传给页面 |
| `--log=<路径>` | 把每条**宿主→页面**消息落盘（一行一条 JSON）——进度不靠截图猜，直接对日志断言单调性（`tools\install-test.ps1` 的判据） |
| `LK_FORCE_NO_RUNTIME=1`（环境变量） | 模拟 WebView2 运行时缺失 → 系统对话框＋退出码 3（件 3c 非交互测兜底路径） |

验收辅助脚本（`tools/`，PS 5.1 直跑，**改完 `app.*` 必须先 `build.cmd`**——exe 只从自己所在目录读页面）：

| 脚本 | 用途 |
|:--|:--|
| `window-probe.ps1` | 列顶层窗口：类名/尺寸/标题 |
| `capture.ps1` | 真桌面截图（最小化全部→屏幕拷贝→还原；`-NoMinimize` 供已清场时用） |
| `verify-no-runtime.ps1` | 兜底路径自动验证，断言退出码 3 |
| `mockup-shot.ps1` | 把 mockup 拍成同尺寸 PNG：临时 harness 只去设计注记 + 钉 `.stage` 到 0,0，原文一字不改。默认拍 `E-混合提案.html`（780×570）；`-Mock <path>` 换 mockup（如 E-卸载屏）、`-W/-H` 换画布、`-Scale` 配高 DPI。**自动识别卸载 mockup**：把页面的 `#s-confirm` 当信号，将 harness 用的 `un-` 前缀 id 折回 mockup 自身的 id，并支持 `?keep=0` 徽章态 |
| `cmp-shots.ps1` | 并排对照（左 mockup／右实机＋合成大图），带资产新鲜度守卫。默认六屏 `out\cmp-*.png`（780×570）；`-Uninstall` 切卸载四帧 `out\cmp-un-*.png`（720×540，实机自动带 `--uninstall`）。`-Screen`/`-Screens` 指定屏（⚠️ `powershell -File` 下多值要写成重复参数，`-Screens a,b` 会被当成一个屏名） |
| `interact-test.ps1` | 真键鼠交互验收：拖窗位移断言 / Enter 主按钮 / 下拉＋Esc / ✕ 退出（产物 `out\it-*.png`） |
| `i18n-test.ps1` | 件 1c 词条装载器验收（39 断言）：探针页 iframe 实测 DOM ＋ 1px 图片信标回传（**不靠截图/OCR/时序运气**——靠本地 http.server 的访问日志），C1–C5 五路装载器 ＋ 三张 exe 实跑截图（带出注册表语言／扫目录，跑完复原注册表）；日志 `out\i18n-test.log` |
| `install-test.ps1` | 件 2a 验收（三路，跑**真安装包**）：路 B 静默装（退出码／文件数／字节数与 marker 声明对账）· 路 A 界面态（`--log` 证进度单调不倒退、四段边界到过、收在 100）· 路 C `--force-run` 拉起壳（**按安装目录路径认进程**，不按名字）。⚠️ 三条路的 `--dir` 全指临时目录，**不碰**真装的 LinkDesk；用法 `-Setup <安装包.exe>` |
| `gen-ui-rc.mjs` | 生成 `out\ui.gen.rc` ＋ `out\ui.manifest`：把 `app.html/css/js` 与 `i18n/*.json` 编成 RCDATA（id 3 清单、id 10+ 文件）。**单文件产品态必须**——拼合后的 setup.exe 旁边没有 `app.html` |

## 二、实测事实（2026-10-01，本机 VS2022 Community ＋ WebView2 运行时 140.0.3485.94）

- `out\bootstrapper.exe` = **195,072 字节**（件 1a 壳）；接入 1b 页面前端（消息桥 ＋ 焦点 ＋ 预览开关）后 **209,408 字节**；
  件 1c 加宿主扫目录/带出注册表语言/延迟截图后 **221,696 字节**；件 1d 加卸载模式（窗口尺寸/标题/URL 参数分流）后 **222,208 字节**。
  件 2a 加装真载荷所需的三件（内嵌 `7zr.exe` ＋ 载荷定位/解压/进度 ＋ 内嵌 UI 资源）后 **995,328 字节**（预算 5MB，用掉 19.0%）。
  **C++ 路线据此定案**——C# self-contained 70MB+ 直接出局。
  ⚠️ 件 2a 起页面与词条**同时**有两份去处：`out/app.*`（开发态磁盘，改完 `build.cmd` 即生效）与
  **exe 内的 RCDATA**（产品态，单文件拼合后旁边没有 `app.html`，只能内嵌）。两处都由 `build.cmd` 同笔产出，
  不存在「只更新了一处」——但**改了 `app.*` 忘了 `build.cmd`，产品态仍是旧的**（开发态看不出来）。
- 无边框窗：`cls=LinkDeskInstallerBootstrapper`，窗口矩形 = 客户区 = 780×570（无任何非客户区）。
- **载荷定位（件 2a）**：安装包 = `[壳.exe][marker 64B][app-*.7z]` 直拼。7-Zip **从文件尾**找归档签名，
  所以追加在后面的 7z 能直接解，不必先拷到临时文件。实测：`7zr l linkdesk-setup-0.2.33.exe` 报
  `Offset = 904704+64 = 904768`、`Physical Size = 4910133`。（marker 契约见 §四。）
- **真安装实测（件 2a，真载荷 106,303,059 字节 → 解压后 439,377,123 字节 / 204 个文件）**：
  静默装 5.7s 退出码 0，落位字节与 marker 声明**逐字节相等**；界面态 13 条进度消息、**0 处倒退**、
  收在 100、解压段 11 条真读数。exe 壳 + marker + 载荷 = **107,298,451 字节**。
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
6. 🔴 **PS 5.1 把「弯引号」当定界符**：U+2019（’）视同**单引号**，U+201C/D（“ ”）视同**双引号**——写在单引号串里
   （英文文案 `didn't`、`“Open with LinkDesk”` 之类）会当场把字符串截断，而**报错位置跑到几十行之后**
   （实测报 `AmpersandNotAllowed`，指着一行看着毫无问题的 URL `&`）。`tools/*.ps1` 里含弯引号的断言一律改用**双引号串**；
   改完先 `[System.Management.Automation.Language.Parser]::ParseInput()` 过一遍（0 错才算改对）。
7. 🔴 **工具链两处「静默失配」**（件 1d 验收抓到，已修；同类还会再犯，先查这两处）：
   ① `mockup-shot.ps1` 里 `__W__/__H__` 占位替换**必须排在 `-replace '</body>'` 拼接之前**——排在后面时 harness 拿到的是
   非法 `width:__W__px`，`.stage` 落到样式表兜底 `min(540px, calc(100vh - 120px))` = 420：画布凭空少 120px 高
   （症状：mockup 侧内容整体上移、底部露桌面底色，**看着像设计变了**）。
   ② `cmp-shots.ps1` 的 `PrevQuery` 只认页面当前模式的屏名：卸载态白名单是 `un-*`，发 `screen=finish` 会被 `go()`
   **静默 `return`**（不抛错、不落日志）⇒ 实机侧整屏空白（症状：合成图右半只剩顶栏、左 mockup 正常）。
   凡「实机没渲染」，先对屏名白名单与 `?mode`，再怀疑 CSS。
8. 🔴 **7-Zip 的进度读数在输出被重定向时是拿不到的**（件 2a 实测，**别再试回去**）：7-Zip 26.03 只在挂到**真控制台**时
   才画进度条；`-bsp1`／`-bsp2`／`-bso0/-bso1/-bso2`／`-bb1` 九种组合实测**一律 0 行含 `%`**。
   故进度改用**文件系统实测**：先 `7zr l -slt` 取「路径→大小」清单，解压中轮询目标树，某文件当前大小 == 期望大小即算完成。
   新装与覆盖装都成立（覆盖时大小先不为 0 也无妨，判据是等值不是增量）。
9. **`rc` 把路径里的 `\` 当转义符**：生成的 `out\ui.gen.rc` 里写 `"..\app.js"` 会变 `..pp.js`（`\a` = 响铃），
   报错是 `file not found`。`tools\gen-ui-rc.mjs` 因此把所有反斜杠**翻倍**输出。
10. **单文件产品态没有 `app.html` 给宿主读**：第一次跑界面态测试时空屏且无日志——因为拼合后的 setup.exe 旁边什么都没有。
   宿主 `ResolveUiRoot()` 因此分两态：exe 旁有 `app.html` ⇒ 用磁盘那份（开发态）；没有 ⇒ 把内嵌 RCDATA 摊到
   `%TEMP%\linkdesk-bootstrapper-<pid>\` 再映射（产品态）。**「实机白屏 + 无日志」先查这条。**

## 四、宿主契约（件 1b 起会用到）

- 页面根目录：**开发态** = exe 所在目录（`out/`，`app.html`、`app.css`、`app.js`、`i18n/` 都在这一层）；
  **产品态**（单文件安装包旁边没有 `app.html`）= 内嵌 RCDATA 摊到 `%TEMP%\linkdesk-bootstrapper-<pid>\`。
  两态由 `ResolveUiRoot()` 判（文件头注释与坑 10）。构建脚本 `build.cmd` 同笔把页面拷进 `out\` **并**编进 exe。
- **载荷 marker（64 字节，与 `scripts/build-installer.mjs` 的共用契约，改一侧必改另一侧）**：
  `magic[16]="LKDESK-PAYLOAD-1"` ＋ `uint64 packed` ＋ `uint64 unpacked` ＋ `char version[32]`（ASCII，补 NUL）。
  `static_assert(sizeof(PayloadMark) == 64)` 钉着。定位时**从文件尾倒着**找，且必须同时满足三样：
  magic 命中 ＋ `marker末 + packed == 文件大小` ＋ 紧随其后是 6 字节 7z 签名 `37 7A BC AF 27 1C`。
  最后一条不是多余的——**壳自己的 `.rdata` 里就存着 magic 字面量**，只认 magic 会认到自己身上。
- **退出码（静默态）**：0 成功 · 4 拿开发壳当安装包跑（无载荷）· 5 解压失败 · 6 解压后校验没找到 `LinkDesk.exe`。
  3 = 缺 WebView2 运行时（界面态专用）。
- **宿主 → 页面消息**（`PostWebMessageAsJson`，**必须在 UI 线程调**；工人线程用 `WM_APP+1..4` 转一手）：
  `{"type":"progress","pct":0-100}`（只前进不倒退）· `{"type":"install-error","code","msg"}` ·
  `{"type":"install-canceled"}` · `{"type":"install-done"}`。
- **界面态安装跑在宿主进程里**（工人线程解压 → 消息回报进度），**不是**页面自己调后端：
  `?autoinstall=1` 只是让页面自动点一下「立即安装」（测试/更新链用），真实路径同一条。
- **词条与语言（件 1c）**：源在 `build/installer/i18n/*.json`（一语言一文件，`_meta.code/label` 供下拉标签），`build.cmd`
  拷进 `out\i18n\`；宿主扫该目录得清单 → 注入 `?langs=`，上次语言从注册表 `HKCU\Software\LinkDesk\Installer → Language`
  带出 → `?lang=`（写侧归 2b）。**加语言 = 加一个文件，零代码**；`_` 开头的文件名是预留位，不进清单。
  页面回落链：当前语言 → zh-CN → 标记里的中文原文（含 `app.js` 里段头那一组）→ key 名。
  ⚠️ 页面自己的标记属性名**别叫 `data-i18n`**——`applyI18n` 扫的就是它（见 `app.js` 注释里那次整页消失的事故）。
- WebView2 用户数据夹 = 页面根下的 `.wv2data`（安装器不落地用户配置）。产品态页面根在 `%TEMP%`，
  退出时 `RemoveTree()` 连同它一起清掉；**开发态 `out/.wv2data` 需手工清**。
- 窗口内没有任何系统装饰，**拖拽区、关闭按钮、Esc/Alt+F4 分流全部要在页面/宿主里自管**（1b 与 2c 的活）。
- 页面 → 宿主消息桥（`postMessage` 一行 JSON）：`{"type":"drag"}`（拖窗）/ `{"type":"close"|"exit"|"install-done"}`（关窗）/
  `{"type":"install-start"|"browse-dir"|"cancel"|"open-license",...}`（件 2 用，先通后接）。
  件 1d 加卸载侧：页面发 `{"type":"uninstall-start"}`（确认屏「卸载」）/ `{"type":"un-run"}`（运行中屏「关闭并继续」）/
  `{"type":"un-cancel"}`（确认屏「取消」）/ `{"type":"uninstall-done"}`（完成屏「完成」）；宿主已在关窗名单里收 `uninstall-done`，
  **细粒度分流（回滚、置灰吞 Alt+F4、按阶段分派）归件 2c**。
- **键盘焦点**：WebView2 不自动接手顶层窗焦点，`WM_SETFOCUS` → `MoveFocus(PROGRAMMATIC)`（controller 建好前的那次会落空，
  建好后在前台再补一次）——否则 Enter/Tab/Esc 全部进不到页面。
