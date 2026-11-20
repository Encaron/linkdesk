# 更新链安装目录分叉——静默更新永远落默认目录

> **状态**：🟢 已修复（2026-11-20）· 📦 **已归档（2026-11-20）** · ⏳ **未发版**（随壳攒批；当前 dev 版本 **0.2.57**）
> **归属**：04 软件本体（壳更新链 ＋ 安装器引导器），**单仓**——不涉及插件仓与 npm 轴
> **用户原话**：「linkdesk更新机制是不是有问题？比如我在d盘装的linkdesk，但是点更新，覆盖在了C盘，d盘仍旧是那个旧的……最后两个版本linkdesk」

## 一、症状（用户实机）

1. 软件装在 `D:\01link\linkdesk`（界面态安装、手选目录）。
2. 在软件里点「检查更新 → 安装」：新版本被装到 **`C:\Users\<用户>\AppData\Local\Programs\linkdesk`**，D 盘原目录**一个文件都没动** ⇒ 两个版本并存。
3. 外部 AI 调 `linkdesk` / `linkdeskctl` 命中的是 D 盘旧版（PATH 指向 D）⇒ 表现为「总是启动 0.2.40」。
4. 应用和功能里只看到一份（ARP 键被覆盖成 C 盘那份），D 盘那份成**无卸载入口的孤儿**。

## 二、根因（三条，合起来才构成分叉）

### 2.1 P0 · 更新链拉起安装器时**不带安装目录**（直接原因）

[electron/services/update-install.ts:195](../../../../electron/services/update-install.ts#L195)：

```ts
app.relaunch({ execPath: installerPath, args: [SILENT_SWITCH, FORCE_RUN_SWITCH] });
// 实际 = ['/S', '--force-run']——没有 --dir
```

`git show v0.2.53:electron/services/update-install.ts` 同样没有 ⇒ **不是后来改坏的**，从更新链上线起就缺。

### 2.2 P1 · 引导器静默路径不认已装目录（结构原因）

[build/installer/bootstrapper/main.cpp:1013](../../../../build/installer/bootstrapper/main.cpp#L1013)：

```cpp
if (g_installDir.empty()) g_installDir = DefaultInstallDir();   // → %LOCALAPPDATA%\Programs\linkdesk
```

而**界面态**（双击安装包）是先反推旧目录的（同文件 `:1270-1273`）：

```cpp
std::wstring existing = FindInstalledDir();
g_installDir = existing.empty() ? DefaultInstallDir() : existing;
```

⇒ 手动安装会覆盖原处、点更新却另起一份。

### 2.3 P2 · PATH 标记与路径无关（把分叉放大成「AI 启动旧版」）

[syswrite.cpp:229](../../../../build/installer/bootstrapper/syswrite.cpp#L229)：`PathAdded` 标记只要非空就整段跳过——**不比较标记里的目录与本次安装目录**。于是 C 盘那份安装不写 PATH，PATH 永远停在 D 盘（甚至 D 盘删掉后仍是死路径）。

### 2.4 为什么现有验收没抓到：契约写反了

[docs/04-软件更新/已落地/安装界面自绘/06-任务清单.md:119](../../已落地/安装界面自绘/06-任务清单.md) 写着：

> ③**静默路不反推目录是设计**（`RunSilentInstall` 无 `--dir` 落默认目录——**更新链永远带 `--dir`**，反推是界面态的活）

**「更新链永远带 `--dir`」从未实现**。验收脚本自己手动传了 `--dir`（同文件 `:118`），单测又把参数**钉死**成 `['/S','--force-run']`（`electron/services/update-install.test.ts:251`）⇒ 测试与生产不同形状，两处一起把洞焊死。

### 2.5 后果链

静默装到默认目录 → 旧目录不清理 → ARP 键名是固定 GUID（`syswrite.cpp:58`，一次安装覆盖同一条）→ 旧安装变孤儿 → PATH 因 P2 不动 → 外部 AI / 终端命中旧版。

## 三、修复（三处一起，缺一不完整）

| 层 | 改动 | 文件 |
|:--|:--|:--|
| **P0** | 更新腿拉起安装器时补 `--dir=<当前 exe 所在目录>`（`path.dirname(app.getPath('exe'))`），单测改为断言「必须含 --dir」 | `electron/services/update-install.ts` ＋ `.test.ts` ＋ `electron-mock.ts` |
| **P1** | 静默路径在**没有 `--dir`** 时先 `FindInstalledDir()`（ARP 反推），都没有才落 `DefaultInstallDir()` | `build/installer/bootstrapper/main.cpp` |
| **P2** | `AddToPath` 改成**路径敏感**：标记与本次目录相同才幂等；换目录时摘掉「上次自己加的段」与「ARP 旧安装目录」再追加，备份同步改成摘完的原值（卸载不复活旧目录） | `build/installer/bootstrapper/syswrite.cpp` ＋ `syswrite.h` |

> 🔴 **P0 单独上线不够**：用户从 0.2.53（或更旧）升级时，拉起新安装器的仍是**旧版更新器**（不带 `--dir`）⇒ 必须靠 P1 兜住这次过渡。
> 🔴 **P2 治的是存量机器**：已经分叉过的机器，标记指向旧目录；只在 P0/P1 修好之后的新安装才会写对。

## 四、判据与验收

1. **单测**：`update-install.test.ts` 拉起参数 = `['/S', '--force-run', '--dir=<exe 目录>']`，且**不含** `--updated`。
2. **编译**：`build/installer/bootstrapper/build.cmd` 通过（cl 编译 + 5MB 体积门）。
3. **机械门**：`npm run check` 全绿。
4. **真机（待用户/后续发版批）**：
   - 旧版（自定义目录）→ 点更新 → 新版本**落在原目录**，不产生第二份；
   - 换目录安装 → PATH 只剩一份且指向新目录；卸载 → 旧目录段不复活；
   - 无 ARP + 无 --dir 的静默安装（手工 `/S`）→ 落默认目录（旧行为保留）。
   - ⚠️ **静默安装验收必须用 `cmd /c`（或批处理）拉起**：PowerShell `Start-Process -Wait` 在没有控制台时会传入无效 stdin 句柄，引导器的 7zr 子进程 `CreateProcess` 失败 ⇒ **退出码 5**（实测 2026-11-20，两次复现；同一安装包用 `cmd /c` 拉起即 `EXIT=0`）。产品链路不受影响——更新器走 `app.relaunch`，不经过 `Start-Process`。

## 五、发版去向

- ⏳ **未发版**；CHANGELOG `v0.2.57` 记一条 `fix`。
- 安装器（bootstrapper）改动**只有出安装包才生效** ⇒ 必须随壳发版，不能只发 npm/插件。
- 发版前按 [发布清单](../../../06-发布管理/发布清单.md) §一核对「跳过版本累计摘要」。

## 六、给同事 AI 的交接

- **与 Marketplace-Store 任务系列无代码冲突**：本档只碰 `electron/services/update-install.*` 与 `build/installer/bootstrapper/*`；市场系列碰 `src/`、插件仓、SDK 文档。
- **唯一交点** = `package.json` / `CHANGELOG.md` 的版本登记。本笔按 PATCH 规则 bump 到 **0.2.57**；若市场系列同一时间要 bump，以**后提交者重新读当前值再 +1**为准，⛔ 不要并行改同一行。
- **本机基线（2026-11-20 已修好）**：`D:\01link\linkdesk` = **0.2.57**（本地构建的安装包静默装入，`--dir=D:\01link\linkdesk`）；ARP `DisplayName=LinkDesk 0.2.57`／UninstallString 指 D；开始菜单与桌面（重定向到 `D:\360MoveData\Users\fengy\Desktop`）快捷方式均指 D；用户 PATH 里 `linkdesk` 段只剩 D 一条；C 盘半截装与 C 盘残留已清；`where linkdesk` → `D:\01link\linkdesk\LinkDesk.exe`。⚠️ 这份是 **dev 树构建的待发版**（含 Marketplace 系列已提交的 SDK 0.1.94），将来点更新会从 GitHub 正常拉取下一个**高于 0.2.57** 的正式版并原地装回 D（P1/P0 的端到端验收留到那次发版做——同版本静默重装会被版本守卫 1602 拦下，今天无法在此机复测）。
