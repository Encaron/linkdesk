; ============================================================================
; LinkDesk 安装器 · 覆盖安装方向守卫（E6#42d 反向，2026-09-12）
; ============================================================================
;
; 【为什么有这份文件】用户 2026-09-12 实测：0.1.47 装着时双击 0.1.48 的安装包 ——
;   **没有任何「检测到旧版本」提示，直接装**。逐份读 electron-builder 的 NSIS 模板确认
;   这是设计如此：整棵模板树里 `version` 只出现在两处 —— `common.nsh:4` 的 BrandingText
;   （纯外观）与 `include/installer.nsh:125` 的 `WriteRegStr … DisplayVersion`（**只写、
;   从不读、从不比对**）⇒ **NSIS 默认静默允许降级覆盖**：会把已装的新版换成旧版，用户
;   全程看不到一句提醒 —— 「失败不出声」那一类。
;
; 【本守卫做什么】用户 2026-09-12 拍板口径：**更旧和同版都问一句，默认取消**。
;   覆盖安装前比一下「已装版本」vs「本安装包版本」：
;     · 本包更新（1）→ 放行，一个字都不多问（正常升级不受影响）
;     · 本包同版（0）→ 问「已安装相同版本，要重新安装吗？」
;     · 本包更旧（2）→ 问「已装的是更新的 X，要换成更旧的 Y 吗？」
;   用户选「否」（默认按钮）⇒ 安装器退出，**一个字节都没动**。
;
; 【比较用谁】NSIS 自带的 `${VersionCompare}`（标准头 `WordFunc.nsh`，本机 NSIS 3.0.4.1
;   实测存在）—— **不自己写版本比较器**。返回 0 = 同版 / 1 = 第一参数更新 / 2 = 第二参数更新。
;
; ⚠️ 【单一真值源】`src/core/utils/plugin/semverUtils.ts` 的 `updateTargetDirection()` 是
;   **插件更新链路**的判断，NSIS 里跑不了 TypeScript ⇒ 本安装器**不搬运、也不另写一份那个
;   判断**，只保留上面那三行策略。**主软件更新器的方向判定必须继续只走 TS 那一处**
;   （E6#57.x）；安装器这层是「覆盖前问一句」的第二道闸，本身不参与方向决策。
;
; ⚠️ 【静默安装】（`/S`，自动更新与 CI 走这条）：**不弹窗**（没有人点会挂死）⇒ 按「用户
;   取消了」办，设退出码 **1602**（= ERROR_INSTALL_USEREXIT）后退出。自动更新的方向永远是
;   升级 ⇒ 不受影响。真要人工降级 ⇒ **先卸载再装**（卸载会删掉那条注册表键 ⇒ 无旧版可比
;   ⇒ 放行）—— 这是刻意留的正路，不是漏洞。
;
; ⚠️ 【提权重启的二次进入】按「所有用户」安装时 Windows 会以管理员身份**重启一次安装进程**，
;   `.onInit` 会跑两遍。本守卫**只在非内层实例弹窗**（内层那遍是外层已问过之后的重入），
;   否则会连问两遍。外层选「否」时在提权之前就 `Quit`，内层根本不会被拉起来。
;   ⚠️ **本机实测覆盖面**：用户机器 = per-user 安装（`D:\01link\LinkDesk`，HKCU）⇒ 走的是
;   无提权路径；per-machine 那条路径**尚未实机确证**，清单里已记明，不许写成「应该没问题」。
;
; 【挂点】electron-builder 的 `customInit`（`templates/nsis/installer.nsi:79-81`）—— 在
;   `initMultiUser`（已认到旧安装位置、已定安装模式）之后、画界面之前 ⇒ 拦得住且还没动文件。
; 【本文件位置】electron-builder 的约定：`buildResources/installer.nsh` 自动 include
;   （`NsisTarget.js:600` `packager.getResource(this.options.include, "installer.nsh")`；
;   `:662` `scriptGenerator.build() + originalScript` ⇒ 本文件先于 `installer.nsi` 展开）。
;   ⇒ **不需要动 `electron-builder.yml`**（也就不和后头 5.3 的右键注册抢同一份配置）。
; ============================================================================

!include "WordFunc.nsh"

; 🔴 这两个 Var 必须包在 `!ifndef BUILD_UNINSTALLER` 里 —— **2026-09-12 实测踩过**：
;   electron-builder 会拿同一个 installer.nsi **再编一遍**生成卸载程序（命令行带
;   `-DBUILD_UNINSTALLER`），而那一遍**不插 `customInit`**（`installer.nsi:63` 的 `!else`
;   分支）。于是这两个变量成了「声明了但没人用」⇒ makensis 报
;   `warning 6001: Variable "…" not referenced or never set, wasting memory!`；
;   而 electron-builder 是**按「警告即错误」**编的（`-WX`）⇒ **整个打包中止**，
;   一行 `.exe` 都不出。**删掉这层 `!ifndef` 就会重现**——变量可见性必须与宏的可见性对齐。
!ifndef BUILD_UNINSTALLER
  Var lkInstalledVersion
  Var lkVersionCmp
!endif

!macro customInit
  ; —— 先找「有没有旧安装」——两个根都读：electron-builder 自己的 initMultiUser 也是
  ;    HKLM + HKCU 都查（per-machine / per-user 两种装法都要认得出）。
  ;    两个根都读不到 ⇒ 全新安装（或刚卸载过）⇒ 放行。
  ;
  ;    已装版本的来源 = 卸载项的 `DisplayVersion`。核过 electron-builder 每次安装都会写它
  ;    （include/installer.nsh:125，无条件写），现成的、不用新造。⚠️ 万一某条更老的安装
  ;    路径没写过它 ⇒ 读不到 ⇒ 当「无旧版」放行（宁可不拦，不许误拦）。
  ReadRegStr $lkInstalledVersion HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  ${If} $lkInstalledVersion == ""
    ReadRegStr $lkInstalledVersion HKLM "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  ${EndIf}

  ${If} $lkInstalledVersion != ""
    ; $lkVersionCmp：0 = 同版 / 1 = 本包更新 / 2 = 本包更旧
    ${VersionCompare} "${VERSION}" "$lkInstalledVersion" $lkVersionCmp

    ${If} $lkVersionCmp != 1
      ${If} ${Silent}
        ; 静默：不弹窗，按「取消」办 —— 让调用方从退出码看出「没装成、且是被拦的」
        SetErrorLevel 1602
        Quit
      ${Else}
        ${IfNot} ${UAC_IsInnerInstance}
          ${If} $lkVersionCmp == 0
            MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "LinkDesk ${VERSION} is already installed. Install it again?  |  已安装相同版本（${VERSION}），要重新安装吗？" IDYES lkVersionGuardAllow
          ${Else}
            MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "LinkDesk $lkInstalledVersion is already installed, which is NEWER than the version you are about to install (${VERSION}). Replace the newer version with this older one?  |  已装的是更新的版本（$lkInstalledVersion），要把它换成更旧的 ${VERSION} 吗？" IDYES lkVersionGuardAllow
          ${EndIf}
          ; 落到这里 = 用户点了「否」（默认按钮）⇒ 不装，什么都不动
          SetErrorLevel 1602
          Quit
          lkVersionGuardAllow:
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
