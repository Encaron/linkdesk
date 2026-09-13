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
  ; E6#45：附加任务默认值先落（静默安装跳过勾选页 ⇒ 这里给的就是最终值；见 §静默口径）
  !insertmacro lkInitTaskDefaults

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

; ============================================================================
; E6#45：附加任务勾选页 + 右键菜单 / 文件类型关联 / PATH（2026-09-13）
; ============================================================================
;
; 【拍板】用户 2026-09-13 逐项确认（详见 docs/02-Electron架构/E6_插件生态与发布/07-Shell集成与多窗口/03-安装器勾选页与注册表.md）：
;   · 勾选项与默认值照抄 VS Code：文件右键菜单（默认不勾）/ 目录右键菜单（默认不勾）/
;     文件类型编辑器注册（默认勾）/ 添加到 PATH（默认勾）；
;   · **弃用 electron-builder 自带 fileAssociations**（它无条件注册、接不上勾选框）——改本文件手写；
;   · 桌面快捷方式仍由 electron-builder 无条件创建（`createDesktopShortcut: true`）⇒ 本页**不出**该项
;     勾选框（出一个管不住的勾选框 = 骗用户；改成自建快捷方式属额外风险，先不动，已在文档登记）。
;
; 【页挂点】electron-builder 模板的 `customPageAfterChangeDir`（assistedInstaller.nsh:42-43，
;   `!ifmacrodef` 守护）——位置正在「选完安装目录」与 INSTFILES 之间，即 VS Code 附加任务页的同位。
;   **不许**自己写 `Page custom` 塞在文件顶层：本文件先于 installer.nsi 展开，页序会跑到最前（页序=脚本序）。
;   静默安装（/S，自动更新走这条）NSIS 直接跳过所有页 ⇒ 勾选值保持 customInit 里给的默认集（§静默口径）。
;
; 【升级口径】用户装过一次后取消勾选，静默升级**不得复活**：customInit 里以注册表现状反推默认值
;   （右键键已在 ⇒ 保持勾；不在 ⇒ 维持默认不勾）。
;
; 【卸载】customUnInstall 反向清理：右键三键整树删 + OpenWithProgids 值删（**不动扩展名键本身**）
;   + ProgId/Capabilities/RegisteredApplications 删 + PATH 段**按标记定位删**（只删自己加的那段）。
; ============================================================================

; 头文件两个 build 都要（LogicLib 的 ${If} / StrFunc 的 ${StrRep} 在 customUnInstall 里也用到）
!include "LogicLib.nsh"

; 一律 per-user 写 HKCU：per-user 安装免提权（本机现状），不碰 HKLM、不需要管理员。
!define LK_CLASSES "Software\Classes"
!define LK_VENDOR  "Software\LinkDesk"
!define LK_PROGID  "LinkDesk.Document"
!define LK_MENUKEY "OpenWithLinkDesk"

; 文件类型关联的 13 个扩展名（#45a 原文清单）
!macro lkAssocExt EXT
  WriteRegStr HKCU "${LK_CLASSES}\${EXT}\OpenWithProgids" "${LK_PROGID}" ""
  WriteRegStr HKCU "${LK_VENDOR}\Capabilities\FileAssociations" "${EXT}" "${LK_PROGID}"
!macroend
!macro lkDelAssocExt EXT
  DeleteRegValue HKCU "${LK_CLASSES}\${EXT}\OpenWithProgids" "${LK_PROGID}"
!macroend

!ifndef BUILD_UNINSTALLER

  !include "nsDialogs.nsh"

  ; 勾选值（"1"=勾）：customInit 给默认 → 页面 leave 按 UI 覆盖 → customInstall 消费
  Var lkTaskFileMenu
  Var lkTaskDirMenu
  Var lkTaskAssoc
  Var lkTaskPath
  ; 页面控件句柄
  Var lkDlg
  Var lkCtlFileMenu
  Var lkCtlDirMenu
  Var lkCtlAssoc
  Var lkCtlPath

  /** 附加任务页——reflect 勾选值到控件（自定义页在 NSIS 里没有「初值」概念，show 时自己设） */
  Function lkTasksPageShow
    !insertmacro MUI_HEADER_TEXT "选择附加任务" "选择安装程序在此次安装 LinkDesk 时要执行的附加任务。"
    nsDialogs::Create 1018
    Pop $lkDlg
    ${If} $lkDlg == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0u 100% 24u "请选择安装程序在执行 LinkDesk 安装时所要执行的附加任务，然后单击「安装」。"
    Pop $0
    ${NSD_CreateLabel} 0 30u 100% 12u "其他："
    Pop $0

    ${NSD_CreateCheckBox} 10u 44u 100% 12u "将「通过 LinkDesk 打开」操作添加到 Windows 资源管理器文件上下文菜单"
    Pop $lkCtlFileMenu
    ${NSD_CreateCheckBox} 10u 58u 100% 12u "将「通过 LinkDesk 打开」操作添加到 Windows 资源管理器目录上下文菜单"
    Pop $lkCtlDirMenu
    ${NSD_CreateCheckBox} 10u 72u 100% 12u "将 LinkDesk 注册为受支持的文件类型的编辑器"
    Pop $lkCtlAssoc
    ${NSD_CreateCheckBox} 10u 86u 100% 12u "添加到 PATH（重启终端后生效）"
    Pop $lkCtlPath

    ${NSD_SetState} $lkCtlFileMenu $lkTaskFileMenu
    ${NSD_SetState} $lkCtlDirMenu $lkTaskDirMenu
    ${NSD_SetState} $lkCtlAssoc $lkTaskAssoc
    ${NSD_SetState} $lkCtlPath $lkTaskPath

    nsDialogs::Show
  FunctionEnd

  /** leave——UI → 勾选值（silent 不进本函数 ⇒ 保留 customInit 默认集） */
  Function lkTasksPageLeave
    ${NSD_GetState} $lkCtlFileMenu $lkTaskFileMenu
    ${NSD_GetState} $lkCtlDirMenu $lkTaskDirMenu
    ${NSD_GetState} $lkCtlAssoc $lkTaskAssoc
    ${NSD_GetState} $lkCtlPath $lkTaskPath
  FunctionEnd

!endif

!macro customPageAfterChangeDir
  Page custom lkTasksPageShow lkTasksPageLeave
!macroend

; ── 默认值（customInit 里，紧跟既有版本守卫之前——静默安装也走到这里）──
!ifndef BUILD_UNINSTALLER
!macro lkInitTaskDefaults
  ; D2：文件类型编辑器 + PATH 默认勾；右键两项默认不勾
  StrCpy $lkTaskAssoc "1"
  StrCpy $lkTaskPath "1"
  StrCpy $lkTaskFileMenu "0"
  StrCpy $lkTaskDirMenu "0"
  ; 升级口径：右键键已在 ⇒ 保持勾（尊重用户当初的选择）；静默升级不复活用户取消过的项
  ReadRegStr $0 HKCU "${LK_CLASSES}\*\shell\${LK_MENUKEY}" ""
  ReadRegStr $1 HKCU "${LK_CLASSES}\Directory\shell\${LK_MENUKEY}" ""
  ${If} $0 != ""
    StrCpy $lkTaskFileMenu "1"
  ${EndIf}
  ${If} $1 != ""
    StrCpy $lkTaskDirMenu "1"
  ${EndIf}
!macroend
!endif

!macro customInstall
  ; ── 文件类型编辑器注册（#45a，不抢默认程序：Capabilities + OpenWithProgids）──
  ${If} $lkTaskAssoc == "1"
    WriteRegStr HKCU "${LK_CLASSES}\${LK_PROGID}" "" "LinkDesk Document"
    WriteRegStr HKCU "${LK_CLASSES}\${LK_PROGID}\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    WriteRegStr HKCU "${LK_CLASSES}\${LK_PROGID}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
    !insertmacro lkAssocExt ".txt"
    !insertmacro lkAssocExt ".py"
    !insertmacro lkAssocExt ".js"
    !insertmacro lkAssocExt ".json"
    !insertmacro lkAssocExt ".md"
    !insertmacro lkAssocExt ".html"
    !insertmacro lkAssocExt ".css"
    !insertmacro lkAssocExt ".ts"
    !insertmacro lkAssocExt ".tsx"
    !insertmacro lkAssocExt ".yaml"
    !insertmacro lkAssocExt ".xml"
    !insertmacro lkAssocExt ".csv"
    !insertmacro lkAssocExt ".log"
    WriteRegStr HKCU "${LK_VENDOR}\Capabilities" "ApplicationName" "LinkDesk"
    WriteRegStr HKCU "${LK_VENDOR}\Capabilities" "ApplicationDescription" "LinkDesk 通用容器"
    WriteRegStr HKCU "Software\RegisteredApplications" "LinkDesk" "${LK_VENDOR}\Capabilities"
  ${EndIf}

  ; ── 右键三键（#45b，带图标；「显示更多选项」传统层）──
  ${If} $lkTaskFileMenu == "1"
    WriteRegStr HKCU "${LK_CLASSES}\*\shell\${LK_MENUKEY}" "" "Open with LinkDesk"
    WriteRegStr HKCU "${LK_CLASSES}\*\shell\${LK_MENUKEY}" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    WriteRegStr HKCU "${LK_CLASSES}\*\shell\${LK_MENUKEY}\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  ${EndIf}
  ${If} $lkTaskDirMenu == "1"
    WriteRegStr HKCU "${LK_CLASSES}\Directory\shell\${LK_MENUKEY}" "" "Open with LinkDesk"
    WriteRegStr HKCU "${LK_CLASSES}\Directory\shell\${LK_MENUKEY}" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    WriteRegStr HKCU "${LK_CLASSES}\Directory\shell\${LK_MENUKEY}\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
    WriteRegStr HKCU "${LK_CLASSES}\Directory\Background\shell\${LK_MENUKEY}" "" "Open with LinkDesk"
    WriteRegStr HKCU "${LK_CLASSES}\Directory\Background\shell\${LK_MENUKEY}" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
    WriteRegStr HKCU "${LK_CLASSES}\Directory\Background\shell\${LK_MENUKEY}\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
  ${EndIf}

  ; ── PATH（#45d 内 PATH 项；per-user HKCU\Environment）──
  ; 🔴 **不做子串搜索/替换**（StrFunc 的 un. 变体在两遍编译里都要求不同前缀，实测炸）——
  ;    改「标记 + 备份」法：首次追加前把原 PATH 存进 PathBackup，卸载时**精确匹配**才恢复。
  ;    重复安装幂等：标记在 ⇒ 不重复追加、不覆盖备份。
  ${If} $lkTaskPath == "1"
    ReadRegStr $0 HKCU "${LK_VENDOR}" "PathAdded"
    ${If} $0 == ""
      ReadRegStr $1 HKCU "Environment" "Path"
      WriteRegStr HKCU "${LK_VENDOR}" "PathBackup" "$1"
      ${If} $1 == ""
        WriteRegStr HKCU "Environment" "Path" "$INSTDIR"
      ${Else}
        WriteRegStr HKCU "Environment" "Path" "$1;$INSTDIR"
      ${EndIf}
      WriteRegStr HKCU "${LK_VENDOR}" "PathAdded" "$INSTDIR"
      ; 通知资源管理器环境变量已变（新开终端生效；已开终端需重启）
      System::Call 'USER32::SendMessageTimeoutW(i 0xFFFF, i 0x001A, i 0, w "Environment", i 0x0002, i 5000, i 0)'
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ; ── 右键三键整树删（不存在则无害；与安装时勾没勾无关——清理要彻底）──
  DeleteRegKey HKCU "${LK_CLASSES}\*\shell\${LK_MENUKEY}"
  DeleteRegKey HKCU "${LK_CLASSES}\Directory\shell\${LK_MENUKEY}"
  DeleteRegKey HKCU "${LK_CLASSES}\Directory\Background\shell\${LK_MENUKEY}"

  ; ── 文件关联：只删自己写的值/键，**不动 .txt 等扩展名键本身**（那不是我们建的）──
  !insertmacro lkDelAssocExt ".txt"
  !insertmacro lkDelAssocExt ".py"
  !insertmacro lkDelAssocExt ".js"
  !insertmacro lkDelAssocExt ".json"
  !insertmacro lkDelAssocExt ".md"
  !insertmacro lkDelAssocExt ".html"
  !insertmacro lkDelAssocExt ".css"
  !insertmacro lkDelAssocExt ".ts"
  !insertmacro lkDelAssocExt ".tsx"
  !insertmacro lkDelAssocExt ".yaml"
  !insertmacro lkDelAssocExt ".xml"
  !insertmacro lkDelAssocExt ".csv"
  !insertmacro lkDelAssocExt ".log"
  DeleteRegKey HKCU "${LK_CLASSES}\${LK_PROGID}"
  DeleteRegKey HKCU "${LK_VENDOR}\Capabilities"
  DeleteRegValue HKCU "Software\RegisteredApplications" "LinkDesk"

  ; ── PATH 段：**精确匹配才恢复备份**（宁可不删，不许误伤用户改过的 PATH）──
  ;   两种可判定的情形：① current == 备份（我们加的那段已被系统/用户去掉）② current == 备份;安装目录（正是我们加的那次）
  ReadRegStr $0 HKCU "${LK_VENDOR}" "PathAdded"
  ${If} $0 != ""
    ReadRegStr $1 HKCU "Environment" "Path"
    ReadRegStr $2 HKCU "${LK_VENDOR}" "PathBackup"
    StrCpy $3 "$2;$0"
    ${If} $1 == "$3"
      WriteRegStr HKCU "Environment" "Path" "$2"
      System::Call 'USER32::SendMessageTimeoutW(i 0xFFFF, i 0x001A, i 0, w "Environment", i 0x0002, i 5000, i 0)'
    ${ElseIf} $1 == "$0"
      ${If} $2 == ""
        DeleteRegValue HKCU "Environment" "Path"
      ${Else}
        WriteRegStr HKCU "Environment" "Path" "$2"
      ${EndIf}
      System::Call 'USER32::SendMessageTimeoutW(i 0xFFFF, i 0x001A, i 0, w "Environment", i 0x0002, i 5000, i 0)'
    ${Else}
      ; 用户装后改过 PATH：**不动**（删错别家路径的代价远大于留一段死路径）
    ${EndIf}
    DeleteRegValue HKCU "${LK_VENDOR}" "PathBackup"
  ${EndIf}
  DeleteRegValue HKCU "${LK_VENDOR}" "PathAdded"
!macroend
