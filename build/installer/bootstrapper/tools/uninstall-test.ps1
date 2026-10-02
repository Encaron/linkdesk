# uninstall-test.ps1 — 件 2d 验收：静默/界面态真卸载（清理清单逐条对账 ＋ PATH 误伤保护 ＋ 自删）
#
# 🔴 会写真机注册表（跑的是**真安装**与**真卸载**）——与 syswrite-test 同一条家法：
#   装前把要碰的键全量快照（整键走 reg export/import；单值走 .NET 逐值带类型还原），跑完
#   无条件还原并自检。桌面/开始菜单的 LinkDesk.lnk 同样先备份后还原。
# 🔴 **keep=0（真删 userData）不在此脚本测**：userData 是真 `%APPDATA%\linkdesk`（小写），
#   删了不可逆——它的实机验证归 3c「卸载两分支各一次」（用户在真机上做）。本脚本三路全部
#   keep=true；keep=0 的删除逻辑与程序树删除是同一段 WipeTree，路 1 已实删验证。
#
# 路 1 全链（静默装 → 静默卸）：装好基线（卸载器副本/ARP/关联/PATH/快捷方式都在）
#   → INSTDIR\linkdesk-setup.exe --uninstall /S → 逐条断言 customUnInstall 清单 + 自删收尾。
# 路 2 PATH 误伤保护：装后人为改 PATH（模拟用户）→ 卸载 → 断言 PATH **一字未动**（宁可不删）
#   ＋ PathBackup/PathAdded 标记清掉。
# 路 3 界面态全流程：自动缝（?autouninstall=1&autocontinue=1）走帧 1→3→4，
#   断言四段进度到 100 ＋ `uninstall-finished` ＋ 干净退出后目录自删。⚠️ 关窗走 WM_CLOSE
#   （完成屏 = 等价完成）——**不能 Stop-Process**：杀进程会跳过退出路径 ⇒ 自删子进程不产生。
#
# 用法：powershell -File tools\uninstall-test.ps1 [-Road 1|2|3] [-KeepWork]

param(
  [string]$Setup = (Join-Path $PSScriptRoot '..\out\linkdesk-setup-2d.exe'),
  [string]$Builder = (Join-Path $PSScriptRoot '..\..\..\..\scripts\build-installer.mjs'),
  [int]$Road = 0,
  [switch]$KeepWork
)
$ErrorActionPreference = 'Stop'
$outDir = Split-Path $Setup -Parent
$selfLog = Join-Path $outDir 'uninstall-test.log'
$pass = 0; $fail = 0
Add-Type -AssemblyName System.Windows.Forms | Out-Null

function Note { param($m) $line = ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $m); Write-Output $line; Add-Content -LiteralPath $selfLog -Value $line -Encoding UTF8 }
function Pass { param($m) $script:pass++; Note ("  PASS  " + $m) }
function Bail { param($m) $script:fail++; Note ("  FAIL  " + $m) }

# ── 注册表机器（坑 12：字面键路径一律走 .NET；坑 13：还原链每步记账，不许一步炸全链）──
$script:undo = New-Object System.Collections.ArrayList   # 还原动作（后进先出）
# reg.exe 一律**数组传参**（PS 自动加引号）——手拼字符串的引号转义在 export/delete/import
# 三个子命令上各踩过一次（无效项名），args 里的 `\"` 与 `"` 混着谁也对不上谁（坑 13 的近亲）
function Invoke-Reg {
  param([string[]]$RegArgs)
  $err = $env:TEMP + '\reg-err.txt'
  $p = Start-Process -FilePath 'reg.exe' -ArgumentList $RegArgs -NoNewWindow -Wait -PassThru -RedirectStandardError $err
  return ($p.ExitCode -eq 0)
}
function Backup-Key { param([string]$SubKey)     # 整键：export → 记「删+导」还原
  $file = Join-Path $env:TEMP ('uk-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.reg')
  # 🔴 reg.exe 的 export/delete/import 都要**全路径（带 HKCU\）**——只给 'Software\...' 一律报错
  $full = 'HKCU\' + $SubKey
  $ok = Invoke-Reg @('export', $full, $file, '/y')
  $existed = (Get-Item -LiteralPath ('Registry::HKEY_CURRENT_USER\' + $SubKey) -ErrorAction SilentlyContinue) -ne $null
  if ($ok -and $existed) {
    [void]$script:undo.Add(@{ kind = 'key'; sub = $full; file = $file })
  } elseif ($existed -and -not $ok) {
    Note ("  WARN  export 失败（$SubKey）——该键的还原靠手工")
  } elseif (-not $existed) {
    [void]$script:undo.Add(@{ kind = 'keydel'; sub = $full })   # 测试新建的键 ⇒ 还原=删掉
  }
}
function Backup-Value { param([string]$SubKey, [string]$Name)   # 单值：带类型原样还原
  $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($SubKey, $false)
  $vKind = $null; $val = $null
  if ($k) {
    $val = $k.GetValue($Name, $null)
    if ($null -ne $val) { $vKind = $k.GetValueKind($Name) }   # 值不存在 ⇒ kind 保持 null（还原=删掉）
    $k.Close()
  }
  [void]$script:undo.Add(@{ kind = 'value'; sub = $SubKey; name = $Name; val = $val; vkind = $vKind })
}
function Restore-All {
  Note ("还原链：" + $script:undo.Count + " 步")
  $bad = 0
  for ($i = $script:undo.Count - 1; $i -ge 0; $i--) {
    $u = $script:undo[$i]
    try {
      if ($u.kind -eq 'key') {
        [void](Invoke-Reg @('delete', $u.sub, '/f'))
        [void](Invoke-Reg @('import', $u.file))
      } elseif ($u.kind -eq 'keydel') {
        [void](Invoke-Reg @('delete', $u.sub, '/f'))
      } elseif ($u.kind -eq 'value') {        $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($u.sub, $true)
        if ($k) {
          if ($null -eq $u.val) { $k.DeleteValue($u.name, $false) }
          else { $k.SetValue($u.name, $u.val, $u.vkind) }
          $k.Close()
        }
      }
    } catch { $bad++; Note ("  WARN  还原步失败：" + $u.kind + " " + $u.sub) }
  }
  if ($bad -gt 0) { Note ("  🔴 有 " + $bad + " 步还原失败——机器留在测试态，按上次备份手工补救") }
  else { Note "还原自检：全部完成" }
}
function Reg-KeyGone { param([string]$SubKey) return ($null -eq [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($SubKey, $false)) }
function Reg-ValGone { param([string]$SubKey, [string]$Name)
  $k = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($SubKey, $false)
  if (-not $k) { return $true }
  $gone = ($k.GetValue($Name, $null) -eq $null); $k.Close(); return $gone
}

$script:procs = @()
function Stop-Procs { foreach ($p in $script:procs) { if ($p -and -not $p.HasExited) { try { $p.Kill() } catch {} } } }

# ── 开跑 ─────────────────────────────────────────────────────────────────────
Remove-Item -LiteralPath $selfLog -ErrorAction SilentlyContinue
Note ("uninstall-test 开跑；setup=" + $Setup)
if (-not (Test-Path -LiteralPath $Setup)) { Note "FAIL 找不到带载荷的安装包 out\linkdesk-setup-2d.exe——先 build.cmd ＋ build-installer.mjs"; exit 3 }
if ((Get-Item -LiteralPath $Setup).LastWriteTime -lt (Get-Item -LiteralPath (Join-Path $outDir 'bootstrapper.exe')).LastWriteTime) {
  Note "FAIL setup 比当前壳旧——重拼再测"; exit 3
}
# 🔴 别人的 LinkDesk 不许碰（卸载器会给同名进程发 WM_CLOSE；guard-test 路 3 同款闸）
$foreign = @(Get-Process -Name 'LinkDesk' -ErrorAction SilentlyContinue)
if ($foreign.Count -gt 0) { Note ("FAIL 已有 LinkDesk.exe 在跑（" + $foreign.Count + " 个）——先关掉再测"); exit 3 }
# 🔴 真 userData 在 ⇒ keep=0 的实删不能在这里做（见文件头）
$hasRealUserData = Test-Path -LiteralPath ([Environment]::GetFolderPath('ApplicationData') + '\linkdesk')

$work = Join-Path $env:TEMP ('lk-uninst-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $work | Out-Null
# 🔴 2c 的版本守卫对**静默装**也生效：机器 ARP 里现登记着 0.2.33（用户的真机状态），本脚本
#   装的同版本包会被守卫拦成 1602。这里全部装测都摆 LK_GUARD_ASSUME_VERSION=0.0.1
#   （假装已装极旧版 ⇒ 放行）——守卫自身的正反路径已由 guard-test.ps1 路 1/2 专测。
$env:LK_GUARD_ASSUME_VERSION = '0.0.1'
# 工人诊断缝（main.cpp TraceLine）：静默态没有窗，工人走到哪/为何被闸全靠这份流水看
$env:LK_TRACE = (Join-Path $outDir 'uninstall-trace.log')
try {
  # ── 快照（三路共用同一份，装前拍）──
  $arp = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\d7b1f08d-e543-5ebb-a1d6-cfc088dc2c70'
  $vendor = 'Software\LinkDesk'
  $progId = 'Software\Classes\LinkDesk.Document'
  $menuFile = 'Software\Classes\*\shell\OpenWithLinkDesk'
  $menuDir = 'Software\Classes\Directory\shell\OpenWithLinkDesk'
  $menuBg = 'Software\Classes\Directory\Background\shell\OpenWithLinkDesk'
  Backup-Key $arp; Backup-Key $vendor; Backup-Key $progId
  Backup-Key $menuFile; Backup-Key $menuDir; Backup-Key $menuBg
  Backup-Value 'Environment' 'Path'
  Backup-Value 'Software\RegisteredApplications' 'LinkDesk'
  foreach ($ext in @('.txt','.py','.js','.json','.md','.html','.css','.ts','.tsx','.yaml','.xml','.csv','.log')) {
    Backup-Value ('Software\Classes\' + $ext + '\OpenWithProgids') 'LinkDesk.Document'
  }
  # 快捷方式：先备份现存的 .lnk（可能本来就有），卸载测试后原样放回
  $lnkBackups = @()
  foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
    $lnk = Join-Path $folder 'LinkDesk.lnk'
    if (Test-Path -LiteralPath $lnk) {
      $bak = Join-Path $work ('lnk-' + [guid]::NewGuid().ToString('N').Substring(0,6) + '.lnk')
      Copy-Item -LiteralPath $lnk -Destination $bak
      $lnkBackups += @{ lnk = $lnk; bak = $bak }
    }
  }

  function Install-Test { param([string]$Dir)
    $p = Start-Process -FilePath $Setup -ArgumentList @('/S', ('--dir=' + $Dir)) -Wait -PassThru
    return $p.ExitCode
  }
  function Uninstall-Silent { param([string]$Dir)
    $p = Start-Process -FilePath (Join-Path $Dir 'linkdesk-setup.exe') -ArgumentList @('--uninstall', '/S') -Wait -PassThru
    return $p.ExitCode
  }
  function Wait-DirGone { param([string]$Dir)   # 自删子进程 ping 3s + del + rd，给足 15s
    for ($i = 0; $i -lt 30; $i++) { if (-not (Test-Path -LiteralPath $Dir)) { return $true }; Start-Sleep -Milliseconds 500 }
    return $false
  }

  # ══════════ 路 1 · 全链（静默装 → 静默卸，keep=true）══════════
  if ($Road -eq 0 -or $Road -eq 1) {
    Note "路 1 · 全链：静默装 → 静默卸（清理清单逐条对账）"
    # 🔴 PATH 基线必须拍在**任何一次安装之前**——装好基线里已经含测试目录段了，
    #   卸载后正确地把它删掉，拿装后基线比对就是假 FAIL（2026-10-02 实测踩过）
    $pathBefore = ([Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')).GetValue('Path', '')
    $kindBefore = ([Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')).GetValueKind('Path')
    $inst = Join-Path $work 'i1'
    $rc = Install-Test $inst
    if ($rc -eq 0) { Pass "静默装退 0" } else { Bail "静默装退 $rc"; throw '装都装不上，后面免谈' }
    # 装好基线
    if (Test-Path -LiteralPath (Join-Path $inst 'linkdesk-setup.exe')) { Pass '卸载器副本已落 INSTDIR（ARP 指的那份）' }
    else { Bail 'INSTDIR 里没有 linkdesk-setup.exe —— ARP 卸载是死链接' }
    if (-not (Reg-KeyGone $arp)) { Pass 'ARP 键已登记' } else { Bail 'ARP 键没写' }
    # 预置一个「旧装的」右键键 ⇒ 升级反推 fileMenu=true ⇒ 安装会重写它 ⇒ 卸载必须删它
    $k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($menuFile); $k.SetValue('', 'Open with LinkDesk'); $k.Close()
    $rc = 0
    # 重新装一遍让预置键参与反推（第一次装在预置之前）
    $rc2 = Install-Test $inst
    if ($rc2 -eq 0) { Pass "覆盖装退 0（反推生效）" } else { Bail "覆盖装退 $rc2" }
    if (-not (Reg-KeyGone $menuFile)) { Pass '右键键（反推后）已写' } else { Bail '右键键没写（反推没生效）' }

    # 静默卸
    $rc = Uninstall-Silent $inst
    if ($rc -eq 0) { Pass "静默卸退 0" } else { Bail "静默卸退 $rc" }
    Start-Sleep -Seconds 1
    if (Reg-KeyGone $arp) { Pass 'ARP 键已删' } else { Bail 'ARP 键残留' }
    if (Reg-KeyGone $menuFile) { Pass '右键键（文件）已删' } else { Bail '右键键（文件）残留' }
    if (Reg-KeyGone $menuDir) { Pass '右键键（目录）已删' } else { Bail '右键键（目录）残留' }
    if (Reg-KeyGone $menuBg) { Pass '右键键（Background）已删' } else { Bail '右键键（Background）残留' }
    if (Reg-KeyGone $progId) { Pass 'ProgId 整树已删' } else { Bail 'ProgId 残留' }
    if (Reg-ValGone $vendor 'PathBackup' -and (Reg-ValGone $vendor 'PathAdded')) { Pass 'PATH 标记（Backup/Added）已删' }
    else { Bail 'PATH 标记残留' }
    $env_ = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
    $pathAfter = $env_.GetValue('Path', ''); $kindAfter = $env_.GetValueKind('Path'); $env_.Close()
    if ($pathAfter -eq $pathBefore) { Pass 'PATH 精确恢复（逐字符相等）' } else { Bail ("PATH 变了：`n  前=[$pathBefore]`n  后=[$pathAfter]") }
    if ($kindAfter -eq $kindBefore) { Pass 'PATH 类型未降级' } else { Bail ("PATH 类型变了：$kindBefore → $kindAfter") }
    if (Reg-ValGone 'Software\RegisteredApplications' 'LinkDesk') { Pass 'RegisteredApplications 值已删' } else { Bail 'RegisteredApplications 残留' }
    $extLeft = 0
    foreach ($ext in @('.txt','.py','.js','.json','.md','.html','.css','.ts','.tsx','.yaml','.xml','.csv','.log')) {
      if (-not (Reg-ValGone ('Software\Classes\' + $ext + '\OpenWithProgids') 'LinkDesk.Document')) { $extLeft++ }
    }
    if ($extLeft -eq 0) { Pass '13 个扩展名的 OpenWithProgids 值全删（扩展名键本身没动）' }
    else { Bail "$extLeft 个扩展名值残留" }
    if (Reg-KeyGone ($vendor + '\Capabilities')) { Pass 'Capabilities 整树已删' } else { Bail 'Capabilities 残留' }
    $lnkGone = $true
    foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
      if (Test-Path -LiteralPath (Join-Path $folder 'LinkDesk.lnk')) { $lnkGone = $false }
    }
    if ($lnkGone) { Pass '桌面＋开始菜单 .lnk 已删' } else { Bail '.lnk 残留' }
    if ($hasRealUserData) { Pass 'userData 原样未动（keep=true ＋ 真 userData 在场）' }
    if (Wait-DirGone $inst) { Pass 'INSTDIR 已自删（del + rd）' } else { Bail 'INSTDIR 没删掉——自删链断了' }
  }

  # ══════════ 路 2 · PATH 误伤保护 ══════════
  if ($Road -eq 0 -or $Road -eq 2) {
    Note "路 2 · PATH 误伤保护（装后人为改 PATH ⇒ 卸载必须一字不动）"
    $inst = Join-Path $work 'i2'
    $rc = Install-Test $inst
    if ($rc -ne 0) { Bail "静默装退 $rc"; throw '装不上' }
    $env_ = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true)
    $before = $env_.GetValue('Path', ''); $env_.SetValue('Path', $before + ';C:\lk-user-edit', [Microsoft.Win32.RegistryValueKind]::String); $env_.Close()
    $rc = Uninstall-Silent $inst
    if ($rc -eq 0) { Pass "静默卸退 0" } else { Bail "静默卸退 $rc" }
    $env_ = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')
    $after = $env_.GetValue('Path', ''); $env_.Close()
    if ($after -eq ($before + ';C:\lk-user-edit')) { Pass '用户改过的 PATH 一字未动（宁可不删）' }
    else { Bail ("PATH 被动了！`n  期望=[$($before);C:\lk-user-edit]`n  实际=[$after]") }
    if ((Reg-ValGone $vendor 'PathBackup') -and (Reg-ValGone $vendor 'PathAdded')) { Pass '标记值照删' }
    else { Bail '标记值残留' }
  }

  # ══════════ 路 3 · 界面态全流程（自动缝，keep=true）══════════
  if ($Road -eq 0 -or $Road -eq 3) {
    Note "路 3 · 界面态：帧1→帧3→帧4（autouninstall + autocontinue）"
    $inst = Join-Path $work 'i3'
    $rc = Install-Test $inst
    if ($rc -ne 0) { Bail "静默装退 $rc"; throw '装不上' }
    $log = Join-Path $outDir 'uninstall-r3.log'
    Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
    $p = Start-Process -FilePath (Join-Path $inst 'linkdesk-setup.exe') `
           -ArgumentList @('--uninstall', ('--preview=screen=confirm&lang=zh-CN&autouninstall=1&autocontinue=1'), ('--log=' + $log)) -PassThru
    $script:procs += $p
    $done = $false
    for ($i = 0; $i -lt 80; $i++) {
      Start-Sleep -Milliseconds 500
      if ((Test-Path -LiteralPath $log) -and ((Get-Content -LiteralPath $log -Raw) -like '*"type":"uninstall-finished"*')) { $done = $true; break }
    }
    if ($done) { Pass 'uninstall-finished 到达（四段进度走满，完成屏已推）' }
    else { Bail '40s 内没等到 uninstall-finished——看 out\uninstall-r3.log' }
    if (Test-Path -LiteralPath $log) {
      $txt = Get-Content -LiteralPath $log -Raw
      if ($txt -like '*"pct":100*') { Pass '进度收到 100' } else { Bail '进度没到 100' }
      if (-not ($txt -like '*uninstall-close-timeout*')) { Pass '没有超时分支（无实例路径）' } else { Bail '误入超时分支' }
      if ($txt -like '*"pct":60*' -and $txt -like '*"pct":80*' -and $txt -like '*"pct":92*') { Pass '60/80/92 三段边界都到过' }
      else { Bail '分段边界缺失' }
    }
    # 干净退出：完成屏 ✕ = 等价完成 ⇒ 发 WM_CLOSE（**不能杀进程**——杀掉就跳过自删）
    Add-Type 'using System;using System.Runtime.InteropServices;public class W { [DllImport("user32.dll")] public static extern bool PostMessageW(IntPtr h, uint m, IntPtr w, IntPtr l); }' -ErrorAction SilentlyContinue
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
      [W]::PostMessageW($p.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
      if ($p.WaitForExit(15000)) { Pass 'WM_CLOSE 后干净退出（完成屏=等价完成）' }
      else { Bail '15s 没退出'; Stop-Procs }
    } else { Bail '找不到主窗（窗口没了？）'; Stop-Procs }
    if (Wait-DirGone $inst) { Pass 'INSTDIR 已自删' } else { Bail 'INSTDIR 没删掉' }
  }
}
finally {
  Stop-Procs
  Restore-All
  foreach ($b in $lnkBackups) { Copy-Item -LiteralPath $b.bak -Destination $b.lnk -Force -ErrorAction SilentlyContinue }
  if (-not $KeepWork) { Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue }
}
Note ("uninstall-test 收工：PASS " + $pass + " · FAIL " + $fail)
if ($fail -gt 0) { exit 1 } else { exit 0 }
